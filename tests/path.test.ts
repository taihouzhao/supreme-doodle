import { describe, expect, it } from "vitest";
import { getMission } from "../src/content/missions";
import { findPath, reachableTiles } from "../src/core/grid";
import { createMissionState } from "../src/core/mission";
import { deriveSeed } from "../src/core/rng";
import type { GameState, Unit } from "../src/core/types";

function scenario(): GameState {
  const mission = getMission("m2-unsan");
  return createMissionState({
    mission,
    seed: deriveSeed(1, mission.id),
    roster: [
      { id: "r0", name: "步兵", type: "rifle", hp: 100, maxHp: 100, exp: 0, fatigue: 0, missionsSurvived: 0, keyUnit: true },
      { id: "r1", name: "机枪", type: "mg", hp: 90, maxHp: 90, exp: 0, fatigue: 0, missionsSurvived: 0, keyUnit: false },
      { id: "r2", name: "迫击炮", type: "mortar", hp: 70, maxHp: 70, exp: 0, fatigue: 0, missionsSurvived: 0, keyUnit: false },
      { id: "r3", name: "坦克", type: "tank", hp: 140, maxHp: 140, exp: 0, fatigue: 0, missionsSurvived: 0, keyUnit: false },
    ],
    inventory: { medkit: 1, at_charge: 1, arty_support: 1 },
  });
}

function put(state: GameState, unitId: string, x: number, y: number): Unit {
  const unit = state.units.find((u) => u.id === unitId)!;
  unit.x = x;
  unit.y = y;
  return unit;
}

describe("findPath", () => {
  it("重建与可达域一致的路径，含起终点", () => {
    const state = scenario();
    const unit = put(state, "p0", 6, 9);
    unit.mpLeft = 8;
    const reach = reachableTiles(state, unit).find((t) => t.x === 6 && t.y === 7);
    expect(reach).toBeTruthy();
    const path = findPath(state, unit, { x: 6, y: 7 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 6, y: 9 });
    expect(path![path!.length - 1]).toEqual({ x: 6, y: 7 });
    for (let i = 1; i < path!.length; i += 1) {
      const a = path![i - 1]!;
      const b = path![i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });

  it("移动结算后仍可按 from 覆盖重建路径", () => {
    const state = scenario();
    const unit = put(state, "p0", 6, 7);
    unit.mpLeft = 2;
    const path = findPath(state, unit, { x: 6, y: 7 }, { x: 6, y: 9 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 6, y: 9 });
    expect(path!.at(-1)).toEqual({ x: 6, y: 7 });
  });
});
