import {
  COUNTER_RATIO,
  JITTER,
  canCounter,
  damageComponents,
} from "../core/combat";
import { attackImpactPlan } from "../core/grid";
import { secondaryDamageMultiplier, weaponPattern } from "../content/weapons";
import type { DamageBreakdown, GameState, Unit, Vec2 } from "../core/types";

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
  /** 主目标之外由武器形状覆盖的全部格子，包含当前为空的落点。 */
  impactTiles: Vec2[];
  affected: {
    unitId: string;
    damage: DamageRange;
    hpAfter: DamageRange;
    friendly: boolean;
  }[];
  effectProfile: ReturnType<typeof weaponPattern>["profile"];
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

function impactRangeFor(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  components: Array<{ multiplier: number; friendlyFire: boolean }>,
  victim: Unit,
): DamageRange | null {
  const applicable = components.filter(
    (component) => victim.faction !== attacker.faction || component.friendlyFire,
  );
  if (applicable.length === 0) return null;
  const friendlyScale = secondaryDamageMultiplier(attacker.faction, victim.faction);
  const damageAt = (jitter: number): number => {
    const main = damageComponents(state, attacker, defender, jitter).total;
    return applicable.reduce(
      (sum, component) =>
        sum + Math.max(1, Math.round(main * component.multiplier * friendlyScale)),
      0,
    );
  };
  return {
    min: damageAt(JITTER.min),
    expected: damageAt(1),
    max: damageAt(JITTER.max),
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
  const pattern = weaponPattern(attacker.weapon, attacker.type);
  const impactPlan = attackImpactPlan(state, attacker, defender);
  const affected = impactPlan
    .map((impact) => {
      const unit = state.units.find(
        (candidate) => candidate.alive && candidate.x === impact.at.x && candidate.y === impact.at.y,
      );
      if (!unit) return null;
      const range = impactRangeFor(state, attacker, defender, impact.components, unit);
      if (!range) return null;
      return {
        unitId: unit.id,
        damage: range,
        hpAfter: {
          min: Math.max(0, unit.hp - range.max),
          expected: Math.max(0, unit.hp - range.expected),
          max: Math.max(0, unit.hp - range.min),
        },
        friendly: unit.faction === attacker.faction,
      };
    })
    .filter((impact): impact is NonNullable<typeof impact> => Boolean(impact));

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
    impactTiles: impactPlan.map((impact) => ({ ...impact.at })),
    affected,
    effectProfile: pattern.profile,
  };
}
