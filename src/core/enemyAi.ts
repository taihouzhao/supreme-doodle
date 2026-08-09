import { UNIT_TYPES } from "../content/units";
import { COUNTER_RATIO, estimateDamageFrom } from "./combat";
import {
  livingUnits,
  manhattan,
  reachableTiles,
  resupplyTargets,
  tileAt,
  unitAt,
} from "./grid";
import type { ReachableTile } from "./grid";
import {
  performAttack,
  performCapture,
  performMove,
  performResupply,
  performWait,
} from "./resolve";
import type { GameEvent, GameState, Unit, Vec2 } from "./types";

/** 防守型关卡里，敌人不会离开阵地太远去追人 */
const DEFENDER_LEASH = 7;

function rangeFrom(state: GameState, unit: Unit, pos: Vec2): { min: number; max: number } {
  const def = UNIT_TYPES[unit.type];
  const bonus = tileAt(state, pos.x, pos.y).rangeBonus;
  return { min: def.minRange, max: def.maxRange + bonus };
}

function canCounterFrom(state: GameState, attacker: Unit, defender: Unit, from: Vec2): boolean {
  if (UNIT_TYPES[attacker.type].indirect) return false;
  const range = rangeFrom(state, defender, { x: defender.x, y: defender.y });
  const distance = manhattan(from, defender);
  return distance >= range.min && distance <= range.max;
}

interface AttackPlan {
  tile: ReachableTile;
  target: Unit;
  score: number;
}

function bestAttackPlan(state: GameState, unit: Unit, tiles: ReachableTile[]): AttackPlan | null {
  const targets = livingUnits(state, "player");
  let best: AttackPlan | null = null;
  const artillery = unit.type === "artillery";

  for (const tile of tiles) {
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    const range = rangeFrom(state, unit, tile);
    const moved = tile.cost > 0;
    const terrain = tileAt(state, tile.x, tile.y);

    for (const target of targets) {
      const distance = manhattan(tile, target);
      if (distance < range.min || distance > range.max) continue;

      const damage = estimateDamageFrom(state, unit, target, tile, moved);
      const counter = canCounterFrom(state, unit, target, tile)
        ? estimateDamageFrom(state, target, unit, { x: target.x, y: target.y }, false) *
          COUNTER_RATIO
        : 0;

      let score = damage - counter * 0.7;
      score += terrain.defense * 25;
      score -= tile.cost * 0.2;
      if (target.hp <= damage) score += 30;

      // 敌炮：偏好阵地（高地/工事）、架设射击，避免贴脸；移动会丢掉 setupBonus
      if (artillery) {
        if (!moved) score += 18;
        if (terrain.id === "hill" || terrain.id === "fort") score += 22;
        if (distance <= 2) score -= 25;
        // 脆弱窗口：刚移动的炮更怕被近战摸到，优先远距离目标
        if (moved && distance <= 3) score -= 12;
      }

      if (
        !best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) < 1e-9 &&
          (tile.y < best.tile.y || (tile.y === best.tile.y && tile.x < best.tile.x)))
      ) {
        best = { tile, target, score };
      }
    }
  }

  return best;
}

function lostObjective(state: GameState, unit: Unit): Vec2 | null {
  if (!UNIT_TYPES[unit.type].canCapture) return null;
  const lost = state.objectives.filter((o) => o.kind === "capture" && o.owner === "player");
  if (lost.length === 0) return null;
  const target = lost.reduce((closest, candidate) =>
    manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
  );
  return { x: target.x, y: target.y };
}

function goalFor(state: GameState, unit: Unit): Vec2 | null {
  const players = livingUnits(state, "player");
  if (players.length === 0) return null;

  const nearestPlayer = players.reduce((closest, candidate) =>
    manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
  );

  // —— 战役专属敌 AI 指纹（≥4 关可辨识行为）——
  const mid = state.missionId;

  // m2 云山：能占领的单位优先夺回城南公路桥；其余按通用逻辑
  if (mid === "m2-unsan") {
    const bridge = state.objectives.find((o) => o.id === "south-road-bridge");
    if (bridge && bridge.owner === "player" && UNIT_TYPES[unit.type].canCapture) {
      return { x: bridge.x, y: bridge.y };
    }
  }

  // m4 长津：沿 MSR 清障，优先靠近路障目标
  if (mid === "m4-chosin") {
    const blocks = state.objectives.filter((o) => o.kind === "hold");
    if (blocks.length > 0 && unit.type !== "artillery") {
      const target = blocks.reduce((closest, candidate) =>
        manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
      );
      return { x: target.x, y: target.y };
    }
  }

  // m8 临津：机枪/坦克钉桥头轴；步兵偏 235——可辨识但不封死双目标种子
  if (mid === "m8-imjin") {
    const bridge = state.objectives.find((o) => o.id === "imjin-bridgehead");
    const hill = state.objectives.find((o) => o.id === "gloster-hill");
    if ((unit.type === "mg" || unit.type === "tank") && bridge) {
      return { x: bridge.x, y: bridge.y };
    }
    if (hill && unit.type === "rifle" && state.turn >= 5 && unit.y <= 9) {
      return { x: hill.x, y: hill.y };
    }
  }

  // m9 铁原：前两波优先压公路口（hold），后期才追北撤轴——避免堵死撤离造成无解种子
  if (mid === "m9-cheorwon" && unit.type !== "artillery" && unit.type !== "mortar") {
    const roadMouth = state.objectives.find((o) => o.kind === "hold");
    if (roadMouth && state.turn <= 6) {
      return { x: roadMouth.x, y: roadMouth.y };
    }
    // 后期：略偏北追，但仍落在最近玩家邻域，保留交火
    const northernmost = players.reduce((best, candidate) =>
      candidate.y < best.y || (candidate.y === best.y && candidate.x < best.x) ? candidate : best,
    );
    if (manhattan(unit, northernmost) <= manhattan(unit, nearestPlayer) + 1) {
      return { x: northernmost.x, y: northernmost.y };
    }
  }

  // m10 上甘岭：步兵压玩家据点；炮兵偏好南缘高地但保持可射击最近目标（由 bestAttackPlan 主导）
  if (mid === "m10-triangle-hill" && unit.type !== "artillery") {
    const posts = state.objectives.filter((o) => o.kind === "hold" && o.owner === "player");
    if (posts.length > 0) {
      const target = posts.reduce((closest, candidate) =>
        manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
      );
      return { x: target.x, y: target.y };
    }
  }

  if (state.missionKind === "hold") {
    const held = state.objectives.filter((o) => o.kind === "hold" && o.owner === "player");
    if (held.length > 0) {
      const target = held.reduce((closest, candidate) =>
        manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
      );
      return { x: target.x, y: target.y };
    }
    return { x: nearestPlayer.x, y: nearestPlayer.y };
  }

  if (state.missionKind === "breakthrough") {
    const retake = lostObjective(state, unit);
    if (retake) return retake;
    if (manhattan(unit, nearestPlayer) > DEFENDER_LEASH) return null;
  }

  return { x: nearestPlayer.x, y: nearestPlayer.y };
}

function bestApproachTile(
  state: GameState,
  unit: Unit,
  tiles: ReachableTile[],
  goal: Vec2,
): ReachableTile | null {
  let best: ReachableTile | null = null;
  let bestKey: [number, number] = [Infinity, -Infinity];

  for (const tile of tiles) {
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    const distance = manhattan(tile, goal);
    const defense = tileAt(state, tile.x, tile.y).defense;
    if (distance < bestKey[0] || (distance === bestKey[0] && defense > bestKey[1])) {
      best = tile;
      bestKey = [distance, defense];
    }
  }

  return best;
}

/** 确定性脚本 AI：同一状态永远产生同一批动作 */
export function runEnemyPhase(state: GameState, events: GameEvent[]): void {
  const order = livingUnits(state, "enemy")
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of order) {
    if (!unit.alive || unit.hasActed) continue;
    if (state.status !== "playing") return;

    if (performCapture(state, unit, events)) continue;

    // 后勤：优先补充重伤友军
    if (unit.type === "logistics") {
      const needy = resupplyTargets(state, unit)
        .slice()
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id));
      if (needy[0] && performResupply(state, unit, needy[0], events)) continue;
      const wounded = livingUnits(state, "enemy")
        .filter((ally) => ally.id !== unit.id && ally.hp < ally.maxHp * 0.7)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0];
      if (wounded) {
        const tiles = reachableTiles(state, unit);
        const approach = bestApproachTile(state, unit, tiles, wounded);
        if (approach && approach.cost > 0) {
          performMove(state, unit, { x: approach.x, y: approach.y }, events);
        }
        const after = resupplyTargets(state, unit).sort(
          (a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id),
        )[0];
        if (after) performResupply(state, unit, after, events);
        else if (unit.alive && !unit.hasActed) performWait(state, unit);
        continue;
      }
    }

    const tiles = reachableTiles(state, unit);
    const retake = lostObjective(state, unit);
    if (retake) {
      const spot = tiles.find((t) => t.x === retake.x && t.y === retake.y);
      if (spot && !unitAt(state, spot.x, spot.y)) {
        performMove(state, unit, { x: spot.x, y: spot.y }, events);
        if (performCapture(state, unit, events)) continue;
      }
    }

    const plan = bestAttackPlan(state, unit, tiles);

    if (plan) {
      if (plan.tile.cost > 0) {
        performMove(state, unit, { x: plan.tile.x, y: plan.tile.y }, events);
      }
      performAttack(state, unit, plan.target, events);
      continue;
    }

    const goal = goalFor(state, unit);
    if (goal) {
      const approach = bestApproachTile(state, unit, tiles, goal);
      if (approach && approach.cost > 0) {
        performMove(state, unit, { x: approach.x, y: approach.y }, events);
      }
    }

    if (unit.alive && !unit.hasActed) performWait(state, unit);
  }
}
