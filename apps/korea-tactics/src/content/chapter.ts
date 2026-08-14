import type { AttachmentId, CommanderStats, ItemId, UnitTypeId, WeaponId } from "../core/types";
import { PACED_RESUPPLY_AFTER, PACED_STARTING_INVENTORY } from "./item-pacing";
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
  /** 史实简介（简报 / 军械库展示） */
  bio?: string;
  /** 底板属性（未含等级成长） */
  baseStats?: Partial<CommanderStats>;
  weapon?: WeaponId;
  attachment?: AttachmentId;
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
  startingInventory: Partial<Record<ItemId, number>>;
  /** 开局军械库 */
  startingArmory: WeaponId[];
  /** 开局附件库存；与 startingRoster 的附件一一对应时仍只计一件实物。 */
  startingAttachments?: AttachmentId[];
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
  /** 每关结束补给的道具（缺省时回退；优先用 resupplyAfter） */
  resupply?: Partial<Record<ItemId, number>>;
  /** 打完 missions[i] 后入库的物资 */
  resupplyAfter?: Array<Partial<Record<ItemId, number>>>;
}

/**
 * 历史战役篇：仅主角高大全为虚构连接；
 * 常驻伴随与各关临时配属均为真实志愿军人物（选集式叙事）。
 */
export const CHAPTER_ONE: ChapterConfig = {
  id: "chapter-one",
  name: "朝鲜战场 · 1950—1953",
  protagonist: {
    name: "高大全",
    title: "志司直属加强营指挥员",
    bio: "虚构人物，作为战役选集的指挥连接。身旁常驻班底与各关临时配属均为真实志愿军战斗英雄与部队指挥员；敌军历史主将也会以精英单位出现在战场上。",
    portrait: "gao-daquan",
  },
  missions: MISSION_LIST,
  startingRoster: [
    {
      commander: "高大全",
      type: "rifle",
      level: 2,
      duty: "志司直属加强营指挥员",
      bio: "虚构主角：串联十二场关键战役的机动指挥员。",
      keyUnit: true,
      baseStats: { leadership: 48, intellect: 44, might: 45, stamina: 46, agility: 42 },
      weapon: "zhongzheng",
      attachment: "engineer_tools",
    },
    {
      commander: "郭恩志",
      type: "rifle",
      level: 1,
      duty: "188师563团8连指挥员",
      bio: "铁原阻击战中率部坚守，志愿军战斗英雄。",
      baseStats: { leadership: 42, intellect: 38, might: 44, stamina: 45, agility: 40 },
      weapon: "type38",
    },
    {
      commander: "胡修道",
      type: "mg",
      level: 1,
      duty: "12军31师91团机枪班长",
      bio: "上甘岭战役机枪阵地英雄，以火力压制著称。",
      baseStats: { leadership: 44, intellect: 40, might: 42, stamina: 42, agility: 36 },
      weapon: "zb26",
    },
    {
      commander: "唐章洪",
      type: "mortar",
      level: 1,
      duty: "炮兵迫击炮分队指挥员",
      bio: "志愿军炮兵战斗骨干，擅长山地迫击火力协同。",
      baseStats: { leadership: 38, intellect: 46, might: 38, stamina: 40, agility: 38 },
      weapon: "mortar60",
    },
    {
      commander: "柴云振",
      type: "logistics",
      level: 1,
      duty: "直属火力与辎重协同分队",
      bio: "朴达峰战斗英雄；本篇以其韧劲与补给穿插能力编入加强营。",
      baseStats: { leadership: 44, intellect: 40, might: 36, stamina: 48, agility: 40 },
      weapon: "supply_cart",
      attachment: "pack_train",
    },
  ],
  reserveCommanders: [
    "杨育才",
    "张桃芳",
    "李玉安",
    "孙生禄",
    "王兆才",
    "刘维汉",
    "陈德忠",
    "周厚刚",
    "高玉宝",
    "倪恩德",
  ],
  startingInventory: PACED_STARTING_INVENTORY,
  startingArmory: ["type38", "zhongzheng", "zb26", "mortar60", "supply_cart", "type75"],
  startingAttachments: ["engineer_tools", "pack_train"],
  minRoster: 5,
  maxReplacementsPerMission: 2,
  // 新版集火与包围会把前沿减员传导到后续关卡；提高战后永久损失并略收紧休整恢复，
  // 让连续战役保持偏难但可恢复，避免基础策略长期稳定通吃。
  permanentLossChance: { won: 0.25, lost: 0.45 },
  returningUnit: { hp: 40, expPenalty: 0.25 },
  restRecovery: { hp: 0.45, fatigue: 0.55 },
  resupplyAfter: PACED_RESUPPLY_AFTER,
};

export function rosterUnitName(spec: StartingUnitSpec): string {
  return designation(spec.commander, spec.type);
}

/** 从番号反推主将名（番号 = 主将 + 兵种名） */
export function commanderFromUnitName(name: string): string {
  for (const label of ["迫击炮", "机枪", "步兵", "装甲车", "坦克", "炮兵", "后勤"]) {
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
