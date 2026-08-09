import { BALANCE } from "../content/balance";
import { ITEMS } from "../content/items";
import { LOGISTICS, UNIT_TYPES, VETERANCY } from "../content/units";
import { WEAPONS } from "../content/weapons";
import { effectiveStats, syncLevelFromExp } from "./commander";
import { COUNTER_RATIO, canCounter, computeDamage, itemDamage, refreshMaxHp } from "./combat";
import {
  canAttack,
  findPath,
  livingUnits,
  manhattan,
  orthogonalNeighbours,
  pathCost,
  resupplyOutcome,
  resupplyTargets,
  unitAt,
} from "./grid";
import { isEvacTile } from "./mission";
import { nextInt, nextRange } from "./rng";
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

  const place = state.places.find((entry) => entry.x === x && entry.y === y);
  if (place) {
    const placeId = place.id ?? `${place.x},${place.y}`;
    state.discoveredPlaceIds ??= [];
    if (!state.discoveredPlaceIds.includes(placeId)) {
      state.discoveredPlaceIds.push(placeId);
      state.stats.landmarksDiscovered = state.discoveredPlaceIds.length;
      events.push({
        type: "landmarkDiscovered",
        placeId,
        placeName: place.name,
        historicalContext: place.historicalContext,
        tacticalHint: place.tacticalHint,
      });
    }
  }

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

/**
 * 敌军溃散后不再自动推进。若条件允许，按确定性随机收容少量俘虏，
 * 优先进入最近的后勤队，其次才进入发动攻击的作战单位。
 */
function capturePrisoners(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  events: GameEvent[],
): void {
  if (attacker.faction !== "player" || defender.faction !== "enemy") return;

  const chance = nextRange(state.rng, 0, 1);
  state.rng = chance.state;
  if (chance.value > BALANCE.prisoners.chance) return;

  const recipients = livingUnits(state, "player")
    .filter((unit) => unit.type === "logistics" || unit.id === attacker.id)
    .sort((a, b) => {
      const aRoom = a.maxHp - a.hp;
      const bRoom = b.maxHp - b.hp;
      return bRoom - aRoom || manhattan(a, defender) - manhattan(b, defender) || a.id.localeCompare(b.id);
    });
  const recipient = recipients.find((unit) => unit.hp < unit.maxHp);
  if (!recipient) return;

  const draw = nextInt(state.rng, BALANCE.prisoners.min, BALANCE.prisoners.max);
  state.rng = draw.state;
  const amount = Math.min(draw.value, recipient.maxHp - recipient.hp);
  if (amount <= 0) return;

  recipient.hp += amount;
  state.stats.prisonersCaptured = (state.stats.prisonersCaptured ?? 0) + amount;
  events.push({ type: "prisonersCaptured", unitId: recipient.id, sourceId: defender.id, amount });
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

  // 先发 attacked（带本击血量/溃散），再发晋升与 routed，保证 FX 时间线：命中→掉血→溃散→收容
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
    capturePrisoners(state, attacker, defender, events);
  }
  if (attackerRouted) {
    routUnit(state, attacker, events);
    grantExp(defender, VETERANCY.expPerRout, state, events);
  }

  addFatigue(attacker, FATIGUE.perAttack);
  attacker.hasActed = true;
  attacker.mpLeft = 0;
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

/** 后勤邻接补充：从后勤人员池转移兵员，并降低疲劳、恢复弹药窗口。 */
export function performResupply(
  state: GameState,
  unit: Unit,
  target: Unit,
  events: GameEvent[],
): boolean {
  if (unit.type !== "logistics") return false;
  if (!resupplyTargets(state, unit).some((ally) => ally.id === target.id)) return false;
  const preview = resupplyOutcome(state, unit, target);
  const { personnel, fatigueRelief } = preview;
  if (personnel <= 0 && fatigueRelief <= 0 && !preview.ammoRestored) return false;
  // 人员守恒：后勤减少多少，作战单位就增加多少，禁止凭空回血。
  unit.hp -= personnel;
  target.hp += personnel;
  addFatigue(target, -fatigueRelief);
  // 弹药恢复：显式补弹，或治疗/消疲时顺带恢复（仅玩家）
  if (
    target.faction === "player" &&
    state.scripted.some((rule) => rule.kind === "supplyWindow") &&
    (preview.ammoRestored || personnel > 0 || fatigueRelief > 0)
  ) {
    target.supplyRestoredUntil = state.turn + LOGISTICS.ammoRestoreTurns;
  }
  unit.hasActed = true;
  unit.mpLeft = 0;
  events.push({
    type: "resupplied",
    unitId: unit.id,
    targetId: target.id,
    personnel,
    heal: 0,
    fatigueRelief,
  });
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
    if (target.hp <= 0) {
      routUnit(state, target, events);
      grantExp(unit, VETERANCY.expPerRout, state, events);
      capturePrisoners(state, unit, target, events);
    }
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
      if (victim.hp <= 0) {
        routUnit(state, victim, events);
        grantExp(unit, VETERANCY.expPerRout, state, events);
        capturePrisoners(state, unit, victim, events);
      }
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
