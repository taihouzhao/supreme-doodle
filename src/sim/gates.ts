import type { CampaignAggregate, MissionAggregate } from "./stats";
import type { RecoveryResult } from "./simulate";

/** 门槛阈值集中在这里，便于随平衡调整一起 review */
export const THRESHOLDS = {
  randomMaxWinRate: 0.15,
  /** 全局兜底带；分关阈值见 basicWinRateByMission */
  basicWinRateBand: [0.25, 0.75] as [number, number],
  /** 难度递进：基础策略胜率随关卡下降 */
  basicWinRateByMission: {
    "m1-breakthrough": [0.45, 1] as [number, number],
    "m2-hold": [0.35, 1] as [number, number],
    "m3-withdraw": [0.35, 0.95] as [number, number],
  } as Record<string, [number, number]>,
  /** 首关相对后两关中较低一关至少下降 */
  difficultyRampMinDrop: 0.05,
  tacticalMinWinRate: 0.75,
  /**
   * 玩家代理（基础策略）战役三关全胜率靶心 ≈ 胜 6 负 4。
   * `npm run balance:tune` 以此为优化目标。
   */
  playerCampaignWinTarget: 0.6,
  playerCampaignWinTolerance: 0.08,
  playerCampaignWinBand: [0.52, 0.68] as [number, number],
  casualtyAdvantage: 1.05,
  /**
   * 同策略跨种子胜率的分块标准差上限。
   * 小样本（<100）时分块方差天然偏大，阈值略放宽。
   */
  maxWinRateStdDev: 0.18,
  maxWinRateStdDevSmallSample: 0.28,
  smallSampleRuns: 100,
  /** 单个退化打法在最难的一关必须低于此胜率，否则算统治性策略 */
  degenerateMaxWinRate: 0.5,
  /** 重创续跑后仍需达到的第三关胜率 */
  recoveryMinWinRate: 0.55,
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
  const basicBandOk = basic.every((r) => {
    const band = THRESHOLDS.basicWinRateByMission[r.missionId] ?? [lo, hi];
    return r.winRate >= band[0] && r.winRate <= band[1];
  });
  gates.push({
    id: "gradient-basic",
    title: "基础策略胜率落在分关难度带内",
    passed: basicBandOk,
    detail: basic
      .map((r) => {
        const band = THRESHOLDS.basicWinRateByMission[r.missionId] ?? [lo, hi];
        return `${r.missionId} ${pct(r.winRate)}（目标 ${pct(band[0])}–${pct(band[1])}）`;
      })
      .join("，"),
  });

  const orderedBasic = ["m1-breakthrough", "m2-hold", "m3-withdraw"]
    .map((id) => basic.find((r) => r.missionId === id))
    .filter((row): row is MissionAggregate => Boolean(row));
  const first = orderedBasic[0];
  const rest = orderedBasic.slice(1);
  const hardest = rest.reduce((min, row) => Math.min(min, row.winRate), 1);
  const drop = first ? first.winRate - hardest : 0;
  const rampOk = Boolean(first) && rest.length > 0 && drop >= THRESHOLDS.difficultyRampMinDrop;
  gates.push({
    id: "difficulty-ramp",
    title: `基础策略胜率随战役变难（首关相对后两关最低点至少低 ${pct(THRESHOLDS.difficultyRampMinDrop)}）`,
    passed: rampOk,
    detail: orderedBasic.map((r) => `${r.missionId} ${pct(r.winRate)}`).join(" → "),
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

  const sampleRuns = Math.min(
    ...[...basic, ...tactical].map((row) => row.runs),
    Number.POSITIVE_INFINITY,
  );
  const stdDevLimit =
    sampleRuns < THRESHOLDS.smallSampleRuns
      ? THRESHOLDS.maxWinRateStdDevSmallSample
      : THRESHOLDS.maxWinRateStdDev;
  const volatile = [...basic, ...tactical].filter((row) => row.winRateStdDev > stdDevLimit);
  gates.push({
    id: "randomness-bounded",
    title: `同策略跨种子胜率标准差 ≤ ${stdDevLimit.toFixed(2)}（n=${Number.isFinite(sampleRuns) ? sampleRuns : 0}）`,
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

  const campaigns = input.campaigns;
  const basicCampaign = campaigns.find((row) => row.agentId === "basic");
  const [winLo, winHi] = THRESHOLDS.playerCampaignWinBand;
  const campaignRate = basicCampaign?.fullClearRate ?? 0;
  gates.push({
    id: "player-win-band",
    title: `基础策略战役全胜率落在胜6负4带（${pct(winLo)}–${pct(winHi)}，靶心 ${pct(THRESHOLDS.playerCampaignWinTarget)}）`,
    passed: campaignRate >= winLo && campaignRate <= winHi,
    detail: basicCampaign
      ? `三关全胜 ${pct(campaignRate)}，平均通关 ${basicCampaign.avgMissionsWon.toFixed(2)}`
      : "缺少基础策略战役数据",
  });

  return gates;
}
