import { describe, expect, it } from "vitest";
import { basicAgent } from "../src/ai/basicAgent";
import { attackRangeFrom, evacGoal, routeCost } from "../src/ai/helpers";
import { tacticalAgent } from "../src/ai/tacticalAgent";
import type { Agent } from "../src/ai/types";
import { getMission } from "../src/content/missions";
import { createMissionState } from "../src/core/mission";
import { Rng, deriveSeed } from "../src/core/rng";
import type { GameState, Unit, UnitTypeId, WeaponId } from "../src/core/types";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function duel(type: UnitTypeId, weapon: WeaponId, distance: number): {
  state: GameState;
  player: Unit;
  enemy: Unit;
} {
  const mission = getMission("m2-unsan");
  const state = createMissionState({
    mission,
    seed: deriveSeed(17, mission.id),
    roster: [testRosterUnit("r0", "射程测试", type)],
    inventory: fullInventory(),
  });
  const player = state.units.find((unit) => unit.rosterId === "r0")!;
  const enemy = state.units.find((unit) => unit.faction === "enemy")!;

  // M2 (1,5) 至 (4,5) 均为平地，不借用高地射程加成。
  player.x = 1;
  player.y = 5;
  player.weapon = weapon;
  player.hasActed = false;
  player.keyUnit = false;
  enemy.x = 1 + distance;
  enemy.y = 5;
  enemy.hasActed = false;
  state.units = [player, enemy];
  state.objectives = [];
  state.missionKind = "breakthrough";
  return { state, player, enemy };
}

function expectAttack(agent: Agent, state: GameState, target: Unit): void {
  expect(agent.decide(state, new Rng(1))).toEqual({
    kind: "attack",
    unitId: state.units[0]!.id,
    targetId: target.id,
  });
}

describe("AI 射程规划", () => {
  it("basic 会在移动前使用武器提供的额外最大射程", () => {
    const { state, player, enemy } = duel("mg", "dp28", 3);
    expect(attackRangeFrom(state, player, player)).toEqual({ min: 1, max: 3 });
    expectAttack(basicAgent, state, enemy);
  });

  it("tactical 的候选攻击包含武器提供的额外最大射程", () => {
    const { state, player, enemy } = duel("mg", "dp28", 3);
    player.mpLeft = 0;
    expect(attackRangeFrom(state, player, player)).toEqual({ min: 1, max: 3 });
    expectAttack(tacticalAgent, state, enemy);
  });

  it("候选格射程直接继承核心的最小射程与武器修正", () => {
    const { state, player } = duel("mortar", "mortar82", 2);
    // 82毫米迫击炮保留兵种最小射程，并把武器最大射程 +1 计入规划。
    // 兵种最大射程 3 + 82 毫米武器 +1 → 4
    expect(attackRangeFrom(state, player, { x: 1, y: 5 })).toEqual({ min: 2, max: 4 });
  });
});

describe("AI 撤离路线", () => {
  it("低机动力单位会绕开单回合永远无法进入的雪地高地", () => {
    const mission = getMission("m7-chipyongni");
    const state = createMissionState({
      mission,
      seed: deriveSeed(23, mission.id),
      roster: [testRosterUnit("r0", "撤离测试", "mg")],
      inventory: fullInventory(),
    });
    const unit = state.units.find((candidate) => candidate.rosterId === "r0")!;
    unit.x = 12;
    unit.y = 2;

    // 雪地高地抬高直路代价，AI 应改选侧向撤离格
    const direct = routeCost(state, unit, unit, { x: 12, y: 0 });
    const side = routeCost(state, unit, unit, { x: 11, y: 0 });
    expect(direct).not.toBeNull();
    expect(side).not.toBeNull();
    expect(direct!).toBeGreaterThan(side!);
    expect(evacGoal(state, unit)).toEqual({ x: 11, y: 0 });
  });
});
