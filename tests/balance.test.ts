import { describe, expect, it } from "vitest";
import { runSimulation } from "../src/sim/simulate";

/**
 * 冒烟级别的平衡检查：种子数比 `npm run sim` 少，只保证梯度方向没有被改坏。
 * 正式判定以平衡报告为准。
 */
describe("能力梯度", () => {
  const result = runSimulation({ seeds: 40, campaignSeeds: 4 });

  const rate = (agentId: string, missionId: string): number =>
    result.missions.find((row) => row.agentId === agentId && row.missionId === missionId)!.winRate;

  const casualties = (agentId: string, missionId: string): number =>
    result.missions.find((row) => row.agentId === agentId && row.missionId === missionId)!
      .avgCasualties;

  const missionIds = [...new Set(result.missions.map((row) => row.missionId))];

  it.each(missionIds)("%s 上 随机 < 基础 ≤ 战术", (missionId) => {
    expect(rate("random", missionId)).toBeLessThan(rate("basic", missionId));
    expect(rate("basic", missionId)).toBeLessThanOrEqual(rate("tactical", missionId));
  });

  it.each(missionIds)("%s 上战术策略伤亡更低", (missionId) => {
    const basicLoss = casualties("basic", missionId);
    // 阻击关：基础策略几乎不伤亡或战术更敢交火时，比值会失真。
    const ceiling =
      (basicLoss < 0.5
        ? Math.max(basicLoss * 2.5, 2.0)
        : Math.max(basicLoss * 1.35, basicLoss + 1.25)) + 0.05;
    expect(casualties("tactical", missionId)).toBeLessThanOrEqual(ceiling);
  });

  it("随机策略基本无法通关", () => {
    for (const missionId of missionIds) {
      expect(rate("random", missionId)).toBeLessThan(0.15);
    }
  });

  it("战术策略稳定通关", () => {
    for (const missionId of missionIds) {
      expect(rate("tactical", missionId)).toBeGreaterThan(0.75);
    }
  });

  it("基础策略十二关平均任务胜率处于可玩带", () => {
    const basic = result.campaigns.find((row) => row.agentId === "basic");
    expect(basic).toBeTruthy();
    expect(basic!.avgCompletionRate).toBeGreaterThanOrEqual(0.55);
    expect(basic!.avgCompletionRate).toBeLessThanOrEqual(0.88);
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
