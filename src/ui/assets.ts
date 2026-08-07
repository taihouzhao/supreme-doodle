import type { Faction, ItemId, TerrainId, UnitTypeId } from "../core/types";

/** Cache-bust when swapping generated art without renaming. */
const V = "?v=3";

/** Static art under /assets (served from public/). */

export const TERRAIN_ICON: Record<TerrainId, string> = {
  road: `/assets/terrain/road.png${V}`,
  plain: `/assets/terrain/plain.png${V}`,
  forest: `/assets/terrain/forest.png${V}`,
  hill: `/assets/terrain/hill.png${V}`,
  village: `/assets/terrain/village.png${V}`,
  river: `/assets/terrain/river.png${V}`,
};

export const UNIT_ICON: Record<UnitTypeId, Record<Faction, string>> = {
  rifle: {
    player: `/assets/units/rifle-player.png${V}`,
    enemy: `/assets/units/rifle-enemy.png${V}`,
  },
  mg: {
    player: `/assets/units/mg-player.png${V}`,
    enemy: `/assets/units/mg-enemy.png${V}`,
  },
  mortar: {
    player: `/assets/units/mortar-player.png${V}`,
    enemy: `/assets/units/mortar-enemy.png${V}`,
  },
  tank: {
    player: `/assets/units/tank-player.png${V}`,
    enemy: `/assets/units/tank-enemy.png${V}`,
  },
};

export const ITEM_ICON: Record<ItemId, string> = {
  medkit: `/assets/items/medkit.png${V}`,
  at_charge: `/assets/items/at-charge.png${V}`,
  arty_support: `/assets/items/arty-support.png${V}`,
};

export const UI_ICON = {
  weatherClear: `/assets/ui/weather-clear.png${V}`,
  weatherRain: `/assets/ui/weather-rain.png${V}`,
  objPending: `/assets/ui/obj-pending.png${V}`,
  objDone: `/assets/ui/obj-done.png${V}`,
  evac: `/assets/ui/evac.png${V}`,
  fieldItem: `/assets/ui/field-item.png${V}`,
  keyUnit: `/assets/ui/key-unit.png${V}`,
  actEndTurn: `/assets/ui/act-end-turn.png${V}`,
  actCapture: `/assets/ui/act-capture.png${V}`,
  factionPva: `/assets/ui/faction-pva.png${V}`,
  factionUn: `/assets/ui/faction-un.png${V}`,
  resultWin: `/assets/ui/result-win.png${V}`,
  resultLose: `/assets/ui/result-lose.png${V}`,
} as const;

/** Every asset URL used by the game (for preload). */
export function allAssetUrls(): string[] {
  return [
    ...Object.values(TERRAIN_ICON),
    ...Object.values(UNIT_ICON).flatMap((pair) => Object.values(pair)),
    ...Object.values(ITEM_ICON),
    ...Object.values(UI_ICON),
  ];
}
