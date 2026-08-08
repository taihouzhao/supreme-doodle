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
  },
  ration: {
    id: "ration",
    name: "干粮",
    targeting: "self",
    description: "恢复体力，降低 35 疲劳",
    heal: 0,
    damage: 0,
    antiArmorOnly: false,
    range: 0,
    splash: false,
    fatigueRelief: 35,
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
