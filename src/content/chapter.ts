import type { ItemId, UnitTypeId } from "../core/types";
import { designation } from "./naming";
import { M1_BREAKTHROUGH } from "./missions/m1-breakthrough";
import { M2_HOLD } from "./missions/m2-hold";
import { M3_WITHDRAW } from "./missions/m3-withdraw";
import type { MissionConfig } from "./missions/schema";

export interface StartingUnitSpec {
  /** 主将名：全军唯一，一将一支部队 */
  commander: string;
  type: UnitTypeId;
  exp: number;
}

export interface ChapterConfig {
  id: string;
  name: string;
  missions: MissionConfig[];
  startingRoster: StartingUnitSpec[];
  /** 补充兵可用的主将名池（按顺序取尚未在花名册中的） */
  reserveCommanders: string[];
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
 * 编制以步兵/机枪为主；每支部队对应唯一主将。
 */
export const CHAPTER_ONE: ChapterConfig = {
  id: "chapter-one",
  name: "第一章 · 入朝",
  missions: [M1_BREAKTHROUGH, M2_HOLD, M3_WITHDRAW],
  startingRoster: [
    { commander: "梁兴初", type: "rifle", exp: 120 },
    { commander: "江拥辉", type: "rifle", exp: 40 },
    { commander: "温玉成", type: "rifle", exp: 20 },
    { commander: "邓岳", type: "rifle", exp: 0 },
    { commander: "吴瑞林", type: "rifle", exp: 0 },
    { commander: "张竭诚", type: "mg", exp: 60 },
    { commander: "贺晋年", type: "mg", exp: 10 },
    { commander: "李天佑", type: "mg", exp: 0 },
  ],
  reserveCommanders: [
    "韩先楚",
    "解方",
    "杜平",
    "刘震",
    "杨得志",
    "彭德怀",
    "洪学智",
    "邓华",
  ],
  startingInventory: { medkit: 2, at_charge: 1, arty_support: 0 },
  minRoster: 8,
  maxReplacementsPerMission: 4,
  permanentLossChance: { won: 0.35, lost: 0.5 },
  returningUnit: { hp: 35, expPenalty: 0.3 },
  restRecovery: { hp: 0.5, fatigue: 0.6 },
  resupply: { medkit: 1, at_charge: 1 },
};

export function rosterUnitName(spec: StartingUnitSpec): string {
  return designation(spec.commander, spec.type);
}

/** 从番号反推主将名（番号 = 主将 + 兵种名） */
export function commanderFromUnitName(name: string): string {
  for (const label of ["迫击炮", "机枪", "步兵", "坦克"]) {
    if (name.endsWith(label)) return name.slice(0, -label.length);
  }
  return name;
}

export const CHAPTERS: Record<string, ChapterConfig> = {
  [CHAPTER_ONE.id]: CHAPTER_ONE,
};
