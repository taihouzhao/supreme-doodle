import type { Faction, ItemId, TerrainId, UnitTypeId } from "../core/types";

/** Static art under /assets (served from public/). */

export const TERRAIN_ICON: Record<TerrainId, string> = {
  road: "/assets/terrain/road.png",
  plain: "/assets/terrain/plain.png",
  forest: "/assets/terrain/forest.png",
  hill: "/assets/terrain/hill.png",
  village: "/assets/terrain/village.png",
  river: "/assets/terrain/river.png",
};

export const UNIT_ICON: Record<UnitTypeId, Record<Faction, string>> = {
  rifle: {
    player: "/assets/units/rifle-player.png",
    enemy: "/assets/units/rifle-enemy.png",
  },
  mg: {
    player: "/assets/units/mg-player.png",
    enemy: "/assets/units/mg-enemy.png",
  },
  mortar: {
    player: "/assets/units/mortar-player.png",
    enemy: "/assets/units/mortar-enemy.png",
  },
  tank: {
    player: "/assets/units/tank-player.png",
    enemy: "/assets/units/tank-enemy.png",
  },
};

export const ITEM_ICON: Record<ItemId, string> = {
  medkit: "/assets/items/medkit.png",
  at_charge: "/assets/items/at-charge.png",
  arty_support: "/assets/items/arty-support.png",
};

export const UI_ICON = {
  weatherClear: "/assets/ui/weather-clear.png",
  weatherRain: "/assets/ui/weather-rain.png",
  objPending: "/assets/ui/obj-pending.png",
  objDone: "/assets/ui/obj-done.png",
  evac: "/assets/ui/evac.png",
  fieldItem: "/assets/ui/field-item.png",
  keyUnit: "/assets/ui/key-unit.png",
  actEndTurn: "/assets/ui/act-end-turn.png",
  actCapture: "/assets/ui/act-capture.png",
  factionPva: "/assets/ui/faction-pva.png",
  factionUn: "/assets/ui/faction-un.png",
  resultWin: "/assets/ui/result-win.png",
  resultLose: "/assets/ui/result-lose.png",
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
