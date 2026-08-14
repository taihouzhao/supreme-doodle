import { AGENTS, getAgent } from "../ai";
import { BALANCE } from "../content/balance";
import {
  playCampaign,
  playStandaloneMission,
  type CampaignRun,
  type MissionFacts,
} from "./runner";

/** 随任务传入，避免 worker 线程读不到主线程对 BALANCE 的就地修改 */
export interface BalanceOverrides {
  enemyDamage?: number;
}

export type SimJob =
  | {
      kind: "standaloneBatch";
      chapterId: string;
      missionId: string;
      agentId: string;
      seeds: number[];
      balance?: BalanceOverrides;
    }
  | {
      kind: "campaignBatch";
      chapterId: string;
      agentId: string;
      seeds: number[];
      balance?: BalanceOverrides;
    }
  | {
      kind: "recoveryBatch";
      chapterId: string;
      seeds: number[];
      balance?: BalanceOverrides;
    };

function applyBalance(balance?: BalanceOverrides): void {
  if (balance?.enemyDamage !== undefined) {
    BALANCE.factionDamage.enemy = balance.enemyDamage;
  }
}

export type SimJobResult =
  | {
      kind: "standaloneBatch";
      missionId: string;
      agentId: string;
      runs: MissionFacts[];
    }
  | {
      kind: "campaignBatch";
      agentId: string;
      runs: CampaignRun[];
    }
  | {
      kind: "recoveryBatch";
      runs: CampaignRun[];
    };

/** 把连续种子切成多块，便于多核负载均衡 */
export function chunkSeeds(seedCount: number, chunkSize: number): number[][] {
  const chunks: number[][] = [];
  for (let start = 1; start <= seedCount; start += chunkSize) {
    const end = Math.min(seedCount, start + chunkSize - 1);
    const seeds: number[] = [];
    for (let seed = start; seed <= end; seed += 1) seeds.push(seed);
    chunks.push(seeds);
  }
  return chunks;
}

export function executeJob(job: SimJob): SimJobResult {
  applyBalance(job.balance);
  switch (job.kind) {
    case "standaloneBatch": {
      const agent = getAgent(job.agentId);
      const runs = job.seeds.map((seed) =>
        playStandaloneMission(job.chapterId, job.missionId, agent, seed, {
          recordTrace: false,
        }),
      );
      return {
        kind: "standaloneBatch",
        missionId: job.missionId,
        agentId: job.agentId,
        runs,
      };
    }
    case "campaignBatch": {
      const agent = getAgent(job.agentId);
      const runs = job.seeds.map((seed) =>
        playCampaign(job.chapterId, agent, seed, { recordTrace: false }),
      );
      return { kind: "campaignBatch", agentId: job.agentId, runs };
    }
    case "recoveryBatch": {
      const runs = job.seeds.map((seed) =>
        playCampaign(
          job.chapterId,
          (index) => (index === 0 ? AGENTS.random! : AGENTS.tactical!),
          seed,
          { recordTrace: false },
        ),
      );
      return { kind: "recoveryBatch", runs };
    }
    default: {
      const _exhaustive: never = job;
      throw new Error(`未知任务: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
