import { describe, expect, it } from "vitest";
import { getAgent } from "../src/ai";
import { CHAPTER_ONE } from "../src/content/chapter";
import { LOGISTICS, veterancyLevel } from "../src/content/units";
import {
  createCampaign,
  finishMission,
  personnelTransferBounds,
  startMission,
  transferPersonnel,
} from "../src/core/campaign";
import { evaluateVictory } from "../src/core/mission";
import { playCampaign } from "../src/sim/runner";

describe("战役继承", () => {
  it("十二关按顺序推进并在结束后收敛", () => {
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

  it("兵员调拨保持守恒，并保留后勤最低机动编制", () => {
    const campaign = createCampaign("chapter-one", 13);
    const source = campaign.roster.find((unit) => unit.type === "logistics")!;
    const target = campaign.roster.find((unit) => unit.type !== "logistics")!;
    source.hp = source.maxHp;
    target.hp = Math.max(1, target.hp - 40);

    const beforeTotal = source.hp + target.hp;
    const bounds = personnelTransferBounds(campaign, source.id, target.id);
    expect(bounds.max).toBeGreaterThan(0);

    const next = transferPersonnel(campaign, source.id, target.id, bounds.max + 100);
    const nextSource = next.roster.find((unit) => unit.id === source.id)!;
    const nextTarget = next.roster.find((unit) => unit.id === target.id)!;
    expect(nextSource.hp).toBeGreaterThanOrEqual(LOGISTICS.minimumPersonnel);
    expect(nextTarget.hp).toBe(target.maxHp);
    expect(nextSource.hp + nextTarget.hp).toBe(beforeTotal);
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

  it("编制被打残后会补充新兵，但补的是低经验伴随部队", () => {
    let campaign = createCampaign("chapter-one", 4);
    campaign.roster = campaign.roster.slice(0, 2);
    const started = startMission(campaign);
    campaign = started.campaign;
    expect(campaign.roster.length).toBeGreaterThan(2);
    const fresh = campaign.roster.slice(2);
    expect(fresh.every((u) => u.level <= 1 && u.commanderKind === "companion")).toBe(true);
  });

  it("即使第一关被打残，第三关早期恢复检查仍然存在可行解", () => {
    let recovered = 0;
    const trials = 3;
    for (let seed = 1; seed <= trials; seed += 1) {
      const run = playCampaign(
        "chapter-one",
        (index) => getAgent(index === 0 ? "random" : "tactical"),
        seed,
      );
      // 补充新兵在开战时结算，因此以第三关作为早期恢复检查点
      expect(run.missions[2]!.finalState.deployedCount).toBeGreaterThanOrEqual(3);
      if (run.missions[2]!.status === "won") recovered += 1;
    }
    expect(recovered / trials).toBeGreaterThanOrEqual(1 / 3);
  });

  it("老兵是稀缺资源：战术策略保住的老兵不少于基础策略", () => {
    const trials = 2;
    let tactical = 0;
    let basic = 0;
    for (let seed = 1; seed <= trials; seed += 1) {
      tactical += playCampaign("chapter-one", getAgent("tactical"), seed).veteransAtEnd;
      basic += playCampaign("chapter-one", getAgent("basic"), seed).veteransAtEnd;
    }
    expect(tactical).toBeGreaterThanOrEqual(basic);
  }, 30_000);

  it("经验等级会随战役推进出现", () => {
    const run = playCampaign("chapter-one", getAgent("tactical"), 2);
    expect(run.finalCampaign.roster.some((u) => veterancyLevel(u.exp) >= 3)).toBe(true);
  });

  it("开局伴随将领精简，战场另有剧情将领", () => {
    const campaign = createCampaign("chapter-one", 1);
    expect(campaign.roster).toHaveLength(5);
    expect(campaign.roster.every((u) => u.commanderKind === "companion")).toBe(true);
    const started = startMission(campaign);
    const story = started.state.units.filter((u) => u.commanderKind === "story");
    expect(story.length).toBeGreaterThan(0);
    expect(started.state.units.some((u) => u.stats.might > 0)).toBe(true);
  });

  it("主力阵亡则立即失败", () => {
    const campaign = createCampaign("chapter-one", 11);
    const started = startMission(campaign);
    const key = started.state.units.find((u) => u.keyUnit)!;
    expect(key.name).toBe("高大全步兵");
    key.alive = false;
    key.hp = 0;
    const verdict = evaluateVictory(started.state, started.mission.victory, false);
    expect(verdict.status).toBe("lost");
    expect(verdict.reason).toContain("主力重伤");
  });

  it("高大全绝对属性底板不会再次叠加40点", () => {
    const campaign = createCampaign("chapter-one", 1);
    const started = startMission(campaign);
    const key = started.state.units.find((unit) => unit.keyUnit)!;
    expect(key.stats).toEqual({ leadership: 49, intellect: 44, might: 46, stamina: 47, agility: 42 });
    expect(key.maxHp).toBe(165);
    expect(key.duty).toBe("志司直属加强营指挥员");
    expect(key.rank).toBe("熟练");
  });

  it("部队番号为唯一主将+兵种，不带序号", () => {
    const campaign = createCampaign("chapter-one", 1);
    expect(campaign.roster.every((u) => /^[\u4e00-\u9fa5]+(步兵|机枪|迫击炮|炮兵|坦克|后勤)$/.test(u.name))).toBe(
      true,
    );
    expect(campaign.roster.every((u) => !/\d/.test(u.name))).toBe(true);
    const commanders = campaign.roster.map((u) => u.name.replace(/(步兵|机枪|迫击炮|炮兵|坦克|后勤)$/, ""));
    expect(new Set(commanders).size).toBe(commanders.length);
  });
});
