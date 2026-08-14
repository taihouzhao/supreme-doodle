import { ITEM_IDS } from "../content/items";
import {
  BASE_STATS,
  PROGRESS,
  addStats,
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

/** 生效属性 = 将领成长属性 + 武器；消耗品不再提供永久被动。 */
export function effectiveStats(unit: Unit, inventory?: Record<ItemId, number>): CommanderStats {
  const weapon = WEAPONS[unit.weapon];
  void inventory;
  return addStats(unit.stats, weapon?.stats ?? {});
}

/** 已有背包时只读取该单位携带的物资；旧状态无背包则回退共享库存。 */
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
  _commanderName: string,
): CommanderStats {
  return statsAtLevel(baseStats, type, level);
}

/**
 * 同步等级与属性。
 * - 任意经验变化都按统一等级阈值和一级底板重算，跳级与逐级升级结果一致。
 * - 降级：若有 baseStats，按开局公式重算，避免经验回撤后属性虚高。
 */
export function syncLevelFromExp(unit: Unit): { from: number; to: number } | null {
  const nextLevel = levelFromExp(unit.exp);
  if (nextLevel === unit.level) return null;
  const from = unit.level;
  // 任何经验变化都从一级底板重算，保证跳级、逐级升级、读档迁移结果一致。
  const base = unit.baseStats ?? { ...BASE_STATS };
  unit.baseStats = base;
  unit.stats = recomputeStatsAtLevel(base, unit.type, nextLevel, unit.commanderName);
  unit.level = nextLevel;
  return nextLevel > from ? { from, to: nextLevel } : null;
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

/** 旧 UI 兼容入口：物品不再提供永久被动，因此始终返回空摘要。 */
export function inventoryPassiveSummary(_state: GameState): string {
  return "";
}
