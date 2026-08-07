import type { ItemId, UnitTypeId } from "../core/types";
import { M1_BREAKTHROUGH } from "./missions/m1-breakthrough";
import { M2_HOLD } from "./missions/m2-hold";
import { M3_WITHDRAW } from "./missions/m3-withdraw";
import type { MissionConfig } from "./missions/schema";

export interface StartingUnitSpec {
  name: string;
  type: UnitTypeId;
  exp: number;
}

export interface ChapterConfig {
  id: string;
  name: string;
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

export const CHAPTER_ONE: ChapterConfig = {
  id: "chapter-one",
  name: "第一章 · 隘口",
  missions: [M1_BREAKTHROUGH, M2_HOLD, M3_WITHDRAW],
  startingRoster: [
    { name: "一连", type: "rifle", exp: 80 },
    { name: "二连", type: "rifle", exp: 30 },
    { name: "三连", type: "rifle", exp: 10 },
    { name: "四连", type: "rifle", exp: 0 },
    { name: "机枪一班", type: "mg", exp: 50 },
    { name: "机枪二班", type: "mg", exp: 0 },
    { name: "迫击炮班", type: "mortar", exp: 40 },
    { name: "装甲排", type: "tank", exp: 20 },
  ],
  startingInventory: { medkit: 2, at_charge: 1, arty_support: 1 },
  minRoster: 8,
  maxReplacementsPerMission: 4,
  permanentLossChance: { won: 0.35, lost: 0.5 },
  returningUnit: { hp: 35, expPenalty: 0.3 },
  restRecovery: { hp: 0.5, fatigue: 0.6 },
  resupply: { medkit: 1 },
};

export const CHAPTERS: Record<string, ChapterConfig> = {
  [CHAPTER_ONE.id]: CHAPTER_ONE,
};
