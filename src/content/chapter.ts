import type { ItemId, UnitTypeId } from "../core/types";
import { designation } from "./naming";
import { MISSION_LIST } from "./missions";
import type { MissionConfig } from "./missions/schema";

export interface StartingUnitSpec {
  /** 主将名：全军唯一，一将一支部队 */
  commander: string;
  type: UnitTypeId;
  exp: number;
  keyUnit?: boolean;
}

export interface ChapterConfig {
  id: string;
  name: string;
  protagonist: {
    name: string;
    title: string;
    bio: string;
    portrait: string;
  };
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
 * 历史战役篇：主角与直属部队均为虚构，历史将领只作为战役背景出现。
 */
export const CHAPTER_ONE: ChapterConfig = {
  id: "chapter-one",
  name: "朝鲜战场 · 1950—1953",
  protagonist: {
    name: "高大全",
    title: "志司直属加强营指挥员",
    bio: "虚构人物。出身东北野战军，擅长夜战穿插和山地防御；作为志愿军司令部直属机动指挥员，被派往不同军团协同关键战斗。",
    portrait: "gao-daquan",
  },
  missions: MISSION_LIST,
  startingRoster: [
    { commander: "高大全", type: "rifle", exp: 180, keyUnit: true },
    { commander: "王铁山", type: "rifle", exp: 55 },
    { commander: "赵长河", type: "rifle", exp: 35 },
    { commander: "何满仓", type: "rifle", exp: 20 },
    { commander: "刘黑牛", type: "mg", exp: 80 },
    { commander: "陈守义", type: "mg", exp: 45 },
    { commander: "孙有田", type: "mortar", exp: 65 },
    { commander: "周文虎", type: "mortar", exp: 30 },
  ],
  reserveCommanders: [
    "谢大勇",
    "马振东",
    "曹立新",
    "冯树林",
    "顾平安",
    "石大川",
    "罗成武",
    "丁海峰",
    "孔庆元",
    "许长胜",
    "关万里",
    "田守信",
    "郭明山",
    "沈大江",
    "章克难",
    "贾四海",
  ],
  startingInventory: { medkit: 2, at_charge: 1, arty_support: 0 },
  minRoster: 8,
  maxReplacementsPerMission: 4,
  permanentLossChance: { won: 0.22, lost: 0.4 },
  returningUnit: { hp: 35, expPenalty: 0.3 },
  restRecovery: { hp: 0.5, fatigue: 0.6 },
  resupply: { medkit: 1, at_charge: 1, arty_support: 1 },
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
