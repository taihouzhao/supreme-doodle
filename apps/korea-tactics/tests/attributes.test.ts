import { describe, expect, it } from "vitest";
import { CHAPTER_ONE } from "../src/content/chapter";
import {
  BASE_STATS,
  PROGRESS,
  levelFromExp,
  scaleEnemyExp,
  statsAtLevel,
} from "../src/content/progress";
import { WEAPONS } from "../src/content/weapons";
import { createCampaign, startMission } from "../src/core/campaign";
import {
  makeEnemyCommander,
  recomputeStatsAtLevel,
  syncLevelFromExp,
} from "../src/core/commander";
import { damageComponents } from "../src/core/combat";
import { createMissionState } from "../src/core/mission";
import type { Unit } from "../src/core/types";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function bareUnit(overrides: Partial<Unit> & Pick<Unit, "id" | "type" | "commanderName">): Unit {
  const level = overrides.level ?? 1;
  const baseStats = overrides.baseStats ?? { ...BASE_STATS };
  const stats =
    overrides.stats ??
    recomputeStatsAtLevel(baseStats, overrides.type, level, overrides.commanderName);
  return {
    rosterId: null,
    faction: "player",
    name: overrides.commanderName,
    equipment: "test",
    weapon: "type38",
    commanderKind: "companion",
    x: 1,
    y: 1,
    hp: 80,
    maxHp: 80,
    fatigue: 0,
    mpLeft: 4,
    movedThisTurn: false,
    hasActed: false,
    alive: true,
    evacuated: false,
    keyUnit: false,
    exp: PROGRESS.expForLevel(level),
    ...overrides,
    level,
    baseStats,
    stats,
  };
}

describe("属性系统修复", () => {
  it("敌军经验在阵地战后期抬升", () => {
    expect(scaleEnemyExp("m1-onjong", 50)).toBe(50);
    expect(scaleEnemyExp("m7-chipyongni", 110)).toBe(110);
    expect(scaleEnemyExp("m12-kumsong", 115)).toBeGreaterThan(115);
    expect(levelFromExp(scaleEnemyExp("m12-kumsong", 115))).toBeGreaterThanOrEqual(2);

    const early = makeEnemyCommander("rifle", scaleEnemyExp("m2-unsan", 55), "m1_garand", "韩军");
    const late = makeEnemyCommander("rifle", scaleEnemyExp("m11-pork-chop", 100), "m1_garand", "美军");
    expect(late.exp).toBeGreaterThan(early.exp);
    expect(late.baseStats).toBeDefined();
  });

  it("武器进攻通道并入五维，attackBonus 恒为 0", () => {
    for (const weapon of Object.values(WEAPONS)) {
      expect(weapon.attackBonus).toBe(0);
    }
    expect(WEAPONS.type38.stats.might).toBeGreaterThanOrEqual(6);
    expect(WEAPONS.mortar60.stats.intellect).toBeGreaterThanOrEqual(8);
  });

  it("统率即使无夹击也影响伤害", () => {
    const campaign = createCampaign("chapter-one", 7);
    const started = startMission(campaign);
    const attacker = started.state.units.find((u) => u.faction === "player" && u.type === "rifle")!;
    const defender = started.state.units.find((u) => u.faction === "enemy")!;
    const low = { ...attacker, stats: { ...attacker.stats, leadership: 40 } };
    const high = { ...attacker, stats: { ...attacker.stats, leadership: 70 } };
    const lowDmg = damageComponents(started.state, low, defender, 1).total;
    const highDmg = damageComponents(started.state, high, defender, 1).total;
    expect(highDmg).toBeGreaterThan(lowDmg);
  });

  it("降级从 baseStats 重算，不会保留虚高属性", () => {
    const base = { ...BASE_STATS, might: 45, agility: 42 };
    const unit = bareUnit({
      id: "u1",
      type: "rifle",
      commanderName: "试炼将",
      level: 4,
      exp: PROGRESS.expForLevel(4),
      baseStats: base,
      stats: statsAtLevel(base, "rifle", 4, "试炼将".length),
    });
    const at4 = { ...unit.stats };
    unit.exp = PROGRESS.expForLevel(2);
    expect(syncLevelFromExp(unit)).toBeNull();
    expect(unit.level).toBe(2);
    expect(unit.stats).toEqual(statsAtLevel(base, "rifle", 2, "试炼将".length));
    const sum = (s: typeof at4) =>
      s.might + s.stamina + s.leadership + s.intellect + s.agility;
    expect(sum(unit.stats)).toBeLessThan(sum(at4));
  });

  it("同一最终经验不受跳级或逐级升级路径影响", () => {
    const base = { ...BASE_STATS };
    const jump = bareUnit({
      id: "jump",
      type: "rifle",
      commanderName: "路径测试将",
      level: 1,
      exp: 0,
      baseStats: base,
    });
    const staged = structuredClone(jump);
    jump.exp = PROGRESS.expForLevel(3);
    syncLevelFromExp(jump);
    staged.exp = PROGRESS.expForLevel(2);
    syncLevelFromExp(staged);
    staged.exp = PROGRESS.expForLevel(3);
    syncLevelFromExp(staged);
    expect(jump.level).toBe(3);
    expect(staged.level).toBe(3);
    expect(jump.stats).toEqual(staged.stats);
  });

  it("开局敌军已应用关卡经验缩放并带有底板", () => {
    const roster = [testRosterUnit("r0", "高大全步兵", "rifle", { keyUnit: true, level: 2 })];
    const mission = CHAPTER_ONE.missions[9]!; // m10
    const state = createMissionState({
      mission,
      seed: 1,
      roster,
      inventory: fullInventory(),
    });
    const enemies = state.units.filter((u) => u.faction === "enemy");
    expect(enemies.every((u) => u.baseStats)).toBe(true);
    expect(Math.max(...enemies.map((u) => u.exp))).toBeGreaterThan(100);
  });
});
