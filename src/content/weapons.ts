import type { CommanderStats, UnitTypeId, WeaponId } from "../core/types";

export type { WeaponId };

/**
 * 武器挂在将领身上，提供属性与少量战斗修正。
 * 战场拾取进军械库，战役内可自动换装更优武器。
 */

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** 适配兵种；空数组表示通用 */
  forTypes: UnitTypeId[];
  /** 属性加点（叠加在将领属性上） */
  stats: Partial<CommanderStats>;
  /** 额外攻击倍率 */
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
    stats: { might: 3, agility: 1 },
    attackBonus: 0.02,
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
    stats: { might: 4, stamina: 1 },
    attackBonus: 0.03,
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
    stats: { might: 6, intellect: 1 },
    attackBonus: 0.05,
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
    stats: { might: 5, agility: 3, leadership: 1 },
    attackBonus: 0.06,
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
    stats: { might: 4, leadership: 2 },
    attackBonus: 0.04,
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
    stats: { might: 6, leadership: 3, stamina: 1 },
    attackBonus: 0.07,
    defenseBonus: 0.01,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 28,
    era: "late",
  },
  mortar60: {
    id: "mortar60",
    name: "60毫米迫击炮",
    forTypes: ["mortar"],
    stats: { intellect: 4, might: 2 },
    attackBonus: 0.03,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 15,
    era: "early",
  },
  mortar82: {
    id: "mortar82",
    name: "82毫米迫击炮",
    forTypes: ["mortar"],
    stats: { intellect: 7, might: 3, leadership: 1 },
    attackBonus: 0.08,
    defenseBonus: 0,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 30,
    era: "late",
  },
  bazooka: {
    id: "bazooka",
    name: "火箭筒（支援）",
    forTypes: ["rifle", "tank"],
    stats: { might: 5, intellect: 2 },
    attackBonus: 0.04,
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
    stats: { might: 8, stamina: 6, leadership: 2 },
    attackBonus: 0.1,
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
    stats: { might: 5, agility: 1 },
    attackBonus: 0.05,
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
    stats: { might: 3, agility: 3 },
    attackBonus: 0.03,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 12,
    era: "enemy",
  },
  m1919: {
    id: "m1919",
    name: "勃朗宁M1919",
    forTypes: ["mg"],
    stats: { might: 5, leadership: 2 },
    attackBonus: 0.05,
    defenseBonus: 0,
    rangeBonus: 0,
    minRangeBonus: 0,
    score: 20,
    era: "enemy",
  },
  m1_mortar: {
    id: "m1_mortar",
    name: "M1 81毫米迫击炮",
    forTypes: ["mortar"],
    stats: { intellect: 6, might: 2 },
    attackBonus: 0.06,
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
    stats: { might: 7, stamina: 5 },
    attackBonus: 0.09,
    defenseBonus: 0.03,
    rangeBonus: 1,
    minRangeBonus: 0,
    score: 36,
    era: "enemy",
  },
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
    return era === "enemy" ? "sherman" : "t34_85";
  }
  return pool.sort((a, b) => WEAPONS[a].score - WEAPONS[b].score)[0]!;
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
