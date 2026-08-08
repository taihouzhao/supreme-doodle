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
    avgVeteransAlive: 0,
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
      avgVeteransAtEnd: 0,
    },
  });
  return gates.find((gate) => gate.id === "no-local-dominant-strategy")!;
}

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
