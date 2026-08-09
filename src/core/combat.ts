import { BALANCE } from "../content/balance";
import { ITEMS } from "../content/items";
import { WEATHER_EFFECT } from "../content/terrain";
import { MATCHUP, PROGRESS, UNIT_TYPES } from "../content/units";
import { WEAPONS } from "../content/weapons";
import { effectiveMaxHp, effectiveStats } from "./commander";
import {
  adjacentAllies,
  attackRange,
  coordinationAllies,
  defensiveSupportAllies,
  encirclementStatus,
  manhattan,
  tileAt,
} from "./grid";
import { nightAssaultBonus, supplyPenalty } from "./mission";
import { nextRange } from "./rng";
import type { DamageBreakdown, GameState, Unit } from "./types";

export const JITTER = BALANCE.jitter;
export const COUNTER_RATIO = BALANCE.counterRatio;

/** @deprecated 使用带完整 unit 的 effectiveMaxHp */
export function effectiveMaxHpLegacy(type: Unit["type"], exp: number): number {
  return UNIT_TYPES[type].maxHp + Math.round(levelish(exp) * 6);
}

function levelish(exp: number): number {
  return Math.max(0, Math.floor(exp / 120));
}

export function refreshMaxHp(unit: Unit, state?: GameState): void {
  const next = effectiveMaxHp(unit, state?.inventory);
  if (next !== unit.maxHp) {
    const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
    unit.maxHp = next;
    unit.hp = Math.max(1, Math.min(next, Math.round(next * ratio)));
  } else {
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
 * 将领武力/智力、武器、等级与兵种底盘共同决定输出。
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
  const atkStats = effectiveStats(attacker, state.inventory);
  const defStats = effectiveStats(defender, state.inventory);
  const defWeapon = WEAPONS[defender.weapon];

  const primaryStat = attackerDef.indirect ? atkStats.intellect : atkStats.might;
  // 统率常驻微幅（仅高于中性点）；夹击仍额外吃统率缩放
  const leadAtk = 1 + Math.max(0, atkStats.leadership - 40) * 0.001;
  const commander = (1 + (primaryStat - 40) * 0.005) * leadAtk;
  // 武器进攻已并入五维 stats；breakdown.weapon 恒为 1
  const weapon = 1;
  const levelAtk = 1 + PROGRESS.attackPerLevel * Math.max(0, attacker.level - 1);

  const base = attackerDef.attack * BALANCE.factionDamage[attacker.faction];
  const matchup = MATCHUP[attacker.type][defender.type];
  const veterancy = levelAtk;
  const fatigue =
    1 -
    BALANCE.fatigue.attackPenalty *
      (attacker.fatigue / BALANCE.fatigue.max) *
      (1 - Math.max(0, atkStats.stamina - 40) * 0.004);
  const leadScale = 1 + Math.max(0, atkStats.leadership - 40) * 0.004;
  const flank =
    1 +
      Math.min(BALANCE.flank.cap, adjacentAllies(state, attacker) * BALANCE.flank.perAlly) *
      leadScale;
  const coordination =
    1 +
      Math.min(
        BALANCE.coordination.cap,
        coordinationAllies(state, attacker, defender) * BALANCE.coordination.perAlly,
      ) *
        leadScale;
  const defensiveSupport = Math.max(
    1 - BALANCE.defensiveSupport.cap,
    1 -
      Math.min(
        BALANCE.defensiveSupport.cap,
        defensiveSupportAllies(state, defender, attacker) * BALANCE.defensiveSupport.perAlly,
      ),
  );
  const encirclement = encirclementStatus(state, defender, attacker.faction, {
    id: attacker.id,
    x: attacker.x,
    y: attacker.y,
  }).multiplier;

  let rawDefense =
    attackerDef.indirect && defenderTile.defense > 0
      ? defenderTile.defense / 2
      : defenderTile.defense;
  if (attackerDef.indirect) {
    // 智力进一步压低掩体收益
    rawDefense *= 1 - Math.max(0, atkStats.intellect - 40) * 0.004;
  }
  const terrain = 1 - rawDefense;
  const defenderVeterancy =
    (1 - PROGRESS.defensePerLevel * Math.max(0, defender.level - 1)) *
    (1 - Math.max(0, defStats.stamina - 40) * 0.003) *
    (1 - (defWeapon?.defenseBonus ?? 0));
  const keyGuard = defender.keyUnit ? BALANCE.keyUnitDamageTaken : 1;
  const weather = distance > 1 ? 1 + WEATHER_EFFECT[state.weather].rangedDamage : 1;
  const setup = !attacker.movedThisTurn ? 1 + attackerDef.setupBonus : 1;
  const highGround = 1 + attackerTile.attackBonus;
  const scripted =
    nightAssaultBonus(state, attacker, distance) * supplyPenalty(state, attacker);

  const total = Math.max(
    BALANCE.minDamage,
    Math.round(
      base *
        matchup *
        veterancy *
        commander *
        weapon *
        fatigue *
        flank *
        coordination *
        encirclement *
        terrain *
        defenderVeterancy *
        defensiveSupport *
        keyGuard *
        weather *
        setup *
        highGround *
        scripted *
        jitter,
    ),
  );

  return {
    base,
    matchup,
    veterancy,
    commander,
    weapon,
    fatigue,
    flank,
    coordination,
    encirclement,
    terrain,
    defenderVeterancy,
    defensiveSupport,
    keyGuard,
    weather,
    setup,
    highGround,
    scripted,
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
  const range = attackRange(state, defender);
  const distance = manhattan(attacker, defender);
  return distance >= range.min && distance <= range.max;
}

export function itemDamage(item: keyof typeof ITEMS, target: Unit, user?: Unit, state?: GameState): number {
  const def = ITEMS[item];
  if (def.antiArmorOnly && !UNIT_TYPES[target.type].vehicle) return 0;
  let damage = def.damage;
  if (user && state) {
    const intellect = effectiveStats(user, state.inventory).intellect;
    damage = Math.round(damage * (1 + Math.max(0, intellect - 40) * 0.005));
  }
  return damage;
}

export { effectiveMaxHp };
