import type { CampaignRun, MissionRun } from "./runner";

export interface MissionAggregate {
  missionId: string;
  agentId: string;
  runs: number;
  winRate: number;
  /** 按种子分块统计的胜率标准差，用来衡量随机对结果的主导程度 */
  winRateStdDev: number;
  avgCasualties: number;
  avgSurvivors: number;
  avgTurns: number;
  avgEnemyRouted: number;
  avgEvacuated: number;
  avgVeteransAlive: number;
  lostSeeds: number[];
}

export interface CampaignAggregate {
  agentId: string;
  runs: number;
  fullClearRate: number;
  avgMissionsWon: number;
  avgVeteransAtEnd: number;
  avgRosterAtEnd: number;
  avgPermanentLosses: number;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

/** 把种子切成若干块，各块胜率的标准差衡量「同策略跨种子是否剧烈反转」 */
export function blockedWinRateStdDev(results: boolean[], blocks = 5): number {
  if (results.length < blocks * 2) return 0;
  const size = Math.floor(results.length / blocks);
  const rates: number[] = [];
  for (let i = 0; i < blocks; i += 1) {
    const slice = results.slice(i * size, (i + 1) * size);
    rates.push(slice.filter(Boolean).length / slice.length);
  }
  return stdDev(rates);
}

export function aggregateMission(missionId: string, agentId: string, runs: MissionRun[]): MissionAggregate {
  const wins = runs.map((run) => run.status === "won");
  return {
    missionId,
    agentId,
    runs: runs.length,
    winRate: runs.length === 0 ? 0 : wins.filter(Boolean).length / runs.length,
    winRateStdDev: blockedWinRateStdDev(wins),
    avgCasualties: mean(runs.map((run) => run.playerRouted)),
    avgSurvivors: mean(runs.map((run) => run.survivors)),
    avgTurns: mean(runs.map((run) => run.turnsUsed)),
    avgEnemyRouted: mean(runs.map((run) => run.enemyRouted)),
    avgEvacuated: mean(runs.map((run) => run.evacuated)),
    avgVeteransAlive: mean(runs.map((run) => run.veteransAlive)),
    lostSeeds: runs.filter((run) => run.status !== "won").map((run) => run.seed),
  };
}

export function aggregateCampaign(agentId: string, runs: CampaignRun[]): CampaignAggregate {
  return {
    agentId,
    runs: runs.length,
    fullClearRate:
      runs.length === 0 ? 0 : runs.filter((run) => run.missionsWon === 3).length / runs.length,
    avgMissionsWon: mean(runs.map((run) => run.missionsWon)),
    avgVeteransAtEnd: mean(runs.map((run) => run.veteransAtEnd)),
    avgRosterAtEnd: mean(runs.map((run) => run.rosterAtEnd)),
    avgPermanentLosses: mean(
      runs.map((run) => run.outcomes.reduce((sum, o) => sum + o.permanentLosses.length, 0)),
    ),
  };
}
