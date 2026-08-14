import { TERRAIN } from "../content/terrain";
import { livingUnits, manhattan, tileAt } from "../core/grid";
import type { Rng } from "../core/rng";
import type { Action, GameState, Unit } from "../core/types";
import { approachTile, attackOptions, nearest, standingObjective, stoppableTiles, unitsToAct } from "./helpers";
import type { Agent } from "./types";

function bestTarget(state: GameState, unit: Unit): Action | null {
  const options = attackOptions(state, unit);
  if (options.length === 0) return null;
  const best = options.reduce((chosen, candidate) => {
    if (candidate.lethal !== chosen.lethal) return candidate.lethal ? candidate : chosen;
    return candidate.damage > chosen.damage ? candidate : chosen;
  });
  return { kind: "attack", unitId: unit.id, targetId: best.target.id };
}

/** 无脑龟缩：原地不动，只打进入射程的敌人 */
export const turtleAgent: Agent = {
  id: "turtle",
  name: "原地固守",
  decide(state: GameState, _rng: Rng): Action {
    for (const unit of unitsToAct(state)) {
      if (standingObjective(state, unit)) return { kind: "capture", unitId: unit.id };
      const attack = bestTarget(state, unit);
      if (attack) return attack;
      return { kind: "wait", unitId: unit.id };
    }
    return { kind: "endTurn" };
  },
};

/** 无脑直推：永远冲向最近的敌人 */
export const rushAgent: Agent = {
  id: "rush",
  name: "无脑直推",
  decide(state: GameState, _rng: Rng): Action {
    for (const unit of unitsToAct(state)) {
      if (standingObjective(state, unit)) return { kind: "capture", unitId: unit.id };
      const target = nearest(unit, livingUnits(state, "enemy"));
      if (target && unit.mpLeft > 0) {
        const tile = approachTile(state, unit, target);
        if (tile && tile.cost > 0 && manhattan(tile, target) < manhattan(unit, target)) {
          return { kind: "move", unitId: unit.id, to: { x: tile.x, y: tile.y } };
        }
      }
      const attack = bestTarget(state, unit);
      if (attack) return attack;
      return { kind: "wait", unitId: unit.id };
    }
    return { kind: "endTurn" };
  },
};

/** 无脑抢高地：所有单位堆到防御最好的地形上 */
export const hillCampAgent: Agent = {
  id: "hillcamp",
  name: "高地堆叠",
  decide(state: GameState, _rng: Rng): Action {
    for (const unit of unitsToAct(state)) {
      if (standingObjective(state, unit)) return { kind: "capture", unitId: unit.id };

      const here = tileAt(state, unit.x, unit.y).defense;
      if (unit.mpLeft > 0 && here < TERRAIN.hill.defense) {
        const tiles = stoppableTiles(state, unit);
        let best = null as (typeof tiles)[number] | null;
        let bestDefense = here;
        for (const tile of tiles) {
          const defense = tileAt(state, tile.x, tile.y).defense;
          if (defense > bestDefense) {
            best = tile;
            bestDefense = defense;
          }
        }
        if (best && best.cost > 0) {
          return { kind: "move", unitId: unit.id, to: { x: best.x, y: best.y } };
        }
      }

      const attack = bestTarget(state, unit);
      if (attack) return attack;
      return { kind: "wait", unitId: unit.id };
    }
    return { kind: "endTurn" };
  },
};

export const DEGENERATE_AGENTS: Agent[] = [turtleAgent, rushAgent, hillCampAgent];
