import type { UnitTypeDef, UnitTypeId } from "../core/types";

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
    maxRange: 4,
    attack: 24,
    maxHp: 70,
    vehicle: false,
    canCapture: false,
    indirect: true,
    setupBonus: 0,
    role: "曲射无视一半地形防御且不受反击，但贴身无法开火",
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
};

/** 克制系数：MATCHUP[攻方][守方] */
export const MATCHUP: Record<UnitTypeId, Record<UnitTypeId, number>> = {
  rifle: { rifle: 1.0, mg: 1.1, mortar: 1.25, tank: 0.45 },
  mg: { rifle: 1.3, mg: 1.0, mortar: 1.2, tank: 0.3 },
  mortar: { rifle: 1.1, mg: 1.25, mortar: 1.0, tank: 0.6 },
  tank: { rifle: 1.4, mg: 1.45, mortar: 1.5, tank: 1.0 },
};

export const VETERANCY = {
  /** 经验阈值：新兵 / 老兵 / 精锐 */
  thresholds: [0, 150, 400] as const,
  names: ["新兵", "老兵", "精锐"] as const,
  attackPerLevel: 0.08,
  defensePerLevel: 0.06,
  maxHpPerLevel: 10,
  expPerDamage: 0.35,
  expPerRout: 25,
};

export function veterancyLevel(exp: number): number {
  const [, vet, elite] = VETERANCY.thresholds;
  if (exp >= elite) return 2;
  if (exp >= vet) return 1;
  return 0;
}

export function veterancyName(exp: number): string {
  return VETERANCY.names[veterancyLevel(exp)] as string;
}
