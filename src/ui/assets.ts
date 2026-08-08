import type { Faction, ItemId, TerrainId, UnitTypeId } from "../core/types";

/** Cache-bust when swapping generated art without renaming. */
const V = "?v=4";

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
    player: `/assets/units/rifle-player-v2.png${V}`,
    enemy: `/assets/units/rifle-enemy-v2.png${V}`,
  },
  mg: {
    player: `/assets/units/mg-player-v2.png${V}`,
    enemy: `/assets/units/mg-enemy-v2.png${V}`,
  },
  mortar: {
    player: `/assets/units/mortar-player-v2.png${V}`,
    enemy: `/assets/units/mortar-enemy-v2.png${V}`,
  },
  tank: {
    player: `/assets/units/tank-player-v2.png${V}`,
    enemy: `/assets/units/tank-enemy-v2.png${V}`,
  },
};

export const ITEM_ICON: Record<ItemId, string> = {
  medkit: `/assets/items/medkit.png${V}`,
  bandage: `/assets/items/medkit.png${V}`,
  ration: `/assets/items/medkit.png${V}`,
  at_charge: `/assets/items/at-charge.png${V}`,
  satchel: `/assets/items/at-charge.png${V}`,
  arty_support: `/assets/items/arty-support.png${V}`,
  field_manual: `/assets/items/arty-support.png${V}`,
};

export const UI_ICON = {
  weatherClear: `/assets/ui/weather-clear.png${V}`,
  weatherRain: `/assets/ui/weather-rain.png${V}`,
  weatherSnow: `/assets/ui/weather-snow.svg${V}`,
  weatherFog: `/assets/ui/weather-fog.svg${V}`,
  weatherOvercast: `/assets/ui/weather-overcast.svg${V}`,
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

export const COMMANDER_PORTRAIT: Record<string, string> = {
  "gao-daquan": `/assets/commanders/gao-daquan.png${V}`,
  "peng-dehuai": `/assets/commanders/peng-dehuai.png${V}`,
  "wu-xinquan": `/assets/commanders/wu-xinquan.png${V}`,
  "song-shilun": `/assets/commanders/song-shilun.png${V}`,
  "qin-jiwei": `/assets/commanders/qin-jiwei.png${V}`,
  "matthew-ridgway": `/assets/commanders/matthew-ridgway.png${V}`,
  "oliver-smith": `/assets/commanders/oliver-smith.png${V}`,
};

/** Every asset URL used by the game (for preload). */
export function allAssetUrls(): string[] {
  return [
    ...Object.values(TERRAIN_ICON),
    ...Object.values(UNIT_ICON).flatMap((pair) => Object.values(pair)),
    ...Object.values(ITEM_ICON),
    ...Object.values(UI_ICON),
    ...Object.values(COMMANDER_PORTRAIT),
  ];
}
