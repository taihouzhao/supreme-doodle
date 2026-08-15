import { describe, expect, it } from "vitest";
import { calculateStars, createDefenseState, dispatchCommand, stepSimulation } from "../src/core/engine";
import type { ArmoryLevels, DefenseMode } from "../src/core/types";

const EMPTY: ArmoryLevels = { infantry: [0, 0, 0], machineGun: [0, 0, 0], mortar: [0, 0, 0] };
const FULL: ArmoryLevels = { infantry: [1, 1, 1], machineGun: [1, 1, 1], mortar: [1, 1, 1] };

function stagedRun(mode: DefenseMode, armory: ArmoryLevels, seed: number, upgrade = false) {
  const state = createDefenseState({ mode, armory, seed });
  dispatchCommand(state, { type: "DEPLOY", towerType: "infantry", nodeId: "ridge-west" });
  dispatchCommand(state, { type: "DEPLOY", towerType: "machineGun", nodeId: "road-west" });
  dispatchCommand(state, { type: "START_WAVE" });
  for (let tick = 0; tick < 250_000 && state.result === "playing"; tick += 1) {
    stepSimulation(state, 1);
    if (!state.activeWave && state.currentWave < state.mission.waves.length) {
      if (!state.towers.some((tower) => tower.type === "mortar") && state.deploymentPoints >= 80) dispatchCommand(state, { type: "DEPLOY", towerType: "mortar", nodeId: "road-east" });
      if (state.currentWave >= 2 && !state.towers.some((tower) => tower.nodeId === "last-stand") && state.deploymentPoints >= 40) dispatchCommand(state, { type: "DEPLOY", towerType: "infantry", nodeId: "last-stand" });
      if (upgrade && state.currentWave >= 3) {
        for (const tower of [...state.towers]) {
          if (tower.level < 3 && state.deploymentPoints >= 30) dispatchCommand(state, { type: "UPGRADE", towerId: tower.id });
        }
      }
      dispatchCommand(state, { type: "START_WAVE" });
    }
  }
  return { result: state.result, stars: calculateStars(state).stars, seconds: state.simulationSeconds, integrity: state.commandPostIntegrity };
}

function soloRun(mode: DefenseMode, seed: number) {
  const state = createDefenseState({ mode, seed });
  dispatchCommand(state, { type: "DEPLOY", towerType: "machineGun", nodeId: "road-west" });
  dispatchCommand(state, { type: "START_WAVE" });
  for (let tick = 0; tick < 250_000 && state.result === "playing"; tick += 1) {
    stepSimulation(state, 1);
    if (!state.activeWave && state.currentWave < state.mission.waves.length) dispatchCommand(state, { type: "START_WAVE" });
  }
  return { result: state.result, stars: calculateStars(state).stars, integrity: state.commandPostIntegrity };
}

describe("温井平衡模拟", () => {
  it("标准普通布局在约 8–12 分钟内稳定三星", () => {
    const results = [1, 2, 3, 4, 5].map((seed) => stagedRun("normal", EMPTY, seed));
    expect(results.every((result) => result.result === "won" && result.stars === 3)).toBe(true);
    expect(results.every((result) => result.seconds >= 8 * 60 && result.seconds <= 12 * 60)).toBe(true);
  });

  it("困难模式的未升级配置不能稳定三星，而六枚勋章配置可完成", () => {
    const unupgraded = [1, 2, 3, 4, 5].map((seed) => stagedRun("hard", EMPTY, seed));
    const upgraded = [1, 2, 3, 4, 5].map((seed) => stagedRun("hard", FULL, seed));
    expect(unupgraded.some((result) => result.result === "lost")).toBe(true);
    expect(unupgraded.every((result) => result.stars < 3)).toBe(true);
    expect(upgraded.every((result) => result.result === "won")).toBe(true);
  });

  it("单一兵种不能同时统治普通与困难", () => {
    const normal = [1, 2, 3].map((seed) => soloRun("normal", seed));
    const hard = [1, 2, 3].map((seed) => soloRun("hard", seed));
    expect(normal.some((result) => result.result !== "won" || result.stars < 3 || result.integrity < 85)).toBe(true);
    expect(hard.some((result) => result.result !== "won" || result.stars < 3 || result.integrity < 85)).toBe(true);
  });
});
