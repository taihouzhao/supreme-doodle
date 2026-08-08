import { describe, expect, it } from "vitest";
import { getMission } from "../src/content/missions";
import { findPath, inEnemyZoc, reachableTiles } from "../src/core/grid";
import { createMissionState } from "../src/core/mission";
import { deriveSeed } from "../src/core/rng";
import type { GameState, Unit } from "../src/core/types";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function scenario(): GameState {
  const mission = getMission("m2-unsan");
  return createMissionState({
    mission,
    seed: deriveSeed(1, mission.id),
    roster: [
      testRosterUnit("r0", "试步兵", "rifle", { keyUnit: true }),
      testRosterUnit("r1", "试机枪", "mg"),
      testRosterUnit("r2", "试迫击炮", "mortar"),
      testRosterUnit("r3", "试坦克", "tank"),
    ],
    inventory: fullInventory({ medkit: 1, at_charge: 1, arty_support: 1 }),
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

describe("敌方控制区", () => {
  /** 全平原空场，只留下需要的单位，方便算准移动消耗 */
  function openField(state: GameState, keepEnemies: string[]): void {
    state.tiles = state.tiles.map(() => "plain");
    for (const unit of state.units) {
      if (unit.faction === "enemy" && !keepEnemies.includes(unit.id)) unit.alive = false;
      if (unit.faction === "player" && unit.id !== "p0") unit.alive = false;
    }
  }

  const costOf = (state: GameState, unit: Unit, x: number, y: number): number | null => {
    const tile = reachableTiles(state, unit).find((t) => t.x === x && t.y === y);
    return tile ? tile.cost : null;
  };

  it("绕过敌军侧翼要付出额外代价，不能贴边穿插", () => {
    const state = scenario();
    openField(state, ["e0"]);
    put(state, "e0", 6, 5);
    const unit = put(state, "p0", 6, 9);
    unit.mpLeft = 40;

    // 敌人身侧可以停留
    expect(costOf(state, unit, 6, 6)).toBe(6);
    // 敌人背后仍能到，但必须绕开控制区，比几何最短路（7 步 = 14）更贵
    const behind = costOf(state, unit, 6, 4);
    expect(behind).not.toBeNull();
    expect(behind!).toBeGreaterThan(14);
  });

  it("两个敌人夹出的缺口只能进不能过", () => {
    const state = scenario();
    openField(state, ["e0", "e1"]);
    put(state, "e0", 5, 5);
    put(state, "e1", 7, 5);
    const unit = put(state, "p0", 6, 9);
    unit.mpLeft = 40;

    // 缺口本身可以踏进去
    expect(inEnemyZoc(state, unit, 6, 5)).toBe(true);
    expect(costOf(state, unit, 6, 5)).toBe(8);
    // 但穿过缺口继续北上要绕远路
    const beyond = costOf(state, unit, 6, 4);
    expect(beyond).not.toBeNull();
    expect(beyond!).toBeGreaterThan(10);
  });

  it("已接触的单位可以脱离，但落点不能越过封锁线", () => {
    const state = scenario();
    openField(state, ["e0"]);
    put(state, "e0", 6, 5);
    const unit = put(state, "p0", 6, 6);
    unit.mpLeft = 40;

    const reach = reachableTiles(state, unit);
    // 向南脱离接触没问题
    expect(reach.some((t) => t.x === 6 && t.y === 8)).toBe(true);
    // 侧移到敌人身侧后必须停下，想继续北上只能绕远
    expect(costOf(state, unit, 5, 5)).toBe(4);
    expect(costOf(state, unit, 5, 4)!).toBeGreaterThan(4);
  });

  it("路径重建同样遵守控制区", () => {
    const state = scenario();
    openField(state, ["e0"]);
    put(state, "e0", 6, 5);
    const unit = put(state, "p0", 6, 9);
    unit.mpLeft = 40;
    const path = findPath(state, unit, { x: 6, y: 6 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 6, y: 6 });
    // 只有终点允许落在控制区里
    for (const step of path!.slice(0, -1)) {
      expect(inEnemyZoc(state, unit, step.x, step.y)).toBe(false);
    }
  });
});
