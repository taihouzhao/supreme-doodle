import type { CampaignAggregate, MissionAggregate } from "./stats";
import type { RecoveryResult } from "./simulate";

/** 门槛阈值集中在这里，便于随平衡调整一起 review */
export const THRESHOLDS = {
  randomMaxWinRate: 0.15,
  basicWinRateBand: [0.3, 0.7] as [number, number],
  tacticalMinWinRate: 0.85,
  /** 战术策略的伤亡至少要比基础策略低这么多比例 */
  casualtyAdvantage: 0.8,
  /** 同策略跨种子胜率的分块标准差上限 */
  maxWinRateStdDev: 0.18,
  /** 单个退化打法在最难的一关必须低于此胜率，否则算统治性策略 */
  degenerateMaxWinRate: 0.5,
  /** 重创续跑后仍需达到的第三关胜率 */
  recoveryMinWinRate: 0.6,
  /** 重创续跑后花名册的最低规模 */
  recoveryMinRoster: 5,
};

export interface GateResult {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function byAgent(rows: MissionAggregate[], agentId: string): MissionAggregate[] {
  return rows.filter((row) => row.agentId === agentId);
}

export interface GateInput {
  missions: MissionAggregate[];
  degenerates: MissionAggregate[];
  campaigns: CampaignAggregate[];
  unwinnableSeeds: Record<string, number[]>;
  recovery: RecoveryResult;
}

export function evaluateGates(input: GateInput): GateResult[] {
  const gates: GateResult[] = [];
  const { missions, degenerates, unwinnableSeeds, recovery } = input;

  const random = byAgent(missions, "random");
  const basic = byAgent(missions, "basic");
  const tactical = byAgent(missions, "tactical");

  const randomWorst = random.reduce((worst, row) => Math.max(worst, row.winRate), 0);
  gates.push({
    id: "gradient-random",
    title: `随机策略胜率 < ${pct(THRESHOLDS.randomMaxWinRate)}`,
    passed: randomWorst < THRESHOLDS.randomMaxWinRate,
    detail: random.map((r) => `${r.missionId} ${pct(r.winRate)}`).join("，"),
  });

  const [lo, hi] = THRESHOLDS.basicWinRateBand;
  gates.push({
    id: "gradient-basic",
    title: `基础策略胜率落在 ${pct(lo)}–${pct(hi)}`,
    passed: basic.every((r) => r.winRate >= lo && r.winRate <= hi),
    detail: basic.map((r) => `${r.missionId} ${pct(r.winRate)}`).join("，"),
  });

  gates.push({
    id: "gradient-tactical",
    title: `战术策略胜率 > ${pct(THRESHOLDS.tacticalMinWinRate)}`,
    passed: tactical.every((r) => r.winRate > THRESHOLDS.tacticalMinWinRate),
    detail: tactical.map((r) => `${r.missionId} ${pct(r.winRate)}`).join("，"),
  });

  const casualtyRows = tactical.map((row) => {
    const peer = basic.find((b) => b.missionId === row.missionId);
    const ratio = peer && peer.avgCasualties > 0 ? row.avgCasualties / peer.avgCasualties : 0;
    return {
      missionId: row.missionId,
      ratio,
      detail: `${row.missionId} ${row.avgCasualties.toFixed(1)} vs ${(peer?.avgCasualties ?? 0).toFixed(1)}`,
    };
  });
  gates.push({
    id: "skill-casualties",
    title: `战术策略伤亡不高于基础策略的 ${pct(THRESHOLDS.casualtyAdvantage)}`,
    passed: casualtyRows.every((row) => row.ratio <= THRESHOLDS.casualtyAdvantage),
    detail: casualtyRows.map((row) => row.detail).join("，"),
  });

  const unwinnable = Object.entries(unwinnableSeeds).filter(([, seeds]) => seeds.length > 0);
  gates.push({
    id: "no-unwinnable-seed",
    title: "不存在所有策略都无法通关的种子",
    passed: unwinnable.length === 0,
    detail:
      unwinnable.length === 0
        ? "全部种子至少有一种策略可以完成核心目标"
        : unwinnable
            .map(([mission, seeds]) => `${mission}: ${seeds.slice(0, 10).join(",")}`)
            .join("；"),
  });

  const volatile = [...basic, ...tactical].filter(
    (row) => row.winRateStdDev > THRESHOLDS.maxWinRateStdDev,
  );
  gates.push({
    id: "randomness-bounded",
    title: `同策略跨种子胜率标准差 ≤ ${THRESHOLDS.maxWinRateStdDev.toFixed(2)}`,
    passed: volatile.length === 0,
    detail: [...basic, ...tactical]
      .map((r) => `${r.agentId}/${r.missionId} ${r.winRateStdDev.toFixed(2)}`)
      .join("，"),
  });

  const degenerateIds = [...new Set(degenerates.map((row) => row.agentId))];
  const dominant = degenerateIds.filter((id) => {
    const rows = byAgent(degenerates, id);
    const worst = rows.reduce((min, row) => Math.min(min, row.winRate), 1);
    return worst >= THRESHOLDS.degenerateMaxWinRate;
  });
  gates.push({
    id: "no-dominant-strategy",
    title: "不存在能通吃三关的无脑打法",
    passed: dominant.length === 0,
    detail: degenerateIds
      .map((id) => {
        const rows = byAgent(degenerates, id);
        return `${id} ${rows.map((r) => pct(r.winRate)).join("/")}`;
      })
      .join("，"),
  });

  gates.push({
    id: "campaign-recovery",
    title: `第一关重创后，第三关胜率 ≥ ${pct(THRESHOLDS.recoveryMinWinRate)} 且编制 ≥ ${THRESHOLDS.recoveryMinRoster}`,
    passed:
      recovery.finalMissionWinRate >= THRESHOLDS.recoveryMinWinRate &&
      recovery.avgRosterBeforeFinal >= THRESHOLDS.recoveryMinRoster,
    detail: `第三关胜率 ${pct(recovery.finalMissionWinRate)}，进入第三关时平均编制 ${recovery.avgRosterBeforeFinal.toFixed(1)}，平均永久损失 ${recovery.avgPermanentLosses.toFixed(1)}`,
  });

  return gates;
}
