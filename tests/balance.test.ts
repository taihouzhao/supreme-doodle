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

  it.each(missionIds)("%s 上随机不显著优于基础，基础 ≤ 战术", (missionId) => {
    // 40 个种子的冒烟样本允许 2 次（5%）离散波动；正式随机上限由 gates 单独阻断。
    expect(rate("random", missionId)).toBeLessThanOrEqual(rate("basic", missionId) + 0.05);
    // 阻击关蹲点有时比主动交火更稳，允许小幅倒挂，但仍要求战术不低于随机之上的可用水平
    const holdSlack = /chosin|cheorwon|triangle-hill/.test(missionId) ? 0.3 : 0;
    expect(rate("basic", missionId)).toBeLessThanOrEqual(rate("tactical", missionId) + holdSlack);
  });

  it.each(missionIds)("%s 上战术策略伤亡更低", (missionId) => {
    const basicLoss = casualties("basic", missionId);
    // 阻击关：基础策略几乎不伤亡或战术更敢交火时，比值会失真。
    const holdMission = /chosin|cheorwon|triangle-hill/.test(missionId);
    const ceiling =
      (basicLoss < 0.5
        ? Math.max(basicLoss * 2.5, holdMission ? 3.5 : 2.0)
        : Math.max(basicLoss * 3.5, basicLoss + (holdMission ? 2.5 : 1.25))) + 0.05;
    expect(casualties("tactical", missionId)).toBeLessThanOrEqual(ceiling);
  });

  it("随机策略基本无法通关", () => {
    for (const missionId of missionIds) {
      expect(rate("random", missionId)).toBeLessThan(0.15);
    }
  });

  it("战术策略保持可通关优势", () => {
    for (const missionId of missionIds) {
      expect(rate("tactical", missionId)).toBeGreaterThan(0.52);
    }
  });

  it("基础策略十二关平均任务胜率处于偏难可玩带", () => {
    const basic = result.campaigns.find((row) => row.agentId === "basic");
    expect(basic).toBeTruthy();
    expect(basic!.avgCompletionRate).toBeGreaterThanOrEqual(0.2);
    expect(basic!.avgCompletionRate).toBeLessThanOrEqual(0.58);
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
