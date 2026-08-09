import { describe, expect, it } from "vitest";
import { createCampaign, equipAttachment, equipWeapon, freeWeaponCount } from "../src/core/campaign";
import { getMission } from "../src/content/missions";
import { applyAction } from "../src/core/engine";
import { canEnter, coordinationAllies, tileAt } from "../src/core/grid";
import { createMissionState, runUpkeep } from "../src/core/mission";
import { deriveSeed } from "../src/core/rng";
import type { GameEvent } from "../src/core/types";
import { fullInventory, testRosterUnit } from "./helpers/roster";

describe("有限军械与附件", () => {
  it("有限武器库存支持原子换装，不产生负库存", () => {
    const campaign = createCampaign("chapter-one", 1);
    const rifle = campaign.roster.find((unit) => unit.commanderName === "郭恩志")!;
    const key = campaign.roster.find((unit) => unit.keyUnit)!;
    expect(freeWeaponCount(campaign, key.weapon, rifle.id)).toBe(0);
    const unchanged = equipWeapon(campaign, rifle.id, key.weapon);
    expect(unchanged.roster.find((unit) => unit.id === rifle.id)?.weapon).toBe(rifle.weapon);

    campaign.armory.push("type38");
    const swapped = equipWeapon(campaign, rifle.id, "type38");
    expect(swapped.roster.find((unit) => unit.id === rifle.id)?.weapon).toBe("type38");
    expect(freeWeaponCount(swapped, "type38")).toBe(1);
  });

  it("附件受兵种与 BM-13 牵引车限制", () => {
    const campaign = createCampaign("chapter-one", 2);
    const rifle = campaign.roster.find((unit) => unit.type === "rifle" && !unit.keyUnit)!;
    const logistics = campaign.roster.find((unit) => unit.type === "logistics")!;
    expect(equipAttachment(campaign, rifle.id, "motor_transport")).toBe(campaign);
    campaign.attachments.push("motor_transport");
    const motorized = equipAttachment(campaign, logistics.id, "motor_transport");
    expect(motorized.roster.find((unit) => unit.id === logistics.id)?.attachment).toBe("motor_transport");

    campaign.armory.push("bm13");
    const artillery = {
      ...testRosterUnit("art", "谭朝志炮兵", "artillery"),
      weapon: "bm13" as const,
    };
    campaign.roster.push(artillery);
    campaign.attachments.push("artillery_tractor");
    expect(equipAttachment(campaign, artillery.id, "artillery_tractor")).toBe(campaign);
  });

  it("战场回收只进入 pending，不即时替换装备", () => {
    const mission = getMission("m1-onjong");
    const roster = [testRosterUnit("r0", "回收步兵", "rifle", { keyUnit: true })];
    const state = createMissionState({
      mission,
      seed: deriveSeed(3, mission.id),
      roster,
      inventory: fullInventory(),
    });
    const unit = state.units.find((entry) => entry.rosterId === "r0")!;
    state.fieldAttachments = [{ id: "att-test", attachment: "field_telephone", x: unit.x, y: unit.y }];
    const before = unit.attachment;
    const next = applyAction(state, { kind: "move", unitId: unit.id, to: { x: unit.x, y: unit.y } });
    expect(next.state.pendingAttachments).toEqual(["field_telephone"]);
    expect(next.state.units.find((entry) => entry.id === unit.id)?.attachment).toBe(before);
    expect(next.state.fieldAttachments).toHaveLength(0);
  });

  it("卫生员每关最多自动触发三次，每次回复六人", () => {
    const mission = getMission("m1-onjong");
    const roster = [{ ...testRosterUnit("r0", "卫生员步兵", "rifle", { keyUnit: true }), attachment: "medic_team" as const }];
    const state = createMissionState({
      mission,
      seed: deriveSeed(4, mission.id),
      roster,
      inventory: fullInventory(),
    });
    const unit = state.units.find((entry) => entry.rosterId === "r0")!;
    const events: GameEvent[] = [];
    unit.hp = unit.maxHp - 30;
    for (let i = 0; i < 4; i += 1) {
      unit.hp = Math.max(1, unit.hp - 1);
      unit.attackedThisTurn = false;
      runUpkeep(state, "player", events);
    }
    expect(unit.medicTriggersUsed).toBe(3);
    expect(events.filter((event) => event.type === "healed").map((event) => event.amount)).toEqual([6, 6, 6]);
  });

  it("汽车附件遵守车辆地形限制，骡马附件不受此限制", () => {
    const mission = getMission("m1-onjong");
    const roster = [testRosterUnit("r0", "运输后勤", "logistics", { keyUnit: true })];
    const state = createMissionState({
      mission,
      seed: deriveSeed(5, mission.id),
      roster,
      inventory: fullInventory(),
    });
    const unit = state.units.find((entry) => entry.rosterId === "r0")!;
    const forest = state.tiles.findIndex((id) => id === "forest");
    const x = forest % state.width;
    const y = Math.floor(forest / state.width);
    unit.attachment = "motor_transport";
    expect(canEnter(state, unit, x, y)).toBe(false);
    unit.attachment = "pack_train";
    expect(canEnter(state, unit, x, y)).toBe(true);
    expect(tileAt(state, x, y).vehiclePassable).toBe(false);
  });

  it("野战电话在静止 5 格内提供协同，移动后失去静止中继", () => {
    const mission = getMission("m1-onjong");
    const roster = [
      testRosterUnit("r0", "电话步兵", "rifle", { keyUnit: true }),
      testRosterUnit("r1", "目标步兵", "rifle"),
    ];
    const state = createMissionState({
      mission,
      seed: deriveSeed(6, mission.id),
      roster,
      inventory: fullInventory(),
    });
    const relay = state.units.find((entry) => entry.rosterId === "r0")!;
    const attacker = state.units.find((entry) => entry.rosterId === "r1")!;
    const enemy = state.units.find((entry) => entry.faction === "enemy")!;
    relay.attachment = "field_telephone";
    relay.x = attacker.x;
    relay.y = attacker.y + 1;
    expect(coordinationAllies(state, attacker, enemy)).toBeGreaterThan(0);
    relay.movedThisTurn = true;
    expect(coordinationAllies(state, attacker, enemy)).toBe(0);
  });
});
