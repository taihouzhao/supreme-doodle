import type { CommanderStats, ItemId, UnitTypeId, WeaponId } from "../core/types";
import { designation } from "./naming";
import { MISSION_LIST } from "./missions";
import type { MissionConfig } from "./missions/schema";
import {
  BASE_STATS,
  PROGRESS,
  statsAtLevel,
  type CommanderKind,
} from "./progress";
export interface StartingUnitSpec {
  /** 主将名：全军唯一，一将一支部队 */
  commander: string;
  type: UnitTypeId;
  /** 起始等级（1 起） */
  level: number;
  /** 战时职务/单位身份，不随战斗等级自动晋升。 */
  duty?: string;
  /** 底板属性（未含等级成长） */
  baseStats?: Partial<CommanderStats>;
  weapon?: WeaponId;
  keyUnit?: boolean;
  kind?: Extract<CommanderKind, "companion">;
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
  /** 伴随将领：跨关成长，开局即在编制内 */
  startingRoster: StartingUnitSpec[];
  /** 补充兵可用的主将名池（按顺序取尚未在花名册中的） */
  reserveCommanders: string[];
  startingInventory: Record<ItemId, number>;
  /** 开局军械库 */
  startingArmory: WeaponId[];
  /** 每关开始时补足到的最低编制（仅伴随将领） */
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
 * 历史战役篇：主角与直属伴随部队均为虚构；
 * 各关另有剧情将领客串出战，不跨关继承。
 */
export const CHAPTER_ONE: ChapterConfig = {
  id: "chapter-one",
  name: "朝鲜战场 · 1950—1953",
  protagonist: {
    name: "高大全",
    title: "志司直属加强营指挥员",
    bio: "虚构人物。出身东北野战军，擅长夜战穿插和山地防御；作为志愿军司令部直属机动指挥员，被派往不同军团协同关键战斗。直属班底精干，每战另有当地协同部队临时配属。",
    portrait: "gao-daquan",
  },
  missions: MISSION_LIST,
  startingRoster: [
    {
      commander: "高大全",
      type: "rifle",
      level: 2,
      duty: "志司直属加强营指挥员",
      keyUnit: true,
      baseStats: { leadership: 48, intellect: 44, might: 45, stamina: 46, agility: 42 },
      weapon: "zhongzheng",
    },
    {
      commander: "王铁山",
      type: "rifle",
      level: 1,
      duty: "直属步兵分队指挥员",
      baseStats: { leadership: 40, intellect: 36, might: 42, stamina: 44, agility: 40 },
      weapon: "type38",
    },
    {
      commander: "刘黑牛",
      type: "mg",
      level: 1,
      duty: "直属机枪分队指挥员",
      baseStats: { leadership: 42, intellect: 38, might: 40, stamina: 40, agility: 36 },
      weapon: "zb26",
    },
    {
      commander: "孙有田",
      type: "mortar",
      level: 1,
      duty: "直属迫击炮分队指挥员",
      baseStats: { leadership: 38, intellect: 44, might: 38, stamina: 38, agility: 38 },
      weapon: "mortar60",
    },
    {
      commander: "周粮草",
      type: "logistics",
      level: 1,
      duty: "直属辎重分队指挥员",
      baseStats: { leadership: 42, intellect: 40, might: 34, stamina: 46, agility: 40 },
      weapon: "supply_cart",
    },
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
  ],
  startingInventory: {
    medkit: 1,
    bandage: 2,
    ration: 1,
    at_charge: 1,
    satchel: 0,
    arty_support: 0,
    field_manual: 1,
  },
  startingArmory: ["type38", "zhongzheng", "zb26", "mortar60", "supply_cart", "type75"],
  minRoster: 5,
  maxReplacementsPerMission: 2,
  permanentLossChance: { won: 0.18, lost: 0.35 },
  returningUnit: { hp: 40, expPenalty: 0.25 },
  restRecovery: { hp: 0.55, fatigue: 0.65 },
  resupply: { medkit: 1, bandage: 1, ration: 1, at_charge: 1, arty_support: 1 },
};

export function rosterUnitName(spec: StartingUnitSpec): string {
  return designation(spec.commander, spec.type);
}

/** 从番号反推主将名（番号 = 主将 + 兵种名） */
export function commanderFromUnitName(name: string): string {
  for (const label of ["迫击炮", "机枪", "步兵", "坦克", "炮兵", "后勤"]) {
    if (name.endsWith(label)) return name.slice(0, -label.length);
  }
  return name;
}

export function companionSeedExp(level: number): number {
  return PROGRESS.expForLevel(level);
}

export function buildCompanionStats(spec: StartingUnitSpec): CommanderStats {
  // `baseStats` 是绝对底板；缺省项才回退到 40。旧实现使用 addStats，
  // 会把高大全 48/44/45/46/42 再加一次 40，造成五维与 HP 双计。
  const base: CommanderStats = { ...BASE_STATS, ...spec.baseStats };
  return statsAtLevel(base, spec.type, spec.level, spec.commander.length);
}

export const CHAPTERS: Record<string, ChapterConfig> = {
  [CHAPTER_ONE.id]: CHAPTER_ONE,
};
