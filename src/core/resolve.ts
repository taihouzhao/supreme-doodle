import { BALANCE } from "../content/balance";
import { ITEMS } from "../content/items";
import { LOGISTICS, UNIT_TYPES, VETERANCY } from "../content/units";
import { WEAPONS } from "../content/weapons";
import { effectiveStats, syncLevelFromExp } from "./commander";
import { COUNTER_RATIO, canCounter, computeDamage, itemDamage, refreshMaxHp } from "./combat";
import {
  canAttack,
  canEnter,
  findPath,
  livingUnits,
  manhattan,
  orthogonalNeighbours,
  pathCost,
  resupplyTargets,
  unitAt,
} from "./grid";
import { isEvacTile } from "./mission";
import { nextInt } from "./rng";
import type { GameEvent, GameState, ItemId, Unit, Vec2 } from "./types";

const FATIGUE = BALANCE.fatigue;

function addFatigue(unit: Unit, amount: number): void {
  unit.fatigue = Math.max(FATIGUE.min, Math.min(FATIGUE.max, unit.fatigue + amount));
}

function grantExp(
  unit: Unit,
  amount: number,
  state?: GameState,
  events?: GameEvent[],
): void {
  unit.exp += amount;
  const promotion = syncLevelFromExp(unit);
  refreshMaxHp(unit, state);
  if (promotion && events) {
    events.push({
      type: "levelUp",
      unitId: unit.id,
      from: promotion.from,
      to: promotion.to,
      rank: unit.rank,
    });
  }
}

/** 只改经验/等级，不立刻发事件；交战动画需要先播攻击再播晋升 */
function grantExpSilent(unit: Unit, amount: number, state?: GameState): GameEvent | null {
  unit.exp += amount;
  const promotion = syncLevelFromExp(unit);
  refreshMaxHp(unit, state);
  if (!promotion) return null;
  return {
    type: "levelUp",
    unitId: unit.id,
    from: promotion.from,
    to: promotion.to,
    rank: unit.rank,
  };
}

export function routUnit(state: GameState, unit: Unit, events: GameEvent[]): void {
  if (!unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  if (unit.faction === "player") state.stats.playerRouted += 1;
  else state.stats.enemyRouted += 1;
  events.push({ type: "routed", unitId: unit.id, faction: unit.faction });

  // 敌军精英 / 主将击溃后在原地掉落精英道具，供友军拾取
  if (unit.faction === "enemy" && unit.dropOptions && unit.dropOptions.length > 0) {
    const draw = nextInt(state.rng, 0, unit.dropOptions.length - 1);
    state.rng = draw.state;
    const item = unit.dropOptions[draw.value]!;
    state.fieldItems.push({
      id: `elite-${unit.id}`,
      item,
      x: unit.x,
      y: unit.y,
    });
  }
}

/** 落地结算：战场拾取与撤离带判定，移动与击溃推进共用 */
function settleTileEntry(state: GameState, unit: Unit, events: GameEvent[]): void {
  if (unit.faction !== "player") return;
  const { x, y } = unit;

  const pickedIndex = state.fieldItems.findIndex((i) => i.x === x && i.y === y);
  const picked = state.fieldItems[pickedIndex];
  if (picked) {
    state.fieldItems.splice(pickedIndex, 1);
    state.inventory[picked.item] += 1;
    events.push({ type: "itemPicked", unitId: unit.id, item: picked.item });
  }

  const weaponIndex = state.fieldWeapons.findIndex((i) => i.x === x && i.y === y);
  const weaponDrop = state.fieldWeapons[weaponIndex];
  if (weaponDrop) {
    state.fieldWeapons.splice(weaponIndex, 1);
    state.pendingWeapons.push(weaponDrop.weapon);
    const def = WEAPONS[weaponDrop.weapon];
    if (def.forTypes.includes(unit.type) && def.score > WEAPONS[unit.weapon].score) {
      unit.weapon = weaponDrop.weapon;
      unit.equipment = def.name;
      refreshMaxHp(unit, state);
    }
    events.push({ type: "weaponPicked", unitId: unit.id, weapon: weaponDrop.weapon });
  }

  if (isEvacTile(state, x, y)) {
    unit.evacuated = true;
    unit.hasActed = true;
    unit.mpLeft = 0;
    state.stats.playerEvacuated += 1;
    events.push({ type: "evacuated", unitId: unit.id });
  }
}

export function performMove(state: GameState, unit: Unit, to: Vec2, events: GameEvent[]): boolean {
  const cost = pathCost(state, unit, to);
  if (cost === null) return false;
  const occupant = unitAt(state, to.x, to.y);
  if (occupant && occupant.id !== unit.id) return false;

  const from = { x: unit.x, y: unit.y };
  const path = findPath(state, unit, to, from) ?? [from, { ...to }];
  unit.x = to.x;
  unit.y = to.y;
  unit.mpLeft -= cost;
  if (cost > 0) {
    unit.movedThisTurn = true;
    addFatigue(unit, cost * FATIGUE.perMoveCost);
  }
  events.push({ type: "moved", unitId: unit.id, from, to: { ...to }, cost, path });
  settleTileEntry(state, unit, events);

  return true;
}

/** 击溃紧贴的敌军后推进到空出的格子，占住刚打开的缺口 */
function advanceAfterRout(
  state: GameState,
  attacker: Unit,
  target: Unit,
  events: GameEvent[],
): void {
  if (!attacker.alive || attacker.evacuated) return;
  if (manhattan(attacker, target) !== 1) return;
  if (!canEnter(state, attacker, target.x, target.y)) return;
  if (unitAt(state, target.x, target.y)) return;

  const from = { x: attacker.x, y: attacker.y };
  const to = { x: target.x, y: target.y };
  attacker.x = to.x;
  attacker.y = to.y;
  attacker.movedThisTurn = true;
  events.push({
    type: "moved",
    unitId: attacker.id,
    from,
    to,
    cost: 0,
    path: [from, to],
  });
  settleTileEntry(state, attacker, events);
}

export function performAttack(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  events: GameEvent[],
): boolean {
  if (!canAttack(state, attacker, defender)) return false;

  const defenderHpFrom = defender.hp;
  const attackerHpFrom = attacker.hp;
  const attackerFrom = { x: attacker.x, y: attacker.y };
  const defenderFrom = { x: defender.x, y: defender.y };
  const pendingPromotes: GameEvent[] = [];

  const main = computeDamage(state, attacker, defender, state.rng);
  state.rng = main.rng;
  defender.hp -= main.damage;
  {
    const promote = grantExpSilent(attacker, main.damage * VETERANCY.expPerDamage, state);
    if (promote) pendingPromotes.push(promote);
  }
  if (attacker.faction === "player") state.stats.damageDealt += main.damage;
  else state.stats.damageTaken += main.damage;

  let counterDamage = 0;
  if (defender.hp > 0 && canCounter(state, attacker, defender)) {
    const counter = computeDamage(state, defender, attacker, state.rng);
    state.rng = counter.rng;
    counterDamage = Math.max(1, Math.round(counter.damage * COUNTER_RATIO));
    attacker.hp -= counterDamage;
    {
      const promote = grantExpSilent(defender, counterDamage * VETERANCY.expPerDamage, state);
      if (promote) pendingPromotes.push(promote);
    }
    if (defender.faction === "player") state.stats.damageDealt += counterDamage;
    else state.stats.damageTaken += counterDamage;
  }

  const defenderRouted = defender.hp <= 0;
  const attackerRouted = attacker.hp <= 0;

  // 先发 attacked（带本击血量/溃散），再发晋升与 routed，保证 FX 时间线：命中→掉血→溃散→推进
  events.push({
    type: "attacked",
    attackerId: attacker.id,
    defenderId: defender.id,
    damage: main.damage,
    breakdown: main.breakdown,
    counterDamage,
    defenderHpFrom,
    defenderHpTo: Math.max(0, defender.hp),
    attackerHpFrom,
    attackerHpTo: Math.max(0, attacker.hp),
    defenderRouted,
    attackerRouted,
    attackerFrom,
    defenderFrom,
  });
  for (const promote of pendingPromotes) events.push(promote);

  if (defenderRouted) {
    routUnit(state, defender, events);
    grantExp(attacker, VETERANCY.expPerRout, state, events);
  }
  if (attackerRouted) {
    routUnit(state, attacker, events);
    grantExp(defender, VETERANCY.expPerRout, state, events);
  }

  addFatigue(attacker, FATIGUE.perAttack);
  attacker.hasActed = true;
  attacker.mpLeft = 0;
  if (!defender.alive) advanceAfterRout(state, attacker, defender, events);
  return true;
}

export function performCapture(state: GameState, unit: Unit, events: GameEvent[]): boolean {
  if (!UNIT_TYPES[unit.type].canCapture) return false;
  const objective = state.objectives.find(
    (o) => o.kind === "capture" && o.x === unit.x && o.y === unit.y,
  );
  if (!objective || objective.owner === unit.faction) return false;

  objective.owner = unit.faction;
  unit.hasActed = true;
  unit.mpLeft = 0;
  events.push({ type: "captured", objectiveId: objective.id, by: unit.faction });
  return true;
}

export function performWait(_state: GameState, unit: Unit): boolean {
  addFatigue(unit, FATIGUE.perWait);
  unit.hasActed = true;
  unit.mpLeft = 0;
  return true;
}

/** 后勤邻接补充：回复生命、降低疲劳，并短暂恢复弹药（对抗 supplyWindow） */
export function performResupply(
  state: GameState,
  unit: Unit,
  target: Unit,
  events: GameEvent[],
): boolean {
  if (unit.type !== "logistics") return false;
  if (!resupplyTargets(state, unit).some((ally) => ally.id === target.id)) return false;
  const missing = target.maxHp - target.hp;
  const heal = Math.min(LOGISTICS.heal, Math.max(0, missing));
  const fatigueRelief = Math.min(LOGISTICS.fatigueRelief, target.fatigue);
  const needsAmmo =
    target.faction === "player" &&
    state.scripted.some((rule) => rule.kind === "supplyWindow" && state.turn > rule.untilTurn) &&
    (target.supplyRestoredUntil ?? 0) < state.turn;
  if (heal <= 0 && fatigueRelief <= 0 && !needsAmmo) return false;
  target.hp += heal;
  addFatigue(target, -fatigueRelief);
  // 弹药恢复：显式补弹，或治疗/消疲时顺带恢复（仅玩家）
  if (
    target.faction === "player" &&
    state.scripted.some((rule) => rule.kind === "supplyWindow") &&
    (needsAmmo || heal > 0 || fatigueRelief > 0)
  ) {
    target.supplyRestoredUntil = state.turn + LOGISTICS.ammoRestoreTurns;
  }
  unit.hasActed = true;
  unit.mpLeft = 0;
  events.push({
    type: "resupplied",
    unitId: unit.id,
    targetId: target.id,
    heal,
    fatigueRelief,
  });
  if (heal > 0) events.push({ type: "healed", unitId: target.id, amount: heal });
  return true;
}

export interface ItemUsage {
  item: ItemId;
  targetId?: string;
  to?: Vec2;
}

export function performItem(
  state: GameState,
  unit: Unit,
  usage: ItemUsage,
  events: GameEvent[],
): boolean {
  const def = ITEMS[usage.item];
  if ((state.inventory[usage.item] ?? 0) <= 0) return false;

  let heal = 0;
  let damage = 0;
  const targetIds: string[] = [];

  if (def.targeting === "self") {
    const canHeal = def.heal > 0 && unit.hp < unit.maxHp;
    const canFatigue = (def.fatigueRelief ?? 0) > 0 && unit.fatigue > 0;
    const canExp = (def.expGain ?? 0) > 0;
    if (!canHeal && !canFatigue && !canExp) return false;
    if (canHeal) {
      heal = Math.min(def.heal, unit.maxHp - unit.hp);
      unit.hp += heal;
    }
    if (canFatigue) {
      addFatigue(unit, -(def.fatigueRelief ?? 0));
    }
    if (canExp) {
      grantExp(unit, def.expGain ?? 0, state, events);
    }
    targetIds.push(unit.id);
  } else if (def.targeting === "target") {
    const target = state.units.find((u) => u.id === usage.targetId);
    if (!target || !target.alive || target.faction === unit.faction) return false;
    if (manhattan(unit, target) > def.range) return false;
    const dealt = itemDamage(usage.item, target, unit, state);
    if (dealt <= 0) return false;
    target.hp -= dealt;
    damage += dealt;
    targetIds.push(target.id);
    if (target.hp <= 0) routUnit(state, target, events);
  } else {
    const center = usage.to;
    if (!center) return false;
    if (manhattan(unit, center) > def.range) return false;
    const tiles = def.splash ? [center, ...orthogonalNeighbours(center)] : [center];
    const intellectScale =
      1 + Math.max(0, effectiveStats(unit, state.inventory).intellect - 40) * 0.005;
    for (const tile of tiles) {
      const victim = unitAt(state, tile.x, tile.y);
      if (!victim || victim.faction === unit.faction) continue;
      const dealt = Math.round(def.damage * intellectScale);
      victim.hp -= dealt;
      damage += dealt;
      targetIds.push(victim.id);
      if (victim.hp <= 0) routUnit(state, victim, events);
    }
    if (targetIds.length === 0) return false;
  }

  state.inventory[usage.item] -= 1;
  if (unit.faction === "player") state.stats.damageDealt += damage;
  unit.hasActed = true;
  unit.mpLeft = 0;
  events.push({ type: "itemUsed", unitId: unit.id, item: usage.item, targetIds, damage, heal });
  return true;
}

export function activeUnits(state: GameState, faction: Unit["faction"]): Unit[] {
  return livingUnits(state, faction).filter((u) => !u.hasActed);
}
