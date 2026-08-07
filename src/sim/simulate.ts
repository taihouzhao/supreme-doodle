import { AGENTS, AGENT_ORDER, DEGENERATE_ORDER, getAgent } from "../ai";
import { CHAPTER_ONE } from "../content/chapter";
import { evaluateGates, type GateResult } from "./gates";
import { playCampaign, playStandaloneMission, type CampaignRun, type MissionRun } from "./runner";
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
}

/**
 * 「前一关重创」的续跑：第一关交给随机策略制造损失，后两关交给战术策略，
 * 用来检查战役是否存在隐性死档。
 */
function runRecovery(chapterId: string, seeds: number): RecoveryResult {
  const runs: CampaignRun[] = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    runs.push(
      playCampaign(chapterId, (index) => (index === 0 ? AGENTS.random! : AGENTS.tactical!), seed),
    );
  }

  const finals = runs.map((run) => run.missions[2]);
  return {
    runs: runs.length,
    firstMissionWinRate: mean(runs.map((run) => (run.missions[0]?.status === "won" ? 1 : 0))),
    finalMissionWinRate: mean(finals.map((run) => (run?.status === "won" ? 1 : 0))),
    avgRosterBeforeFinal: mean(
      runs.map((run) => (run.outcomes[1]?.rosterAfter ?? 0)),
    ),
    avgPermanentLosses: mean(
      runs.map((run) => run.outcomes.reduce((sum, o) => sum + o.permanentLosses.length, 0)),
    ),
    avgVeteransAtEnd: mean(runs.map((run) => run.veteransAtEnd)),
  };
}

export function runSimulation(options: SimulationOptions = {}): SimulationResult {
  const started = Date.now();
  const chapterId = options.chapterId ?? CHAPTER_ONE.id;
  const seeds = options.seeds ?? 200;
  const campaignSeeds = options.campaignSeeds ?? Math.max(30, Math.floor(seeds / 4));

  const missionRuns = new Map<string, MissionRun[]>();
  const allAgents = [...AGENT_ORDER, ...DEGENERATE_ORDER];

  for (const mission of CHAPTER_ONE.missions) {
    for (const agentId of allAgents) {
      const agent = getAgent(agentId);
      const runs: MissionRun[] = [];
      for (let seed = 1; seed <= seeds; seed += 1) {
        runs.push(playStandaloneMission(chapterId, mission.id, agent, seed));
      }
      missionRuns.set(`${mission.id}:${agentId}`, runs);
    }
  }

  const missions: MissionAggregate[] = [];
  const degenerates: MissionAggregate[] = [];
  const unwinnableSeeds: Record<string, number[]> = {};

  for (const mission of CHAPTER_ONE.missions) {
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

  const campaigns: CampaignAggregate[] = AGENT_ORDER.map((agentId) => {
    const runs: CampaignRun[] = [];
    for (let seed = 1; seed <= campaignSeeds; seed += 1) {
      runs.push(playCampaign(chapterId, getAgent(agentId), seed));
    }
    return aggregateCampaign(agentId, runs);
  });

  const recovery = runRecovery(chapterId, campaignSeeds);
  const gates = evaluateGates({ missions, degenerates, campaigns, unwinnableSeeds, recovery });

  return {
    chapterId,
    seeds,
    missions,
    degenerates,
    campaigns,
    recovery,
    unwinnableSeeds,
    gates,
    elapsedMs: Date.now() - started,
  };
}
