import type {
  AttackPattern,
  CommanderStats,
  Faction,
  GearRarity,
  UnitTypeId,
  WeaponCategoryId,
  WeaponEffectProfile,
  WeaponId,
} from "../core/types";
import { inferWeaponCategory } from "./evolution";

export type { WeaponId };

/**
 * 武器挂在将领身上：进攻加成并入五维属性；另提供防御/射程修正。
 * 战场拾取进军械库，战役内可自动换装更优武器。
 */

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** 适配兵种；空数组表示通用 */
  forTypes: UnitTypeId[];
  /** 属性加点（叠加在将领属性上） */
  stats: Partial<CommanderStats>;
  /** @deprecated 进攻已并入 stats；保留字段恒为 0 */
  attackBonus: number;
  /** 额外承伤减免（正数减伤） */
  defenseBonus: number;
  /** 最大射程修正（格） */
  rangeBonus: number;
  /** 最小射程修正（格），可为负 */
  minRangeBonus: number;
  /** 军械评分，用于自动换装 */
  score: number;
  era: "early" | "late" | "enemy";
  /** 只影响表现与多目标范围，不改变既有基础伤害公式。 */
  effectProfile?: WeaponEffectProfile;
  pattern?: AttackPattern;
  /** 通用装备效果；旧型号缺省时按 1/0 处理。 */
  damageMultiplier?: number;
  moveModifier?: number;
  /** 未移动时使用的固定射程；移动射程仍按 UnitType + rangeBonus。 */
  stationaryMinRange?: number;
  stationaryMaxRange?: number;
  /** 与 stationary* 等价的结构化表示，供数据驱动工具读取。 */
  fixedRange?: { min: number; max: number };
  mobileRange?: { min: number; max: number };
  movingDamageMultiplier?: number;
  requiresSetup?: boolean;
  /** 对特定守方兵种覆写克制系数。 */
  matchupModifiers?: Partial<Record<UnitTypeId, number>>;
  supplyPenaltyMultiplier?: number;
  fortDamageMultiplier?: number;
  splashRatio?: number;
  cooldownTurns?: number;
  /** 装备自身带车辆属性；BM-13 因此不能再挂炮兵牵引车。 */
  motorized?: boolean;
  vehicle?: boolean;
  directFire?: boolean;
  /** BAR 等武器的架设收益覆写。 */
  setupBonusOverride?: number;
  /** 装备大类；缺省时由 inferWeaponCategory 推断。 */
  category?: WeaponCategoryId;
  rarity?: GearRarity;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  type38: {
    id: "type38",
    name: "三八式步枪",
    forTypes: ["rifle"],
    stats: {might: 6, agility: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 10,
    era: "early",
  },
  zhongzheng: {
    id: "zhongzheng",
    name: "中正式步枪",
    forTypes: ["rifle"],
    stats: {might: 8, stamina: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 14,
    era: "early",
  },
  mosin: {
    id: "mosin",
    name: "莫辛-纳甘步枪",
    forTypes: ["rifle"],
    stats: {might: 13, intellect: 1},
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 22,
    era: "late",
  },
  ppsh50: {
    id: "ppsh50",
    name: "50式冲锋枪",
    forTypes: ["rifle"],
    stats: {might: 13, agility: 3, leadership: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 26,
    era: "late",
  },
  zb26: {
    id: "zb26",
    name: "捷克式ZB-26",
    forTypes: ["mg"],
    stats: {might: 10, leadership: 2},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 16,
    era: "early",
  },
  dp28: {
    id: "dp28",
    name: "DP-28轻机枪",
    forTypes: ["mg"],
    stats: {might: 16, leadership: 3, stamina: 1},
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 28,
    era: "late",
  },
  mortar60: {
    id: "mortar60",
    name: "31式60毫米迫击炮",
    forTypes: ["mortar"],
    stats: {intellect: 8, might: 2},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 15,
    era: "early",
  },
  mortar82: {
    id: "mortar82",
    name: "82-PM-37迫击炮",
    forTypes: ["mortar"],
    stats: {intellect: 18, might: 3, leadership: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 30,
    era: "late",
  },
  type75: {
    id: "type75",
    name: "75毫米山炮",
    forTypes: ["artillery"],
    stats: { intellect: 14, leadership: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 24,
    era: "early",
  },
  m2a1_howitzer: {
    id: "m2a1_howitzer",
    name: "M2A1 105毫米榴弹炮",
    forTypes: ["artillery"],
    stats: { intellect: 21, leadership: 2, stamina: 1 },
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 34,
    era: "enemy",
  },
  supply_cart: {
    id: "supply_cart",
    name: "辎重车",
    forTypes: ["logistics"],
    stats: { stamina: 5, leadership: 2, agility: 1 },
    attackBonus: 0,
    defenseBonus: 0.02,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 12,
    era: "early",
  },
  bazooka: {
    id: "bazooka",
    name: "缴获M9A1火箭筒",
    forTypes: ["rifle", "tank"],
    stats: {might: 11, intellect: 2},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 20,
    era: "late",
  },
  t34_85: {
    id: "t34_85",
    name: "T-34-85",
    forTypes: ["tank"],
    stats: {might: 22, stamina: 6, leadership: 2},
    attackBonus: 0,
    defenseBonus: 0.04,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 40,
    era: "late",
  },
  m1_garand: {
    id: "m1_garand",
    name: "M1加兰德",
    forTypes: ["rifle"],
    stats: {might: 12, agility: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 18,
    era: "enemy",
  },
  m1_carbine: {
    id: "m1_carbine",
    name: "M1卡宾枪",
    forTypes: ["rifle"],
    stats: {might: 7, agility: 3},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 12,
    era: "enemy",
  },
  m1919: {
    id: "m1919",
    name: "勃朗宁M1919A4",
    forTypes: ["mg"],
    stats: {might: 12, leadership: 2},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 20,
    era: "enemy",
  },
  m2_mortar: {
    id: "m2_mortar",
    name: "M2 60毫米迫击炮",
    forTypes: ["mortar"],
    stats: {intellect: 8, might: 1, agility: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 16,
    era: "enemy",
  },
  m1_mortar: {
    id: "m1_mortar",
    name: "M1 81毫米迫击炮",
    forTypes: ["mortar"],
    stats: {intellect: 14, might: 2},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 24,
    era: "enemy",
  },
  sherman: {
    id: "sherman",
    name: "M4A3E8谢尔曼",
    forTypes: ["tank"],
    stats: {might: 20, stamina: 5},
    attackBonus: 0,
    defenseBonus: 0.03,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 36,
    era: "enemy",
  },
  lee_enfield: {
    id: "lee_enfield",
    name: "李-恩菲尔德 No.4",
    forTypes: ["rifle"],
    stats: {might: 9, stamina: 1, agility: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 16,
    era: "enemy",
  },
  bren: {
    id: "bren",
    name: "布伦轻机枪",
    forTypes: ["mg"],
    stats: {might: 11, leadership: 2, agility: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 19,
    era: "enemy",
  },
  mac24: {
    id: "mac24",
    name: "MAC 24/29轻机枪",
    forTypes: ["mg"],
    stats: {might: 11, leadership: 1, agility: 1},
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 18,
    era: "enemy",
  },
  centurion: {
    id: "centurion",
    name: "百夫长 Mk.3",
    forTypes: ["tank"],
    stats: {might: 23, stamina: 7, intellect: 1},
    attackBonus: 0,
    defenseBonus: 0.055,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 42,
    era: "enemy",
  },
  mosin_m44_marksman: {
    id: "mosin_m44_marksman",
    name: "莫辛 M44 特等射手枪",
    forTypes: ["rifle"],
    stats: { might: 17, intellect: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 32,
    era: "late",
    stationaryMinRange: 1,
    stationaryMaxRange: 2,
    fixedRange: { min: 1, max: 2 },
    mobileRange: { min: 1, max: 1 },
    damageMultiplier: 0.85,
  },
  m1d_sniper: {
    id: "m1d_sniper",
    name: "M1D狙击步枪",
    forTypes: ["rifle"],
    stats: { might: 18, intellect: 3 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 35,
    era: "enemy",
    stationaryMinRange: 1,
    stationaryMaxRange: 2,
    fixedRange: { min: 1, max: 2 },
    mobileRange: { min: 1, max: 1 },
    damageMultiplier: 0.9,
    supplyPenaltyMultiplier: 1.15,
  },
  bar_m1918a2: {
    id: "bar_m1918a2",
    name: "M1918A2 BAR",
    forTypes: ["mg"],
    stats: { might: 15, agility: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 29,
    era: "enemy",
    moveModifier: 1,
    movingDamageMultiplier: 1.08,
    setupBonusOverride: 0.15,
  },
  m2hb: {
    id: "m2hb",
    name: "M2HB 12.7mm机枪",
    forTypes: ["mg"],
    stats: { might: 22, leadership: 2 },
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 38,
    era: "enemy",
    moveModifier: -2,
    matchupModifiers: { tank: 0.7 },
    requiresSetup: true,
  },
  type92_infantry_gun: {
    id: "type92_infantry_gun",
    name: "九二式步兵炮",
    forTypes: ["artillery"],
    stats: { intellect: 16, might: 4, leadership: 1 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: -2,
    minRangeBonus: -2,
    score: 28,
    era: "early",
    moveModifier: 2,
    fortDamageMultiplier: 1.2,
    directFire: true,
  },
  mortar120: {
    id: "mortar120",
    name: "120mm重迫击炮",
    forTypes: ["mortar"],
    stats: { intellect: 22, might: 4 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 2,
    minRangeBonus: 1,
    score: 36,
    era: "late",
    damageMultiplier: 1.15,
    moveModifier: -1,
    requiresSetup: true,
  },
  m2_4_2_mortar: {
    id: "m2_4_2_mortar",
    name: "M2 4.2英寸迫击炮",
    forTypes: ["mortar"],
    stats: { intellect: 24, might: 5 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 2,
    minRangeBonus: 1,
    score: 39,
    era: "enemy",
    damageMultiplier: 1.18,
    moveModifier: -2,
    supplyPenaltyMultiplier: 1.15,
    requiresSetup: true,
  },
  qf25: {
    id: "qf25",
    name: "英制25磅炮",
    forTypes: ["artillery"],
    stats: { intellect: 21, leadership: 3 },
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 37,
    era: "enemy",
    damageMultiplier: 1.08,
    setupBonusOverride: 0.22,
  },
  zis3: {
    id: "zis3",
    name: "ZiS-3 76.2mm野炮",
    forTypes: ["artillery"],
    stats: { intellect: 23, might: 3, leadership: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 1,
    minRangeBonus: -1,
    score: 41,
    era: "late",
    matchupModifiers: { tank: 0.85 },
    directFire: true,
  },
  m30_122: {
    id: "m30_122",
    name: "M1938 122mm榴弹炮",
    forTypes: ["artillery"],
    stats: { intellect: 27, might: 2, leadership: 2 },
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 1,
    minRangeBonus: 1,
    score: 46,
    era: "late",
    damageMultiplier: 1.18,
    moveModifier: -1,
    requiresSetup: true,
  },
  bm13: {
    id: "bm13",
    name: "BM-13“喀秋莎”",
    forTypes: ["artillery"],
    stats: { intellect: 26, might: 6, leadership: 3 },
    attackBonus: 0,
    defenseBonus: 0.02,
    rangeBonus: 2,
    minRangeBonus: 1,
    score: 52,
    era: "late",
    splashRatio: 0.4,
    cooldownTurns: 2,
    motorized: true,
    vehicle: true,
    directFire: false,
  },
  m1_155: {
    id: "m1_155",
    name: "缴获M1 155mm榴弹炮",
    forTypes: ["artillery"],
    stats: { intellect: 31, might: 5, leadership: 2 },
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 2,
    minRangeBonus: 1,
    score: 50,
    era: "enemy",
    damageMultiplier: 1.25,
    moveModifier: -2,
    supplyPenaltyMultiplier: 1.25,
    requiresSetup: true,
  },

  arsks: {
    id: "arsks",
    name: "苏制 SKS 半自动步枪",
    forTypes: ["rifle"],
    stats: { might: 14, agility: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 24,
    era: "late",
    category: "infantry_rifle",
    rarity: "standard",
  },
  type53_carbine: {
    id: "type53_carbine",
    name: "53式骑枪",
    forTypes: ["rifle"],
    stats: { might: 12, agility: 2, stamina: 1 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 21,
    era: "late",
    category: "infantry_rifle",
    rarity: "standard",
  },
  pps43: {
    id: "pps43",
    name: "PPS-43冲锋枪",
    forTypes: ["rifle"],
    stats: { might: 12, agility: 4 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 24,
    era: "late",
    category: "infantry_smg",
    rarity: "standard",
  },
  thompson: {
    id: "thompson",
    name: "缴获汤姆逊冲锋枪",
    forTypes: ["rifle"],
    stats: { might: 14, agility: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 25,
    era: "enemy",
    category: "infantry_smg",
    rarity: "standard",
  },
  ppsh_drum_elite: {
    id: "ppsh_drum_elite",
    name: "英雄弹鼓·50式",
    forTypes: ["rifle"],
    stats: { might: 16, agility: 4, leadership: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 34,
    era: "late",
    category: "infantry_smg",
    rarity: "elite",
    damageMultiplier: 1.08,
  },
  mosin_scoped_hero: {
    id: "mosin_scoped_hero",
    name: "光学莫辛·特等",
    forTypes: ["rifle"],
    stats: { might: 19, intellect: 4 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 40,
    era: "late",
    category: "infantry_marksman",
    rarity: "elite",
    stationaryMinRange: 1,
    stationaryMaxRange: 2,
    fixedRange: { min: 1, max: 2 },
    mobileRange: { min: 1, max: 1 },
    damageMultiplier: 0.95,
  },
  rpg43: {
    id: "rpg43",
    name: "RPG-43反坦克榴弹",
    forTypes: ["rifle"],
    stats: { might: 10, intellect: 1 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 18,
    era: "late",
    category: "infantry_at",
    rarity: "standard",
    matchupModifiers: { tank: 1.35, armored_car: 1.25 },
  },
  panzerfaust: {
    id: "panzerfaust",
    name: "缴获铁拳",
    forTypes: ["rifle"],
    stats: { might: 14, intellect: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 28,
    era: "enemy",
    category: "infantry_at",
    rarity: "elite",
    damageMultiplier: 1.2,
    matchupModifiers: { tank: 1.5, armored_car: 1.4 },
  },
  sg43: {
    id: "sg43",
    name: "SG-43重机枪",
    forTypes: ["mg"],
    stats: { might: 18, leadership: 3, stamina: 1 },
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 33,
    era: "late",
    category: "mg_mmg",
    rarity: "standard",
    moveModifier: -1,
    requiresSetup: true,
  },
  type24_maxim: {
    id: "type24_maxim",
    name: "24式马克沁重机枪",
    forTypes: ["mg"],
    stats: { might: 14, leadership: 2, stamina: 2 },
    attackBonus: 0,
    defenseBonus: 0.01,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 22,
    era: "early",
    category: "mg_mmg",
    rarity: "standard",
    moveModifier: -1,
    requiresSetup: true,
  },
  m2hb_quad: {
    id: "m2hb_quad",
    name: "M2HB四联阵地机枪",
    forTypes: ["mg"],
    stats: { might: 26, leadership: 3 },
    attackBonus: 0,
    defenseBonus: 0.02,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 46,
    era: "enemy",
    category: "mg_hmg",
    rarity: "elite",
    moveModifier: -3,
    matchupModifiers: { tank: 0.85, armored_car: 1.1 },
    requiresSetup: true,
    damageMultiplier: 1.12,
  },
  mortar70_type: {
    id: "mortar70_type",
    name: "日制70毫米残存迫击炮",
    forTypes: ["mortar"],
    stats: { intellect: 6, might: 1 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 12,
    era: "early",
    category: "mortar_light",
    rarity: "standard",
    damageMultiplier: 0.9,
  },
  mortar120_guard: {
    id: "mortar120_guard",
    name: "近卫120mm重迫",
    forTypes: ["mortar"],
    stats: { intellect: 26, might: 5, leadership: 2 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 2,
    minRangeBonus: 1,
    score: 44,
    era: "late",
    category: "mortar_heavy",
    rarity: "elite",
    damageMultiplier: 1.22,
    moveModifier: -1,
    requiresSetup: true,
  },
  type41_75: {
    id: "type41_75",
    name: "四一式山炮",
    forTypes: ["artillery"],
    stats: { intellect: 12, leadership: 1 },
    attackBonus: 0,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 20,
    era: "early",
    category: "arty_gun",
    rarity: "standard",
  },
  bm13_guards: {
    id: "bm13_guards",
    name: "近卫BM-13喀秋莎",
    forTypes: ["artillery"],
    stats: { intellect: 28, might: 7, leadership: 3 },
    attackBonus: 0,
    defenseBonus: 0.02,
    rangeBonus: 2,
    minRangeBonus: 1,
    score: 58,
    era: "late",
    category: "arty_rocket",
    rarity: "elite",
    splashRatio: 0.45,
    cooldownTurns: 1,
    motorized: true,
    vehicle: true,
    directFire: false,
  },
  ba64: {
    id: "ba64",
    name: "BA-64装甲车",
    forTypes: ["armored_car"],
    stats: { might: 12, agility: 4, stamina: 2 },
    attackBonus: 0,
    defenseBonus: 0.02,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 22,
    era: "late",
    category: "ac_cannon",
    rarity: "standard",
    motorized: true,
    vehicle: true,
  },
  m8_greyhound: {
    id: "m8_greyhound",
    name: "缴获M8灰狗装甲车",
    forTypes: ["armored_car"],
    stats: { might: 16, agility: 3, stamina: 3 },
    attackBonus: 0,
    defenseBonus: 0.03,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 30,
    era: "enemy",
    category: "ac_cannon",
    rarity: "standard",
    motorized: true,
    vehicle: true,
  },
  su76: {
    id: "su76",
    name: "SU-76自行火炮",
    forTypes: ["armored_car"],
    stats: { might: 18, intellect: 2, stamina: 3 },
    attackBonus: 0,
    defenseBonus: 0.025,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 34,
    era: "late",
    category: "ac_cannon",
    rarity: "standard",
    motorized: true,
    vehicle: true,
    fortDamageMultiplier: 1.15,
  },
  m24_chaffee: {
    id: "m24_chaffee",
    name: "缴获M24霞飞",
    forTypes: ["armored_car"],
    stats: { might: 20, agility: 4, stamina: 4 },
    attackBonus: 0,
    defenseBonus: 0.035,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 42,
    era: "enemy",
    category: "ac_cannon",
    rarity: "elite",
    motorized: true,
    vehicle: true,
    damageMultiplier: 1.1,
  },
  t34_85_215: {
    id: "t34_85_215",
    name: "215号T-34-85",
    forTypes: ["tank"],
    stats: { might: 26, stamina: 7, leadership: 3 },
    attackBonus: 0,
    defenseBonus: 0.05,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 50,
    era: "late",
    category: "tank_gun",
    rarity: "elite",
    damageMultiplier: 1.12,
  },

};

export interface WeaponHistory {
  origin: string;
  caliber: string;
  note: string;
}

/** 只记录能由型号确认的史实；游戏数值仍由 WeaponDef 独立平衡。 */
export const WEAPON_HISTORY: Record<WeaponId, WeaponHistory> = {
  type38: { origin: "日本", caliber: "6.5×50毫米有坂弹", note: "日制栓动步枪，志愿军早期装备中的旧存与缴获来源之一。" },
  zhongzheng: { origin: "中国", caliber: "7.92×57毫米", note: "以毛瑟体系为基础的中正式步枪，随原有与缴获库存投入朝鲜战场。" },
  mosin: { origin: "苏联", caliber: "7.62×54毫米R", note: "苏制莫辛-纳甘栓动步枪，后续换装来源之一。" },
  ppsh50: { origin: "中国", caliber: "7.62×25毫米", note: "仿PPSh-41生产的50式冲锋枪，适合近距离夜战。" },
  zb26: { origin: "捷克斯洛伐克／中国", caliber: "7.92×57毫米", note: "顶部弹匣供弹的ZB-26及中国仿制型，早期班组火力常见。" },
  dp28: { origin: "苏联", caliber: "7.62×54毫米R", note: "盘形弹匣供弹的DP-28轻机枪，后续换装班组火力。" },
  mortar60: { origin: "中国", caliber: "60毫米", note: "31式60毫米迫击炮，源自美制M2体系，便于步兵分队携行。" },
  mortar82: { origin: "苏联", caliber: "82毫米", note: "82-PM-37系列迫击炮，用作营级曲射火力的游戏化代表。" },
  type75: { origin: "中国／多源", caliber: "75毫米", note: "山炮作为师属轻型炮兵的游戏化代表，便于山地展开。" },
  m2a1_howitzer: { origin: "美国", caliber: "105毫米", note: "M2A1榴弹炮是美军师属直协炮兵的常见口径。" },
  supply_cart: { origin: "中朝战场通用", caliber: "—", note: "驮载/马车与轻型汽车混编的辎重分队抽象。" },
  bazooka: { origin: "美国（缴获）", caliber: "2.36英寸火箭弹", note: "M9A1火箭筒作为缴获反装甲支援，不视为志愿军制式普遍装备。" },
  t34_85: { origin: "苏联", caliber: "85毫米主炮", note: "T-34-85曾装备中朝装甲部队；关卡中只代表有限配属装甲支援。" },
  m1_garand: { origin: "美国", caliber: ".30-06", note: "M1半自动步枪，美军步兵主要制式步枪。" },
  m1_carbine: { origin: "美国", caliber: ".30 Carbine", note: "M1卡宾枪，多用于军官、通信与支援人员，也大量援助韩军。" },
  m1919: { origin: "美国", caliber: ".30-06", note: "M1919A4中型机枪，常以两脚架或三脚架提供持续火力。" },
  m2_mortar: { origin: "美国", caliber: "60毫米", note: "M2型60毫米迫击炮，美韩步兵分队使用的轻型曲射支援武器。" },
  m1_mortar: { origin: "美国", caliber: "81毫米", note: "M1型81毫米迫击炮，美军营级曲射支援武器。" },
  sherman: { origin: "美国", caliber: "76毫米主炮", note: "M4A3E8“Easy Eight”谢尔曼，朝鲜战场常见美军坦克型号。" },
  lee_enfield: { origin: "英国", caliber: ".303 British", note: "No.4 Mk I栓动步枪，英联邦部队在朝鲜战场的主要步枪之一。" },
  bren: { origin: "英国／加拿大", caliber: ".303 British", note: "布伦轻机枪是英联邦步兵班组的主要自动火力；游戏中兼表同阵地的维克斯支援。" },
  mac24: { origin: "法国", caliber: "7.5×54毫米", note: "MAC 24/29轻机枪，法国联合国营的代表性班组自动武器。" },
  centurion: { origin: "英国", caliber: "20磅炮（84毫米）", note: "百夫长Mk.3装备20磅炮，英军第8骠骑兵团在朝鲜战场投入使用。" },
  mosin_m44_marksman: { origin: "苏联／志愿军", caliber: "7.62×54毫米R", note: "莫辛步枪的精确射手改型，用于冷枪冷炮时期的定点射击。" },
  m1d_sniper: { origin: "美国（缴获）", caliber: ".30-06", note: "M1D加兰德狙击型，作为有限精英缴获装备进入军械库。" },
  bar_m1918a2: { origin: "美国（缴获）", caliber: ".30-06", note: "BAR自动步枪，机动火力强但架设持续火力收益较低。" },
  m2hb: { origin: "美国（缴获）", caliber: ".50 BMG", note: "M2HB重机枪，静止时具备有限反装甲能力。" },
  type92_infantry_gun: { origin: "日本／缴获", caliber: "70毫米", note: "九二式步兵炮，轻便直射火力，适合山地阵地。" },
  mortar120: { origin: "中国／苏式体系", caliber: "120毫米", note: "重迫击炮，威力较高但需要架设和持续补给。" },
  m2_4_2_mortar: { origin: "美国", caliber: "4.2英寸（106.7毫米）", note: "美军化学迫击炮体系，游戏中抽象为高威力曲射火力。" },
  qf25: { origin: "英国／英联邦", caliber: "25磅（87.6毫米）", note: "英军25磅炮，朝鲜战场英联邦炮兵的代表型号。" },
  zis3: { origin: "苏联", caliber: "76.2毫米", note: "ZiS-3野炮，兼具直射与反装甲用途。" },
  m30_122: { origin: "苏联／志愿军", caliber: "122毫米", note: "M-30 122毫米榴弹炮，体现1951年后苏式火炮换装。" },
  bm13: { origin: "苏联／志愿军", caliber: "132毫米火箭弹", note: "BM-13喀秋莎火箭炮，车辆自走且齐射后需要冷却。" },
  m1_155: { origin: "美国（缴获）", caliber: "155毫米", note: "缴获M1重榴弹炮，威力大、机动和补给代价都高。" },
  arsks: { origin: "苏联", caliber: "7.62×39毫米", note: "SKS半自动步枪，1950年代苏援轻武器之一。" },
  type53_carbine: { origin: "中国／苏联", caliber: "7.62×54毫米R", note: "53式骑枪，莫辛体系短枪管改型。" },
  pps43: { origin: "苏联", caliber: "7.62×25毫米", note: "PPS-43冲锋枪，结构简单、适合大规模列装。" },
  thompson: { origin: "美国（缴获）", caliber: ".45 ACP", note: "汤姆逊冲锋枪，作为缴获自动火力进入编制。" },
  ppsh_drum_elite: { origin: "中国／苏联", caliber: "7.62×25毫米", note: "英雄单位保留的大弹鼓改装50式，稀有精英装备。" },
  mosin_scoped_hero: { origin: "苏联／志愿军", caliber: "7.62×54毫米R", note: "带光学瞄具的特等射手莫辛，冷枪战代表装备。" },
  rpg43: { origin: "苏联", caliber: "反坦克榴弹", note: "RPG-43反坦克手榴弹，近距反装甲手段。" },
  panzerfaust: { origin: "德国／缴获流转", caliber: "Panzerfaust", note: "铁拳式单兵反装甲武器的战场缴获抽象。" },
  sg43: { origin: "苏联", caliber: "7.62×54毫米R", note: "SG-43重机枪，提供持续压制火力。" },
  type24_maxim: { origin: "中国", caliber: "7.92×57毫米", note: "24式马克沁重机枪，内战库存与朝鲜早期火力。" },
  m2hb_quad: { origin: "美国", caliber: ".50 BMG", note: "四联M2阵地火力的游戏化精英型号，机动极差。" },
  mortar70_type: { origin: "日本残存", caliber: "70毫米级", note: "日制轻型曲射残存装备，威力有限。" },
  mortar120_guard: { origin: "苏联／志愿军", caliber: "120毫米", note: "近卫重迫编制，精英曲射火力。" },
  type41_75: { origin: "日本", caliber: "75毫米", note: "四一式山炮，山地轻炮兵早期来源。" },
  bm13_guards: { origin: "苏联／志愿军", caliber: "132毫米火箭弹", note: "近卫喀秋莎，齐射节奏略快于普通BM-13。" },
  ba64: { origin: "苏联", caliber: "7.62毫米机枪塔", note: "BA-64轻型装甲车，公路侦察与火力支援。" },
  m8_greyhound: { origin: "美国（缴获）", caliber: "37毫米", note: "M8灰狗装甲车，作为缴获轮式火力。" },
  su76: { origin: "苏联", caliber: "76.2毫米", note: "SU-76轻型自行火炮，在本游戏中归入装甲车编制阶。" },
  m24_chaffee: { origin: "美国（缴获）", caliber: "75毫米", note: "M24霞飞轻型坦克，作装甲车顶级精英缴获，不直接升格为坦克兵种。" },
  t34_85_215: { origin: "中国／苏联", caliber: "85毫米主炮", note: "石岘洞北山215号T-34-85的叙事精英型号。" },

};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** 武器物理表现与命中形状的单一来源，旧内容未填写时按兵种兼容回退。 */
export function weaponPattern(weapon: WeaponId, type: UnitTypeId): {
  profile: WeaponEffectProfile;
  pattern: AttackPattern;
} {
  const def = WEAPONS[weapon];
  if (def.pattern && def.effectProfile) return { profile: def.effectProfile, pattern: def.pattern };
  if (
    weapon === "ppsh50" ||
    weapon === "m1_carbine" ||
    weapon === "pps43" ||
    weapon === "thompson" ||
    weapon === "ppsh_drum_elite"
  ) {
    return { profile: "smg", pattern: { kind: "single" } };
  }
  if (type === "mg") {
    return { profile: "mg", pattern: { kind: "line", depth: 1, multiplier: 0.3 } };
  }
  if (type === "mortar") {
    return { profile: "mortar", pattern: { kind: "cross", radius: 1, multiplier: 0.16 } };
  }
  if (type === "artillery") {
    return { profile: "artillery", pattern: { kind: "radius", radius: 1, multiplier: 0.2 } };
  }
  if (weapon === "bazooka" || weapon === "rpg43" || weapon === "panzerfaust") {
    return { profile: "rocket", pattern: { kind: "cross", radius: 1, multiplier: 0.15 } };
  }
  if (type === "tank" || type === "armored_car") {
    return { profile: "tank", pattern: { kind: "cross", radius: 1, multiplier: 0.15 } };
  }
  if (type === "logistics") {
    return { profile: "support", pattern: { kind: "single" } };
  }
  return { profile: "rifle", pattern: { kind: "single" } };
}

/** 多格攻击的阵营倍率：玩家友伤按需求保留 50%；敌军友伤收敛到 15%，
 * 敌军对玩家的溅射则保留一半主目标伤害，避免新增 AOE 让守点关变成纯随机减员。 */
export function secondaryDamageMultiplier(attacker: Faction, victim: Faction): number {
  const friendly = attacker === victim ? (attacker === "enemy" ? 0.15 : 0.5) : 1;
  const enemySpread = attacker === "enemy" && victim !== attacker ? 0.5 : 1;
  return friendly * enemySpread;
}

export function defaultWeaponFor(type: UnitTypeId, era: "early" | "late" | "enemy"): WeaponId {
  const pool = WEAPON_IDS.filter((id) => {
    const w = WEAPONS[id];
    return w.era === era && (w.forTypes.length === 0 || w.forTypes.includes(type));
  });
  if (pool.length === 0) {
    if (type === "rifle") return era === "enemy" ? "m1_garand" : "type38";
    if (type === "mg") return era === "enemy" ? "m1919" : "zb26";
    if (type === "mortar") return era === "enemy" ? "m1_mortar" : "mortar60";
    if (type === "artillery") return era === "enemy" ? "m2a1_howitzer" : "type75";
    if (type === "logistics") return "supply_cart";
    if (type === "armored_car") return era === "enemy" ? "m8_greyhound" : "ba64";
    return era === "enemy" ? "sherman" : "t34_85";
  }
  return pool.sort((a, b) => WEAPONS[a].score - WEAPONS[b].score)[0]!;
}

/**
 * 把史料化装备名称映射到真实机械型号。任务数据允许写完整编制说明，
 * 但战斗结算不能再默默回退成同兵种的最低分美式默认武器。
 */
export function weaponForEquipment(
  type: UnitTypeId,
  equipment: string | undefined,
  fallbackEra: "early" | "late" | "enemy" = "enemy",
): WeaponId {
  const text = equipment ?? "";
  const matches: [RegExp, WeaponId][] = [
    [/BM[- ]?13|喀秋莎/i, "bm13"],
    [/155毫米|M1\s*155/i, "m1_155"],
    [/122毫米|M1938|M-30/i, "m30_122"],
    [/ZiS[- ]?3|76\.2毫米/i, "zis3"],
    [/25磅|QF25/i, "qf25"],
    [/4\.2英寸|4\.2英寸迫击炮/i, "m2_4_2_mortar"],
    [/120毫米重迫击炮/i, "mortar120"],
    [/九二式步兵炮/i, "type92_infantry_gun"],
    [/M2HB|12\.7mm机枪/i, "m2hb"],
    [/BAR|M1918A2/i, "bar_m1918a2"],
    [/M1D|狙击步枪/i, "m1d_sniper"],
    [/M44|特等射手/i, "mosin_m44_marksman"],
    [/百夫长/i, "centurion"],
    [/谢尔曼|M4A3E8/i, "sherman"],
    [/李[-－]?恩菲尔德|Lee[- ]?Enfield/i, "lee_enfield"],
    [/布伦|维克斯|Bren|Vickers/i, "bren"],
    [/MAC\s*24\/?29/i, "mac24"],
    [/M1919|勃朗宁M1919/i, "m1919"],
    [/M1\s*加兰德|加兰德/i, "m1_garand"],
    [/M1\s*卡宾|卡宾枪/i, "m1_carbine"],
    [/M2(?:型)?\s*60|M1(?:型)?\s*60|60毫米迫击炮/i, "m2_mortar"],
    [/M1(?:型)?\s*81|81毫米迫击炮/i, "m1_mortar"],
    [/105|榴弹炮|M2A1/i, "m2a1_howitzer"],
    [/75毫米|山炮/i, "type75"],
    [/辎重|后勤|补给/i, "supply_cart"],
  ];
  for (const [pattern, weapon] of matches) {
    if (pattern.test(text) && weaponFits(weapon, type)) return weapon;
  }
  return defaultWeaponFor(type, fallbackEra);
}

export function weaponFits(weapon: WeaponId, type: UnitTypeId): boolean {
  const def = WEAPONS[weapon];
  return def.forTypes.length === 0 || def.forTypes.includes(type);
}

/** 在军械库中为该兵种挑选评分最高的可用武器。 */
export function bestWeapon(type: UnitTypeId, armory: WeaponId[], current: WeaponId): WeaponId {
  let best = current;
  let score = WEAPONS[current]?.score ?? 0;
  for (const id of armory) {
    if (!weaponFits(id, type)) continue;
    const s = WEAPONS[id].score;
    if (s > score) {
      best = id;
      score = s;
    }
  }
  return best;
}


export function weaponCategory(weapon: WeaponId): WeaponCategoryId {
  const def = WEAPONS[weapon];
  return def.category ?? inferWeaponCategory(weapon, def.forTypes);
}

export function weaponRarity(weapon: WeaponId): GearRarity {
  return WEAPONS[weapon]?.rarity ?? "standard";
}
