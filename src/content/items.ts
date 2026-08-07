import type { ItemDef, ItemId } from "../core/types";

export const ITEMS: Record<ItemId, ItemDef> = {
  medkit: {
    id: "medkit",
    name: "医疗包",
    targeting: "self",
    description: "回复 40 生命",
    heal: 40,
    damage: 0,
    antiArmorOnly: false,
    range: 0,
    splash: false,
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
};

export const ITEM_IDS: ItemId[] = ["medkit", "at_charge", "arty_support"];
