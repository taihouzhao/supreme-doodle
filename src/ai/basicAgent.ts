import { UNIT_TYPES } from "../content/units";
import { livingUnits, manhattan } from "../core/grid";
import type { Rng } from "../core/rng";
import type { Action, GameState, Unit, Vec2 } from "../core/types";
import {
  approachTile,
  attackOptions,
  canBeCountered,
  captureGoal,
  evacGoal,
  nearest,
  standingObjective,
  stoppableTiles,
  unitsToAct,
} from "./helpers";
import type { Agent } from "./types";

function basicGoal(state: GameState, unit: Unit): Vec2 | null {
  const enemies = livingUnits(state, "enemy");

  if (unit.keyUnit) {
    if (state.missionKind === "withdraw") return evacGoal(state, unit);
    const posts =
      state.missionKind === "hold"
        ? state.objectives.filter((o) => o.kind === "hold" && o.owner === "player")
        : state.objectives.filter((o) => o.kind === "capture");
    const post = nearest(unit, posts);
    if (post && manhattan(unit, post) > 2) return post;
    return null;
  }

  if (state.missionKind === "breakthrough") {
    if (UNIT_TYPES[unit.type].canCapture) {
      return captureGoal(state, unit) ?? nearest(unit, enemies);
    }
    // 支援兵种只向敌人靠近，不占住目标格堵住真正能占领的步兵。
    return nearest(unit, enemies);
  }

  if (state.missionKind === "withdraw") {
    return evacGoal(state, unit);
  }

  const held = state.objectives.filter((o) => o.kind === "hold" && o.owner === "player");
  const post = nearest(unit, held);
  if (post && manhattan(unit, post) > 1) return post;
  return null;
}

function retreatTile(state: GameState, unit: Unit): Vec2 | null {
  const enemies = livingUnits(state, "enemy");
  const threat = nearest(unit, enemies);
  if (!threat) return null;
  let best: { x: number; y: number; dist: number } | null = null;
  for (const tile of stoppableTiles(state, unit)) {
    if (tile.cost === 0) continue;
    const dist = manhattan(tile, threat);
    if (!best || dist > best.dist) best = { x: tile.x, y: tile.y, dist };
  }
  if (best && best.dist > manhattan(unit, threat)) return { x: best.x, y: best.y };
  return null;
}

/** 朝目标推进，攻击射程内最容易击溃的敌人。作为「一般玩家」的基线。 */
export const basicAgent: Agent = {
  id: "basic",
  name: "基础策略",
  decide(state: GameState, _rng: Rng): Action {
    for (const unit of unitsToAct(state)) {
      if (standingObjective(state, unit)) {
        return { kind: "capture", unitId: unit.id };
      }

      const fragileKey = Boolean(unit.keyUnit && unit.hp / unit.maxHp < 0.7);

      if (unit.mpLeft > 0) {
        if (fragileKey) {
          const safeGoal =
            state.missionKind === "withdraw" ? evacGoal(state, unit) : retreatTile(state, unit);
          if (safeGoal) {
            const tile =
              state.missionKind === "withdraw"
                ? approachTile(state, unit, safeGoal)
                : { x: safeGoal.x, y: safeGoal.y, cost: 1 };
            if (tile && (tile.x !== unit.x || tile.y !== unit.y)) {
              return { kind: "move", unitId: unit.id, to: { x: tile.x, y: tile.y } };
            }
          }
        } else {
          const goal = basicGoal(state, unit);
          if (goal) {
            const tile = approachTile(state, unit, goal);
            if (tile && tile.cost > 0 && manhattan(tile, goal) < manhattan(unit, goal)) {
              return { kind: "move", unitId: unit.id, to: { x: tile.x, y: tile.y } };
            }
          }
        }
      }

      if (!fragileKey) {
        const options = attackOptions(state, unit).filter(
          (option) => !(unit.keyUnit && canBeCountered(state, unit, option.target)),
        );
        if (options.length > 0) {
          const best = options.reduce((chosen, candidate) => {
            if (candidate.lethal !== chosen.lethal) return candidate.lethal ? candidate : chosen;
            return candidate.target.hp < chosen.target.hp ? candidate : chosen;
          });
          return { kind: "attack", unitId: unit.id, targetId: best.target.id };
        }
      }

      return { kind: "wait", unitId: unit.id };
    }

    return { kind: "endTurn" };
  },
};
