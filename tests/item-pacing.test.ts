import { describe, expect, it } from "vitest";
import { CHAPTER_ONE } from "../src/content/chapter";
import {
  ITEM_INTROS,
  PACED_RESUPPLY_AFTER,
  PACED_STARTING_INVENTORY,
  briefingGearHint,
  itemsKnownAtMission,
  resupplyAfterMission,
} from "../src/content/item-pacing";
import { MISSION_LIST } from "../src/content/missions";
import { createCampaign, finishMission, startMission } from "../src/core/campaign";

describe("战役物资循序解锁", () => {
  it("开局仓库只有绷带和炒面袋", () => {
    const campaign = createCampaign("chapter-one", 1);
    const stock = Object.entries(campaign.inventory).filter(([, count]) => count > 0);
    expect(stock.map(([id]) => id).sort()).toEqual(["bandage", "ration"]);
    expect(campaign.inventory.bandage).toBe(2);
    expect(campaign.inventory.ration).toBe(1);
    expect(campaign.inventory.medkit).toBe(0);
    expect(campaign.inventory.grenade_bundle).toBe(0);
    expect(campaign.inventory.arty_support).toBe(0);
    expect(Object.keys(PACED_STARTING_INVENTORY)).toEqual(["bandage", "ration"]);
  });

  it("章节配置使用分关补给表而不是每关倾倒全部工具", () => {
    expect(CHAPTER_ONE.resupplyAfter).toHaveLength(MISSION_LIST.length);
    expect(CHAPTER_ONE.resupply).toBeUndefined();
    expect(PACED_RESUPPLY_AFTER).toHaveLength(12);
    expect(resupplyAfterMission(0)).toMatchObject({ medkit: 1 });
    expect(resupplyAfterMission(0).arty_support ?? 0).toBe(0);
    expect(resupplyAfterMission(7).arty_support).toBe(1);
  });

  it("打完温井才把医疗包补进仓库，炮火支援要到临津江", () => {
    const campaign = createCampaign("chapter-one", 8);
    const started = startMission(campaign);
    started.state.status = "won";
    const { campaign: afterM1 } = finishMission(started.campaign, started.state);
    expect(afterM1.inventory.medkit).toBeGreaterThan(0);
    expect(afterM1.inventory.arty_support ?? 0).toBe(0);
    expect(afterM1.inventory.smoke_grenade ?? 0).toBe(0);
  });

  it("参谋部提示会说明本关新接触的物资", () => {
    expect(briefingGearHint(0)).toContain("绷带");
    expect(briefingGearHint(0)).toContain("医疗包");
    expect(briefingGearHint(7)).toContain("炮火支援");
    expect(itemsKnownAtMission(0).has("bandage")).toBe(true);
    expect(itemsKnownAtMission(0).has("medkit")).toBe(false);
    expect(itemsKnownAtMission(1).has("medkit")).toBe(true);
  });

  it("地图掉落不会提前塞进尚未引入的重型工具", () => {
    for (const [index, mission] of MISSION_LIST.entries()) {
      const known = itemsKnownAtMission(index);
      const introduced = new Set(ITEM_INTROS.filter((entry) => entry.introMission === index).map((entry) => entry.id));
      const allowed = new Set([...known, ...introduced]);
      for (const drop of mission.itemDrops) {
        for (const option of drop.options) {
          expect(allowed.has(option), `${mission.id} 掉落 ${option}`).toBe(true);
        }
      }
      for (const enemy of mission.enemies) {
        for (const option of enemy.dropOptions ?? []) {
          expect(allowed.has(option), `${mission.id} 缴获 ${option}`).toBe(true);
        }
      }
    }
  });
});
