import { UNIT_TYPES, VETERANCY } from "../content/units";
import { COUNTER_RATIO, estimateDamageFrom } from "../core/combat";
import {
  attackableTargets,
  livingUnits,
  manhattan,
  reachableTiles,
  tileAt,
  unitAt,
} from "../core/grid";
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
  const def = UNIT_TYPES[defender.type];
  const bonus = tileAt(state, defender.x, defender.y).rangeBonus;
  const distance = manhattan(attacker, defender);
  return distance >= def.minRange && distance <= def.maxRange + bonus;
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

export function evacGoal(state: GameState, unit: Unit): Vec2 | null {
  return nearest(unit, state.evacZone);
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
      const range = def.maxRange + tileAt(state, tile.x, tile.y).rangeBonus;
      for (let dy = -range; dy <= range; dy += 1) {
        const span = range - Math.abs(dy);
        for (let dx = -span; dx <= span; dx += 1) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance < def.minRange) continue;
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
