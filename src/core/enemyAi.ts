import { UNIT_TYPES } from "../content/units";
import { COUNTER_RATIO, estimateDamageFrom } from "./combat";
import { livingUnits, manhattan, reachableTiles, tileAt, unitAt } from "./grid";
import type { ReachableTile } from "./grid";
import { performAttack, performCapture, performMove, performWait } from "./resolve";
import type { GameEvent, GameState, Unit, Vec2 } from "./types";

/** 防守型关卡里，敌人不会离开阵地太远去追人 */
const DEFENDER_LEASH = 7;

function rangeFrom(state: GameState, unit: Unit, pos: Vec2): { min: number; max: number } {
  const def = UNIT_TYPES[unit.type];
  const bonus = tileAt(state, pos.x, pos.y).rangeBonus;
  return { min: def.minRange, max: def.maxRange + bonus };
}

function canCounterFrom(state: GameState, attacker: Unit, defender: Unit, from: Vec2): boolean {
  if (UNIT_TYPES[attacker.type].indirect) return false;
  const range = rangeFrom(state, defender, { x: defender.x, y: defender.y });
  const distance = manhattan(from, defender);
  return distance >= range.min && distance <= range.max;
}

interface AttackPlan {
  tile: ReachableTile;
  target: Unit;
  score: number;
}

function bestAttackPlan(state: GameState, unit: Unit, tiles: ReachableTile[]): AttackPlan | null {
  const targets = livingUnits(state, "player");
  let best: AttackPlan | null = null;

  for (const tile of tiles) {
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    const range = rangeFrom(state, unit, tile);
    const moved = tile.cost > 0;

    for (const target of targets) {
      const distance = manhattan(tile, target);
      if (distance < range.min || distance > range.max) continue;

      const damage = estimateDamageFrom(state, unit, target, tile, moved);
      const counter = canCounterFrom(state, unit, target, tile)
        ? estimateDamageFrom(state, target, unit, { x: target.x, y: target.y }, false) *
          COUNTER_RATIO
        : 0;

      let score = damage - counter * 0.7;
      score += tileAt(state, tile.x, tile.y).defense * 25;
      score -= tile.cost * 0.2;
      if (target.hp <= damage) score += 30;

      if (
        !best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) < 1e-9 &&
          (tile.y < best.tile.y || (tile.y === best.tile.y && tile.x < best.tile.x)))
      ) {
        best = { tile, target, score };
      }
    }
  }

  return best;
}

function lostObjective(state: GameState, unit: Unit): Vec2 | null {
  if (!UNIT_TYPES[unit.type].canCapture) return null;
  const lost = state.objectives.filter((o) => o.kind === "capture" && o.owner === "player");
  if (lost.length === 0) return null;
  const target = lost.reduce((closest, candidate) =>
    manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
  );
  return { x: target.x, y: target.y };
}

function goalFor(state: GameState, unit: Unit): Vec2 | null {
  const players = livingUnits(state, "player");
  if (players.length === 0) return null;

  const nearestPlayer = players.reduce((closest, candidate) =>
    manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
  );

  if (state.missionKind === "hold") {
    const held = state.objectives.filter((o) => o.kind === "hold" && o.owner === "player");
    if (held.length > 0) {
      const target = held.reduce((closest, candidate) =>
        manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
      );
      return { x: target.x, y: target.y };
    }
    return { x: nearestPlayer.x, y: nearestPlayer.y };
  }

  if (state.missionKind === "breakthrough") {
    const retake = lostObjective(state, unit);
    if (retake) return retake;
    if (manhattan(unit, nearestPlayer) > DEFENDER_LEASH) return null;
  }

  return { x: nearestPlayer.x, y: nearestPlayer.y };
}

function bestApproachTile(
  state: GameState,
  unit: Unit,
  tiles: ReachableTile[],
  goal: Vec2,
): ReachableTile | null {
  let best: ReachableTile | null = null;
  let bestKey: [number, number] = [Infinity, -Infinity];

  for (const tile of tiles) {
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    const distance = manhattan(tile, goal);
    const defense = tileAt(state, tile.x, tile.y).defense;
    if (distance < bestKey[0] || (distance === bestKey[0] && defense > bestKey[1])) {
      best = tile;
      bestKey = [distance, defense];
    }
  }

  return best;
}

/** 确定性脚本 AI：同一状态永远产生同一批动作 */
export function runEnemyPhase(state: GameState, events: GameEvent[]): void {
  const order = livingUnits(state, "enemy")
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of order) {
    if (!unit.alive || unit.hasActed) continue;
    if (state.status !== "playing") return;

    if (performCapture(state, unit, events)) continue;

    const tiles = reachableTiles(state, unit);
    const retake = lostObjective(state, unit);
    if (retake) {
      const spot = tiles.find((t) => t.x === retake.x && t.y === retake.y);
      if (spot && !unitAt(state, spot.x, spot.y)) {
        performMove(state, unit, { x: spot.x, y: spot.y }, events);
        if (performCapture(state, unit, events)) continue;
      }
    }

    const plan = bestAttackPlan(state, unit, tiles);

    if (plan) {
      if (plan.tile.cost > 0) {
        performMove(state, unit, { x: plan.tile.x, y: plan.tile.y }, events);
      }
      performAttack(state, unit, plan.target, events);
      continue;
    }

    const goal = goalFor(state, unit);
    if (goal) {
      const approach = bestApproachTile(state, unit, tiles, goal);
      if (approach && approach.cost > 0) {
        performMove(state, unit, { x: approach.x, y: approach.y }, events);
      }
    }

    if (unit.alive && !unit.hasActed) performWait(state, unit);
  }
}
