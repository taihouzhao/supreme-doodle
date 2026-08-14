import type { AttachmentId, MissionKind, UnitClassId, UnitTypeId, WeaponId } from "../core/types";
import { WEAPONS } from "./weapons";
import { UNIT_CLASSES, resolveClassId } from "./evolution";

/** 开局一次性自适应：只读出战花名册，确定性可重放。 */
export interface AdaptSnapshot {
  playerPower: number;
  adaptFactor: number;
  eliteBonusSlots: number;
  reinforceEarlyBias: number;
}

export interface PowerUnit {
  type: UnitTypeId;
  level: number;
  weapon: WeaponId;
  attachment?: AttachmentId;
  classId?: UnitClassId;
}

export function weaponIsElite(weapon: WeaponId): boolean {
  return WEAPONS[weapon]?.rarity === "elite";
}

export function computePlayerPower(roster: PowerUnit[]): number {
  if (roster.length === 0) return 0;
  let levelSum = 0;
  let stageSum = 0;
  let eliteGear = 0;
  let armorOrArty = 0;
  for (const unit of roster) {
    levelSum += unit.level;
    const classId = resolveClassId(unit.classId, unit.type);
    stageSum += UNIT_CLASSES[classId].stage;
    if (weaponIsElite(unit.weapon)) eliteGear += 1;
    if (unit.attachment && ["scr300_radio", "artillery_tractor", "motor_transport", "t52_vest"].includes(unit.attachment)) {
      eliteGear += 0.5;
    }
    if (unit.type === "tank" || unit.type === "armored_car" || unit.type === "artillery") armorOrArty += 1;
  }
  const n = roster.length;
  const avgLevel = levelSum / n;
  const avgStage = stageSum / n;
  // 基准：开局约 L1.2 / stage0 / 5 人 → power≈0.35；后期满编高阶 → 接近 1+
  return (
    (avgLevel / 12) * 0.45 +
    avgStage * 0.18 +
    (eliteGear / Math.max(1, n)) * 0.2 +
    (n / 8) * 0.1 +
    (armorOrArty / Math.max(1, n)) * 0.15
  );
}

export interface AdaptContext {
  /** 战役内关卡序号（0 起）；单关模拟不传，避免晚期关在孤立种子上被额外砸死 */
  missionIndex?: number;
  /** 战役内已获胜关数 */
  priorWins?: number;
}

export function adaptFromPower(playerPower: number, context: AdaptContext = {}): AdaptSnapshot {
  // 花名册战力：开局 ≈1.0，后期温和加压
  const t = Math.max(0, Math.min(1.6, playerPower));
  let adaptFactor = 1.0 + t * 0.2;
  // 仅战役模式叠加关序/连胜压力，把十二关平均胜率压进 ≤20%，且不污染单关死种子门槛
  if (context.missionIndex !== undefined) {
    const idx = Math.max(0, context.missionIndex);
    const wins = Math.max(0, context.priorWins ?? 0);
    adaptFactor += idx * 0.09 + wins * 0.07;
  }
  adaptFactor = Math.max(1.0, Math.min(1.6, adaptFactor));
  return {
    playerPower,
    adaptFactor,
    // 随机拔擢易制造死种子；精英强度改由既有 title/drops 与属性加点承担
    eliteBonusSlots: 0,
    reinforceEarlyBias: adaptFactor >= 1.25 ? 1 : 0,
  };
}

export type MissionEnemyTrait =
  | "ambush_flank"
  | "hold_bridge"
  | "road_counter"
  | "cold_pincer"
  | "river_depth_arty"
  | "night_counter"
  | "fort_crossfire"
  | "arty_corridor"
  | "armor_push"
  | "barrage_rotate"
  | "ridge_counter"
  | "reserve_arty";

export const MISSION_ENEMY_TRAITS: Record<string, MissionEnemyTrait> = {
  "m1-onjong": "ambush_flank",
  "m2-unsan": "hold_bridge",
  "m3-chongchon": "road_counter",
  "m4-chosin": "cold_pincer",
  "m5-third-offensive": "river_depth_arty",
  "m6-hoengsong": "night_counter",
  "m7-chipyongni": "fort_crossfire",
  "m8-imjin": "arty_corridor",
  "m9-cheorwon": "armor_push",
  "m10-triangle-hill": "barrage_rotate",
  "m11-pork-chop": "ridge_counter",
  "m12-kumsong": "reserve_arty",
};

export function traitForMission(missionId: string): MissionEnemyTrait | null {
  return MISSION_ENEMY_TRAITS[missionId] ?? null;
}

export function traitScoreBonus(
  missionId: string,
  _kind: MissionKind,
  turn: number,
  adaptFactor: number,
): { flank: number; holdObjective: number; chase: number; artyPriority: number } {
  const trait = traitForMission(missionId);
  const scale = 0.7 + (adaptFactor - 0.85) * 0.8;
  const base = { flank: 0, holdObjective: 0, chase: 0, artyPriority: 0 };
  if (!trait) return base;
  switch (trait) {
    case "ambush_flank":
      return { ...base, flank: turn <= 4 ? 12 * scale : 6 * scale };
    case "hold_bridge":
      return { ...base, holdObjective: 22 * scale, chase: -8 };
    case "road_counter":
      return { ...base, chase: 12 * scale, flank: 6 * scale };
    case "cold_pincer":
      return { ...base, flank: 14 * scale, chase: 6 * scale };
    case "river_depth_arty":
      return { ...base, artyPriority: 16 * scale };
    case "night_counter":
      return { ...base, chase: turn <= 3 ? 16 * scale : 8 * scale };
    case "fort_crossfire":
      return { ...base, holdObjective: 12 * scale, artyPriority: 6 * scale };
    case "arty_corridor":
      return { ...base, artyPriority: 12 * scale };
    case "armor_push":
      return { ...base, chase: 10 * scale, holdObjective: 8 * scale };
    case "barrage_rotate":
      return { ...base, artyPriority: 18 * scale, holdObjective: 12 * scale };
    case "ridge_counter":
      return { ...base, holdObjective: 16 * scale, chase: 8 * scale };
    case "reserve_arty":
      return { ...base, artyPriority: 14 * scale, chase: turn >= 6 ? 12 * scale : 0 };
    default:
      return base;
  }
}
