import { ClassicRng } from "../core/rng";
import { i16, i16Add, i16Sub } from "../core/i16";
import type {
  BattleState,
  BattleUnit,
  ContentPack,
  Presentation,
  WorldState,
} from "../core/types";

/** Draft range. Marked unverified until a hashed DOS binary is locked. */
const MOVE_RANGE = 2;
const ATTACK_RANGE = 1;
const DAMAGE_SPREAD = 3;

export function startBattle(state: WorldState, content: ContentPack, battleId: string): void {
  const template = content.battles[battleId];
  if (!template) {
    throw new Error(`unknown battle ${battleId}`);
  }
  state.battle = {
    id: template.id,
    formulaStatus: "unverified-vs-original",
    seedAtStart: state.rngSeed,
    width: template.width,
    height: template.height,
    units: template.units.map((unit) => ({ ...unit })),
    turnIndex: 0,
    round: 1,
    result: "ongoing",
    log: [],
  };
  skipDeadTurns(state.battle);
  state.log.push(`battle:${battleId}`);
}

export function currentActor(battle: BattleState): BattleUnit | undefined {
  const living = livingTurnOrder(battle);
  if (living.length === 0) return undefined;
  return living[battle.turnIndex % living.length];
}

export function tryBattleMove(
  state: WorldState,
  unitId: string,
  x: number,
  y: number,
  presentation: Presentation,
): boolean {
  const battle = state.battle;
  if (!battle || battle.result !== "ongoing") return false;
  const actor = requireCurrent(battle, unitId);
  if (!actor) return false;
  if (!inBounds(battle, x, y)) return false;
  if (manhattan(actor.x, actor.y, x, y) > MOVE_RANGE) return false;
  if (occupiedByOther(battle, unitId, x, y)) return false;
  actor.x = x;
  actor.y = y;
  battle.log.push({ kind: "move", actorId: unitId, x, y });
  presentation.animation.push(`move:${unitId}:${x},${y}`);
  finishActorTurn(state, presentation);
  return true;
}

export function tryBattleAttack(
  state: WorldState,
  unitId: string,
  targetId: string,
  presentation: Presentation,
): boolean {
  if (!applyAttack(state, unitId, targetId, presentation, true)) return false;
  if (state.battle?.result === "ongoing") {
    finishActorTurn(state, presentation);
  }
  return true;
}

export function tryBattleWait(state: WorldState, unitId: string, presentation: Presentation): boolean {
  const battle = state.battle;
  if (!battle || battle.result !== "ongoing") return false;
  const actor = requireCurrent(battle, unitId);
  if (!actor) return false;
  battle.log.push({ kind: "wait", actorId: unitId });
  finishActorTurn(state, presentation);
  return true;
}

function applyAttack(
  state: WorldState,
  unitId: string,
  targetId: string,
  presentation: Presentation,
  requireTurn: boolean,
): boolean {
  const battle = state.battle;
  if (!battle || battle.result !== "ongoing") return false;
  const actor = requireTurn ? requireCurrent(battle, unitId) : battle.units.find((unit) => unit.id === unitId);
  const target = battle.units.find((unit) => unit.id === targetId);
  if (!actor || !actor.alive || !target || !target.alive) return false;
  if (actor.side === target.side) return false;
  if (manhattan(actor.x, actor.y, target.x, target.y) > ATTACK_RANGE) return false;

  const rng = new ClassicRng(state.rngSeed);
  const spread = rng.bounded(DAMAGE_SPREAD);
  state.rngSeed = rng.getSeed();
  const raw = i16Add(i16Sub(actor.attack, target.defence), spread);
  const amount = i16(Math.max(1, raw));
  target.hp = i16(Math.max(0, i16Sub(target.hp, amount)));
  if (target.hp <= 0) {
    target.alive = false;
    target.hp = 0;
  }
  battle.log.push({ kind: "attack", actorId: unitId, targetId, amount });
  battle.log.push({ kind: "damage", actorId: unitId, targetId, amount });
  presentation.animation.push(`attack:${unitId}:${targetId}:${amount}`);
  resolveBattleEnd(state, presentation);
  return true;
}

function finishActorTurn(state: WorldState, presentation: Presentation): void {
  const battle = state.battle;
  if (!battle || battle.result !== "ongoing") return;
  advanceTurn(battle);
  while (battle.result === "ongoing") {
    const actor = currentActor(battle);
    if (!actor || actor.side === "player") break;
    runClassicAi(state, actor, presentation);
    if (battle.result !== "ongoing") break;
    advanceTurn(battle);
  }
}

function runClassicAi(state: WorldState, actor: BattleUnit, presentation: Presentation): void {
  const battle = state.battle;
  if (!battle) return;
  const foe = nearestFoe(battle, actor);
  if (!foe) {
    battle.log.push({ kind: "wait", actorId: actor.id });
    return;
  }
  if (manhattan(actor.x, actor.y, foe.x, foe.y) <= ATTACK_RANGE) {
    applyAttack(state, actor.id, foe.id, presentation, false);
    return;
  }
  const step = stepToward(battle, actor, foe);
  if (step) {
    actor.x = step.x;
    actor.y = step.y;
    battle.log.push({ kind: "move", actorId: actor.id, x: step.x, y: step.y });
    presentation.animation.push(`move:${actor.id}:${step.x},${step.y}`);
    return;
  }
  battle.log.push({ kind: "wait", actorId: actor.id });
}

function resolveBattleEnd(state: WorldState, presentation: Presentation): void {
  const battle = state.battle;
  if (!battle) return;
  const playersAlive = battle.units.some((unit) => unit.side === "player" && unit.alive);
  const enemiesAlive = battle.units.some((unit) => unit.side === "enemy" && unit.alive);
  if (!enemiesAlive) {
    battle.result = "win";
    if (!state.battlesWon.includes(battle.id)) {
      state.battlesWon.push(battle.id);
    }
    state.log.push(`battle-win:${battle.id}`);
    presentation.animation.push(`battle-win:${battle.id}`);
    return;
  }
  if (!playersAlive) {
    battle.result = "lose";
    state.log.push(`battle-lose:${battle.id}`);
    presentation.animation.push(`battle-lose:${battle.id}`);
  }
}

function livingTurnOrder(battle: BattleState): BattleUnit[] {
  return battle.units
    .filter((unit) => unit.alive)
    .sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id));
}

function skipDeadTurns(battle: BattleState): void {
  const living = livingTurnOrder(battle);
  if (living.length === 0) return;
  battle.turnIndex %= living.length;
}

function advanceTurn(battle: BattleState): void {
  const living = livingTurnOrder(battle);
  if (living.length === 0) return;
  battle.turnIndex = (battle.turnIndex + 1) % living.length;
  if (battle.turnIndex === 0) {
    battle.round += 1;
  }
}

function requireCurrent(battle: BattleState, unitId: string): BattleUnit | undefined {
  const actor = currentActor(battle);
  if (!actor || actor.id !== unitId || !actor.alive) return undefined;
  return actor;
}

function occupiedByOther(battle: BattleState, unitId: string, x: number, y: number): boolean {
  return battle.units.some((unit) => unit.alive && unit.id !== unitId && unit.x === x && unit.y === y);
}

function inBounds(battle: BattleState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < battle.width && y < battle.height;
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function nearestFoe(battle: BattleState, actor: BattleUnit): BattleUnit | undefined {
  const foes = battle.units.filter((unit) => unit.alive && unit.side !== actor.side);
  foes.sort(
    (a, b) =>
      manhattan(actor.x, actor.y, a.x, a.y) - manhattan(actor.x, actor.y, b.x, b.y) ||
      a.id.localeCompare(b.id),
  );
  return foes[0];
}

function stepToward(
  battle: BattleState,
  actor: BattleUnit,
  target: BattleUnit,
): { x: number; y: number } | undefined {
  const occupied = new Set(
    battle.units.filter((unit) => unit.alive && unit.id !== actor.id).map((unit) => `${unit.x},${unit.y}`),
  );
  let best: { x: number; y: number; dist: number } | undefined;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      const x = actor.x + dx;
      const y = actor.y + dy;
      if (!inBounds(battle, x, y) || occupied.has(`${x},${y}`)) continue;
      const dist = manhattan(x, y, target.x, target.y);
      if (!best || dist < best.dist || (dist === best.dist && `${x},${y}` < `${best.x},${best.y}`)) {
        best = { x, y, dist };
      }
    }
  }
  return best;
}

/** Leave a finished grid so world travel resumes. Encounter id stays in `battlesWon`. */
export function clearFinishedBattle(state: WorldState): void {
  if (state.battle && state.battle.result !== "ongoing") {
    state.battle = null;
  }
}
