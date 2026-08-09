import type { UnitTypeDef, UnitTypeId } from "../core/types";
import { PROGRESS, levelFromExp } from "./progress";

export const UNIT_TYPES: Record<UnitTypeId, UnitTypeDef> = {
  rifle: {
    id: "rifle",
    name: "步兵",
    move: 6,
    minRange: 1,
    maxRange: 1,
    attack: 22,
    maxHp: 100,
    vehicle: false,
    canCapture: true,
    indirect: false,
    setupBonus: 0,
    role: "唯一能占领目标，耐打，是战线主体",
  },
  mg: {
    id: "mg",
    name: "机枪",
    move: 4,
    minRange: 1,
    maxRange: 2,
    attack: 24,
    maxHp: 90,
    vehicle: false,
    canCapture: false,
    indirect: false,
    setupBonus: 0.35,
    role: "本回合未移动则伤害大增，克步兵，对装甲几乎无效",
  },
  mortar: {
    id: "mortar",
    name: "迫击炮",
    move: 4,
    minRange: 2,
    maxRange: 3,
    attack: 22,
    maxHp: 70,
    vehicle: false,
    canCapture: false,
    indirect: true,
    setupBonus: 0,
    role: "营级曲射：地形防御减半且不受反击；射程短，只覆盖局部",
  },
  artillery: {
    id: "artillery",
    name: "炮兵",
    move: 2,
    minRange: 4,
    maxRange: 7,
    attack: 30,
    maxHp: 65,
    vehicle: false,
    canCapture: false,
    indirect: true,
    setupBonus: 0.12,
    role: "师属远程火力：极慢、怕近战；需提前展开才能覆盖战线",
  },
  tank: {
    id: "tank",
    name: "坦克",
    move: 8,
    minRange: 1,
    maxRange: 2,
    attack: 34,
    maxHp: 140,
    vehicle: true,
    canCapture: false,
    indirect: false,
    setupBonus: 0,
    role: "突破核心，机动与火力最强，但受地形限制且怕反坦克武器",
  },
  logistics: {
    id: "logistics",
    name: "后勤",
    move: 5,
    minRange: 1,
    maxRange: 0,
    attack: 0,
    // 后勤队本身就是可调拨的人力池，容量略高于普通步兵。
    maxHp: 115,
    vehicle: false,
    canCapture: false,
    indirect: false,
    setupBonus: 0,
    role: "邻接友军补充兵员：回复生命并降低疲劳；无进攻能力",
  },
};

/** 后勤补充：人员守恒调拨 + 疲劳/弹药服务。 */
export const LOGISTICS = {
  /** 一次战场补充最多调拨的人数。 */
  personnelPerAction: 28,
  /** 后勤队必须保留的最低机动编制，不能捐到空队。 */
  minimumPersonnel: 55,
  fatigueRelief: 18,
  /** 邻接补给后，目标无视 supplyWindow 惩罚的持续回合数 */
  ammoRestoreTurns: 3,
};

/** 克制系数：MATCHUP[攻方][守方] */
export const MATCHUP: Record<UnitTypeId, Record<UnitTypeId, number>> = {
  rifle: { rifle: 1.0, mg: 1.1, mortar: 1.25, artillery: 1.3, tank: 0.45, logistics: 1.2 },
  mg: { rifle: 1.3, mg: 1.0, mortar: 1.2, artillery: 1.25, tank: 0.3, logistics: 1.25 },
  mortar: { rifle: 1.1, mg: 1.25, mortar: 1.0, artillery: 1.05, tank: 0.6, logistics: 1.15 },
  artillery: { rifle: 1.2, mg: 1.25, mortar: 1.15, artillery: 1.0, tank: 0.55, logistics: 1.2 },
  tank: { rifle: 1.4, mg: 1.45, mortar: 1.5, artillery: 1.55, tank: 1.0, logistics: 1.35 },
  logistics: { rifle: 0, mg: 0, mortar: 0, artillery: 0, tank: 0, logistics: 0 },
};

export { levelFromExp, PROGRESS };
