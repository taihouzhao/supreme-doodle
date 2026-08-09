import type { ItemDef, ItemId } from "../core/types";

/**
 * 消耗品：使用后从库存扣除。
 * 部分道具额外提供「战役被动」式的小加成（见 ITEM_PASSIVES），
 * 在库存中持有时即可生效，体现「物资也能加点」。
 */
export const ITEMS: Record<ItemId, ItemDef> = {
  medkit: {
    id: "medkit",
    name: "医疗包",
    targeting: "self",
    description: "回复 40 点生命；持有时全军耐力略增",
    heal: 40,
    damage: 0,
    antiArmorOnly: false,
    range: 0,
    splash: false,
    historicalContext: "前线救护与后送能力长期受运输线和敌军火力限制，医疗物资首先意味着把伤员带回编制。",
    tacticalUse: "留给高价值或即将继续接敌的单位，避免把恢复浪费在安全位置。",
  },
  bandage: {
    id: "bandage",
    name: "绷带",
    targeting: "self",
    description: "回复 22 生命",
    heal: 22,
    damage: 0,
    antiArmorOnly: false,
    range: 0,
    splash: false,
    historicalContext: "单兵急救只能止住眼前伤势，不能替代后勤分队的人员补充与后送。",
    tacticalUse: "用于小幅稳住战线，把后勤调拨留给严重缺编单位。",
  },
  ration: {
    id: "ration",
    name: "炒面袋",
    targeting: "self",
    description: "恢复体力，降低 35 疲劳；志愿军早期常用携行干粮",
    heal: 0,
    damage: 0,
    antiArmorOnly: false,
    range: 0,
    splash: false,
    fatigueRelief: 35,
    historicalContext: "补给受阻时，炒面成为志愿军可直接携行、无需生火的基础口粮。",
    tacticalUse: "让急行军后的部队恢复持续作战能力，但不能补回缺失兵员。",
  },
  at_charge: {
    id: "at_charge",
    name: "反坦克武器",
    targeting: "target",
    description: "对相邻装甲目标造成 55 固定伤害",
    heal: 0,
    damage: 55,
    antiArmorOnly: true,
    range: 1,
    splash: false,
    historicalContext: "面对装甲优势，步兵往往依靠近距离反坦克器材和地形接敌，而不是远距离硬拼。",
    tacticalUse: "利用森林、村庄或高地接近装甲单位后再使用。",
  },
  satchel: {
    id: "satchel",
    name: "爆破筒",
    targeting: "tile",
    description: "对指定格造成 38 伤害（无溅射），擅长清掩体点",
    heal: 0,
    damage: 38,
    antiArmorOnly: false,
    range: 3,
    splash: false,
    historicalContext: "爆破器材用于处理工事、路障与近距离火力点，效果依赖隐蔽接近。",
    tacticalUse: "优先清除高防御据点，给后续步兵打开通路。",
  },
  arty_support: {
    id: "arty_support",
    name: "炮火支援",
    targeting: "tile",
    description: "对指定格及正交邻格造成 30 伤害，无视地形防御",
    heal: 0,
    damage: 30,
    antiArmorOnly: false,
    range: 6,
    splash: true,
    historicalContext: "炮火支援的价值不只在杀伤，更在于打乱阵地协同并为突破制造窗口。",
    tacticalUse: "等待两个以上敌军形成密集阵形，再打击中心格。",
  },
  field_manual: {
    id: "field_manual",
    name: "阵中手册",
    targeting: "self",
    description: "使用后获得 40 经验；持有时略增统率",
    heal: 0,
    damage: 0,
    antiArmorOnly: false,
    range: 0,
    splash: false,
    expGain: 40,
    historicalContext: "战斗经验来自对地形、火力与部队协同的复盘，而非职务或军衔变化。",
    tacticalUse: "用于即将升级、且需要承担关键战术角色的伴随将领。",
  },
};

/** 库存中每持有 1 件时，对出战将领提供的被动属性（上限见下）。 */
export const ITEM_PASSIVES: Partial<
  Record<ItemId, { leadership?: number; intellect?: number; stamina?: number; cap: number }>
> = {
  medkit: { stamina: 1, cap: 3 },
  field_manual: { leadership: 1, intellect: 1, cap: 2 },
  ration: { stamina: 1, cap: 2 },
};

export const ITEM_IDS: ItemId[] = [
  "medkit",
  "bandage",
  "ration",
  "at_charge",
  "satchel",
  "arty_support",
  "field_manual",
];
