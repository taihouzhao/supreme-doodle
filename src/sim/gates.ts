import type { CampaignAggregate, MissionAggregate } from "./stats";
import type { RecoveryResult } from "./simulate";

/** 门槛阈值集中在这里，便于随平衡调整一起 review */
export const THRESHOLDS = {
  randomMaxWinRate: 0.15,
  /** 全局兜底带；分关阈值见 basicWinRateByMission */
  basicWinRateBand: [0.0, 0.65] as [number, number],
  /**
   * 分关目标：基础策略整体约 30% 通关（七成失败）。
   * 单关允许较宽方差，战役平均带负责总体难度；战术策略另见 tacticalMinWinRate。
   */
  basicWinRateByMission: {
    "m1-onjong": [0.05, 0.75] as [number, number],
    "m2-unsan": [0.0, 0.65] as [number, number],
    "m3-chongchon": [0.0, 0.7] as [number, number],
    "m4-chosin": [0.15, 1.0] as [number, number],
    "m5-third-offensive": [0.0, 0.8] as [number, number],
    "m6-hoengsong": [0.0, 0.85] as [number, number],
    "m7-chipyongni": [0.05, 0.75] as [number, number],
    "m8-imjin": [0.0, 0.65] as [number, number],
    "m9-cheorwon": [0.0, 0.8] as [number, number],
    "m10-triangle-hill": [0.1, 1.0] as [number, number],
    "m11-pork-chop": [0.0, 0.85] as [number, number],
    "m12-kumsong": [0.1, 1.0] as [number, number],
  } as Record<string, [number, number]>,
  minChallengingMissions: 7,
  /** 基础策略胜率低于此值才算「非碾压」 */
  challengingWinRateCeiling: 0.68,
  /** 战术策略目标带约 55–65%，门槛取下沿 */
  tacticalMinWinRate: 0.52,
  /**
   * 十二关连续战役以平均任务胜率衡量，避免“全胜”指标随关卡数指数失真。
   * 地图扩至 20×14 并加入后勤后，基础策略续航上升，靶心略上移。
   * `npm run balance:tune` 以此为优化目标。
   */
  playerCampaignWinTarget: 0.35,
  playerCampaignWinTolerance: 0.15,
  playerCampaignWinBand: [0.2, 0.55] as [number, number],
  /** 阻击关战术 AI 更敢交火，伤亡比放宽；基础策略蹲点时比值易失真 */
  casualtyAdvantage: 3.5,
  /**
   * 同策略跨种子胜率的分块标准差上限。
   * 小样本（<100）时分块方差天然偏大，阈值略放宽。
   */
  maxWinRateStdDev: 0.18,
  maxWinRateStdDevSmallSample: 0.36,
  smallSampleRuns: 100,
  /** 单个退化打法在最难的一关必须低于此胜率，否则算统治性策略 */
  degenerateMaxWinRate: 0.5,
  /** 任一分关都不能被同一种退化打法稳定解决；等于阈值也视为失败。 */
  localDegenerateMaxWinRate: 0.85,
  /** 第一关重创后，早期恢复检查（第三关）仍需达到的胜率 */
  recoveryMinWinRate: 0.35,
  /** 重创续跑后花名册的最低规模（伴随编制精简后下调） */
  recoveryMinRoster: 3,
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

  const challenging = basic.filter(
    (row) => row.winRate < THRESHOLDS.challengingWinRateCeiling,
  );
  gates.push({
    id: "difficulty-ramp",
    title: `至少 ${THRESHOLDS.minChallengingMissions} 关不能被基础策略稳定碾压`,
    passed: challenging.length >= THRESHOLDS.minChallengingMissions,
    detail: challenging.map((r) => `${r.missionId} ${pct(r.winRate)}`).join("，"),
  });

  gates.push({
    id: "gradient-tactical",
    title: `战术策略胜率 > ${pct(THRESHOLDS.tacticalMinWinRate)}`,
    passed: tactical.every((r) => r.winRate > THRESHOLDS.tacticalMinWinRate),
    detail: tactical.map((r) => `${r.missionId} ${pct(r.winRate)}`).join("，"),
  });

  const casualtyRows = tactical.map((row) => {
    const peer = basic.find((b) => b.missionId === row.missionId);
    const basicLoss = peer?.avgCasualties ?? 0;
    // 阻击关：基础策略几乎不伤亡或战术更敢交火时，比值会失真。
    const holdMission = /chosin|cheorwon|triangle-hill/.test(row.missionId);
    const ceiling =
      basicLoss < 0.5
        ? Math.max(basicLoss * 2.5, holdMission ? 3.5 : 2.0)
        : Math.max(
            basicLoss * THRESHOLDS.casualtyAdvantage,
            basicLoss + (holdMission ? 2.5 : 1.25),
          );
    const ok = row.avgCasualties <= ceiling + 0.05;
    return {
      missionId: row.missionId,
      ok,
      detail: `${row.missionId} ${row.avgCasualties.toFixed(1)} vs ${basicLoss.toFixed(1)}`,
    };
  });
  gates.push({
    id: "skill-casualties",
    title: `战术策略伤亡不高于基础策略的 ${pct(THRESHOLDS.casualtyAdvantage)}`,
    passed: casualtyRows.every((row) => row.ok),
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
    title: "不存在能通吃十二关的无脑打法",
    passed: dominant.length === 0,
    detail: degenerateIds
      .map((id) => {
        const rows = byAgent(degenerates, id);
        return `${id} ${rows.map((r) => pct(r.winRate)).join("/")}`;
      })
      .join("，"),
  });

  const localDominant = degenerates.filter(
    (row) => row.winRate >= THRESHOLDS.localDegenerateMaxWinRate,
  );
  gates.push({
    id: "no-local-dominant-strategy",
    title: `不存在分关胜率 ≥ ${pct(THRESHOLDS.localDegenerateMaxWinRate)} 的无脑打法`,
    passed: localDominant.length === 0,
    detail:
      localDominant.length === 0
        ? "所有退化打法在每个分关均低于局部统治阈值"
        : localDominant
            .map((row) => `${row.agentId}/${row.missionId} ${pct(row.winRate)}`)
            .join("，"),
  });

  gates.push({
    id: "campaign-recovery",
    title: `第一关重创后，早期恢复关胜率 ≥ ${pct(THRESHOLDS.recoveryMinWinRate)} 且编制 ≥ ${THRESHOLDS.recoveryMinRoster}`,
    passed:
      recovery.finalMissionWinRate >= THRESHOLDS.recoveryMinWinRate &&
      recovery.avgRosterBeforeFinal >= THRESHOLDS.recoveryMinRoster,
    detail: `第三关胜率 ${pct(recovery.finalMissionWinRate)}，进入第三关时平均编制 ${recovery.avgRosterBeforeFinal.toFixed(1)}，平均永久损失 ${recovery.avgPermanentLosses.toFixed(1)}`,
  });

  const campaigns = input.campaigns;
  const basicCampaign = campaigns.find((row) => row.agentId === "basic");
  const [winLo, winHi] = THRESHOLDS.playerCampaignWinBand;
  const campaignRate = basicCampaign?.avgCompletionRate ?? 0;
  gates.push({
    id: "player-win-band",
    title: `基础策略十二关平均任务胜率处于可玩带（${pct(winLo)}–${pct(winHi)}，靶心 ${pct(THRESHOLDS.playerCampaignWinTarget)}）`,
    passed: campaignRate >= winLo && campaignRate <= winHi,
    detail: basicCampaign
      ? `平均任务胜率 ${pct(campaignRate)}，平均通关 ${basicCampaign.avgMissionsWon.toFixed(2)}/12`
      : "缺少基础策略战役数据",
  });

  return gates;
}
