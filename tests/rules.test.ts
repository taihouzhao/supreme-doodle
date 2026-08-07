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

function scenario(): GameState {
  const mission = getMission("m1-breakthrough");
  return createMissionState({
    mission,
    seed: deriveSeed(1, mission.id),
    roster: [
      { id: "r0", name: "步兵", type: "rifle", hp: 100, maxHp: 100, exp: 0, fatigue: 0, missionsSurvived: 0 },
      { id: "r1", name: "机枪", type: "mg", hp: 90, maxHp: 90, exp: 0, fatigue: 0, missionsSurvived: 0 },
      { id: "r2", name: "迫击炮", type: "mortar", hp: 70, maxHp: 70, exp: 0, fatigue: 0, missionsSurvived: 0 },
      { id: "r3", name: "坦克", type: "tank", hp: 140, maxHp: 140, exp: 0, fatigue: 0, missionsSurvived: 0 },
    ],
    inventory: { medkit: 1, at_charge: 1, arty_support: 1 },
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

  it("曲射只吃一半地形防御", () => {
    const state = scenario();
    const mortar = put(state, "p2", 3, 6);
    const rifle = put(state, "p0", 3, 3);
    const target = put(state, "e0", 3, 2);
    const terrain = tileAt(state, target.x, target.y);
    expect(terrain.defense).toBeGreaterThan(0);
    const direct = damageComponents(state, rifle, target, 1);
    const indirect = damageComponents(state, mortar, target, 1);
    expect(indirect.terrain).toBeGreaterThanOrEqual(direct.terrain);
    expect(indirect.terrain).toBe(1 - terrain.defense / 2);
  });

  it("伤害不会低于下限", () => {
    const state = scenario();
    const mg = put(state, "p1", 6, 6);
    mg.fatigue = BALANCE.fatigue.max;
    const tank = put(state, "e0", 6, 5);
    tank.type = "tank";
    expect(estimateDamage(state, mg, tank)).toBeGreaterThanOrEqual(BALANCE.minDamage);
  });
});

describe("经验与老兵", () => {
  it("阈值划分出三个等级", () => {
    expect(veterancyLevel(0)).toBe(0);
    expect(veterancyLevel(200)).toBe(1);
    expect(veterancyLevel(500)).toBe(2);
  });

  it("老兵在同等条件下更能打也更耐打", () => {
    const state = scenario();
    const rookie = put(state, "p0", 6, 6);
    const target = put(state, "e0", 6, 5);
    const base = estimateDamage(state, rookie, target);
    rookie.exp = 500;
    expect(estimateDamage(state, rookie, target)).toBeGreaterThan(base);

    const incoming = estimateDamage(state, target, rookie);
    rookie.exp = 0;
    expect(estimateDamage(state, target, rookie)).toBeGreaterThan(incoming);
  });
});

describe("合法动作", () => {
  it("枚举出的动作全部可以执行", () => {
    const state = scenario();
    for (const action of legalActions(state)) {
      expect(() => applyAction(state, action)).not.toThrow();
    }
  });

  it("只有步兵可以占领", () => {
    const state = scenario();
    const objective = state.objectives[0]!;
    const tank = put(state, "p3", objective.x, objective.y);
    const actions = legalActions(state);
    expect(actions.some((a) => a.kind === "capture" && a.unitId === tank.id)).toBe(false);

    put(state, "p3", 6, 8);
    const rifle = put(state, "p0", objective.x, objective.y);
    expect(
      legalActions(state).some((a) => a.kind === "capture" && a.unitId === rifle.id),
    ).toBe(true);
  });
});

describe("撤离要求", () => {
  it("按出战人数缩放，编制被打残时不会变成死档", () => {
    const state = scenario();
    const rule = getMission("m3-withdraw").victory;
    state.deployedCount = 8;
    const full = requiredEvacuations(state, rule);
    state.deployedCount = 4;
    expect(requiredEvacuations(state, rule)).toBeLessThanOrEqual(full);
    expect(requiredEvacuations(state, rule)).toBeLessThanOrEqual(4);
  });
});
