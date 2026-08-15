import { describe, expect, it } from "vitest";
import { WONJEONG_MISSION } from "../src/content/wonjeong";
import { calculateStars, createDefenseState, dispatchCommand, getTowerDefinition, runToEnd, snapshot, stepSimulation, upgradeCost } from "../src/core/engine";
import { hashState } from "../src/core/rng";

function play(seed: number) {
  const state = createDefenseState({ seed });
  dispatchCommand(state, { type: "DEPLOY", towerType: "infantry", nodeId: "ridge-west" });
  dispatchCommand(state, { type: "DEPLOY", towerType: "machineGun", nodeId: "road-west" });
  dispatchCommand(state, { type: "START_WAVE" });
  for (let index = 0; index < 30_000 && state.result === "playing"; index += 1) {
    stepSimulation(state, 1);
    if (!state.activeWave && state.currentWave < WONJEONG_MISSION.waves.length) {
      if (state.deploymentPoints >= 80 && !state.towers.some((tower) => tower.type === "mortar")) dispatchCommand(state, { type: "DEPLOY", towerType: "mortar", nodeId: "road-east" });
      dispatchCommand(state, { type: "START_WAVE" });
    }
  }
  return state;
}

describe("温井塔防固定步长核心", () => {
  function advanceAtFps(fps: number) {
    const state = createDefenseState({ seed: 77 });
    dispatchCommand(state, { type: "DEPLOY", towerType: "infantry", nodeId: "ridge-west" });
    dispatchCommand(state, { type: "START_WAVE" });
    let accumulator = 0;
    for (let frame = 0; frame < fps * 20; frame += 1) {
      accumulator += 20 / fps;
      while (accumulator + 1e-9 >= 1) {
        stepSimulation(state, 1);
        accumulator -= 1;
      }
    }
    return state;
  }

  it("30/60/120 FPS 只影响渲染采样，不改变固定步长结果", () => {
    expect(hashState(advanceAtFps(30))).toBe(hashState(advanceAtFps(60)));
    expect(hashState(advanceAtFps(60))).toBe(hashState(advanceAtFps(120)));
  });

  it("同一种子和指令流产生相同状态指纹", () => {
    const first = play(0x1234);
    const second = play(0x1234);
    expect(hashState(first)).toBe(hashState(second));
    expect(first.result).toBe(second.result);
    expect(first.kills).toBe(second.kills);
  });

  it("暂停不推进模拟时间，2×只改变逻辑推进倍数", () => {
    const state = createDefenseState();
    dispatchCommand(state, { type: "PAUSE", paused: true });
    stepSimulation(state, 20);
    expect(state.tick).toBe(0);
    dispatchCommand(state, { type: "SET_SPEED", speed: 2 });
    stepSimulation(state, 10);
    expect(state.tick).toBe(20);
    expect(state.simulationSeconds).toBe(1);
  });

  it("部署、升级和撤回遵守经济公式", () => {
    const state = createDefenseState();
    expect(dispatchCommand(state, { type: "DEPLOY", towerType: "infantry", nodeId: "ridge-west" })).toBe(true);
    const tower = state.towers[0]!;
    expect(state.deploymentPoints).toBe(80);
    expect(upgradeCost("infantry", 2)).toBe(30);
    expect(dispatchCommand(state, { type: "UPGRADE", towerId: tower.id })).toBe(true);
    expect(tower.level).toBe(2);
    expect(state.deploymentPoints).toBe(50);
    expect(dispatchCommand(state, { type: "SELL", towerId: tower.id })).toBe(true);
    expect(state.deploymentPoints).toBe(99);
  });

  it("迫击炮保留最小射程并具有范围伤害", () => {
    const definition = getTowerDefinition("mortar");
    expect(definition.minRange).toBe(3);
    expect(definition.splashRadius).toBe(2);
    expect(definition.damage).toBe(28);
  });

  it("每个 seed 固定战术变体，变体不会被重置吞掉", () => {
    const first = createDefenseState({ seed: 1 });
    const second = createDefenseState({ seed: 2 });
    expect(first.variant).not.toBe(second.variant);
    expect(snapshot(first).variant).toBe(first.variant);
  });

  it("波次清除后会进入有限补给间隔并自动开始下一波", () => {
    const state = createDefenseState({ seed: 1 });
    dispatchCommand(state, { type: "START_WAVE" });
    for (let tick = 0; tick < 20_000 && (state.activeWave || state.result === "playing"); tick += 1) {
      stepSimulation(state, 1);
      if (!state.activeWave && state.intermissionTicks > 0) break;
    }
    expect(state.result).toBe("playing");
    expect(state.currentWave).toBe(1);
    expect(state.intermissionTicks).toBeGreaterThan(0);
    const remaining = state.intermissionTicks;
    stepSimulation(state, remaining);
    expect(state.activeWave?.number).toBe(2);
    expect(state.intermissionTicks).toBe(0);
  });

  it("普通标准布局能在六波后得到胜负结果并可计算星级", () => {
    const state = play(0x9876);
    expect(["won", "lost"]).toContain(state.result);
    if (state.result === "won") expect(calculateStars(state).stars).toBeGreaterThanOrEqual(1);
    expect(snapshot(state).towers.length).toBe(state.towers.length);
  });

  it("所有部署点不覆盖主路线", () => {
    for (const node of WONJEONG_MISSION.buildNodes) {
      expect(WONJEONG_MISSION.path.some((point) => Math.floor(point.x) === node.x && Math.floor(point.y) === node.y)).toBe(false);
    }
  });

  it("runToEnd 在无防守时会因漏敌失败而停止", () => {
    const state = runToEnd(createDefenseState());
    expect(state.result).toBe("lost");
    expect(state.leaks).toBeGreaterThan(0);
  });
});
