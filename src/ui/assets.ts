import type {
  Faction,
  ItemId,
  TerrainId,
  Unit,
  UnitPortraitGroup,
  UnitTypeId,
  WeaponId,
  Weather,
} from "../core/types";

/** Cache-bust when swapping generated art without renaming. */
const V = "?v=7";

/** Static art under /assets (served from public/). */

export const TERRAIN_ICON: Record<TerrainId, string> = {
  road: `/assets/terrain/road.png${V}`,
  plain: `/assets/terrain/plain.png${V}`,
  forest: `/assets/terrain/forest.png${V}`,
  hill: `/assets/terrain/hill.png${V}`,
  village: `/assets/terrain/village.png${V}`,
  fort: `/assets/terrain/fort.png${V}`,
  river: `/assets/terrain/river.png${V}`,
  cliff: `/assets/terrain/cliff.png${V}`,
};

/** 雪天换整套贴图，而不是给整张地图糊一层白 */
export const TERRAIN_ICON_SNOW: Record<TerrainId, string> = {
  road: `/assets/terrain/road-snow.png${V}`,
  plain: `/assets/terrain/plain-snow.png${V}`,
  forest: `/assets/terrain/forest-snow.png${V}`,
  hill: `/assets/terrain/hill-snow.png${V}`,
  village: `/assets/terrain/village-snow.png${V}`,
  fort: `/assets/terrain/fort-snow.png${V}`,
  river: `/assets/terrain/river-snow.png${V}`,
  cliff: `/assets/terrain/cliff-snow.png${V}`,
};

export function terrainIcon(terrain: TerrainId, weather: Weather): string {
  return weather === "snow" ? TERRAIN_ICON_SNOW[terrain] : TERRAIN_ICON[terrain];
}

export const UNIT_ICON: Record<UnitTypeId, Record<Faction, string>> = {
  rifle: {
    player: `/assets/units/rifle-player-v3.png${V}`,
    enemy: `/assets/units/rifle-enemy-v3.png${V}`,
  },
  mg: {
    player: `/assets/units/mg-player-v3.png${V}`,
    enemy: `/assets/units/mg-enemy-v3.png${V}`,
  },
  mortar: {
    player: `/assets/units/mortar-player-v3.png${V}`,
    enemy: `/assets/units/mortar-enemy-v3.png${V}`,
  },
  artillery: {
    player: `/assets/units/mortar-player-v3.png${V}`,
    enemy: `/assets/units/mortar-enemy-v3.png${V}`,
  },
  tank: {
    player: `/assets/units/tank-player-v3.png${V}`,
    enemy: `/assets/units/tank-enemy-v3.png${V}`,
  },
  logistics: {
    player: `/assets/units/rifle-player-v3.png${V}`,
    enemy: `/assets/units/rifle-enemy-v3.png${V}`,
  },
};

/** 地图单位使用人物肖像为主体，兵种由独立小角标辨识。 */
export const UNIT_ROLE_ICON: Record<UnitTypeId, string> = {
  rifle: `/assets/roles/rifle.svg${V}`,
  mg: `/assets/roles/mg.svg${V}`,
  mortar: `/assets/roles/mortar.svg${V}`,
  artillery: `/assets/roles/artillery.svg${V}`,
  tank: `/assets/roles/tank.svg${V}`,
  logistics: `/assets/roles/logistics.svg${V}`,
};

export const WEAPON_ICON: Record<WeaponId, string> = {
  type38: `/assets/weapons/type38.svg${V}`,
  zhongzheng: `/assets/weapons/zhongzheng.svg${V}`,
  mosin: `/assets/weapons/mosin.svg${V}`,
  ppsh50: `/assets/weapons/ppsh50.svg${V}`,
  zb26: `/assets/weapons/zb26.svg${V}`,
  dp28: `/assets/weapons/dp28.svg${V}`,
  mortar60: `/assets/weapons/mortar60.svg${V}`,
  mortar82: `/assets/weapons/mortar82.svg${V}`,
  type75: `/assets/weapons/mortar82.svg${V}`,
  m2a1_howitzer: `/assets/weapons/m1_mortar.svg${V}`,
  bazooka: `/assets/weapons/bazooka.svg${V}`,
  t34_85: `/assets/weapons/t34_85.svg${V}`,
  m1_garand: `/assets/weapons/m1_garand.svg${V}`,
  m1_carbine: `/assets/weapons/m1_carbine.svg${V}`,
  m1919: `/assets/weapons/m1919.svg${V}`,
  m2_mortar: `/assets/weapons/mortar60.svg${V}`,
  m1_mortar: `/assets/weapons/m1_mortar.svg${V}`,
  sherman: `/assets/weapons/sherman.svg${V}`,
  // 复用现有同类剪影；机械型号与历史名称已经独立，不再套用错误数值。
  lee_enfield: `/assets/weapons/mosin.svg${V}`,
  bren: `/assets/weapons/zb26.svg${V}`,
  mac24: `/assets/weapons/zb26.svg${V}`,
  centurion: `/assets/weapons/sherman.svg${V}`,
  supply_cart: `/assets/weapons/type38.svg${V}`,
};

export const RANK_INSIGNIA: Record<string, string> = {
  "rok-brigadier-general": `/assets/ranks/rok-brigadier-general.svg${V}`,
  "rok-major-general": `/assets/ranks/rok-major-general.svg${V}`,
  "us-major-general": `/assets/ranks/us-major-general.svg${V}`,
  "us-lieutenant-general": `/assets/ranks/us-lieutenant-general.svg${V}`,
  "us-colonel": `/assets/ranks/us-colonel.svg${V}`,
  "uk-lieutenant-colonel": `/assets/ranks/uk-lieutenant-colonel.svg${V}`,
  "fr-lieutenant-colonel": `/assets/ranks/fr-lieutenant-colonel.svg${V}`,
};

export function rankInsignia(id: string): string {
  return RANK_INSIGNIA[id] ?? "";
}

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
  "wen-yucheng": `/assets/commanders/wen-yucheng.png${V}`,
  "paik-sun-yup": `/assets/commanders/paik-sun-yup.png${V}`,
  "kim-jong-oh": `/assets/commanders/kim-jong-oh.png${V}`,
  "hobart-gay": `/assets/commanders/hobart-gay.png${V}`,
  "liang-xingchu": `/assets/commanders/liang-xingchu.png${V}`,
  "walton-walker": `/assets/commanders/walton-walker.png${V}`,
  "edward-almond": `/assets/commanders/edward-almond.png${V}`,
  "paul-freeman": `/assets/commanders/paul-freeman.png${V}`,
  "ralph-monclar": `/assets/commanders/ralph-monclar.png${V}`,
  "fu-chongbi": `/assets/commanders/fu-chongbi.png${V}`,
  "james-carne": `/assets/commanders/james-carne.png${V}`,
  "james-van-fleet": `/assets/commanders/james-van-fleet.png${V}`,
  "wayne-smith": `/assets/commanders/wayne-smith.png${V}`,
  "zhong-guochu": `/assets/commanders/zhong-guochu.png${V}`,
  "arthur-trudeau": `/assets/commanders/arthur-trudeau.png${V}`,
  "yang-yong": `/assets/commanders/yang-yong.png${V}`,
  "maxwell-taylor": `/assets/commanders/maxwell-taylor.png${V}`,
};

const identityPool = (group: UnitPortraitGroup): string[] =>
  Array.from(
    { length: 8 },
    (_, index) => `/assets/unit-identities/${group}-${String(index + 1).padStart(2, "0")}.png${V}`,
  );

/** 单关最多 8 名同一历史阵营普通单位；每个槽都是不同人物。 */
export const UNIT_IDENTITY_PORTRAIT: Record<UnitPortraitGroup, string[]> = {
  pva: identityPool("pva"),
  rok: identityPool("rok"),
  us: identityPool("us"),
  uk: identityPool("uk"),
  fr: identityPool("fr"),
};

export function unitIdentityPortrait(group: UnitPortraitGroup, index: number): string {
  const pool = UNIT_IDENTITY_PORTRAIT[group];
  return pool[((index % pool.length) + pool.length) % pool.length]!;
}

function fallbackPortraitIndex(unit: Pick<Unit, "id" | "commanderName">): number {
  let hash = 2166136261;
  for (const char of `${unit.id}:${unit.commanderName}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 地图、格子检查与详情卡必须调用同一个函数，保证人物身份不会漂移。 */
export function unitPortrait(
  unit: Pick<
    Unit,
    "id" | "faction" | "commanderName" | "keyUnit" | "portraitGroup" | "portraitIndex"
  >,
): string {
  if (unit.keyUnit || unit.commanderName === "高大全") {
    return COMMANDER_PORTRAIT["gao-daquan"]!;
  }
  const group = unit.portraitGroup ?? (unit.faction === "player" ? "pva" : "us");
  return unitIdentityPortrait(group, unit.portraitIndex ?? fallbackPortraitIndex(unit));
}

/** Every asset URL used by the game (for preload). */
export function allAssetUrls(): string[] {
  return [
    ...Object.values(TERRAIN_ICON),
    ...Object.values(TERRAIN_ICON_SNOW),
    ...Object.values(UNIT_ICON).flatMap((pair) => Object.values(pair)),
    ...Object.values(UNIT_ROLE_ICON),
    ...Object.values(WEAPON_ICON),
    ...Object.values(RANK_INSIGNIA),
    ...Object.values(ITEM_ICON),
    ...Object.values(UI_ICON),
    ...Object.values(COMMANDER_PORTRAIT),
    ...Object.values(UNIT_IDENTITY_PORTRAIT).flat(),
  ];
}
