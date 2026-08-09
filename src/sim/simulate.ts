import { AGENT_ORDER, DEGENERATE_ORDER } from "../ai";
import { CHAPTERS, CHAPTER_ONE } from "../content/chapter";
import { evaluateGates, type GateResult } from "./gates";
import {
  chunkSeeds,
  executeJob,
  type BalanceOverrides,
  type SimJob,
  type SimJobResult,
} from "./jobs";
import { defaultWorkerCount, WorkerPool } from "./pool";
import type { CampaignRun, MissionFacts } from "./runner";
import {
  aggregateCampaign,
  aggregateMission,
  mean,
  type CampaignAggregate,
  type MissionAggregate,
} from "./stats";

export interface RecoveryResult {
  runs: number;
  firstMissionWinRate: number;
  finalMissionWinRate: number;
  avgRosterBeforeFinal: number;
  avgPermanentLosses: number;
  avgVeteransAtEnd: number;
}

export interface SimulationResult {
  chapterId: string;
  seeds: number;
  workers: number;
  missions: MissionAggregate[];
  degenerates: MissionAggregate[];
  campaigns: CampaignAggregate[];
  recovery: RecoveryResult;
  unwinnableSeeds: Record<string, number[]>;
  gates: GateResult[];
  elapsedMs: number;
}

export interface SimulationOptions {
  chapterId?: string;
  seeds?: number;
  campaignSeeds?: number;
  /** 并行 worker 数；默认 os.availableParallelism()；设为 1 则主线程串行 */
  workers?: number;
  /** 写入每个 job，供 worker 线程应用（主线程就地改 BALANCE 不会跨线程） */
  balance?: BalanceOverrides;
}

function summarizeRecovery(runs: CampaignRun[]): RecoveryResult {
  const finals = runs.map((run) => run.missions[2]);
  return {
    runs: runs.length,
    firstMissionWinRate: mean(runs.map((run) => (run.missions[0]?.status === "won" ? 1 : 0))),
    finalMissionWinRate: mean(finals.map((run) => (run?.status === "won" ? 1 : 0))),
    avgRosterBeforeFinal: mean(runs.map((run) => run.outcomes[1]?.rosterAfter ?? 0)),
    avgPermanentLosses: mean(
      runs.map((run) => run.outcomes.reduce((sum, o) => sum + o.permanentLosses.length, 0)),
    ),
    avgVeteransAtEnd: mean(runs.map((run) => run.veteransAtEnd)),
  };
}

function bySeed<T extends { seed: number }>(runs: T[]): T[] {
  return runs.slice().sort((a, b) => a.seed - b.seed);
}

function buildJobs(
  chapterId: string,
  seeds: number,
  campaignSeeds: number,
  workerCount: number,
  balance?: BalanceOverrides,
): SimJob[] {
  const chapter = CHAPTERS[chapterId] ?? CHAPTER_ONE;
  const allAgents = [...AGENT_ORDER, ...DEGENERATE_ORDER];
  // 每块种子数随 worker 数缩放，避免任务过碎或过粗
  const missionChunk = Math.max(8, Math.ceil(seeds / Math.max(1, workerCount * 2)));
  const campaignChunk = Math.max(4, Math.ceil(campaignSeeds / Math.max(1, workerCount)));
  const jobs: SimJob[] = [];
  const withBalance = balance ? { balance } : {};

  for (const mission of chapter.missions) {
    for (const agentId of allAgents) {
      for (const seedChunk of chunkSeeds(seeds, missionChunk)) {
        jobs.push({
          kind: "standaloneBatch",
          chapterId,
          missionId: mission.id,
          agentId,
          seeds: seedChunk,
          ...withBalance,
        });
      }
    }
  }

  for (const agentId of AGENT_ORDER) {
    for (const seedChunk of chunkSeeds(campaignSeeds, campaignChunk)) {
      jobs.push({
        kind: "campaignBatch",
        chapterId,
        agentId,
        seeds: seedChunk,
        ...withBalance,
      });
    }
  }

  for (const seedChunk of chunkSeeds(campaignSeeds, campaignChunk)) {
    jobs.push({ kind: "recoveryBatch", chapterId, seeds: seedChunk, ...withBalance });
  }

  return jobs;
}

function assemble(
  chapterId: string,
  seeds: number,
  workerCount: number,
  results: SimJobResult[],
  started: number,
): SimulationResult {
  const chapter = CHAPTERS[chapterId] ?? CHAPTER_ONE;
  const allAgents = [...AGENT_ORDER, ...DEGENERATE_ORDER];
  const missionRuns = new Map<string, MissionFacts[]>();
  const campaignRuns = new Map<string, CampaignRun[]>();
  const recoveryRuns: CampaignRun[] = [];

  for (const result of results) {
    if (result.kind === "standaloneBatch") {
      const key = `${result.missionId}:${result.agentId}`;
      const list = missionRuns.get(key) ?? [];
      list.push(...result.runs);
      missionRuns.set(key, list);
    } else if (result.kind === "campaignBatch") {
      const list = campaignRuns.get(result.agentId) ?? [];
      list.push(...result.runs);
      campaignRuns.set(result.agentId, list);
    } else {
      recoveryRuns.push(...result.runs);
    }
  }

  for (const [key, runs] of missionRuns) {
    missionRuns.set(key, bySeed(runs));
  }
  for (const [key, runs] of campaignRuns) {
    campaignRuns.set(key, bySeed(runs));
  }
  recoveryRuns.sort((a, b) => a.seed - b.seed);

  const missions: MissionAggregate[] = [];
  const degenerates: MissionAggregate[] = [];
  const unwinnableSeeds: Record<string, number[]> = {};

  for (const mission of chapter.missions) {
    const wonBySomeone = new Set<number>();
    for (const agentId of allAgents) {
      const runs = missionRuns.get(`${mission.id}:${agentId}`) ?? [];
      for (const run of runs) if (run.coreObjectiveMet) wonBySomeone.add(run.seed);
      const aggregate = aggregateMission(mission.id, agentId, runs);
      if (AGENT_ORDER.includes(agentId)) missions.push(aggregate);
      else degenerates.push(aggregate);
    }

    const seedList = (missionRuns.get(`${mission.id}:tactical`) ?? []).map((run) => run.seed);
    unwinnableSeeds[mission.id] = seedList.filter((seed) => !wonBySomeone.has(seed));
  }

  const campaigns: CampaignAggregate[] = AGENT_ORDER.map((agentId) =>
    aggregateCampaign(agentId, campaignRuns.get(agentId) ?? []),
  );

  const recovery = summarizeRecovery(recoveryRuns);
  const gates = evaluateGates({ missions, degenerates, campaigns, unwinnableSeeds, recovery });

  return {
    chapterId,
    seeds,
    workers: workerCount,
    missions,
    degenerates,
    campaigns,
    recovery,
    unwinnableSeeds,
    gates,
    elapsedMs: Date.now() - started,
  };
}

async function runJobs(jobs: SimJob[], workerCount: number): Promise<SimJobResult[]> {
  if (workerCount <= 1 || jobs.length <= 1) {
    return jobs.map((job) => executeJob(job));
  }

  const pool = new WorkerPool(workerCount, new URL("./worker-bootstrap.mjs", import.meta.url));
  try {
    return await pool.map<SimJobResult>(jobs);
  } finally {
    await pool.close();
  }
}

export async function runSimulation(options: SimulationOptions = {}): Promise<SimulationResult> {
  const started = Date.now();
  const chapterId = options.chapterId ?? CHAPTER_ONE.id;
  const seeds = options.seeds ?? 200;
  const campaignSeeds = options.campaignSeeds ?? Math.max(30, Math.floor(seeds / 4));
  const workers = Math.max(1, options.workers ?? defaultWorkerCount());

  const jobs = buildJobs(chapterId, seeds, campaignSeeds, workers, options.balance);
  const results = await runJobs(jobs, workers);
  return assemble(chapterId, seeds, workers, results, started);
}
