import { ITEM_PASSIVES } from "../content/items";
import {
  BASE_STATS,
  GROWTH_WEIGHTS,
  PROGRESS,
  addStats,
  allocatePoints,
  enemyProfileFromExp,
  levelFromExp,
  rankName,
  statsAtLevel,
} from "../content/progress";
import { UNIT_TYPES } from "../content/units";
import { WEAPONS } from "../content/weapons";
import type {
  CommanderStats,
  GameState,
  ItemId,
  Unit,
  UnitTypeId,
  WeaponId,
} from "./types";

/** 生效属性 = 将领成长属性 + 武器 + 库存被动。 */
export function effectiveStats(unit: Unit, inventory?: Record<ItemId, number>): CommanderStats {
  const weapon = WEAPONS[unit.weapon];
  let stats = addStats(unit.stats, weapon?.stats ?? {});
  if (inventory && unit.faction === "player") {
    for (const [itemId, passive] of Object.entries(ITEM_PASSIVES)) {
      const count = Math.min(inventory[itemId as ItemId] ?? 0, passive!.cap);
      if (count <= 0) continue;
      stats = addStats(stats, {
        leadership: (passive!.leadership ?? 0) * count,
        intellect: (passive!.intellect ?? 0) * count,
        stamina: (passive!.stamina ?? 0) * count,
      });
    }
  }
  return stats;
}

export function effectiveMaxHp(
  unit: Pick<Unit, "type" | "level" | "stats" | "weapon" | "keyUnit"> &
    Partial<Pick<Unit, "faction">>,
  inventory?: Record<ItemId, number>,
): number {
  const stats = effectiveStats(
    { ...(unit as Unit), faction: unit.faction ?? "player" },
    inventory,
  );
  const typeHp = UNIT_TYPES[unit.type].maxHp;
  const staminaHp = Math.round((stats.stamina - 40) * 1.1);
  const levelHp = (unit.level - 1) * 6;
  const keyBonus = unit.keyUnit ? 50 : 0;
  return Math.max(40, typeHp + staminaHp + levelHp + keyBonus);
}

export function agilityMoveBonus(stats: CommanderStats): number {
  return Math.floor((stats.agility - 40) / 18);
}

/** 同步等级；发生晋升时返回前后等级，供上层播提示 */
export function syncLevelFromExp(unit: Unit): { from: number; to: number } | null {
  const nextLevel = levelFromExp(unit.exp);
  if (nextLevel <= unit.level) {
    unit.level = Math.max(unit.level, nextLevel);
    unit.rank = rankName(unit.level);
    return null;
  }
  const from = unit.level;
  const gained = (nextLevel - unit.level) * PROGRESS.pointsPerLevel;
  const salt = unit.commanderName.length + unit.level;
  unit.stats = addStats(unit.stats, allocatePoints(GROWTH_WEIGHTS[unit.type], gained, salt));
  unit.level = nextLevel;
  unit.rank = rankName(unit.level);
  return { from, to: nextLevel };
}

export function makeEnemyCommander(
  type: UnitTypeId,
  exp: number,
  weapon: WeaponId,
  name: string,
): Pick<Unit, "commanderKind" | "commanderName" | "level" | "rank" | "stats" | "weapon" | "exp"> {
  const profile = enemyProfileFromExp(type, exp, name.length);
  return {
    commanderKind: "enemy",
    commanderName: name,
    level: profile.level,
    rank: profile.rank,
    stats: profile.stats,
    weapon,
    exp,
  };
}

export function makeStoryCommander(
  commander: string,
  type: UnitTypeId,
  level: number,
  weapon: WeaponId,
  extra?: Partial<CommanderStats>,
): Pick<Unit, "commanderKind" | "commanderName" | "level" | "rank" | "stats" | "weapon" | "exp"> {
  const base = addStats(BASE_STATS, {
    leadership: 0,
    intellect: 0,
    might: 0,
    stamina: 0,
    agility: 0,
    ...extra,
  });
  return {
    commanderKind: "story",
    commanderName: commander,
    level,
    rank: rankName(level),
    stats: statsAtLevel(base, type, level, commander.length),
    weapon,
    exp: PROGRESS.expForLevel(level),
  };
}

export function inventoryPassiveSummary(state: GameState): string {
  const parts: string[] = [];
  for (const [itemId, passive] of Object.entries(ITEM_PASSIVES)) {
    const count = Math.min(state.inventory[itemId as ItemId] ?? 0, passive!.cap);
    if (count <= 0) continue;
    parts.push(`${itemId}×${count}`);
  }
  return parts.join("、");
}
