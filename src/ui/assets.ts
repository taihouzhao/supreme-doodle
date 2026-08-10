import { WEAPON_IDS } from "../content/weapons";
import type {
  Faction,
  AttachmentId,
  ItemId,
  TerrainId,
  Unit,
  UnitPortraitGroup,
  UnitTypeId,
  WeaponId,
  Weather,
} from "../core/types";

/** Cache-bust when swapping generated art without renaming. */
const V = "?v=9";

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

/** 道路跨越河流时使用的正交桥面；横向桥由画布旋转得到。 */
export const BRIDGE_ICON: Record<"clear" | "snow", string> = {
  clear: `/assets/terrain/bridge.png${V}`,
  snow: `/assets/terrain/bridge-snow.png${V}`,
};

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
  armored_car: {
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
  armored_car: `/assets/roles/armored_car.svg${V}`,
  logistics: `/assets/roles/logistics.svg${V}`,
};

export const WEAPON_ICON: Record<WeaponId, string> = Object.fromEntries(
  WEAPON_IDS.map((id) => [id, `/assets/weapons/${id}.svg${V}`]),
) as Record<WeaponId, string>;

export function weaponIcon(id: WeaponId): string {
  return WEAPON_ICON[id] ?? `/assets/weapons/${id}.svg${V}`;
}

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

const ITEM_ICON_FILES: Partial<Record<ItemId, string>> = {
  medkit: `/assets/items/medkit.png${V}`,
  bandage: `/assets/items/bandage-v2.png${V}`,
  ration: `/assets/items/ration-v2.png${V}`,
  compressed_ration: `/assets/items/compressed-ration-v3.png${V}`,
  water_purification: `/assets/items/water-purification-v3.png${V}`,
  grenade_bundle: `/assets/items/grenade-bundle-v3.png${V}`,
  smoke_grenade: `/assets/items/smoke-grenade-v3.png${V}`,
  ammo_crate: `/assets/items/ammo-crate-v3.png${V}`,
  signal_flare: `/assets/items/signal-flare-v3.png${V}`,
  at_charge: `/assets/items/at-charge.png${V}`,
  satchel: `/assets/items/satchel-v2.png${V}`,
  arty_support: `/assets/items/arty-support.png${V}`,
  field_manual: `/assets/items/field-manual-v2.png${V}`,
};

const ITEM_ICON_FALLBACK: Record<ItemId, string> = {
  medkit: "medkit",
  bandage: "bandage",
  ration: "ration",
  at_charge: "at_charge",
  satchel: "satchel",
  arty_support: "arty_support",
  field_manual: "field_manual",
  plasma_unit: "medkit",
  surgeon_kit: "medkit",
  compressed_ration: "ration",
  bangalore: "satchel",
  shaped_charge_elite: "at_charge",
  smoke_screen: "arty_support",
  corps_arty: "arty_support",
  night_attack_notes: "field_manual",
  hero_citation: "field_manual",
  flare: "arty_support",
};

export const ITEM_ICON: Record<ItemId, string> = new Proxy({} as Record<ItemId, string>, {
  get(_target, prop: string) {
    const id = prop as ItemId;
    if (ITEM_ICON_FILES[id]) return ITEM_ICON_FILES[id]!;
    const fb = ITEM_ICON_FALLBACK[id] ?? "medkit";
    return ITEM_ICON_FILES[fb as ItemId] ?? `/assets/items/${id}.svg${V}`;
  },
});

export function itemIcon(id: ItemId): string {
  return ITEM_ICON[id];
}

export function classDecorationIcon(decoration: string): string {
  return `/assets/ui/class/${decoration}.svg${V}`;
}

/** 附件图标与物品分离；型号相近的器材可复用，但通信/防寒使用独立 v3 资产。 */
export const ATTACHMENT_ICON: Record<AttachmentId, string> = {
  engineer_tools: `/assets/items/satchel-v2.png${V}`,
  pack_train: `/assets/items/ration-v2.png${V}`,
  field_telephone: `/assets/items/field-telephone-v3.png${V}`,
  ammo_carrier: `/assets/items/ammo-crate-v3.png${V}`,
  camouflage_net: `/assets/items/smoke-grenade-v3.png${V}`,
  winter_kit: `/assets/items/winter-mittens-v3.png${V}`,
  medic_team: `/assets/items/medkit.png${V}`,
  motor_transport: `/assets/items/ammo-crate-v3.png${V}`,
  artillery_tractor: `/assets/items/ammo-crate-v3.png${V}`,
  scr300_radio: `/assets/items/field-telephone-v3.png${V}`,
  rangefinder: `/assets/items/signal-flare-v3.png${V}`,
  t52_vest: `/assets/items/winter-mittens-v3.png${V}`,
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
  eliteWreath: `/assets/ui/elite-wreath.png${V}`,
  keyUnit: `/assets/ui/key-unit.png${V}`,
  actEndTurn: `/assets/ui/act-end-turn.png${V}`,
  actCapture: `/assets/ui/act-capture.png${V}`,
  factionPva: `/assets/ui/faction-pva.png${V}`,
  factionUn: `/assets/ui/faction-un.png${V}`,
  resultWin: `/assets/ui/result-win.png${V}`,
  resultLose: `/assets/ui/result-lose.png${V}`,
} as const;

export const COMMANDER_PORTRAIT: Record<string, string> = {
  "gao-daquan": `/assets/commanders/gao-daquan-v2.png${V}`,
  "peng-dehuai": `/assets/commanders/peng-dehuai-v2.png${V}`,
  "wu-xinquan": `/assets/commanders/wu-xinquan.png${V}`,
  "song-shilun": `/assets/commanders/song-shilun.png${V}`,
  "qin-jiwei": `/assets/commanders/qin-jiwei.png${V}`,
  "matthew-ridgway": `/assets/commanders/matthew-ridgway-v2.png${V}`,
  "oliver-smith": `/assets/commanders/oliver-smith.png${V}`,
  "wen-yucheng": `/assets/commanders/wen-yucheng.png${V}`,
  "paik-sun-yup": `/assets/commanders/paik-sun-yup.png${V}`,
  "kim-jong-oh": `/assets/commanders/kim-jong-oh-v2.png${V}`,
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
  "hong-xuezhi": `/assets/commanders/hong-xuezhi-v3.png${V}`,
  "cui-jianggong": `/assets/commanders/cui-jianggong-v3.png${V}`,
  "yang-gensi": `/assets/commanders/yang-gensi-v3.png${V}`,
  "huang-jiguang": `/assets/commanders/huang-jiguang-v3.png${V}`,
};

const identityPool = (group: UnitPortraitGroup): string[] =>
  Array.from(
    { length: 8 },
    (_, index) => {
      const migrated = group === "pva" || group === "rok" ? "-v2" : "";
      return `/assets/unit-identities/${group}-${String(index + 1).padStart(2, "0")}${migrated}.png${V}`;
    },
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
    "id" | "faction" | "commanderName" | "keyUnit" | "portraitGroup" | "portraitIndex" | "portraitId"
  >,
): string {
  if (unit.portraitId && COMMANDER_PORTRAIT[unit.portraitId]) {
    return COMMANDER_PORTRAIT[unit.portraitId]!;
  }
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
    ...Object.values(BRIDGE_ICON),
    ...Object.values(UNIT_ICON).flatMap((pair) => Object.values(pair)),
    ...Object.values(UNIT_ROLE_ICON),
    ...Object.values(RANK_INSIGNIA),
    ...Object.values(ITEM_ICON),
    ...Object.values(ATTACHMENT_ICON),
    ...Object.values(UI_ICON),
    ...Object.values(COMMANDER_PORTRAIT),
    ...Object.values(UNIT_IDENTITY_PORTRAIT).flat(),
  ];
}
