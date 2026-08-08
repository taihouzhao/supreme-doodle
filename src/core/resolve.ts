import { BALANCE } from "../content/balance";
import { ITEMS } from "../content/items";
import { UNIT_TYPES, VETERANCY } from "../content/units";
import { WEAPONS } from "../content/weapons";
import { syncLevelFromExp } from "./commander";
import { COUNTER_RATIO, canCounter, computeDamage, itemDamage, refreshMaxHp } from "./combat";
import {
  canAttack,
  canEnter,
  livingUnits,
  manhattan,
  orthogonalNeighbours,
  pathCost,
  unitAt,
} from "./grid";
import { isEvacTile } from "./mission";
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

export function routUnit(state: GameState, unit: Unit, events: GameEvent[]): void {
  if (!unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  if (unit.faction === "player") state.stats.playerRouted += 1;
  else state.stats.enemyRouted += 1;
  events.push({ type: "routed", unitId: unit.id, faction: unit.faction });
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
  unit.x = to.x;
  unit.y = to.y;
  unit.mpLeft -= cost;
  if (cost > 0) {
    unit.movedThisTurn = true;
    addFatigue(unit, cost * FATIGUE.perMoveCost);
  }
  events.push({ type: "moved", unitId: unit.id, from, to: { ...to }, cost });
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
  attacker.x = target.x;
  attacker.y = target.y;
  attacker.movedThisTurn = true;
  events.push({
    type: "moved",
    unitId: attacker.id,
    from,
    to: { x: attacker.x, y: attacker.y },
    cost: 0,
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

  const main = computeDamage(state, attacker, defender, state.rng);
  state.rng = main.rng;
  defender.hp -= main.damage;
  grantExp(attacker, main.damage * VETERANCY.expPerDamage, state, events);
  if (attacker.faction === "player") state.stats.damageDealt += main.damage;
  else state.stats.damageTaken += main.damage;

  let counterDamage = 0;
  if (defender.hp > 0 && canCounter(state, attacker, defender)) {
    const counter = computeDamage(state, defender, attacker, state.rng);
    state.rng = counter.rng;
    counterDamage = Math.max(1, Math.round(counter.damage * COUNTER_RATIO));
    attacker.hp -= counterDamage;
    grantExp(defender, counterDamage * VETERANCY.expPerDamage, state, events);
    if (defender.faction === "player") state.stats.damageDealt += counterDamage;
    else state.stats.damageTaken += counterDamage;
  }

  events.push({
    type: "attacked",
    attackerId: attacker.id,
    defenderId: defender.id,
    damage: main.damage,
    breakdown: main.breakdown,
    counterDamage,
  });

  if (defender.hp <= 0) {
    routUnit(state, defender, events);
    grantExp(attacker, VETERANCY.expPerRout, state, events);
  }
  if (attacker.hp <= 0) {
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
      1 + Math.max(0, unit.stats.intellect - 40) * 0.005;
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
