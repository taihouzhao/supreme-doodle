import type { CommanderStats, UnitTypeId } from "../core/types";

export type { CommanderStats, CommanderKind } from "../core/types";

export type StatKey = keyof CommanderStats;

/** 数值成长曲线：只使用 EXP 与 Lv.，不维护额外的经验称谓。 */

export const PROGRESS = {
  maxLevel: 20,
  /** 每级属性总点数（按兵种成长权重分配） */
  pointsPerLevel: 3,
  /** 等级对伤害的额外温和加成，避免完全吃掉属性曲线 */
  attackPerLevel: 0.018,
  defensePerLevel: 0.012,
  /** 经验：造成伤害与击溃；歼灭奖励明显高于单次擦伤。 */
  expPerDamage: 0.4,
  expPerRout: 40,
  /** 升级曲线：升到 level+1 所需累计经验 */
  expForLevel(level: number): number {
    if (level <= 1) return 0;
    // 平滑递增：L2≈45，L5≈280，L10≈1100，L15≈2600，L20≈4800
    let total = 0;
    for (let l = 2; l <= level; l += 1) {
      total += Math.round(36 + (l - 1) * 22 + (l - 1) * (l - 1) * 1.1);
    }
    return total;
  },
};

/** 兵种成长侧重：决定升级时属性往哪砸。 */
export const GROWTH_WEIGHTS: Record<UnitTypeId, Record<StatKey, number>> = {
  rifle: { might: 0.28, stamina: 0.24, leadership: 0.2, agility: 0.16, intellect: 0.12 },
  mg: { leadership: 0.26, might: 0.24, stamina: 0.2, intellect: 0.16, agility: 0.14 },
  mortar: { intellect: 0.34, might: 0.2, leadership: 0.16, stamina: 0.16, agility: 0.14 },
  artillery: { intellect: 0.36, leadership: 0.2, stamina: 0.18, might: 0.14, agility: 0.12 },
  tank: { might: 0.3, stamina: 0.28, leadership: 0.16, intellect: 0.14, agility: 0.12 },
  armored_car: { might: 0.26, agility: 0.24, stamina: 0.22, leadership: 0.16, intellect: 0.12 },
  logistics: { stamina: 0.3, leadership: 0.24, intellect: 0.18, agility: 0.16, might: 0.12 },
};

export const BASE_STATS: CommanderStats = {
  leadership: 40,
  intellect: 40,
  might: 40,
  stamina: 40,
  agility: 40,
};

export function levelFromExp(exp: number): number {
  let level = 1;
  for (let l = 2; l <= PROGRESS.maxLevel; l += 1) {
    if (exp >= PROGRESS.expForLevel(l)) level = l;
    else break;
  }
  return level;
}

export function expProgress(exp: number): { level: number; into: number; need: number } {
  const level = levelFromExp(exp);
  if (level >= PROGRESS.maxLevel) {
    return { level, into: 0, need: 0 };
  }
  const floor = PROGRESS.expForLevel(level);
  const next = PROGRESS.expForLevel(level + 1);
  return { level, into: exp - floor, need: next - floor };
}

/** 按权重把 `points` 点分配到五维（确定性，便于重放）。 */
export function allocatePoints(
  weights: Record<StatKey, number>,
  points: number,
  salt = 0,
): CommanderStats {
  const keys = Object.keys(weights) as StatKey[];
  const totalW = keys.reduce((s, k) => s + weights[k], 0);
  const raw = keys.map((k) => (weights[k] / totalW) * points);
  const base: CommanderStats = {
    leadership: 0,
    intellect: 0,
    might: 0,
    stamina: 0,
    agility: 0,
  };
  for (let i = 0; i < keys.length; i += 1) base[keys[i]!] = Math.floor(raw[i]!);
  let left = points - keys.reduce((s, k) => s + base[k], 0);
  const order = keys
    .map((k, i) => ({ k, frac: raw[i]! - Math.floor(raw[i]!), i }))
    .sort((a, b) => b.frac - a.frac || ((a.i + salt) % keys.length) - ((b.i + salt) % keys.length));
  for (let n = 0; n < left; n += 1) {
    const pick = order[n % order.length]!.k;
    base[pick] += 1;
  }
  return base;
}

export function addStats(a: CommanderStats, b: Partial<CommanderStats>): CommanderStats {
  return {
    leadership: a.leadership + (b.leadership ?? 0),
    intellect: a.intellect + (b.intellect ?? 0),
    might: a.might + (b.might ?? 0),
    stamina: a.stamina + (b.stamina ?? 0),
    agility: a.agility + (b.agility ?? 0),
  };
}

/** 从 1 级底板滚到目标等级（含起始等级已有的底板）。 */
export function statsAtLevel(
  base: CommanderStats,
  type: UnitTypeId,
  level: number,
  salt = 0,
): CommanderStats {
  let stats = { ...base };
  const gains = Math.max(0, level - 1) * PROGRESS.pointsPerLevel;
  if (gains > 0) {
    stats = addStats(stats, allocatePoints(GROWTH_WEIGHTS[type], gains, salt));
  }
  return stats;
}

/** 敌军底板：略弱于同级伴随将领，避免属性膨胀压过玩家成长。 */
export function enemyBaseStats(): CommanderStats {
  return addStats(BASE_STATS, {
    leadership: -4,
    intellect: -4,
    might: -2,
    stamina: -2,
    agility: -2,
  });
}

/**
 * 关卡波段敌军经验缩放。
 * M1–9 保持作者原值；阵地战 M10–12 温和抬升，使后期更常见 L2–L3。
 * 系数经模拟门槛打磨（过猛会出现无解种子）。
 */
export function scaleEnemyExp(missionId: string, rawExp: number): number {
  const n = Number((missionId.match(/m(\d+)/i) ?? [])[1] ?? "1");
  if (n <= 9) return Math.max(0, rawExp);
  return Math.round(rawExp * 1.18 + 10);
}

/** 敌军用经验合成等级与属性，保持旧关卡 `exp` 字段可用。 */
export function enemyProfileFromExp(
  type: UnitTypeId,
  exp: number,
  salt = 0,
): { level: number; stats: CommanderStats; baseStats: CommanderStats } {
  const level = Math.max(1, Math.min(PROGRESS.maxLevel, levelFromExp(exp)));
  const base = enemyBaseStats();
  const stats = statsAtLevel(base, type, Math.max(1, level), salt);
  return { level, stats, baseStats: base };
}
