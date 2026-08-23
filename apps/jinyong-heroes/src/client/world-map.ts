import { visibleBuildings } from "../content/maps";
import type { ContentPack, WorldState } from "../core/types";

/** Public walkthrough coord space: origin north-west, Y increases south. */
export const WORLD_MAP_SIZE = 480;

/** Visible houses only. The unmarked cave is omitted even after rumors. */
export function overworldSpriteIds(content: ContentPack): string[] {
  return visibleBuildings(content.overworld.buildings).map((building) => building.locationId);
}

export function compassReadout(state: WorldState, content: ContentPack): string {
  const here = content.locations.find((location) => location.id === state.locationId);
  if (!here) return "";
  if ((state.inventory.compass ?? 0) < 1) {
    return "还没有罗盘。隐洞不会因为听说而在地上标出来。";
  }
  return `罗盘 人（${state.overworldX}，${state.overworldY}）`;
}
