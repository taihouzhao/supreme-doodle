import { UNIT_TYPES, VETERANCY } from "../content/units";
import { COUNTER_RATIO, estimateDamageFrom } from "../core/combat";
import {
  attackRange,
  attackableTargets,
  canEnter,
  livingUnits,
  manhattan,
  orthogonalNeighbours,
  reachableTiles,
  tileAt,
  unitAt,
} from "../core/grid";
import { movementBudget } from "../core/mission";
import type { ReachableTile } from "../core/grid";
import type { GameState, Unit, Vec2 } from "../core/types";

export function unitsToAct(state: GameState): Unit[] {
  return livingUnits(state, "player").filter((u) => !u.hasActed);
}

export interface AttackOption {
  target: Unit;
  damage: number;
  counter: number;
  lethal: boolean;
}

/**
 * 计算单位从候选格开火时的完整射程。
 *
 * 射程规则只由 core/attackRange 维护；AI 不再复制兵种、地形与武器修正公式，
 * 避免带射程／最小射程修正的武器在规则里能打、规划时却被忽略。
 */
export function attackRangeFrom(
  state: GameState,
  unit: Unit,
  from: Vec2,
): { min: number; max: number } {
  if (unit.x === from.x && unit.y === from.y) return attackRange(state, unit);
  return attackRange(state, { ...unit, x: from.x, y: from.y });
}

export function attackOptions(state: GameState, unit: Unit): AttackOption[] {
  return attackableTargets(state, unit).map((target) => {
    const damage = estimateDamageFrom(
      state,
      unit,
      target,
      { x: unit.x, y: unit.y },
      unit.movedThisTurn,
    );
    const counter = canBeCountered(state, unit, target)
      ? estimateDamageFrom(state, target, unit, { x: target.x, y: target.y }, false) * COUNTER_RATIO
      : 0;
    return { target, damage, counter, lethal: target.hp <= damage };
  });
}

export function canBeCountered(state: GameState, attacker: Unit, defender: Unit): boolean {
  if (UNIT_TYPES[attacker.type].indirect) return false;
  const range = attackRange(state, defender);
  const distance = manhattan(attacker, defender);
  return distance >= range.min && distance <= range.max;
}

export function stoppableTiles(state: GameState, unit: Unit): ReachableTile[] {
  return reachableTiles(state, unit).filter((tile) => {
    const occupant = unitAt(state, tile.x, tile.y);
    return !occupant || occupant.id === unit.id;
  });
}

export function nearest<T extends Vec2>(from: Vec2, items: T[]): T | null {
  if (items.length === 0) return null;
  return items.reduce((closest, candidate) =>
    manhattan(from, candidate) < manhattan(from, closest) ? candidate : closest,
  );
}

/** 朝目标推进：优先缩短距离，其次选择防御更好的地形 */
export function approachTile(
  state: GameState,
  unit: Unit,
  goal: Vec2,
  tiles = stoppableTiles(state, unit),
): ReachableTile | null {
  let best: ReachableTile | null = null;
  let bestDistance = Infinity;
  let bestDefense = -Infinity;

  for (const tile of tiles) {
    const distance = manhattan(tile, goal);
    const defense = tileAt(state, tile.x, tile.y).defense;
    if (distance < bestDistance || (distance === bestDistance && defense > bestDefense)) {
      best = tile;
      bestDistance = distance;
      bestDefense = defense;
    }
  }

  return best;
}

export function captureGoal(state: GameState, from: Vec2): Vec2 | null {
  const pending = state.objectives.filter((o) => o.kind === "capture" && o.owner !== "player");
  const goal = nearest(from, pending);
  return goal ? { x: goal.x, y: goal.y } : null;
}

export function standingObjective(state: GameState, unit: Unit): boolean {
  if (!UNIT_TYPES[unit.type].canCapture) return false;
  return state.objectives.some(
    (o) => o.kind === "capture" && o.owner !== "player" && o.x === unit.x && o.y === unit.y,
  );
}

/**
 * 估算跨回合路线成本。单格地形消耗若高于该单位一整回合的移动力，
 * 对它就是真正的不可通行地形；单纯用曼哈顿距离会把低机动力火力组
 * 引到这种“看起来最近、实际上永远进不去”的山口前。
 */
export function routeCost(
  state: GameState,
  unit: Unit,
  from: Vec2,
  to: Vec2,
): number | null {
  const key = (x: number, y: number) => y * state.width + x;
  const fullTurnBudget = movementBudget(unit, state.weather, state.inventory);
  const best = new Map<number, number>([[key(from.x, from.y), 0]]);
  const frontier: Array<{ x: number; y: number; cost: number }> = [
    { x: from.x, y: from.y, cost: 0 },
  ];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift()!;
    const currentKey = key(current.x, current.y);
    if ((best.get(currentKey) ?? Infinity) < current.cost) continue;
    if (current.x === to.x && current.y === to.y) return current.cost;

    for (const next of orthogonalNeighbours(current)) {
      if (!canEnter(state, unit, next.x, next.y)) continue;
      const stepCost = tileAt(state, next.x, next.y).moveCost;
      if (stepCost > fullTurnBudget) continue;
      const blocker = unitAt(state, next.x, next.y);
      if (blocker && blocker.faction !== unit.faction) continue;

      const cost = current.cost + stepCost;
      const nextKey = key(next.x, next.y);
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, cost);
      frontier.push({ x: next.x, y: next.y, cost });
    }
  }

  return null;
}

export function evacGoal(state: GameState, unit: Unit): Vec2 | null {
  let best: { goal: Vec2; cost: number } | null = null;
  for (const goal of state.evacZone) {
    const cost = routeCost(state, unit, unit, goal);
    if (cost === null) continue;
    if (!best || cost < best.cost) best = { goal, cost };
  }
  return best?.goal ?? null;
}

/**
 * 敌方下一回合可以覆盖到的火力强度，用于走位与撤退判断。
 * 这是启发式近似，不做逐对伤害计算，以保证批量模拟的速度。
 */
export function dangerMap(state: GameState): number[] {
  const key = dangerKey(state);
  if (dangerCache && dangerCache.key === key) return dangerCache.map;

  const map = new Array<number>(state.width * state.height).fill(0);

  for (const enemy of livingUnits(state, "enemy")) {
    const def = UNIT_TYPES[enemy.type];
    const threat =
      def.attack *
      (1 + VETERANCY.attackPerLevel * Math.max(0, enemy.level - 1)) *
      (1 + Math.max(0, enemy.stats.might - 40) * 0.006);
    // 每个敌人只算一次最强火力，再把所有敌人叠加，用来体现集火风险
    const perEnemy = new Array<number>(map.length).fill(0);

    for (const tile of reachableTiles(state, enemy)) {
      const range = attackRangeFrom(state, enemy, tile);
      for (let dy = -range.max; dy <= range.max; dy += 1) {
        const span = range.max - Math.abs(dy);
        for (let dx = -span; dx <= span; dx += 1) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance < range.min) continue;
          const x = tile.x + dx;
          const y = tile.y + dy;
          if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
          const index = y * state.width + x;
          const value = threat * (1 - tileAt(state, x, y).defense);
          if (value > (perEnemy[index] ?? 0)) perEnemy[index] = value;
        }
      }
    }

    for (let i = 0; i < map.length; i += 1) {
      map[i] = (map[i] ?? 0) + (perEnemy[i] ?? 0);
    }
  }

  dangerCache = { key, map };
  return map;
}

let dangerCache: { key: string; map: number[] } | null = null;

function dangerKey(state: GameState): string {
  const enemies = livingUnits(state, "enemy")
    .map((u) => `${u.id},${u.x},${u.y},${u.hp}`)
    .join(";");
  return `${state.missionId}|${state.turn}|${state.phase}|${state.weather}|${enemies}`;
}

export function dangerAt(state: GameState, map: number[], pos: Vec2): number {
  return map[pos.y * state.width + pos.x] ?? 0;
}
