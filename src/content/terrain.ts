import type { TerrainDef, TerrainId } from "../core/types";

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  road: {
    id: "road",
    name: "道路",
    moveCost: 1,
    defense: -0.1,
    vehiclePassable: true,
    regen: 0,
    rangeBonus: 0,
    attackBonus: 0,
  },
  plain: {
    id: "plain",
    name: "平原",
    moveCost: 2,
    defense: 0,
    vehiclePassable: true,
    regen: 0,
    rangeBonus: 0,
    attackBonus: 0,
  },
  forest: {
    id: "forest",
    name: "森林",
    moveCost: 3,
    defense: 0.25,
    vehiclePassable: false,
    regen: 0,
    rangeBonus: 0,
    attackBonus: 0,
  },
  hill: {
    id: "hill",
    name: "高地",
    moveCost: 4,
    defense: 0.35,
    vehiclePassable: true,
    regen: 0,
    rangeBonus: 1,
    attackBonus: 0.1,
  },
  village: {
    id: "village",
    name: "村庄",
    moveCost: 2,
    defense: 0.2,
    vehiclePassable: true,
    regen: 8,
    rangeBonus: 0,
    attackBonus: 0,
  },
  river: {
    id: "river",
    name: "河流",
    moveCost: 6,
    defense: -0.2,
    vehiclePassable: false,
    regen: 0,
    rangeBonus: 0,
    attackBonus: 0,
  },
};

export const TERRAIN_CHARS: Record<string, TerrainId> = {
  "=": "road",
  ".": "plain",
  F: "forest",
  "^": "hill",
  V: "village",
  "~": "river",
};

export const WEATHER_EFFECT = {
  rain: {
    /** 射程大于 1 的攻击伤害修正 */
    rangedDamage: -0.15,
    movePenalty: 1,
  },
};
