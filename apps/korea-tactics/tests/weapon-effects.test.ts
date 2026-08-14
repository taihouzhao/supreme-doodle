import { describe, expect, it } from "vitest";
import { secondaryDamageMultiplier, weaponPattern } from "../src/content/weapons";
import { getMission } from "../src/content/missions";
import { createMissionState } from "../src/core/mission";
import { attackImpactPlan, secondaryAttackTiles } from "../src/core/grid";
import { performAttack, performItem } from "../src/core/resolve";
import { damageComponents } from "../src/core/combat";
import type { GameEvent, GameState } from "../src/core/types";
import { deriveSeed } from "../src/core/rng";
import { buildAttackPreview } from "../src/ui/combatPreview";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function scenario(): GameState {
  const mission = getMission("m2-unsan");
  return createMissionState({
    mission,
    seed: deriveSeed(9, mission.id),
    roster: [
      testRosterUnit("r0", "测试步兵", "rifle"),
      testRosterUnit("r1", "测试机枪", "mg"),
      testRosterUnit("r2", "测试迫击炮", "mortar"),
    ],
    inventory: fullInventory({ medkit: 1 }),
  });
}

function place(state: GameState, id: string, x: number, y: number) {
  const unit = state.units.find((entry) => entry.id === id)!;
  unit.x = x;
  unit.y = y;
  unit.hasActed = false;
  unit.alive = true;
  return unit;
}

describe("武器范围与伤害反馈", () => {
  it("机枪沿开火方向影响主目标后的下一格", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const attacker = place(state, "p1", 6, 6);
    const defender = place(state, "e0", 6, 5);
    const secondary = place(state, "e1", 6, 4);
    const tiles = secondaryAttackTiles(state, attacker, defender);

    expect(weaponPattern(attacker.weapon, attacker.type).profile).toBe("mg");
    expect(tiles).toContainEqual({ x: 6, y: 4 });

    const events: GameEvent[] = [];
    expect(performAttack(state, attacker, defender, events)).toBe(true);
    expect(secondary.hp).toBeLessThan(secondary.maxHp);
    const attack = events.find((event) => event.type === "attacked");
    expect(attack?.type === "attacked" ? attack.secondaryHits?.[0]?.unitId : undefined).toBe(secondary.id);
  });

  it("迫击炮的次级格会造成 50% 友军误伤并显示倍率", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const attacker = place(state, "p2", 6, 6);
    const defender = place(state, "e0", 6, 4);
    const friendly = place(state, "p0", 5, 4);
    const before = friendly.hp;
    const events: GameEvent[] = [];

    expect(secondaryDamageMultiplier("player", "player")).toBe(0.5);
    expect(performAttack(state, attacker, defender, events)).toBe(true);
    expect(friendly.hp).toBeLessThan(before);
    const attack = events.find((event) => event.type === "attacked");
    expect(
      attack?.type === "attacked" ? attack.secondaryHits?.some((hit) => hit.friendly) : false,
    ).toBe(true);
  });

  it("炮击的范围预览与实际结算共用重叠倍率", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const attacker = place(state, "p2", 6, 10);
    attacker.type = "artillery";
    attacker.weapon = "bm13";
    const defender = place(state, "e0", 6, 5);
    const splashTarget = place(state, "e1", 6, 4);
    splashTarget.hp = splashTarget.maxHp;
    const plan = attackImpactPlan(state, attacker, defender);
    const overlap = plan.find((impact) => impact.at.x === 6 && impact.at.y === 4);
    expect(overlap?.components).toHaveLength(2);

    const preview = buildAttackPreview(state, attacker, defender);
    const affected = preview.affected.find((impact) => impact.unitId === splashTarget.id)!;
    const events: GameEvent[] = [];
    expect(performAttack(state, attacker, defender, events)).toBe(true);
    const attack = events.find((event) => event.type === "attacked");
    const actual = attack?.type === "attacked"
      ? attack.secondaryHits?.find((impact) => impact.unitId === splashTarget.id)?.damage
      : undefined;
    expect(actual).toBeDefined();
    expect(actual).toBeGreaterThanOrEqual(affected.damage.min);
    expect(actual).toBeLessThanOrEqual(affected.damage.max);
  });

  it("信号弹在目标附近提供一次临时火力校射", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const attacker = place(state, "p0", 6, 6);
    const defender = place(state, "e0", 6, 5);
    attacker.backpack = ["signal_flare"];
    state.inventory.signal_flare = 1;
    const events: GameEvent[] = [];
    expect(performItem(state, attacker, { item: "signal_flare", to: { x: defender.x, y: defender.y } }, events)).toBe(true);
    expect(state.signalTiles).toContainEqual({
      x: defender.x,
      y: defender.y,
      until: state.turn + 1,
      faction: "player",
    });
    expect(buildAttackPreview(state, attacker, defender).breakdown.coordination).toBeGreaterThan(1);
  });

  it("烟幕只遮蔽远程火力，并在回合切换后失效", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const attacker = place(state, "p2", 6, 8);
    const defender = place(state, "e0", 6, 5);
    attacker.backpack = ["smoke_grenade"];
    state.inventory.smoke_grenade = 1;
    const baseline = damageComponents(state, attacker, defender, 1).total;
    const events: GameEvent[] = [];
    expect(performItem(state, attacker, { item: "smoke_grenade", to: { x: defender.x, y: defender.y } }, events)).toBe(true);
    expect(damageComponents(state, attacker, defender, 1).smoke).toBe(0.72);
    expect(damageComponents(state, attacker, defender, 1).total).toBeLessThan(baseline);
    state.turn += 1;
    expect(damageComponents(state, attacker, defender, 1).smoke).toBe(1);
  });

  it("有背包时道具不能被其他单位越权使用", () => {
    const state = scenario();
    const owner = place(state, "p0", 6, 6);
    const other = place(state, "p1", 6, 7);
    owner.backpack = ["medkit"];
    other.backpack = [];
    owner.hp -= 20;
    const events: GameEvent[] = [];

    expect(performItem(state, other, { item: "medkit" }, events)).toBe(false);
    expect(performItem(state, owner, { item: "medkit" }, events)).toBe(true);
    expect(owner.backpack).toEqual([]);
  });

  it("弹药箱只在弹药窗口未激活时生效，并按重量物资消耗", () => {
    const state = scenario();
    const unit = place(state, "p1", 6, 6);
    unit.backpack = ["ammo_crate"];
    state.inventory.ammo_crate = 1;
    const events: GameEvent[] = [];
    expect(performItem(state, unit, { item: "ammo_crate" }, events)).toBe(true);
    expect(unit.supplyRestoredUntil).toBe(state.turn + 2);
    expect(state.inventory.ammo_crate).toBe(0);
    expect(unit.backpack).toEqual([]);
    expect(performItem(state, unit, { item: "ammo_crate" }, events)).toBe(false);
  });
});
