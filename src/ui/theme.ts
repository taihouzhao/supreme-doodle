import type { TerrainId, UnitTypeId } from "../core/types";

export const TERRAIN_STYLE: Record<TerrainId, { fill: string; edge: string }> = {
  road: { fill: "#d8cdb6", edge: "#b9a98a" },
  plain: { fill: "#cfd8b9", edge: "#aeb897" },
  forest: { fill: "#8fae87", edge: "#6f8f68" },
  hill: { fill: "#c2a97f", edge: "#9d855c" },
  village: { fill: "#dcbf9a", edge: "#b9966e" },
  fort: { fill: "#c9a88a", edge: "#8a6a4e" },
  river: { fill: "#8fb4c9", edge: "#6a93aa" },
  cliff: { fill: "#7a7468", edge: "#4e4940" },
};

export const FACTION_STYLE = {
  player: { body: "#2f6f5e", ring: "#12312a", text: "#f4f7f2" },
  enemy: { body: "#a8443a", ring: "#4a1712", text: "#fdf3f1" },
};

/** 兵种剪影标识（Canvas 几何绘制，不再用汉字） */
export const UNIT_GLYPH: Record<UnitTypeId, string> = {
  rifle: "步枪",
  mg: "机枪",
  mortar: "迫击炮",
  tank: "坦克",
};

export const HIGHLIGHT = {
  move: "rgba(58, 122, 196, 0.34)",
  moveEdge: "rgba(28, 74, 128, 0.75)",
  /** 攻击半径只用斜线阴影，不铺底色，避免和蓝色移动格糊成一片 */
  attackHatch: "rgba(226, 74, 58, 0.85)",
  attackEdge: "rgba(150, 30, 20, 0.95)",
  item: "rgba(214, 158, 46, 0.32)",
  itemHatch: "rgba(224, 176, 62, 0.9)",
  selected: "#f5d76e",
  objectivePlayer: "#2f6f5e",
  objectiveEnemy: "#a8443a",
  objectiveNeutral: "#6b6355",
  evac: "rgba(47, 111, 94, 0.3)",
  trail: "rgba(58, 122, 196, 0.45)",
  inspect: "rgba(245, 215, 110, 0.35)",
  objectiveFocus: "rgba(245, 215, 110, 0.42)",
};
