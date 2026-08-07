import type { TerrainId, UnitTypeId } from "../core/types";

export const TERRAIN_STYLE: Record<TerrainId, { fill: string; edge: string; glyph: string }> = {
  road: { fill: "#d8cdb6", edge: "#c3b79c", glyph: "" },
  plain: { fill: "#cfd8b9", edge: "#bfc9a6", glyph: "" },
  forest: { fill: "#8fae87", edge: "#7d9c76", glyph: "森" },
  hill: { fill: "#c2a97f", edge: "#ab9268", glyph: "高" },
  village: { fill: "#dcbf9a", edge: "#c7a67c", glyph: "村" },
  river: { fill: "#8fb4c9", edge: "#7aa1b8", glyph: "" },
};

export const FACTION_STYLE = {
  player: { body: "#2f6f5e", ring: "#12312a", text: "#f4f7f2" },
  enemy: { body: "#a8443a", ring: "#4a1712", text: "#fdf3f1" },
};

export const UNIT_GLYPH: Record<UnitTypeId, string> = {
  rifle: "步",
  mg: "枪",
  mortar: "炮",
  tank: "甲",
};

export const HIGHLIGHT = {
  move: "rgba(58, 122, 196, 0.38)",
  moveEdge: "rgba(28, 74, 128, 0.75)",
  attack: "rgba(200, 62, 48, 0.34)",
  attackEdge: "rgba(140, 32, 22, 0.85)",
  item: "rgba(214, 158, 46, 0.38)",
  selected: "#f5d76e",
  objectivePlayer: "#2f6f5e",
  objectiveEnemy: "#a8443a",
  objectiveNeutral: "#6b6355",
  evac: "rgba(47, 111, 94, 0.3)",
};
