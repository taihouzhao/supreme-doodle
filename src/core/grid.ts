import { TERRAIN } from "../content/terrain";
import { UNIT_TYPES } from "../content/units";
import { WEAPONS } from "../content/weapons";
import type { GameState, TerrainDef, Unit, Vec2 } from "./types";

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function tileAt(state: GameState, x: number, y: number): TerrainDef {
  const id = state.tiles[y * state.width + x];
  if (!id) throw new Error(`格子越界: ${x},${y}`);
  return TERRAIN[id];
}

export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function unitAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find((u) => u.alive && !u.evacuated && u.x === x && u.y === y);
}

export function livingUnits(state: GameState, faction?: Unit["faction"]): Unit[] {
  return state.units.filter(
    (u) => u.alive && !u.evacuated && (faction === undefined || u.faction === faction),
  );
}

export function canEnter(state: GameState, unit: Unit, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  const terrain = tileAt(state, x, y);
  if (!terrain.passable) return false;
  if (UNIT_TYPES[unit.type].vehicle && !terrain.vehiclePassable) return false;
  return true;
}

const NEIGHBOURS: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export interface ReachableTile {
  x: number;
  y: number;
  cost: number;
}

/**
 * 是否处于敌方控制区：正交相邻有存活敌军。
 * 进入控制区必须停下，部队无法沿着敌人边缘长距离穿插。
 */
export function inEnemyZoc(state: GameState, unit: Unit, x: number, y: number): boolean {
  for (const step of NEIGHBOURS) {
    const other = unitAt(state, x + step.x, y + step.y);
    if (other && other.alive && !other.evacuated && other.faction !== unit.faction) return true;
  }
  return false;
}

/**
 * Dijkstra 可达域。友军可穿越但不可停留，敌军阻挡通行；
 * 进入敌方控制区后本次移动结束（起点除外，允许脱离接触）。
 */
export function reachableTiles(state: GameState, unit: Unit): ReachableTile[] {
  const budget = unit.mpLeft;
  const key = (x: number, y: number) => y * state.width + x;
  const best = new Map<number, number>();
  best.set(key(unit.x, unit.y), 0);

  const frontier: ReachableTile[] = [{ x: unit.x, y: unit.y, cost: 0 }];
  const results: ReachableTile[] = [];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift() as ReachableTile;
    const currentKey = key(current.x, current.y);
    if ((best.get(currentKey) ?? Infinity) < current.cost) continue;

    const occupant = unitAt(state, current.x, current.y);
    const stoppable = !occupant || occupant.id === unit.id;
    if (stoppable) results.push(current);

    const isOrigin = current.x === unit.x && current.y === unit.y;
    if (!isOrigin && inEnemyZoc(state, unit, current.x, current.y)) continue;

    for (const step of NEIGHBOURS) {
      const nx = current.x + step.x;
      const ny = current.y + step.y;
      if (!canEnter(state, unit, nx, ny)) continue;
      const blocker = unitAt(state, nx, ny);
      if (blocker && blocker.faction !== unit.faction) continue;

      const cost = current.cost + tileAt(state, nx, ny).moveCost;
      if (cost > budget) continue;
      const nextKey = key(nx, ny);
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, cost);
      frontier.push({ x: nx, y: ny, cost });
    }
  }

  return results;
}

export function pathCost(state: GameState, unit: Unit, to: Vec2): number | null {
  if (unit.x === to.x && unit.y === to.y) return 0;
  const found = reachableTiles(state, unit).find((t) => t.x === to.x && t.y === to.y);
  return found ? found.cost : null;
}

/**
 * 从起点到终点重建最短路径（含起点与终点），供表现层动画使用。
 * 不修改单位状态；`from` 可覆盖逻辑坐标（例如移动已结算后仍按原路径回放）。
 */
export function findPath(
  state: GameState,
  unit: Unit,
  to: Vec2,
  from: Vec2 = { x: unit.x, y: unit.y },
  budget = Math.max(unit.mpLeft, 32),
): Vec2[] | null {
  if (from.x === to.x && from.y === to.y) return [{ x: from.x, y: from.y }];
  // 先按控制区规则找；回放已结算的移动时敌情可能已变，退化为忽略控制区
  return searchPath(state, unit, to, from, budget, true) ?? searchPath(state, unit, to, from, budget, false);
}

function searchPath(
  state: GameState,
  unit: Unit,
  to: Vec2,
  from: Vec2,
  budget: number,
  respectZoc: boolean,
): Vec2[] | null {
  const key = (x: number, y: number) => y * state.width + x;
  const best = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  best.set(key(from.x, from.y), 0);

  const frontier: ReachableTile[] = [{ x: from.x, y: from.y, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift() as ReachableTile;
    const currentKey = key(current.x, current.y);
    if ((best.get(currentKey) ?? Infinity) < current.cost) continue;
    if (current.x === to.x && current.y === to.y) {
      const path: Vec2[] = [{ x: to.x, y: to.y }];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        const prev = cameFrom.get(cursor)!;
        path.push({ x: prev % state.width, y: Math.floor(prev / state.width) });
        cursor = prev;
      }
      path.reverse();
      return path;
    }

    const isOrigin = current.x === from.x && current.y === from.y;
    if (respectZoc && !isOrigin && inEnemyZoc(state, unit, current.x, current.y)) continue;

    for (const step of NEIGHBOURS) {
      const nx = current.x + step.x;
      const ny = current.y + step.y;
      if (!canEnter(state, unit, nx, ny)) continue;
      const blocker = unitAt(state, nx, ny);
      if (blocker && blocker.faction !== unit.faction) continue;
      const isDest = nx === to.x && ny === to.y;
      if (blocker && blocker.id !== unit.id && isDest) continue;

      const cost = current.cost + tileAt(state, nx, ny).moveCost;
      if (cost > budget) continue;
      const nextKey = key(nx, ny);
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, cost);
      cameFrom.set(nextKey, currentKey);
      frontier.push({ x: nx, y: ny, cost });
    }
  }

  return null;
}

export function attackRange(state: GameState, unit: Unit): { min: number; max: number } {
  const def = UNIT_TYPES[unit.type];
  const terrain = tileAt(state, unit.x, unit.y);
  const weaponBonus = WEAPONS[unit.weapon]?.rangeBonus ?? 0;
  return {
    min: Math.max(1, def.minRange + (WEAPONS[unit.weapon]?.minRangeBonus ?? 0)),
    max: def.maxRange + terrain.rangeBonus + weaponBonus,
  };
}

/** 当前站位上的全部攻击半径格子（含空地），供 UI 红圈叠加。 */
export function attackRangeTiles(state: GameState, unit: Unit): Vec2[] {
  const { min, max } = attackRange(state, unit);
  const tiles: Vec2[] = [];
  for (let y = Math.max(0, unit.y - max); y <= Math.min(state.height - 1, unit.y + max); y += 1) {
    for (let x = Math.max(0, unit.x - max); x <= Math.min(state.width - 1, unit.x + max); x += 1) {
      if (x === unit.x && y === unit.y) continue;
      const distance = Math.abs(x - unit.x) + Math.abs(y - unit.y);
      if (distance >= min && distance <= max) tiles.push({ x, y });
    }
  }
  return tiles;
}

export function canAttack(state: GameState, attacker: Unit, defender: Unit): boolean {
  if (!attacker.alive || !defender.alive) return false;
  if (attacker.evacuated || defender.evacuated) return false;
  if (attacker.faction === defender.faction) return false;
  const { min, max } = attackRange(state, attacker);
  const distance = manhattan(attacker, defender);
  return distance >= min && distance <= max;
}

export function attackableTargets(state: GameState, unit: Unit): Unit[] {
  return state.units.filter((u) => canAttack(state, unit, u));
}

export function adjacentAllies(state: GameState, unit: Unit): number {
  return NEIGHBOURS.reduce((count, step) => {
    const other = unitAt(state, unit.x + step.x, unit.y + step.y);
    return other && other.faction === unit.faction ? count + 1 : count;
  }, 0);
}

export function orthogonalNeighbours(pos: Vec2): Vec2[] {
  return NEIGHBOURS.map((step) => ({ x: pos.x + step.x, y: pos.y + step.y }));
}
