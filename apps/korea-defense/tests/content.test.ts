import { describe, expect, it } from "vitest";
import { DEFENSE_VARIANT_LABELS, ENEMY_DEFINITIONS, TOWER_DEFINITIONS, WONJEONG_MISSION } from "../src/content/wonjeong";

describe("温井内容配置", () => {
  it("包含六波且所有敌军能到达主路线终点", () => {
    expect(WONJEONG_MISSION.waves).toHaveLength(6);
    expect(WONJEONG_MISSION.path.at(-1)).toEqual({ x: 15, y: 14.5 });
    expect(Object.keys(ENEMY_DEFINITIONS)).toEqual(expect.arrayContaining(["rifle", "runner", "heavy", "armored"]));
  });

  it("三种玩家单位符合首版部署数据", () => {
    expect(TOWER_DEFINITIONS.infantry).toMatchObject({ cost: 40, range: 5, damage: 8, shotsPerSecond: 2 });
    expect(TOWER_DEFINITIONS.machineGun).toMatchObject({ cost: 60, range: 6, damage: 5, shotsPerSecond: 5 });
    expect(TOWER_DEFINITIONS.mortar).toMatchObject({ cost: 80, range: 9, minRange: 3, damage: 28, splashRadius: 2, shotsPerSecond: 0.6 });
  });

  it("变化配置提供不同路线和可读的敌我克制", () => {
    expect(WONJEONG_MISSION.alternatePath).not.toEqual(WONJEONG_MISSION.path);
    expect(Object.keys(DEFENSE_VARIANT_LABELS)).toEqual(["road-raids", "ridge-relief", "night-attack"]);
    expect(ENEMY_DEFINITIONS.armored!.damageTakenMultiplier).toMatchObject({ infantry: 0.42, machineGun: 0.3, mortar: 1.2 });
    expect(ENEMY_DEFINITIONS.runner!.damageTakenMultiplier).toMatchObject({ machineGun: 1.18 });
  });
});
