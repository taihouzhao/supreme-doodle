import { BASE_STATS, rankName, statsAtLevel } from "../../src/content/progress";
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
  const stats = statsAtLevel(BASE_STATS, type, level, id.length);
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
    rank: rankName(level),
    stats,
    weapon,
  };
  unit.maxHp = effectiveMaxHp(unit);
  unit.hp = unit.maxHp;
  return unit;
}

export function fullInventory(extra: Partial<Record<ItemId, number>> = {}): Record<ItemId, number> {
  return {
    medkit: 0,
    bandage: 0,
    ration: 0,
    at_charge: 0,
    satchel: 0,
    arty_support: 0,
    field_manual: 0,
    ...extra,
  };
}
