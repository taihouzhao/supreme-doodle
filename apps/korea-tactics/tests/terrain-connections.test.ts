import { describe, expect, it } from "vitest";
import { getMission } from "../src/content/missions";
import { createMissionState } from "../src/core/mission";
import { deriveSeed } from "../src/core/rng";
import { bridgeAxisAt, CONNECTION, terrainConnectionMask } from "../src/ui/terrainConnections";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function scenario() {
  const mission = getMission("m2-unsan");
  return createMissionState({
    mission,
    seed: deriveSeed(31, mission.id),
    roster: [testRosterUnit("r0", "道路测试", "rifle", { keyUnit: true })],
    inventory: fullInventory(),
  });
}

describe("道路与河流自动连接", () => {
  it("横向河流和纵向公路保持可辨识方向，并识别跨河桥", () => {
    const state = scenario();
    expect(terrainConnectionMask(state, 4, 8, "river")).toBe(
      CONNECTION.east | CONNECTION.west,
    );
    expect(terrainConnectionMask(state, 10, 7, "road")).toBe(
      CONNECTION.north | CONNECTION.south,
    );
    expect(bridgeAxisAt(state, 9, 8)).toBe("north-south");
    expect(bridgeAxisAt(state, 10, 8)).toBe("north-south");
  });

  it("相邻正交线段组成转弯，而不是继续复用同一方向贴图", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    state.tiles[5 * state.width + 5] = "road";
    state.tiles[6 * state.width + 5] = "road";
    state.tiles[6 * state.width + 6] = "road";
    expect(terrainConnectionMask(state, 5, 6, "road")).toBe(
      CONNECTION.north | CONNECTION.east,
    );
  });

  it("道路会接入沿线村镇，不在镇口突然变回纵向贴图", () => {
    const state = scenario();
    // 云山城位于 (10,4)，左右道路应明确接入城镇。
    expect(terrainConnectionMask(state, 9, 4, "road") & CONNECTION.east).toBeTruthy();
    expect(terrainConnectionMask(state, 11, 4, "road") & CONNECTION.west).toBeTruthy();
  });

  it("没有明确桥梁史实标记的道路渡河带保持为浅滩", () => {
    const mission = getMission("m12-kumsong");
    const state = createMissionState({
      mission,
      seed: deriveSeed(32, mission.id),
      roster: [testRosterUnit("r0", "浅滩测试", "rifle", { keyUnit: true })],
      inventory: fullInventory(),
    });
    expect(bridgeAxisAt(state, 9, 10)).toBeNull();
    expect(bridgeAxisAt(state, 10, 10)).toBeNull();
  });
});
