import type { CommanderStats, UnitTypeId, WeaponId } from "../core/types";

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
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

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
