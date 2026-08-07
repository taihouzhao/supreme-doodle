import { BALANCE } from "../content/balance";
import { ITEMS } from "../content/items";
import { WEATHER_EFFECT } from "../content/terrain";
import { MATCHUP, UNIT_TYPES, VETERANCY, veterancyLevel } from "../content/units";
import { adjacentAllies, manhattan, tileAt } from "./grid";
import { nextRange } from "./rng";
import type { DamageBreakdown, GameState, Unit } from "./types";

export const JITTER = BALANCE.jitter;
export const COUNTER_RATIO = BALANCE.counterRatio;

export function effectiveMaxHp(type: Unit["type"], exp: number): number {
  return UNIT_TYPES[type].maxHp + VETERANCY.maxHpPerLevel * veterancyLevel(exp);
}

export function refreshMaxHp(unit: Unit): void {
  const next = effectiveMaxHp(unit.type, unit.exp);
  if (next !== unit.maxHp) {
    unit.maxHp = next;
    unit.hp = Math.min(unit.hp, next);
  }
}

export interface DamageResult {
  rng: number;
  damage: number;
  breakdown: DamageBreakdown;
}

/**
 * 伤害为连续值，没有命中判定、没有暴击、没有秒杀。
 * 抖动被限制在一个窄区间，保证单次随机不能决定胜负。
 */
export function damageComponents(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  jitter: number,
): DamageBreakdown {
  const attackerDef = UNIT_TYPES[attacker.type];
  const attackerTile = tileAt(state, attacker.x, attacker.y);
  const defenderTile = tileAt(state, defender.x, defender.y);
  const distance = manhattan(attacker, defender);

  const base = attackerDef.attack * BALANCE.factionDamage[attacker.faction];
  const matchup = MATCHUP[attacker.type][defender.type];
  const veterancy = 1 + VETERANCY.attackPerLevel * veterancyLevel(attacker.exp);
  const fatigue = 1 - BALANCE.fatigue.attackPenalty * (attacker.fatigue / BALANCE.fatigue.max);
  const flank =
    1 + Math.min(BALANCE.flank.cap, adjacentAllies(state, attacker) * BALANCE.flank.perAlly);
  // 曲射削弱掩体，但不会把「开阔地扣防御」这类负值也一并削弱
  const rawDefense =
    attackerDef.indirect && defenderTile.defense > 0
      ? defenderTile.defense / 2
      : defenderTile.defense;
  const terrain = 1 - rawDefense;
  const defenderVeterancy = 1 - VETERANCY.defensePerLevel * veterancyLevel(defender.exp);
  const keyGuard = defender.keyUnit ? BALANCE.keyUnitDamageTaken : 1;
  const weather =
    distance > 1 ? 1 + WEATHER_EFFECT[state.weather].rangedDamage : 1;
  const setup = !attacker.movedThisTurn ? 1 + attackerDef.setupBonus : 1;
  const highGround = 1 + attackerTile.attackBonus;

  const total = Math.max(
    BALANCE.minDamage,
    Math.round(
      base *
        matchup *
        veterancy *
        fatigue *
        flank *
        terrain *
        defenderVeterancy *
        keyGuard *
        weather *
        setup *
        highGround *
        jitter,
    ),
  );

  return {
    base,
    matchup,
    veterancy,
    fatigue,
    flank,
    terrain,
    defenderVeterancy,
    weather,
    setup,
    highGround,
    jitter,
    total,
  };
}

export function computeDamage(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  rngState: number,
): DamageResult {
  const draw = nextRange(rngState, JITTER.min, JITTER.max);
  const breakdown = damageComponents(state, attacker, defender, draw.value);
  return { rng: draw.state, damage: breakdown.total, breakdown };
}

/** 不消耗随机流的期望伤害，供 AI 与界面预览使用 */
export function estimateDamage(state: GameState, attacker: Unit, defender: Unit): number {
  return damageComponents(state, attacker, defender, 1).total;
}

/** 评估「移动到某格再攻击」的伤害，不改变任何持久状态 */
export function estimateDamageFrom(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  from: { x: number; y: number },
  moved: boolean,
): number {
  const originX = attacker.x;
  const originY = attacker.y;
  const originMoved = attacker.movedThisTurn;
  attacker.x = from.x;
  attacker.y = from.y;
  attacker.movedThisTurn = moved;
  const value = damageComponents(state, attacker, defender, 1).total;
  attacker.x = originX;
  attacker.y = originY;
  attacker.movedThisTurn = originMoved;
  return value;
}

export function canCounter(state: GameState, attacker: Unit, defender: Unit): boolean {
  if (!defender.alive || defender.hp <= 0) return false;
  if (UNIT_TYPES[attacker.type].indirect) return false;
  const def = UNIT_TYPES[defender.type];
  const bonus = tileAt(state, defender.x, defender.y).rangeBonus;
  const distance = manhattan(attacker, defender);
  return distance >= def.minRange && distance <= def.maxRange + bonus;
}

export function itemDamage(item: keyof typeof ITEMS, target: Unit): number {
  const def = ITEMS[item];
  if (def.antiArmorOnly && !UNIT_TYPES[target.type].vehicle) return 0;
  return def.damage;
}
