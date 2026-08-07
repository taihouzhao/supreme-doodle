import { describe, expect, it } from "vitest";
import { getAgent } from "../src/ai";
import { CHAPTER_ONE } from "../src/content/chapter";
import { veterancyLevel } from "../src/content/units";
import { createCampaign, finishMission, startMission } from "../src/core/campaign";
import { playCampaign } from "../src/sim/runner";

describe("战役继承", () => {
  it("三关按顺序推进并在结束后收敛", () => {
    const run = playCampaign("chapter-one", getAgent("tactical"), 7);
    expect(run.missions.map((m) => m.missionId)).toEqual(
      CHAPTER_ONE.missions.map((m) => m.id),
    );
    expect(run.finalCampaign.status).toBe("complete");
  });

  it("生命、经验与疲劳跨关传递", () => {
    const campaign = createCampaign("chapter-one", 3);
    const started = startMission(campaign);
    const survivor = started.state.units.find((u) => u.faction === "player" && u.rosterId)!;
    survivor.exp += 300;
    survivor.hp = 20;
    survivor.fatigue = 80;
    started.state.status = "won";

    const { campaign: next } = finishMission(started.campaign, started.state);
    const inherited = next.roster.find((u) => u.id === survivor.rosterId)!;
    expect(inherited.exp).toBeGreaterThan(200);
    expect(inherited.fatigue).toBeLessThan(80);
    expect(inherited.hp).toBeGreaterThan(20);
    expect(inherited.missionsSurvived).toBe(1);
  });

  it("撤离的单位一定保留，不参与永久损失判定", () => {
    const campaign = createCampaign("chapter-one", 9);
    const started = startMission(campaign);
    for (const unit of started.state.units.filter((u) => u.faction === "player")) {
      unit.alive = false;
      unit.hp = 0;
    }
    const saved = started.state.units.find((u) => u.faction === "player")!;
    saved.alive = false;
    saved.evacuated = true;
    started.state.status = "lost";

    const { campaign: next, outcome } = finishMission(started.campaign, started.state);
    expect(next.roster.some((u) => u.id === saved.rosterId)).toBe(true);
    expect(outcome.permanentLosses).not.toContain(saved.rosterId);
  });

  it("编制被打残后会补充新兵，但补的是没有经验的部队", () => {
    let campaign = createCampaign("chapter-one", 4);
    campaign.roster = campaign.roster.slice(0, 2);
    const started = startMission(campaign);
    campaign = started.campaign;
    expect(campaign.roster.length).toBeGreaterThan(2);
    const fresh = campaign.roster.slice(2);
    expect(fresh.every((u) => u.exp === 0)).toBe(true);
  });

  it("即使第一关被打残，第三关仍然存在可行解", () => {
    let recovered = 0;
    const trials = 12;
    for (let seed = 1; seed <= trials; seed += 1) {
      const run = playCampaign(
        "chapter-one",
        (index) => getAgent(index === 0 ? "random" : "tactical"),
        seed,
      );
      // 补充新兵在开战时结算，因此看第三关实际出战的兵力
      expect(run.missions[2]!.finalState.deployedCount).toBeGreaterThanOrEqual(4);
      if (run.missions[2]!.status === "won") recovered += 1;
    }
    expect(recovered / trials).toBeGreaterThan(0.5);
  });

  it("老兵是稀缺资源：战术策略保住的老兵明显多于基础策略", () => {
    const trials = 10;
    let tactical = 0;
    let basic = 0;
    for (let seed = 1; seed <= trials; seed += 1) {
      tactical += playCampaign("chapter-one", getAgent("tactical"), seed).veteransAtEnd;
      basic += playCampaign("chapter-one", getAgent("basic"), seed).veteransAtEnd;
    }
    expect(tactical).toBeGreaterThan(basic);
  });

  it("经验等级会随战役推进出现", () => {
    const run = playCampaign("chapter-one", getAgent("tactical"), 2);
    expect(run.finalCampaign.roster.some((u) => veterancyLevel(u.exp) >= 1)).toBe(true);
  });
});
