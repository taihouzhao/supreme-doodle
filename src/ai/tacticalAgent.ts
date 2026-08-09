import { ITEMS } from "../content/items";
import { UNIT_TYPES } from "../content/units";
import { getMission } from "../content/missions";
import { COUNTER_RATIO, estimateDamageFrom, itemDamage } from "../core/combat";
import {
  livingUnits,
  manhattan,
  orthogonalNeighbours,
  resupplyTargets,
  tileAt,
  unitAt,
} from "../core/grid";
import type { ReachableTile } from "../core/grid";
import type { Rng } from "../core/rng";
import type { Action, GameState, Unit, Vec2 } from "../core/types";
import {
  attackRangeFrom,
  attackOptions,
  canBeCountered,
  dangerAt,
  dangerMap,
  evacGoal,
  nearest,
  standingObjective,
  stoppableTiles,
  unitsToAct,
} from "./helpers";
import type { Agent } from "./types";

const WEIGHTS = {
  lethalMultiplier: 1.6,
  focusFire: 25,
  counter: 0.8,
  terrain: 30,
  danger: 0.5,
  moveCost: 0.1,
  idlePenalty: 15,
  breakthroughPull: 10,
  holdPull: 3,
  garrison: 45,
  withdrawPull: 7,
  keyUnitWithdrawPull: 11,
  keyUnitProtect: 55,
  retreatHpRatio: 0.55,
  retreatDangerRatio: 0.4,
  cohesion: 7,
  cohesionCap: 21,
};

/** 保持互相掩护：相邻友军既有集火加成，也能分摊敌方火力 */
function alliesAround(state: GameState, unit: Unit, tile: Vec2): number {
  return orthogonalNeighbours(tile).reduce((count, spot) => {
    const other = unitAt(state, spot.x, spot.y);
    return other && other.faction === unit.faction && other.id !== unit.id ? count + 1 : count;
  }, 0);
}

/**
 * 保存部队：把「这一步会不会送掉一个单位」显式计入代价。
 * 老兵越贵，越不该拿去换。
 */
function deathRisk(unit: Unit, projectedDamage: number): number {
  const keyWeight = unit.keyUnit ? 3.5 : 1;
  if (projectedDamage < unit.hp) return projectedDamage * 0.35 * keyWeight;
  const veteranWeight = 1 + Math.min(10, unit.level) * 0.12;
  return (80 + (projectedDamage - unit.hp)) * veteranWeight * keyWeight + (unit.keyUnit ? 120 : 0);
}

/** 据点必须有人站着，否则回合结束就会被敌人占走 */
function garrisonBonus(
  state: GameState,
  unit: Unit,
  tile: Vec2,
  posts: { x: number; y: number; owner: string }[],
): number {
  const goal = nearest(tile, posts);
  if (!goal) return 0;
  const contested = posts.filter((o) => o.owner !== "player").length;
  let bonus = -manhattan(tile, goal) * WEIGHTS.holdPull * (contested > 0 ? 1.8 : 1);
  const onPost = posts.find((o) => o.x === tile.x && o.y === tile.y);
  if (onPost) {
    const occupied = unitAt(state, onPost.x, onPost.y);
    if (!occupied || occupied.id === unit.id) bonus += WEIGHTS.garrison;
  }
  return bonus;
}

/** 越接近回合上限，越需要压向目标而不是安全对射 */
function urgency(state: GameState): number {
  return 1 + (state.turn / state.maxTurns) * 1.5;
}

function missionBonus(state: GameState, unit: Unit, tile: Vec2): number {
  if (state.missionKind === "breakthrough") {
    const pending = state.objectives.filter((o) => o.kind === "capture" && o.owner !== "player");
    if (pending.length === 0) {
      // 目标已到手，转入守住反扑的姿态
      return garrisonBonus(state, unit, tile, state.objectives);
    }
    const goal = nearest(tile, pending);
    if (!goal) return 0;
    const onGoal = goal.x === tile.x && goal.y === tile.y;

    // 只有步兵能占领，其余兵种不能堵在目标格上
    if (!UNIT_TYPES[unit.type].canCapture) {
      const pull = -manhattan(tile, goal) * WEIGHTS.breakthroughPull * 0.4;
      return onGoal ? pull - WEIGHTS.garrison : pull;
    }

    return (
      -manhattan(tile, goal) * WEIGHTS.breakthroughPull * urgency(state) +
      (onGoal ? WEIGHTS.garrison : 0)
    );
  }

  if (state.missionKind === "hold") {
    return garrisonBonus(
      state,
      unit,
      tile,
      state.objectives.filter((o) => o.kind === "hold"),
    );
  }

  const pressurePending =
    state.stats.enemyRouted < (getMission(state.missionId).victory.minEnemiesRouted ?? 0);
  if (pressurePending && !unit.keyUnit) {
    const contact = nearest(tile, livingUnits(state, "enemy"));
    return contact ? -manhattan(tile, contact) * WEIGHTS.breakthroughPull : 0;
  }

  const evac = nearest(tile, state.evacZone);
  if (!evac) return 0;
  const pull = unit.keyUnit ? WEIGHTS.keyUnitWithdrawPull : WEIGHTS.withdrawPull;
  let bonus = -manhattan(tile, evac) * pull;
  if (unit.keyUnit) bonus += WEIGHTS.keyUnitProtect;
  return bonus;
}

interface Plan {
  score: number;
  action: Action;
}

function planItem(state: GameState, unit: Unit): Plan | null {
  const hpRatio = unit.hp / unit.maxHp;

  if ((state.inventory.at_charge ?? 0) > 0) {
    const armour = livingUnits(state, "enemy").filter(
      (e) => UNIT_TYPES[e.type].vehicle && manhattan(unit, e) <= ITEMS.at_charge.range,
    );
    const target = armour.sort((a, b) => a.hp - b.hp)[0];
    if (target) {
      const damage = itemDamage("at_charge", target);
      const normal = estimateDamageFrom(
        state,
        unit,
        target,
        { x: unit.x, y: unit.y },
        unit.movedThisTurn,
      );
      if (damage > normal * 1.2) {
        return {
          score: damage * (target.hp <= damage ? WEIGHTS.lethalMultiplier : 1) + 20,
          action: { kind: "useItem", unitId: unit.id, item: "at_charge", targetId: target.id },
        };
      }
    }
  }

  if ((state.inventory.arty_support ?? 0) > 0) {
    let best: { tile: Vec2; hits: number } | null = null;
    for (const enemy of livingUnits(state, "enemy")) {
      if (manhattan(unit, enemy) > ITEMS.arty_support.range) continue;
      const centre = { x: enemy.x, y: enemy.y };
      const hits = [centre, ...orthogonalNeighbours(centre)].filter((tile) => {
        const occupant = unitAt(state, tile.x, tile.y);
        return occupant?.faction === "enemy";
      }).length;
      if (!best || hits > best.hits) best = { tile: centre, hits };
    }
    if (best && best.hits >= 2) {
      return {
        score: ITEMS.arty_support.damage * best.hits + 15,
        action: { kind: "useItem", unitId: unit.id, item: "arty_support", to: best.tile },
      };
    }
  }

  if ((state.inventory.medkit ?? 0) > 0 && hpRatio < 0.5 && unit.hp < unit.maxHp - 20) {
    return {
      score: ITEMS.medkit.heal * 0.9,
      action: { kind: "useItem", unitId: unit.id, item: "medkit" },
    };
  }

  return null;
}

function planCombat(state: GameState, unit: Unit, danger: number[]): Plan | null {
  const tiles = stoppableTiles(state, unit);
  const targets = livingUnits(state, "enemy");
  let best: Plan | null = null;

  const consider = (score: number, action: Action) => {
    if (!best || score > best.score) best = { score, action };
  };

  for (const tile of tiles) {
    const moved = tile.cost > 0;
    const terrain = tileAt(state, tile.x, tile.y);
    const positional =
      terrain.defense * WEIGHTS.terrain -
      dangerAt(state, danger, tile) * WEIGHTS.danger -
      tile.cost * WEIGHTS.moveCost +
      Math.min(WEIGHTS.cohesionCap, alliesAround(state, unit, tile) * WEIGHTS.cohesion) +
      missionBonus(state, unit, tile);

    const reposition: Action = moved
      ? { kind: "move", unitId: unit.id, to: { x: tile.x, y: tile.y } }
      : { kind: "wait", unitId: unit.id };
    consider(
      positional - WEIGHTS.idlePenalty - deathRisk(unit, dangerAt(state, danger, tile)),
      reposition,
    );

    const range = attackRangeFrom(state, unit, tile);
    for (const target of targets) {
      const distance = manhattan(tile, target);
      if (distance < range.min || distance > range.max) continue;

      const damage = estimateDamageFrom(state, unit, target, tile, moved);
      const lethal = target.hp <= damage;
      const counter =
        !lethal && canBeCountered(state, unit, target)
          ? estimateDamageFrom(state, target, unit, { x: target.x, y: target.y }, false) *
            COUNTER_RATIO
          : 0;

      // 集火：优先补刀已经受创的目标，让敌人尽快离场而不是平摊伤害
      const focus = (1 - target.hp / target.maxHp) * WEIGHTS.focusFire;

      const score =
        damage * (lethal ? WEIGHTS.lethalMultiplier : 1) +
        focus -
        counter * WEIGHTS.counter +
        positional -
        deathRisk(unit, dangerAt(state, danger, tile) + counter);

      consider(
        score,
        moved
          ? { kind: "move", unitId: unit.id, to: { x: tile.x, y: tile.y } }
          : { kind: "attack", unitId: unit.id, targetId: target.id },
      );
    }
  }

  return best;
}

function planRetreat(state: GameState, unit: Unit, danger: number[]): Plan | null {
  const tiles = stoppableTiles(state, unit);
  let best: ReachableTile | null = null;
  let bestScore = -Infinity;

  for (const tile of tiles) {
    const terrain = tileAt(state, tile.x, tile.y);
    const score =
      -dangerAt(state, danger, tile) +
      terrain.defense * 40 +
      terrain.regen * 2 +
      missionBonus(state, unit, tile);
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }

  if (!best || best.cost === 0) return null;
  return { score: bestScore, action: { kind: "move", unitId: unit.id, to: { x: best.x, y: best.y } } };
}

function priority(state: GameState, unit: Unit): number {
  let score = 0;
  if (unit.keyUnit) score += state.missionKind === "withdraw" ? 60 : 40;
  if (UNIT_TYPES[unit.type].indirect) score += 30;
  if (unit.type === "mg") score += 20;
  if (unit.type === "artillery") score += 15;
  if (unit.type === "logistics") score += 8;
  if (unit.type === "tank") score += 10;
  return score;
}

/**
 * 战术策略：考虑地形、集火、机枪架设、曲射反制、残血后撤、道具时机与兵种克制。
 * 作为能力梯度的上界。
 */
export const tacticalAgent: Agent = {
  id: "tactical",
  name: "战术策略",
  decide(state: GameState, _rng: Rng): Action {
    const pending = unitsToAct(state);
    if (pending.length === 0) return { kind: "endTurn" };

    const ordered = pending
      .slice()
      .sort((a, b) => priority(state, b) - priority(state, a) || a.id.localeCompare(b.id));
    const unit = ordered[0] as Unit;

    if (standingObjective(state, unit)) {
      return { kind: "capture", unitId: unit.id };
    }

    // 后勤：优先补充重伤/高疲劳友军；阻击关不追到火线送死，改靠后补给
    if (unit.type === "logistics") {
      const needy = resupplyTargets(state, unit)
        .slice()
        .sort(
          (a, b) =>
            a.hp / a.maxHp - b.hp / b.maxHp ||
            b.fatigue - a.fatigue ||
            a.id.localeCompare(b.id),
        );
      if (needy[0]) return { kind: "resupply", unitId: unit.id, targetId: needy[0].id };
      const holdMission = state.missionKind === "hold";
      const wounded = livingUnits(state, unit.faction)
        .filter((ally) => {
          if (ally.id === unit.id) return false;
          const hurt =
            ally.hp < ally.maxHp * (holdMission ? 0.55 : 0.75) ||
            ally.fatigue >= (holdMission ? 40 : 25);
          if (!hurt) return false;
          // 阻击关：只接近仍靠近己方据点的伤员，避免后勤冲进南侧突击走廊
          if (!holdMission) return true;
          const posts = state.objectives.filter((o) => o.kind === "hold");
          return posts.some((post) => manhattan(ally, post) <= 2);
        })
        .sort(
          (a, b) =>
            a.hp / a.maxHp - b.hp / b.maxHp ||
            b.fatigue - a.fatigue ||
            a.id.localeCompare(b.id),
        )[0];
      if (wounded && unit.mpLeft > 0) {
        let best: { x: number; y: number; dist: number } | null = null;
        for (const tile of stoppableTiles(state, unit)) {
          if (tile.cost === 0) continue;
          const dist = manhattan(tile, wounded);
          if (!best || dist < best.dist) best = { x: tile.x, y: tile.y, dist };
        }
        if (best && best.dist < manhattan(unit, wounded)) {
          return { kind: "move", unitId: unit.id, to: { x: best.x, y: best.y } };
        }
      }
      // 阻击关无伤员可补时，撤回己方据点后方待机
      if (holdMission && unit.mpLeft > 0) {
        const posts = state.objectives.filter((o) => o.kind === "hold");
        const anchor = nearest(unit, posts);
        if (anchor && manhattan(unit, anchor) > 2) {
          let best: { x: number; y: number; dist: number } | null = null;
          for (const tile of stoppableTiles(state, unit)) {
            if (tile.cost === 0) continue;
            const dist = manhattan(tile, anchor);
            if (!best || dist < best.dist) best = { x: tile.x, y: tile.y, dist };
          }
          if (best && best.dist < manhattan(unit, anchor)) {
            return { kind: "move", unitId: unit.id, to: { x: best.x, y: best.y } };
          }
        }
      }
      return { kind: "wait", unitId: unit.id };
    }

    // 突破关后半段：能占领的部队优先压向未占目标，避免清场后超时
    if (
      state.missionKind === "breakthrough" &&
      UNIT_TYPES[unit.type].canCapture &&
      unit.mpLeft > 0 &&
      state.turn >= Math.ceil(state.maxTurns * 0.45)
    ) {
      const pending = state.objectives.filter((o) => o.kind === "capture" && o.owner !== "player");
      const goal = nearest(unit, pending);
      if (goal && (unit.x !== goal.x || unit.y !== goal.y)) {
        let best: { x: number; y: number; dist: number } | null = null;
        for (const tile of stoppableTiles(state, unit)) {
          if (tile.cost === 0) continue;
          const dist = manhattan(tile, goal);
          if (!best || dist < best.dist) best = { x: tile.x, y: tile.y, dist };
        }
        if (best && best.dist < manhattan(unit, goal)) {
          return { kind: "move", unitId: unit.id, to: { x: best.x, y: best.y } };
        }
      }
    }

    // 阻击关：先占住据点，据点上优先自救；非据点单位不要去追击散兵
    if (state.missionKind === "hold") {
      // 上界策略会主动夺回失守据点；只筛 player 会让 AI 永久忽略刚被敌军占领的高地。
      const posts = state.objectives.filter((o) => o.kind === "hold");
      const onPost = posts.some((o) => o.x === unit.x && o.y === unit.y);
      if (!onPost && unit.mpLeft > 0) {
        const vacant = posts.filter((post) => {
          const occ = unitAt(state, post.x, post.y);
          return !occ || occ.id === unit.id;
        });
        const goal = nearest(unit, vacant.length > 0 ? vacant : posts);
        if (goal && (unit.x !== goal.x || unit.y !== goal.y)) {
          let best: { x: number; y: number; dist: number } | null = null;
          for (const tile of stoppableTiles(state, unit)) {
            if (tile.cost === 0) continue;
            const dist = manhattan(tile, goal);
            if (!best || dist < best.dist) best = { x: tile.x, y: tile.y, dist };
          }
          if (best && best.dist < manhattan(unit, goal)) {
            return { kind: "move", unitId: unit.id, to: { x: best.x, y: best.y } };
          }
        }
      }
      if (onPost || posts.some((post) => manhattan(unit, post) <= 1)) {
        const hpRatio = unit.hp / unit.maxHp;
        if ((state.inventory.medkit ?? 0) > 0 && hpRatio < 0.6 && unit.hp < unit.maxHp - 15) {
          return { kind: "useItem", unitId: unit.id, item: "medkit" };
        }
        if ((state.inventory.bandage ?? 0) > 0 && hpRatio < 0.75 && unit.hp < unit.maxHp - 8) {
          return { kind: "useItem", unitId: unit.id, item: "bandage" };
        }
        const options = attackOptions(state, unit).filter((option) => {
          if (unit.keyUnit && canBeCountered(state, unit, option.target)) return false;
          // 满血守军可以利用工事主动压低突击梯队；低血量单位只补刀，避免无谓换血。
          if (hpRatio < 0.35 && !option.lethal) return false;
          // 中残血时避免无反击换血，保全阻击关存活门槛。
          if (hpRatio < 0.55 && canBeCountered(state, unit, option.target) && !option.lethal) {
            return false;
          }
          return true;
        });
        if (options.length > 0) {
          const best = options.reduce((chosen, candidate) => {
            if (candidate.lethal !== chosen.lethal) return candidate.lethal ? candidate : chosen;
            return candidate.damage > chosen.damage ? candidate : chosen;
          });
          return { kind: "attack", unitId: unit.id, targetId: best.target.id };
        }
        return { kind: "wait", unitId: unit.id };
      }
      return { kind: "wait", unitId: unit.id };
    }

    const pressurePending =
      state.missionKind === "withdraw" &&
      state.stats.enemyRouted < (getMission(state.missionId).victory.minEnemiesRouted ?? 0);
    if (state.missionKind === "withdraw" && !pressurePending && unit.mpLeft > 0) {
      const evac = evacGoal(state, unit);
      if (evac) {
        const onEvac = stoppableTiles(state, unit).find((tile) =>
          state.evacZone.some((z) => z.x === tile.x && z.y === tile.y),
        );
        if (onEvac && onEvac.cost > 0) {
          return { kind: "move", unitId: unit.id, to: { x: onEvac.x, y: onEvac.y } };
        }
        // 北撤关：优先脱离，只有挡住去路才交火
        let best: { x: number; y: number; dist: number } | null = null;
        for (const tile of stoppableTiles(state, unit)) {
          if (tile.cost === 0) continue;
          const dist = manhattan(tile, evac);
          if (!best || dist < best.dist) best = { x: tile.x, y: tile.y, dist };
        }
        if (best && best.dist < manhattan(unit, evac)) {
          return { kind: "move", unitId: unit.id, to: { x: best.x, y: best.y } };
        }
      }
    }

    const danger = dangerMap(state);
    const item = planItem(state, unit);
    const combat = planCombat(state, unit, danger);

    const hurt = unit.hp / unit.maxHp < (unit.keyUnit ? 0.7 : WEIGHTS.retreatHpRatio);
    const exposed =
      dangerAt(state, danger, unit) > unit.hp * (unit.keyUnit ? 0.25 : WEIGHTS.retreatDangerRatio);
    if ((hurt && exposed || (unit.keyUnit && hurt)) && unit.mpLeft > 0) {
      const retreat = planRetreat(state, unit, danger);
      if (retreat && (!combat || retreat.score > combat.score - (unit.keyUnit ? 30 : 0))) {
        return retreat.action;
      }
    }

    if (item && (!combat || item.score > combat.score)) return item.action;
    if (combat) return combat.action;
    return { kind: "wait", unitId: unit.id };
  },
};
