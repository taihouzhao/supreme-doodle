import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/content/balance";
import { getMission } from "../src/content/missions";
import { UNIT_TYPES, veterancyLevel } from "../src/content/units";
import { damageComponents, estimateDamage } from "../src/core/combat";
import { applyAction, legalActions } from "../src/core/engine";
import { canAttack, reachableTiles, tileAt } from "../src/core/grid";
import { createMissionState, movementBudget, requiredEvacuations } from "../src/core/mission";
import { deriveSeed } from "../src/core/rng";
import type { GameState, Unit } from "../src/core/types";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function scenario(): GameState {
  const mission = getMission("m2-unsan");
  return createMissionState({
    mission,
    seed: deriveSeed(1, mission.id),
    roster: [
      testRosterUnit("r0", "试步兵", "rifle", { keyUnit: true }),
      testRosterUnit("r1", "试机枪", "mg"),
      testRosterUnit("r2", "试迫击炮", "mortar"),
      testRosterUnit("r3", "试坦克", "tank"),
    ],
    inventory: fullInventory({ medkit: 1, at_charge: 1, arty_support: 1 }),
  });
}

function put(state: GameState, unitId: string, x: number, y: number): Unit {
  const unit = state.units.find((u) => u.id === unitId)!;
  unit.x = x;
  unit.y = y;
  return unit;
}

describe("地形与移动", () => {
  it("车辆无法进入森林与河流", () => {
    const state = scenario();
    const tank = put(state, "p3", 6, 8);
    tank.mpLeft = 20;
    const tiles = reachableTiles(state, tank);
    for (const tile of tiles) {
      const terrain = tileAt(state, tile.x, tile.y);
      expect(terrain.vehiclePassable).toBe(true);
    }
  });

  it("疲劳会削减移动力", () => {
    const state = scenario();
    const unit = state.units.find((u) => u.id === "p0")!;
    const fresh = movementBudget(unit, "clear");
    unit.fatigue = BALANCE.fatigue.max;
    expect(movementBudget(unit, "clear")).toBeLessThan(fresh);
  });

  it("雨天进一步削减移动力", () => {
    const state = scenario();
    const unit = state.units.find((u) => u.id === "p0")!;
    expect(movementBudget(unit, "rain")).toBeLessThan(movementBudget(unit, "clear"));
  });
});

describe("射程", () => {
  it("迫击炮有最小射程，贴身无法开火", () => {
    const state = scenario();
    const mortar = put(state, "p2", 6, 5);
    const enemy = put(state, "e0", 6, 4);
    expect(canAttack(state, mortar, enemy)).toBe(false);
    put(state, "e0", 6, 3);
    expect(canAttack(state, mortar, enemy)).toBe(true);
  });

  it("高地为站立单位提供额外射程", () => {
    const state = scenario();
    const mg = put(state, "p1", 4, 6);
    expect(tileAt(state, 4, 6).rangeBonus).toBe(1);
    const enemy = put(state, "e0", 4, 3);
    expect(canAttack(state, mg, enemy)).toBe(true);
  });
});

describe("战斗", () => {
  it("抖动被限制在窄区间内，没有暴击", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    const low = damageComponents(state, attacker, defender, BALANCE.jitter.min).total;
    const high = damageComponents(state, attacker, defender, BALANCE.jitter.max).total;
    expect(high / low).toBeLessThan(1.25);
  });

  it("兵种克制生效：机枪打步兵强，打坦克弱", () => {
    const state = scenario();
    const mg = put(state, "p1", 6, 6);
    const infantry = put(state, "e0", 6, 5);
    const vsInfantry = estimateDamage(state, mg, infantry);
    infantry.type = "tank";
    infantry.maxHp = UNIT_TYPES.tank.maxHp;
    const vsTank = estimateDamage(state, mg, infantry);
    expect(vsTank).toBeLessThan(vsInfantry * 0.5);
  });

  it("将领武力提升伤害", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    const base = estimateDamage(state, attacker, defender);
    attacker.stats.might += 30;
    expect(estimateDamage(state, attacker, defender)).toBeGreaterThan(base);
  });

  it("等级随经验提升", () => {
    expect(veterancyLevel(0)).toBe(1);
    expect(veterancyLevel(500)).toBeGreaterThan(1);
  });
});

describe("规则动作", () => {
  it("结束回合会切换到敌方阶段或推进回合", () => {
    const state = scenario();
    const before = state.turn;
    const next = applyAction(state, { kind: "endTurn" }).state;
    expect(next.phase === "enemy" || next.turn > before || next.status !== "playing").toBe(true);
  });

  it("撤离要求会按出战人数缩放", () => {
    const state = scenario();
    state.deployedCount = 4;
    expect(requiredEvacuations(state, { evacuateRatio: 0.5, minEvacuated: 3 })).toBe(3);
  });

  it("合法动作列表不为空", () => {
    const state = scenario();
    expect(legalActions(state).length).toBeGreaterThan(0);
  });
});
