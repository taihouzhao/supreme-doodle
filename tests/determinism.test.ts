import { describe, expect, it } from "vitest";
import { getAgent } from "../src/ai";
import { applyAction, hashState, legalActions } from "../src/core/engine";
import { Rng, deriveSeed, nextRandom } from "../src/core/rng";
import { playStandaloneMission } from "../src/sim/runner";
import { MISSION_LIST } from "../src/content/missions";
import { createCampaign } from "../src/core/campaign";
import { createMissionState } from "../src/core/mission";
import type { Action, GameState } from "../src/core/types";

function freshState(missionId: string, seed: number): GameState {
  const mission = MISSION_LIST.find((m) => m.id === missionId)!;
  const campaign = createCampaign("chapter-one", seed);
  const roster = campaign.roster
    .slice()
    .sort((a, b) => b.exp - a.exp || a.id.localeCompare(b.id))
    .slice(0, mission.playerSpawns.length);
  return createMissionState({
    mission,
    seed: deriveSeed(seed, mission.id),
    roster,
    inventory: campaign.inventory,
  });
}

function replay(missionId: string, seed: number, actions: Action[]): GameState {
  let state = freshState(missionId, seed);
  for (const action of actions) {
    if (state.status !== "playing") break;
    state = applyAction(state, action).state;
  }
  return state;
}

describe("确定性随机", () => {
  it("同一状态推进出同一结果", () => {
    const a = nextRandom(12345);
    const b = nextRandom(12345);
    expect(a).toEqual(b);
  });

  it("不同标签派生出不同子流", () => {
    expect(deriveSeed(7, "combat")).not.toBe(deriveSeed(7, "weather"));
    expect(deriveSeed(7, "combat")).toBe(deriveSeed(7, "combat"));
  });

  it("Rng 序列可复现", () => {
    const first = Array.from({ length: 8 }, () => new Rng(99).next());
    const second = new Rng(99);
    expect(first[0]).toBe(second.next());
  });
});

describe("关卡装载", () => {
  it("同一种子产生完全相同的初始状态", () => {
    for (const mission of MISSION_LIST) {
      expect(hashState(freshState(mission.id, 42))).toBe(hashState(freshState(mission.id, 42)));
    }
  });

  it("不同种子会改变敌军编成或天气", () => {
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1) {
      const state = freshState("m1-breakthrough", seed);
      signatures.add(
        `${state.weather}|${state.units
          .filter((u) => u.faction === "enemy")
          .map((u) => u.type)
          .join(",")}|${state.pending.map((p) => p.turn).join(",")}`,
      );
    }
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("核心要素在所有种子下保持不变", () => {
    const baseline = freshState("m1-breakthrough", 1);
    for (let seed = 2; seed <= 20; seed += 1) {
      const state = freshState("m1-breakthrough", seed);
      expect(state.tiles).toEqual(baseline.tiles);
      expect(state.objectives.map((o) => `${o.id}:${o.x},${o.y}`)).toEqual(
        baseline.objectives.map((o) => `${o.id}:${o.x},${o.y}`),
      );
      expect(
        state.units.filter((u) => u.faction === "player").map((u) => `${u.type}@${u.x},${u.y}`),
      ).toEqual(
        baseline.units.filter((u) => u.faction === "player").map((u) => `${u.type}@${u.x},${u.y}`),
      );
    }
  });
});

describe("applyAction", () => {
  it("是纯函数，不修改传入状态", () => {
    const state = freshState("m1-breakthrough", 3);
    const before = hashState(state);
    const move = legalActions(state).find((a) => a.kind === "move")!;
    applyAction(state, move);
    expect(hashState(state)).toBe(before);
  });

  it("非法动作会抛错而不是静默失败", () => {
    const state = freshState("m1-breakthrough", 3);
    expect(() => applyAction(state, { kind: "attack", unitId: "p0", targetId: "e0" })).toThrow();
  });
});

describe("重放", () => {
  it.each(MISSION_LIST.map((m) => m.id))("%s 的整局可以完整复现", (missionId) => {
    for (const agentId of ["random", "basic", "tactical"]) {
      const run = playStandaloneMission("chapter-one", missionId, getAgent(agentId), 11);
      const replayed = replay(missionId, 11, run.actions);
      expect(hashState(replayed)).toBe(hashState(run.finalState));
      expect(replayed.status).toBe(run.status);
    }
  });

  it("同一 Agent 同一种子两次运行结果一致", () => {
    const a = playStandaloneMission("chapter-one", "m2-hold", getAgent("tactical"), 5);
    const b = playStandaloneMission("chapter-one", "m2-hold", getAgent("tactical"), 5);
    expect(hashState(a.finalState)).toBe(hashState(b.finalState));
    expect(a.actions).toEqual(b.actions);
  });
});
