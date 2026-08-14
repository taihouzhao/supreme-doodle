import { describe, expect, it } from "vitest";
import {
  UNIT_CLASSES,
  canEvolveTo,
  evolveTokensAvailable,
  resolveClassId,
  unlockedCategories,
} from "../src/content/evolution";
import { MATCHUP, UNIT_TYPES } from "../src/content/units";
import { createCampaign, evolveUnit, evolutionChoices, tokensForUnit } from "../src/core/campaign";
import { weaponCategory } from "../src/content/weapons";

describe("unit evolution", () => {
  it("grants a token every 6 levels up to 3", () => {
    expect(evolveTokensAvailable(5, 0)).toBe(0);
    expect(evolveTokensAvailable(6, 0)).toBe(1);
    expect(evolveTokensAvailable(12, 0)).toBe(2);
    expect(evolveTokensAvailable(18, 1)).toBe(2);
    expect(evolveTokensAvailable(20, 3)).toBe(0);
  });

  it("keeps rifle evolution inside the rifle family", () => {
    expect(UNIT_CLASSES.rifle_assault.type).toBe("rifle");
    expect(UNIT_CLASSES.rifle_vanguard.type).toBe("rifle");
    expect(canEvolveTo("rifle_line", "mg_gunner", 20, 0)).toBe(false);
    expect(canEvolveTo("rifle_line", "tank_crew", 20, 0)).toBe(false);
  });

  it("allows mortar into artillery and armored car into tank", () => {
    expect(canEvolveTo("mortar_heavy", "arty_field", 12, 1)).toBe(true);
    expect(UNIT_CLASSES.arty_field.type).toBe("artillery");
    expect(canEvolveTo("ac_gun", "tank_crew", 12, 1)).toBe(true);
    expect(UNIT_CLASSES.tank_crew.type).toBe("tank");
  });

  it("unlocks weapon categories rather than single models", () => {
    const cats = unlockedCategories("rifle_assault");
    expect(cats.has("infantry_smg")).toBe(true);
    expect(cats.has("infantry_at")).toBe(false);
    expect(weaponCategory("ppsh50")).toBe("infantry_smg");
  });

  it("evolves a campaign companion and changes logistics branch exclusively", () => {
    const campaign = createCampaign(CHAPTER_ID, 7);
    const logi = campaign.roster.find((u) => u.type === "logistics")!;
    // Force enough level for first evolve
    logi.level = 6;
    logi.exp = 9999;
    expect(tokensForUnit(logi)).toBe(1);
    const choices = evolutionChoices({ ...campaign, roster: campaign.roster }, logi.id);
    expect(choices.sort()).toEqual(["logi_motor", "logi_pack"].sort());

    const packed = evolveUnit(campaign, logi.id, "logi_pack");
    const after = packed.roster.find((u) => u.id === logi.id)!;
    expect(after.classId).toBe("logi_pack");
    expect(after.attachment).toBe("pack_train");
    expect(evolutionChoices(packed, logi.id).includes("logi_motor")).toBe(false);
  });

  it("lets mg, armored_car and tank capture; mortar/artillery/logistics cannot", () => {
    expect(UNIT_TYPES.mg.canCapture).toBe(true);
    expect(UNIT_TYPES.armored_car.canCapture).toBe(true);
    expect(UNIT_TYPES.tank.canCapture).toBe(true);
    expect(UNIT_TYPES.mortar.canCapture).toBe(false);
    expect(UNIT_TYPES.artillery.canCapture).toBe(false);
    expect(UNIT_TYPES.logistics.canCapture).toBe(false);
    expect(MATCHUP.armored_car.tank).toBeLessThan(1);
    expect(MATCHUP.tank.armored_car).toBeGreaterThan(1);
  });

  it("resolves missing classId from type for save compatibility", () => {
    expect(resolveClassId(undefined, "rifle")).toBe("rifle_line");
    expect(resolveClassId(undefined, "artillery")).toBe("arty_field");
  });
});

const CHAPTER_ID = "chapter-one";
