import { UNIT_TYPES } from "../content/units";
import { livingUnits, manhattan } from "../core/grid";
import type { Rng } from "../core/rng";
import type { Action, GameState, Unit, Vec2 } from "../core/types";
import {
  approachTile,
  attackOptions,
  captureGoal,
  evacGoal,
  nearest,
  standingObjective,
  unitsToAct,
} from "./helpers";
import type { Agent } from "./types";

function basicGoal(state: GameState, unit: Unit): Vec2 | null {
  const enemies = livingUnits(state, "enemy");

  if (state.missionKind === "breakthrough") {
    // 只有步兵去占点，其他兵种去打人，免得堵住目标格
    if (UNIT_TYPES[unit.type].canCapture) {
      return captureGoal(state, unit) ?? nearest(unit, enemies);
    }
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

/** 朝目标推进，攻击射程内最容易击溃的敌人。作为「一般玩家」的基线。 */
export const basicAgent: Agent = {
  id: "basic",
  name: "基础策略",
  decide(state: GameState, _rng: Rng): Action {
    for (const unit of unitsToAct(state)) {
      if (standingObjective(state, unit)) {
        return { kind: "capture", unitId: unit.id };
      }

      // 先朝目标推进，再打射程内的敌人
      if (unit.mpLeft > 0) {
        const goal = basicGoal(state, unit);
        if (goal) {
          const tile = approachTile(state, unit, goal);
          if (tile && tile.cost > 0 && manhattan(tile, goal) < manhattan(unit, goal)) {
            return { kind: "move", unitId: unit.id, to: { x: tile.x, y: tile.y } };
          }
        }
      }

      const options = attackOptions(state, unit);
      if (options.length > 0) {
        const best = options.reduce((chosen, candidate) => {
          if (candidate.lethal !== chosen.lethal) return candidate.lethal ? candidate : chosen;
          return candidate.target.hp < chosen.target.hp ? candidate : chosen;
        });
        return { kind: "attack", unitId: unit.id, targetId: best.target.id };
      }

      return { kind: "wait", unitId: unit.id };
    }

    return { kind: "endTurn" };
  },
};
