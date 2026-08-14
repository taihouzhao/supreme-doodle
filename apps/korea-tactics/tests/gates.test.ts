import { describe, expect, it } from "vitest";
import { evaluateGates, THRESHOLDS } from "../src/sim/gates";
import type { MissionAggregate } from "../src/sim/stats";

function aggregate(agentId: string, missionId: string, winRate: number): MissionAggregate {
  return {
    agentId,
    missionId,
    runs: 100,
    winRate,
    winRateStdDev: 0,
    avgCasualties: 0,
    avgSurvivors: 1,
    avgTurns: 1,
    avgEnemyRouted: 0,
    avgEvacuated: 0,
    avgLevelAlive: 0,
    lostSeeds: [],
  };
}

function localGate(rows: MissionAggregate[]) {
  const gates = evaluateGates({
    missions: [],
    degenerates: rows,
    campaigns: [],
    unwinnableSeeds: {},
    recovery: {
      runs: 0,
      firstMissionWinRate: 0,
      finalMissionWinRate: 0,
      avgRosterBeforeFinal: 0,
      avgPermanentLosses: 0,
      avgLevelAtEnd: 0,
    },
  });
  return gates.find((gate) => gate.id === "no-local-dominant-strategy")!;
}

function playerWinGate(rate: number, runs: number) {
  const gates = evaluateGates({
    missions: [],
    degenerates: [],
    campaigns: [
      {
        agentId: "basic",
        runs,
        fullClearRate: 0,
        avgMissionsWon: rate * 12,
        avgCompletionRate: rate,
        avgLevelAtEnd: 1,
        avgRosterAtEnd: 4,
        avgPermanentLosses: 0,
      },
    ],
    unwinnableSeeds: {},
    recovery: {
      runs,
      firstMissionWinRate: 0,
      finalMissionWinRate: 1,
      avgRosterBeforeFinal: 5,
      avgPermanentLosses: 0,
      avgLevelAtEnd: 1,
    },
  });
  return gates.find((gate) => gate.id === "player-win-band")!;
}

describe("战役可玩带", () => {
  it("正式样本贴上沿通过，越出 20% 失败", () => {
    expect(playerWinGate(0.187, 50).passed).toBe(true);
    expect(playerWinGate(0.201, 50).passed).toBe(false);
    expect(playerWinGate(0.201, 50).title).not.toContain("小样本");
  });

  it("CI 小样本对可玩带放宽，避免 20 种子把 15% 靶心打出带外", () => {
    const inside = playerWinGate(0.28, 20);
    expect(inside.passed).toBe(true);
    expect(inside.title).toContain("小样本");
    expect(playerWinGate(0.33, 20).passed).toBe(false);
  });
});

function unwinnableGate(seedsByMission: Record<string, number[]>, runs: number) {
  const missions = Object.keys(seedsByMission).flatMap((missionId) => [
    aggregate("basic", missionId, 0.2),
    aggregate("tactical", missionId, 0.9),
  ]);
  for (const row of missions) row.runs = runs;
  const gates = evaluateGates({
    missions,
    degenerates: [],
    campaigns: [],
    unwinnableSeeds: seedsByMission,
    recovery: {
      runs: 0,
      firstMissionWinRate: 0,
      finalMissionWinRate: 1,
      avgRosterBeforeFinal: 5,
      avgPermanentLosses: 0,
      avgLevelAtEnd: 1,
    },
  });
  return gates.find((gate) => gate.id === "no-unwinnable-seed")!;
}

describe("无解种子搜索容差", () => {
  it("200 种子时每关允许 2 个全策略失败种子", () => {
    const gate = unwinnableGate({ "m1-onjong": [96], "m5-third-offensive": [109, 167] }, 200);
    expect(gate.passed).toBe(true);
    expect(gate.detail).toContain("m1-onjong:1");
    expect(gate.detail).toContain("m5-third-offensive:2");
  });

  it("超过 1% 容差则失败", () => {
    const gate = unwinnableGate({ "m5-third-offensive": [1, 2, 3] }, 200);
    expect(gate.passed).toBe(false);
    expect(gate.detail).toContain("m5-third-offensive");
  });
});

describe("逐关反退化门槛", () => {
  it("任一无脑打法达到 85% 即失败，并列出打法与关卡", () => {
    const gate = localGate([
      aggregate("rush", "m5-third-offensive", THRESHOLDS.localDegenerateMaxWinRate),
      aggregate("turtle", "m2-unsan", 0.2),
    ]);

    expect(gate.passed).toBe(false);
    expect(gate.detail).toContain("rush/m5-third-offensive");
    expect(gate.detail).toContain("85.0%");
    expect(gate.detail).not.toContain("turtle/m2-unsan");
  });

  it("所有分关均低于阈值时通过", () => {
    const gate = localGate([
      aggregate("rush", "m5-third-offensive", 0.849),
      aggregate("hillcamp", "m9-cheorwon", 0.4),
    ]);

    expect(gate.passed).toBe(true);
    expect(gate.detail).toContain("均低于局部统治阈值");
  });
});
