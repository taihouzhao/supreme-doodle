import { BASE_STATS, statsAtLevel } from "../../src/content/progress";
import { defaultWeaponFor } from "../../src/content/weapons";
import type { RosterUnit } from "../../src/core/mission";
import type { ItemId, UnitTypeId } from "../../src/core/types";
import { effectiveMaxHp } from "../../src/core/commander";

export function testRosterUnit(
  id: string,
  name: string,
  type: UnitTypeId,
  opts: { keyUnit?: boolean; level?: number; exp?: number } = {},
): RosterUnit {
  const level = opts.level ?? 1;
  const commanderName = name.replace(/(步兵|机枪|迫击炮|炮兵|坦克|后勤)$/, "") || name;
  const weapon = defaultWeaponFor(type, "early");
  const baseStats = { ...BASE_STATS };
  const stats = statsAtLevel(baseStats, type, level, commanderName.length);
  const unit: RosterUnit = {
    id,
    name,
    type,
    hp: 1,
    maxHp: 1,
    exp: opts.exp ?? 0,
    fatigue: 0,
    missionsSurvived: 0,
    keyUnit: opts.keyUnit ?? false,
    commanderKind: "companion",
    commanderName,
    level,
    baseStats,
    stats,
    weapon,
  };
  unit.maxHp = effectiveMaxHp(unit);
  unit.hp = unit.maxHp;
  return unit;
}

export function fullInventory(extra: Partial<Record<ItemId, number>> = {}): Record<ItemId, number> {
  const base = {
    medkit: 0,
    bandage: 0,
    ration: 0,
    compressed_ration: 0,
    water_purification: 0,
    grenade_bundle: 0,
    smoke_grenade: 0,
    ammo_crate: 0,
    signal_flare: 0,
    at_charge: 0,
    satchel: 0,
    arty_support: 0,
    field_manual: 0,
    plasma_unit: 0,
    surgeon_kit: 0,
    bangalore: 0,
    shaped_charge_elite: 0,
    smoke_screen: 0,
    corps_arty: 0,
    night_attack_notes: 0,
    hero_citation: 0,
    flare: 0,
  } satisfies Record<ItemId, number>;
  return { ...base, ...extra };
}
