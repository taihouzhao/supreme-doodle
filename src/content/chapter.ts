import type { ItemId, UnitTypeId } from "../core/types";
import { designation } from "./naming";
import { M1_BREAKTHROUGH } from "./missions/m1-breakthrough";
import { M2_HOLD } from "./missions/m2-hold";
import { M3_WITHDRAW } from "./missions/m3-withdraw";
import type { MissionConfig } from "./missions/schema";

export interface StartingUnitSpec {
  type: UnitTypeId;
  /** 同将领同兵种下的部队序号 */
  serial: number;
  exp: number;
}

export interface ChapterConfig {
  id: string;
  name: string;
  /** 番号用将领名，如梁兴初 */
  commander: string;
  missions: MissionConfig[];
  startingRoster: StartingUnitSpec[];
  startingInventory: Record<ItemId, number>;
  /** 每关开始时补足到的最低编制 */
  minRoster: number;
  /** 单关最多补充的新兵数 */
  maxReplacementsPerMission: number;
  /** 溃散单位的永久损失概率 */
  permanentLossChance: { won: number; lost: number };
  /** 溃散后归队单位的恢复生命与经验折扣 */
  returningUnit: { hp: number; expPenalty: number };
  /** 关卡之间恢复的生命与疲劳比例 */
  restRecovery: { hp: number; fatigue: number };
  /** 每关结束补给的道具 */
  resupply: Partial<Record<ItemId, number>>;
}

/**
 * 第一章 · 入朝：云山伏击 → 长津阻击 → 北撤掩护。
 * 编制以步兵/机枪为主，贴合入朝初期缺少成建制装甲与师属炮兵的现实。
 */
export const CHAPTER_ONE: ChapterConfig = {
  id: "chapter-one",
  name: "第一章 · 入朝",
  commander: "梁兴初",
  missions: [M1_BREAKTHROUGH, M2_HOLD, M3_WITHDRAW],
  startingRoster: [
    { type: "rifle", serial: 1, exp: 120 },
    { type: "rifle", serial: 2, exp: 40 },
    { type: "rifle", serial: 3, exp: 20 },
    { type: "rifle", serial: 4, exp: 0 },
    { type: "rifle", serial: 5, exp: 0 },
    { type: "mg", serial: 1, exp: 60 },
    { type: "mg", serial: 2, exp: 10 },
    { type: "mg", serial: 3, exp: 0 },
  ],
  startingInventory: { medkit: 2, at_charge: 1, arty_support: 0 },
  minRoster: 8,
  maxReplacementsPerMission: 4,
  permanentLossChance: { won: 0.35, lost: 0.5 },
  returningUnit: { hp: 35, expPenalty: 0.3 },
  restRecovery: { hp: 0.5, fatigue: 0.6 },
  resupply: { medkit: 1, at_charge: 1 },
};

export function rosterUnitName(chapter: ChapterConfig, spec: StartingUnitSpec): string {
  return designation(chapter.commander, spec.type, spec.serial);
}

export const CHAPTERS: Record<string, ChapterConfig> = {
  [CHAPTER_ONE.id]: CHAPTER_ONE,
};
