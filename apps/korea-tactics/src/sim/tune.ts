import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BALANCE } from "../content/balance";
import { evaluateGates, THRESHOLDS } from "./gates";
import { defaultWorkerCount } from "./pool";
import { renderReport } from "./report";
import { runSimulation, type SimulationResult } from "./simulate";

/**
 * 以「基础策略十二关平均任务胜率 ≈ 15%」为靶心，搜索敌军伤害系数。
 * 玩法数值变更后应跑此工具反复打磨，再部署试玩。
 */

export interface TuneOptions {
  target?: number;
  tolerance?: number;
  seeds?: number;
  campaignSeeds?: number;
  workers?: number;
  write?: boolean;
  out?: string;
  quiet?: boolean;
}

export interface TuneTrial {
  enemyDamage: number;
  basicCampaignWinRate: number;
  distance: number;
  gatesPassed: number;
  gatesTotal: number;
  allGatesPassed: boolean;
}

export interface TuneResult {
  best: TuneTrial;
  trials: TuneTrial[];
  simulation: SimulationResult;
  written: boolean;
}

function basicCampaignWinRate(result: SimulationResult): number {
  const row = result.campaigns.find((c) => c.agentId === "basic");
  return row?.avgCompletionRate ?? 0;
}

function applyEnemyDamage(value: number): void {
  BALANCE.factionDamage.enemy = value;
}

function writeBalanceFile(enemyDamage: number): void {
  const path = resolve(process.cwd(), "src/content/balance.ts");
  const source = readFileSync(path, "utf8");
  const next = source.replace(
    /factionDamage:\s*\{\s*player:\s*[^,]+,\s*enemy:\s*[^}]+\}/,
    `factionDamage: { player: 1, enemy: ${formatNum(enemyDamage)} }`,
  );
  if (next === source) {
    throw new Error("未能在 balance.ts 中定位 factionDamage.enemy，请手工写入");
  }
  writeFileSync(path, next, "utf8");
}

function formatNum(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}

async function evaluateTrial(
  enemyDamage: number,
  seeds: number,
  campaignSeeds: number,
  workers: number,
): Promise<{
  trial: TuneTrial;
  simulation: SimulationResult;
}> {
  applyEnemyDamage(enemyDamage);
  const simulation = await runSimulation({
    seeds,
    campaignSeeds,
    workers,
    balance: { enemyDamage },
  });
  const winRate = basicCampaignWinRate(simulation);
  const target = THRESHOLDS.playerCampaignWinTarget;
  const gatesPassed = simulation.gates.filter((g) => g.passed).length;
  const trial: TuneTrial = {
    enemyDamage,
    basicCampaignWinRate: winRate,
    distance: Math.abs(winRate - target),
    gatesPassed,
    gatesTotal: simulation.gates.length,
    allGatesPassed: gatesPassed === simulation.gates.length,
  };
  return { trial, simulation };
}

/**
 * 在敌军伤害系数上做有界搜索，优先「全部门槛通过且最接近目标」，
 * 其次「最接近目标」。
 */
export async function tuneBalance(options: TuneOptions = {}): Promise<TuneResult> {
  const target = options.target ?? THRESHOLDS.playerCampaignWinTarget;
  const tolerance = options.tolerance ?? THRESHOLDS.playerCampaignWinTolerance;
  const seeds = options.seeds ?? 80;
  const campaignSeeds = options.campaignSeeds ?? Math.max(24, Math.floor(seeds / 3));
  const workers = Math.max(1, options.workers ?? defaultWorkerCount());
  const write = options.write ?? false;
  const quiet = options.quiet ?? false;

  const original = BALANCE.factionDamage.enemy;
  const candidates = buildCandidates(original);
  const trials: TuneTrial[] = [];
  let bestSim: SimulationResult | null = null;
  let best: TuneTrial | null = null;

  for (const enemyDamage of candidates) {
    const { trial, simulation } = await evaluateTrial(
      enemyDamage,
      seeds,
      campaignSeeds,
      workers,
    );
    trials.push(trial);
    if (!quiet) {
      console.log(
        `  enemy×${trial.enemyDamage.toFixed(3)}  基础平均任务胜率 ${pct(trial.basicCampaignWinRate)}  门槛 ${trial.gatesPassed}/${trial.gatesTotal}${trial.allGatesPassed ? " ✓" : ""}`,
      );
    }
    if (!best || prefer(trial, best, target)) {
      best = trial;
      bestSim = simulation;
    }
    if (trial.allGatesPassed && trial.distance <= tolerance) {
      break;
    }
  }

  if (!best || !bestSim) {
    applyEnemyDamage(original);
    throw new Error("调参未产生任何试验结果");
  }

  applyEnemyDamage(best.enemyDamage);
  const finalSeeds = Math.max(seeds, 100);
  const finalCampaign = Math.max(campaignSeeds, 30);
  const simulation =
    bestSim.seeds >= finalSeeds
      ? bestSim
      : await runSimulation({
          seeds: finalSeeds,
          campaignSeeds: finalCampaign,
          workers,
          balance: { enemyDamage: best.enemyDamage },
        });
  const gates = evaluateGates({
    missions: simulation.missions,
    degenerates: simulation.degenerates,
    campaigns: simulation.campaigns,
    unwinnableSeeds: simulation.unwinnableSeeds,
    recovery: simulation.recovery,
  });
  const finalResult: SimulationResult = { ...simulation, gates };

  let written = false;
  if (write) {
    writeBalanceFile(best.enemyDamage);
    written = true;
  }

  const out = resolve(process.cwd(), options.out ?? "reports/balance.md");
  writeFileSync(out, renderReport(finalResult), "utf8");

  if (!quiet) {
    console.log(
      `\n靶心 基础平均任务胜率 ${pct(target)} ± ${pct(tolerance)} → 最佳 enemy×${best.enemyDamage.toFixed(3)} = ${pct(best.basicCampaignWinRate)}`,
    );
    console.log(
      `报告已写入 ${out}${written ? "；已写回 balance.ts" : "（未写回 balance.ts，加 --write）"}`,
    );
  }

  return { best, trials, simulation: finalResult, written };
}

function prefer(candidate: TuneTrial, incumbent: TuneTrial, target: number): boolean {
  if (candidate.allGatesPassed !== incumbent.allGatesPassed) {
    return candidate.allGatesPassed;
  }
  const cDist = Math.abs(candidate.basicCampaignWinRate - target);
  const iDist = Math.abs(incumbent.basicCampaignWinRate - target);
  if (Math.abs(cDist - iDist) > 0.005) return cDist < iDist;
  return candidate.gatesPassed > incumbent.gatesPassed;
}

function buildCandidates(center: number): number[] {
  const coarse = [1.2, 1.35, 1.45, 1.55, 1.65, 1.75, 1.85, 1.95, 2.05, 2.15];
  const fine = [
    center - 0.12,
    center - 0.08,
    center - 0.04,
    center,
    center + 0.04,
    center + 0.08,
    center + 0.12,
  ];
  return [...coarse, ...fine]
    .map((v) => Math.round(Math.min(2.3, Math.max(1.0, v)) * 1000) / 1000)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a - b);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function parseTuneArgs(argv: string[]): TuneOptions {
  const options: TuneOptions = {};
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.split("=");
    const key = rawKey?.replace(/^--/, "");
    switch (key) {
      case "target":
        options.target = Number(rawValue);
        break;
      case "tolerance":
        options.tolerance = Number(rawValue);
        break;
      case "seeds":
        options.seeds = Number(rawValue);
        break;
      case "campaign-seeds":
        options.campaignSeeds = Number(rawValue);
        break;
      case "workers":
        options.workers = Number(rawValue);
        break;
      case "out":
        options.out = rawValue;
        break;
      case "write":
        options.write = rawValue === undefined || rawValue === "1" || rawValue === "true";
        break;
      case "quiet":
        options.quiet = true;
        break;
      default:
        break;
    }
  }
  return options;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const options = parseTuneArgs(process.argv.slice(2));
  if (options.write === undefined) options.write = true;
  const result = await tuneBalance(options);
  const [lo, hi] = THRESHOLDS.playerCampaignWinBand;
  const rate = result.best.basicCampaignWinRate;
  const inBand = rate >= lo && rate <= hi;
  process.exitCode = result.best.allGatesPassed && inBand ? 0 : 1;
}
