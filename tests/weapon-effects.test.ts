import { describe, expect, it } from "vitest";
import { secondaryDamageMultiplier, weaponPattern } from "../src/content/weapons";
import { getMission } from "../src/content/missions";
import { createMissionState } from "../src/core/mission";
import { secondaryAttackTiles } from "../src/core/grid";
import { performAttack, performItem } from "../src/core/resolve";
import type { GameEvent, GameState } from "../src/core/types";
import { deriveSeed } from "../src/core/rng";
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
});
