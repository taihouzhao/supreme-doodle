import {
  COUNTER_RATIO,
  JITTER,
  canCounter,
  damageComponents,
} from "../core/combat";
import type { DamageBreakdown, GameState, Unit } from "../core/types";

export interface DamageRange {
  min: number;
  expected: number;
  max: number;
}

export interface AttackPreview {
  attackerId: string;
  defenderId: string;
  damage: DamageRange;
  defenderHpAfter: DamageRange;
  counter: DamageRange | null;
  /** 只有部分伤害抖动结果会击溃守方，因此反击也只是“可能”。 */
  counterConditional: boolean;
  rout: "none" | "possible" | "certain";
  breakdown: DamageBreakdown;
}

function rangeFor(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  multiplier = 1,
): { range: DamageRange; breakdown: DamageBreakdown } {
  const low = damageComponents(state, attacker, defender, JITTER.min);
  const expected = damageComponents(state, attacker, defender, 1);
  const high = damageComponents(state, attacker, defender, JITTER.max);
  const scale = (value: number) =>
    multiplier === 1
      ? value
      : Math.max(1, Math.round(value * multiplier));
  return {
    range: {
      min: scale(low.total),
      expected: scale(expected.total),
      max: scale(high.total),
    },
    breakdown: expected,
  };
}

/** 与真实结算共用 damageComponents，不消耗随机流。 */
export function buildAttackPreview(
  state: GameState,
  attacker: Unit,
  defender: Unit,
): AttackPreview {
  const main = rangeFor(state, attacker, defender);
  const certainRout = main.range.min >= defender.hp;
  const possibleRout = main.range.max >= defender.hp;
  const counterEligible = canCounter(state, attacker, defender);
  const counter =
    counterEligible && !certainRout
      ? rangeFor(state, defender, attacker, COUNTER_RATIO).range
      : null;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    damage: main.range,
    defenderHpAfter: {
      min: Math.max(0, defender.hp - main.range.max),
      expected: Math.max(0, defender.hp - main.range.expected),
      max: Math.max(0, defender.hp - main.range.min),
    },
    counter,
    counterConditional: Boolean(counter && possibleRout),
    rout: certainRout ? "certain" : possibleRout ? "possible" : "none",
    breakdown: main.breakdown,
  };
}
