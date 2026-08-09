import { ITEM_IDS, ITEM_PASSIVES } from "../content/items";
import {
  BASE_STATS,
  GROWTH_WEIGHTS,
  PROGRESS,
  addStats,
  allocatePoints,
  enemyProfileFromExp,
  levelFromExp,
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

/** 已有背包时只读取该单位携带的被动；旧状态无背包则回退共享库存。 */
export function inventoryForUnit(unit: Unit, shared?: Record<ItemId, number>): Record<ItemId, number> {
  if (!unit.backpack) return shared ?? ({} as Record<ItemId, number>);
  const result = {} as Record<ItemId, number>;
  for (const item of ITEM_IDS) result[item] = unit.backpack.filter((entry) => entry === item).length;
  return result;
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

/** 从绝对底板按开局同一套 `statsAtLevel` 重算（归队/降级用）。 */
export function recomputeStatsAtLevel(
  baseStats: CommanderStats,
  type: UnitTypeId,
  level: number,
  commanderName: string,
): CommanderStats {
  return statsAtLevel(baseStats, type, level, commanderName.length);
}

/**
 * 同步等级与属性。
 * - 升级：沿用增量加点（盐 = name.length + 原等级），保持既有成长手感与平衡。
 * - 降级：若有 baseStats，按开局公式重算，避免经验回撤后属性虚高。
 */
export function syncLevelFromExp(unit: Unit): { from: number; to: number } | null {
  const nextLevel = levelFromExp(unit.exp);
  if (nextLevel === unit.level) return null;
  const from = unit.level;
  if (nextLevel < from) {
    if (unit.baseStats) {
      unit.stats = recomputeStatsAtLevel(unit.baseStats, unit.type, nextLevel, unit.commanderName);
    }
    unit.level = nextLevel;
    return null;
  }
  const gained = (nextLevel - unit.level) * PROGRESS.pointsPerLevel;
  const salt = unit.commanderName.length + unit.level;
  unit.stats = addStats(unit.stats, allocatePoints(GROWTH_WEIGHTS[unit.type], gained, salt));
  unit.level = nextLevel;
  return { from, to: nextLevel };
}

export function makeEnemyCommander(
  type: UnitTypeId,
  exp: number,
  weapon: WeaponId,
  name: string,
): Pick<
  Unit,
  "commanderKind" | "commanderName" | "level" | "stats" | "baseStats" | "weapon" | "exp"
> {
  const profile = enemyProfileFromExp(type, exp, name.length);
  return {
    commanderKind: "enemy",
    commanderName: name,
    level: profile.level,
    stats: profile.stats,
    baseStats: profile.baseStats,
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
): Pick<
  Unit,
  "commanderKind" | "commanderName" | "level" | "stats" | "baseStats" | "weapon" | "exp"
> {
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
    baseStats: base,
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
