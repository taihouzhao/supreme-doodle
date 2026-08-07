import { BALANCE } from "../content/balance";
import { ITEMS } from "../content/items";
import { UNIT_TYPES, VETERANCY } from "../content/units";
import { COUNTER_RATIO, canCounter, computeDamage, itemDamage, refreshMaxHp } from "./combat";
import { canAttack, livingUnits, manhattan, orthogonalNeighbours, pathCost, unitAt } from "./grid";
import { isEvacTile } from "./mission";
import type { GameEvent, GameState, ItemId, Unit, Vec2 } from "./types";

const FATIGUE = BALANCE.fatigue;

function addFatigue(unit: Unit, amount: number): void {
  unit.fatigue = Math.max(FATIGUE.min, Math.min(FATIGUE.max, unit.fatigue + amount));
}

function grantExp(unit: Unit, amount: number): void {
  unit.exp += amount;
  refreshMaxHp(unit);
}

export function routUnit(state: GameState, unit: Unit, events: GameEvent[]): void {
  if (!unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  if (unit.faction === "player") state.stats.playerRouted += 1;
  else state.stats.enemyRouted += 1;
  events.push({ type: "routed", unitId: unit.id, faction: unit.faction });
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

  if (unit.faction === "player") {
    const pickedIndex = state.fieldItems.findIndex((i) => i.x === to.x && i.y === to.y);
    const picked = state.fieldItems[pickedIndex];
    if (picked) {
      state.fieldItems.splice(pickedIndex, 1);
      state.inventory[picked.item] += 1;
      events.push({ type: "itemPicked", unitId: unit.id, item: picked.item });
    }

    if (isEvacTile(state, to.x, to.y)) {
      unit.evacuated = true;
      unit.hasActed = true;
      unit.mpLeft = 0;
      state.stats.playerEvacuated += 1;
      events.push({ type: "evacuated", unitId: unit.id });
    }
  }

  return true;
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
  grantExp(attacker, main.damage * VETERANCY.expPerDamage);
  if (attacker.faction === "player") state.stats.damageDealt += main.damage;
  else state.stats.damageTaken += main.damage;

  let counterDamage = 0;
  if (defender.hp > 0 && canCounter(state, attacker, defender)) {
    const counter = computeDamage(state, defender, attacker, state.rng);
    state.rng = counter.rng;
    counterDamage = Math.max(1, Math.round(counter.damage * COUNTER_RATIO));
    attacker.hp -= counterDamage;
    grantExp(defender, counterDamage * VETERANCY.expPerDamage);
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
    grantExp(attacker, VETERANCY.expPerRout);
  }
  if (attacker.hp <= 0) {
    routUnit(state, attacker, events);
    grantExp(defender, VETERANCY.expPerRout);
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
    heal = Math.min(def.heal, unit.maxHp - unit.hp);
    if (heal <= 0) return false;
    unit.hp += heal;
    targetIds.push(unit.id);
  } else if (def.targeting === "target") {
    const target = state.units.find((u) => u.id === usage.targetId);
    if (!target || !target.alive || target.faction === unit.faction) return false;
    if (manhattan(unit, target) > def.range) return false;
    const dealt = itemDamage(usage.item, target);
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
    for (const tile of tiles) {
      const victim = unitAt(state, tile.x, tile.y);
      if (!victim || victim.faction === unit.faction) continue;
      victim.hp -= def.damage;
      damage += def.damage;
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
