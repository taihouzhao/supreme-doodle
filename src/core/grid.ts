import { TERRAIN } from "../content/terrain";
import { BALANCE } from "../content/balance";
import { LOGISTICS, UNIT_TYPES } from "../content/units";
import { WEAPONS, weaponPattern } from "../content/weapons";
import {
  coordinationRelay,
  hasWeaponCooldown,
  ignoresVehicleTerrain,
  isMotorized,
  requiresSetup,
  resupplyRange,
} from "./equipment";
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
  if (isMotorized(unit) && !ignoresVehicleTerrain(unit) && !terrain.vehiclePassable) return false;
  return true;
}

const NEIGHBOURS: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export interface EncirclementStatus {
  controlledSides: number;
  opposedAxis: boolean;
  encircled: boolean;
  multiplier: number;
}

/** 指定格周围有多少个敌方单位直接建立控制区。 */
export function enemyZocCountAt(
  state: GameState,
  unit: Pick<Unit, "faction">,
  x: number,
  y: number,
): number {
  return NEIGHBOURS.reduce((count, step) => {
    const other = unitAt(state, x + step.x, y + step.y);
    return other && other.faction !== unit.faction ? count + 1 : count;
  }, 0);
}

/**
 * 包围必须发生在守方四周：两支部队占住对向格，或至少三面受控。
 * 这与“攻方身边有友军”的普通夹击分开，给围堵路线一个清晰、可预测的收益。
 */
export function encirclementStatus(
  state: GameState,
  defender: Unit,
  attackingFaction: Unit["faction"],
  projectedAttacker?: { id: string; x: number; y: number },
): EncirclementStatus {
  const controlled = NEIGHBOURS.map((step) => {
    const x = defender.x + step.x;
    const y = defender.y + step.y;
    if (projectedAttacker && projectedAttacker.x === x && projectedAttacker.y === y) return true;
    const unit = unitAt(state, x, y);
    if (!unit || unit.faction !== attackingFaction) return false;
    if (projectedAttacker && unit.id === projectedAttacker.id) return false;
    return true;
  });
  const controlledSides = controlled.filter(Boolean).length;
  const opposedAxis = (controlled[0] && controlled[2]) || (controlled[1] && controlled[3]);
  const encircled = Boolean(opposedAxis || controlledSides >= 3);
  let bonus = 0;
  if (controlledSides >= 4) bonus = BALANCE.encirclement.fourSides;
  else if (controlledSides >= 3) bonus = BALANCE.encirclement.threeSides;
  else if (opposedAxis) bonus = BALANCE.encirclement.opposedAxes;
  return { controlledSides, opposedAxis: Boolean(opposedAxis), encircled, multiplier: 1 + bonus };
}

/** 从接触中脱离的额外成本；多面受压时会显著拖慢撤出。 */
export function disengagementCostAt(
  state: GameState,
  unit: Pick<Unit, "faction">,
  x: number,
  y: number,
): number {
  return Math.min(
    BALANCE.disengagement.cap,
    enemyZocCountAt(state, unit, x, y) * BALANCE.disengagement.perEnemy,
  );
}

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
  return enemyZocCountAt(state, unit, x, y) > 0;
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

      const disengage = isOrigin ? disengagementCostAt(state, unit, current.x, current.y) : 0;
      const cost = current.cost + tileAt(state, nx, ny).moveCost + disengage;
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

      const disengage =
        respectZoc && isOrigin ? disengagementCostAt(state, unit, current.x, current.y) : 0;
      const cost = current.cost + tileAt(state, nx, ny).moveCost + disengage;
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
  const weapon = WEAPONS[unit.weapon];
  const stationary = !unit.movedThisTurn;
  const stationaryMin = stationary && (weapon?.stationaryMinRange ?? weapon?.fixedRange?.min) !== undefined
    ? (weapon?.stationaryMinRange ?? weapon?.fixedRange?.min)!
    : weapon?.mobileRange?.min ?? def.minRange + (weapon?.minRangeBonus ?? 0);
  const stationaryMax = stationary && (weapon?.stationaryMaxRange ?? weapon?.fixedRange?.max) !== undefined
    ? (weapon?.stationaryMaxRange ?? weapon?.fixedRange?.max)!
    : weapon?.mobileRange?.max ?? def.maxRange + (weapon?.rangeBonus ?? 0);
  const rangefinder = stationary && unit.attachment === "rangefinder" ? 1 : 0;
  const equipmentBonus = Math.min(2, Math.max(-2, stationaryMax - def.maxRange + rangefinder));
  return {
    min: Math.max(1, stationaryMin),
    max: def.maxRange + terrain.rangeBonus + equipmentBonus,
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
  if (UNIT_TYPES[attacker.type].attack <= 0) return false;
  if (hasWeaponCooldown(attacker, state.turn)) return false;
  if (requiresSetup(attacker) && attacker.movedThisTurn) return false;
  const { min, max } = attackRange(state, attacker);
  if (max < min) return false;
  const distance = manhattan(attacker, defender);
  return distance >= min && distance <= max;
}

/** 返回主目标之外的真实受影响格；边界外格子会被裁剪。 */
export function secondaryAttackTiles(state: GameState, attacker: Unit, defender: Unit): Vec2[] {
  const { pattern } = weaponPattern(attacker.weapon, attacker.type);
  if (pattern.kind === "single") return [];
  const tiles: Vec2[] = [];
  const add = (x: number, y: number) => {
    if (!inBounds(state, x, y)) return;
    if (x === defender.x && y === defender.y) return;
    if (!tiles.some((tile) => tile.x === x && tile.y === y)) tiles.push({ x, y });
  };
  if (pattern.kind === "line") {
    const stepX = Math.sign(defender.x - attacker.x);
    const stepY = Math.sign(defender.y - attacker.y);
    for (let i = 1; i <= pattern.depth; i += 1) add(defender.x + stepX * i, defender.y + stepY * i);
  } else if (pattern.kind === "cross") {
    for (let y = defender.y - pattern.radius; y <= defender.y + pattern.radius; y += 1) {
      for (let x = defender.x - pattern.radius; x <= defender.x + pattern.radius; x += 1) {
        if (Math.abs(x - defender.x) + Math.abs(y - defender.y) <= pattern.radius) add(x, y);
      }
    }
  } else if (pattern.kind === "radius") {
    for (let y = defender.y - pattern.radius; y <= defender.y + pattern.radius; y += 1) {
      for (let x = defender.x - pattern.radius; x <= defender.x + pattern.radius; x += 1) {
        if (Math.max(Math.abs(x - defender.x), Math.abs(y - defender.y)) <= pattern.radius) add(x, y);
      }
    }
  }
  return tiles;
}

/** 后勤正交相邻的存活友军（含已满员，供 UI 提示） */
export function adjacentFriendlyUnits(state: GameState, unit: Unit): Unit[] {
  if (!unit.alive || unit.evacuated) return [];
  const out: Unit[] = [];
  for (const step of NEIGHBOURS) {
    const other = unitAt(state, unit.x + step.x, unit.y + step.y);
    if (!other || other.faction !== unit.faction || !other.alive || other.evacuated) continue;
    if (other.id === unit.id) continue;
    out.push(other);
  }
  return out;
}

/** 友军此刻是否可被后勤补充 */
export function needsResupply(state: GameState, ally: Unit): boolean {
  const ammoActive = state.scripted.some(
    (rule) => rule.kind === "supplyWindow" && state.turn > rule.untilTurn,
  );
  const needsAmmo =
    ammoActive &&
    ally.faction === "player" &&
    (ally.supplyRestoredUntil ?? 0) < state.turn;
  return ally.hp < ally.maxHp || ally.fatigue > 0 || needsAmmo;
}

export interface ResupplyOutcome {
  personnel: number;
  fatigueRelief: number;
  ammoRestored: boolean;
  sourceHpAfter: number;
  targetHpAfter: number;
}

/** 与实际补充共用的纯计算：不修改单位，也不消耗随机流。 */
export function resupplyOutcome(state: GameState, unit: Unit, target: Unit): ResupplyOutcome {
  const missing = Math.max(0, target.maxHp - target.hp);
  const transferable = Math.max(0, unit.hp - LOGISTICS.minimumPersonnel);
  const personnel = Math.min(LOGISTICS.personnelPerAction, transferable, missing);
  const fatigueRelief = Math.min(LOGISTICS.fatigueRelief, target.fatigue);
  const ammoRestored =
    target.faction === "player" &&
    state.scripted.some((rule) => rule.kind === "supplyWindow" && state.turn > rule.untilTurn) &&
    (target.supplyRestoredUntil ?? 0) < state.turn;
  return {
    personnel,
    fatigueRelief,
    ammoRestored,
    sourceHpAfter: unit.hp - personnel,
    targetHpAfter: target.hp + personnel,
  };
}

/** 后勤可补充的正交相邻友军（未满员、仍有疲劳，或我方弹药窗口已过期） */
export function resupplyTargets(state: GameState, unit: Unit): Unit[] {
  if (unit.type !== "logistics" || !unit.alive || unit.evacuated) return [];
  const range = resupplyRange(unit);
  return livingUnits(state, unit.faction).filter((ally) => {
    if (ally.id === unit.id || manhattan(unit, ally) > range) return false;
    if (!needsResupply(state, ally)) return false;
    const outcome = resupplyOutcome(state, unit, ally);
    // 缺编需要真实人力；后勤队降到最低机动编制后仍可处理疲劳/弹药，但不会再凭空回血。
    if (ally.hp < ally.maxHp && outcome.personnel <= 0) return false;
    return outcome.personnel > 0 || outcome.fatigueRelief > 0 || outcome.ammoRestored;
  });
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

/**
 * 能够对同一目标形成覆盖的友军数。
 * 这里不要求这些单位本回合仍有行动点，表示的是「已经建立的火力呼应」；
 * 后勤不计入火力覆盖，但可以通过相邻位置提供有限的近距离支援。
 */
export function coordinationAllies(state: GameState, attacker: Unit, defender: Unit): number {
  return coordinationSources(state, attacker, defender).length;
}

/** 协同来源明细：普通友军 4 格，电话静止中继 5 格，SCR-300 移动中继 7 格。 */
export function coordinationSources(state: GameState, attacker: Unit, defender: Unit): string[] {
  return livingUnits(state, attacker.faction)
    .filter((ally) => {
      if (ally.id === attacker.id || ally.type === "logistics" && !coordinationRelay(ally)) return false;
      const relay = coordinationRelay(ally);
      if (relay?.staticOnly && ally.movedThisTurn) return false;
      const radius = relay?.radius ?? 4;
      if (manhattan(ally, attacker) > radius) return false;
      if (hasWeaponCooldown(ally, state.turn) || (requiresSetup(ally) && ally.movedThisTurn)) return false;
      // 电话/电台本身就是中继节点，即使所属后勤单位没有攻击力，也能把相邻火力接入网络。
      if (relay) return true;
      const range = attackRange(state, ally);
      const distance = manhattan(ally, defender);
      return distance >= range.min && distance <= range.max;
    })
    .map((ally) => {
      const relay = coordinationRelay(ally);
      return relay ? `${ally.name}·${relay.label}` : `${ally.name}·普通火力呼应`;
    });
}

/**
 * 守方的相互掩护单位数：相邻单位或能够反击当前攻方的单位均算入，
 * 但不把守方本身重复计算。这样远程火力也会影响近战单位是否贸然接触。
 */
export function defensiveSupportAllies(state: GameState, defender: Unit, attacker: Unit): number {
  return livingUnits(state, defender.faction).filter((ally) => {
    if (ally.id === defender.id || ally.type === "logistics") return false;
    if (manhattan(ally, defender) === 1) return true;
    const range = attackRange(state, ally);
    const distance = manhattan(ally, attacker);
    return distance >= range.min && distance <= range.max;
  }).length;
}

export function orthogonalNeighbours(pos: Vec2): Vec2[] {
  return NEIGHBOURS.map((step) => ({ x: pos.x + step.x, y: pos.y + step.y }));
}
