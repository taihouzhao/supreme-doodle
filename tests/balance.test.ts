import { beforeAll, describe, expect, it } from "vitest";
import { runSimulation, type SimulationResult } from "../src/sim/simulate";
import { THRESHOLDS } from "../src/sim/gates";

/**
 * 冒烟级别的平衡检查：种子数比 `npm run sim` 少，只保证梯度方向没有被改坏。
 * 正式判定以平衡报告为准。
 */
describe("能力梯度", () => {
  let result: SimulationResult;

  beforeAll(async () => {
    result = await runSimulation({ seeds: 40, campaignSeeds: 12 });
  }, 120_000);

  const rate = (agentId: string, missionId: string): number =>
    result.missions.find((row) => row.agentId === agentId && row.missionId === missionId)!.winRate;

  const casualties = (agentId: string, missionId: string): number =>
    result.missions.find((row) => row.agentId === agentId && row.missionId === missionId)!
      .avgCasualties;

  it("随机策略基本无法通关", () => {
    const missionIds = [...new Set(result.missions.map((row) => row.missionId))];
    for (const missionId of missionIds) {
      expect(rate("random", missionId)).toBeLessThan(0.15);
    }
  });

  it("战术策略保持可通关优势", () => {
    const missionIds = [...new Set(result.missions.map((row) => row.missionId))];
    for (const missionId of missionIds) {
      expect(rate("tactical", missionId)).toBeGreaterThan(0.52);
    }
  });

  it("各关随机不显著优于基础，基础 ≤ 战术（阻击容差）", () => {
    const missionIds = [...new Set(result.missions.map((row) => row.missionId))];
    for (const missionId of missionIds) {
      // 40 个种子的冒烟样本允许约 10% 离散波动；正式随机上限由 gates 单独阻断。
      expect(rate("random", missionId)).toBeLessThanOrEqual(rate("basic", missionId) + 0.1);
      const holdSlack = /chosin|cheorwon|triangle-hill/.test(missionId) ? 0.3 : 0;
      expect(rate("basic", missionId)).toBeLessThanOrEqual(rate("tactical", missionId) + holdSlack);
    }
  });

  it("各关战术策略伤亡可控", () => {
    const missionIds = [...new Set(result.missions.map((row) => row.missionId))];
    for (const missionId of missionIds) {
      const basicLoss = casualties("basic", missionId);
      const holdMission = /chosin|cheorwon|triangle-hill/.test(missionId);
      const ceiling =
        (basicLoss < 0.5
          ? Math.max(basicLoss * 2.5, holdMission ? 3.5 : 2.0)
          : Math.max(basicLoss * 3.5, basicLoss + (holdMission ? 2.5 : 1.25))) + 0.05;
      expect(casualties("tactical", missionId)).toBeLessThanOrEqual(ceiling);
    }
  });

  it("基础策略十二关平均任务胜率处于偏难可玩带", () => {
    const basic = result.campaigns.find((row) => row.agentId === "basic");
    expect(basic).toBeTruthy();
    const [lo, hi] = THRESHOLDS.playerCampaignWinBand;
    // 冒烟战役样本小，上沿额外放宽 10pp；正式判定以 gates / npm run sim 为准
    expect(basic!.avgCompletionRate).toBeGreaterThanOrEqual(lo);
    expect(basic!.avgCompletionRate).toBeLessThanOrEqual(hi + 0.1);
  });

  it("不存在所有策略都无法完成核心目标的种子", () => {
    for (const seeds of Object.values(result.unwinnableSeeds)) {
      expect(seeds).toEqual([]);
    }
  });

  it("不存在通吃十二关的无脑打法", () => {
    const ids = [...new Set(result.degenerates.map((row) => row.agentId))];
    for (const id of ids) {
      const worst = result.degenerates
        .filter((row) => row.agentId === id)
        .reduce((min, row) => Math.min(min, row.winRate), 1);
      expect(worst).toBeLessThan(0.5);
    }
  });
});
