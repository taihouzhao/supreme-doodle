import { traitScoreBonus } from "../content/enemyAdapt";
import { UNIT_TYPES } from "../content/units";
import { COUNTER_RATIO, estimateDamageFrom } from "./combat";
import {
  attackRange,
  canEnter,
  encirclementStatus,
  livingUnits,
  manhattan,
  orthogonalNeighbours,
  reachableTiles,
  resupplyTargets,
  tileAt,
  unitAt,
} from "./grid";
import { effectiveIndirect } from "./equipment";
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

function rangeFrom(state: GameState, unit: Unit, pos: Vec2, moved = false): { min: number; max: number } {
  return attackRange(state, { ...unit, x: pos.x, y: pos.y, movedThisTurn: moved });
}

function canCounterFrom(state: GameState, attacker: Unit, defender: Unit, from: Vec2): boolean {
  if (defender.type !== "rifle" && defender.type !== "mg") return false;
  if (effectiveIndirect(attacker)) return false;
  const range = rangeFrom(state, defender, { x: defender.x, y: defender.y });
  const distance = manhattan(from, defender);
  return distance >= range.min && distance <= range.max;
}

interface AttackPlan {
  tile: ReachableTile;
  target: Unit;
  score: number;
}

interface EnemyBattlePlan {
  focusTargetId: string | null;
}

/**
 * 敌方整回合共享一个集火目标。目标会随伤亡重新计算，避免每支单位各打各的；
 * 后勤、曲射和正在守目标的单位具有更高战术价值，但不会无条件越过战线追杀。
 */
function buildEnemyBattlePlan(state: GameState): EnemyBattlePlan {
  const targets = livingUnits(state, "player");
  let focusTargetId: string | null = null;
  let best = -Infinity;
  for (const target of targets) {
    const hpRatio = target.hp / Math.max(1, target.maxHp);
    const onObjective = state.objectives.some(
      (objective) => objective.x === target.x && objective.y === target.y,
    );
    let score = (1 - hpRatio) * 72;
    if (target.type === "logistics") score += 22;
    if (target.type === "artillery" || target.type === "mortar") score += 18;
    // AI 只能从战场态势判断目标价值，不读取“主角/关键单位”这一层任务元数据。
    // 这样集火仍然聪明，但不会以不可见信息无条件追杀任务失败点。
    if (onObjective) score += 20;
    score -= Math.min(24, Math.min(...livingUnits(state, "enemy").map((unit) => manhattan(unit, target))) * 3);
    if (score > best || (Math.abs(score - best) < 1e-9 && target.id < (focusTargetId ?? "~"))) {
      best = score;
      focusTargetId = target.id;
    }
  }
  return { focusTargetId };
}

function formationSupportAt(state: GameState, unit: Unit, tile: Vec2): number {
  return livingUnits(state, unit.faction).filter(
    (ally) => ally.id !== unit.id && manhattan(ally, tile) <= 2,
  ).length;
}

/** 只看已建立的火力覆盖，给 AI 一个“不要单独冲出阵形”的风险估计。 */
function incomingThreatAt(state: GameState, unit: Unit, tile: Vec2): number {
  const projected: Unit = { ...unit, x: tile.x, y: tile.y };
  let threat = 0;
  for (const enemy of livingUnits(state, "player")) {
    const range = attackRange(state, enemy);
    const distance = manhattan(enemy, projected);
    if (distance < range.min || distance > range.max) continue;
    threat += estimateDamageFrom(state, enemy, projected, { x: enemy.x, y: enemy.y }, false);
  }
  return threat;
}

function bestAttackPlan(
  state: GameState,
  unit: Unit,
  tiles: ReachableTile[],
  battlePlan: EnemyBattlePlan,
): AttackPlan | null {
  const targets = livingUnits(state, "player");
  let best: AttackPlan | null = null;
  const artillery = unit.type === "artillery";
  const guardingObjective = state.objectives.some(
    (objective) =>
      objective.kind === "capture" &&
      objective.owner === "enemy" &&
      objective.x === unit.x &&
      objective.y === unit.y,
  );

  for (const tile of tiles) {
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    const moved = tile.cost > 0;
    const range = rangeFrom(state, unit, tile, moved);
    const terrain = tileAt(state, tile.x, tile.y);
    const formationSupport = Math.min(18, formationSupportAt(state, unit, tile) * 5);
    const incomingThreat = incomingThreatAt(state, unit, tile) * 0.22;

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
      if (guardingObjective && (tile.x !== unit.x || tile.y !== unit.y)) score -= 64;
      if (target.hp <= damage) score += 30;
      if (target.id === battlePlan.focusTargetId) score += 34;
      if (target.type === "logistics") score += 12;
      if (target.type === "artillery" || target.type === "mortar") score += 8;

      const surround = encirclementStatus(state, target, unit.faction, {
        id: unit.id,
        x: tile.x,
        y: tile.y,
      });
      score += (surround.multiplier - 1) * 115;
      score += formationSupport;
      score -= incomingThreat;

      const traits = traitScoreBonus(
        state.missionId,
        state.missionKind,
        state.turn,
        state.adaptFactor ?? 1,
      );
      score += (surround.multiplier - 1) * traits.flank * 0.35;
      if (target.type === "artillery" || target.type === "mortar") score += traits.artyPriority;
      if (
        state.objectives.some(
          (objective) => objective.x === target.x && objective.y === target.y && objective.owner === "player",
        )
      ) {
        score += traits.holdObjective * 0.4;
      }
      score += traits.chase * 0.15;

      // 敌炮：偏好阵地（高地/工事）、架设射击，避免贴脸；移动会丢掉 setupBonus
      if (artillery) {
        if (!moved) score += 18;
        if (terrain.id === "hill" || terrain.id === "fort") score += 22;
        if (distance <= 2) score -= 25;
        // 脆弱窗口：刚移动的炮更怕被近战摸到，优先远距离目标
        if (moved && distance <= 3) score -= 12;
        score += traits.artyPriority * 0.5;
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
  if (unit.type === "mg") return null;
  const lost = state.objectives.filter((o) => o.kind === "capture" && o.owner === "player");
  if (lost.length === 0) return null;
  const target = lost.reduce((closest, candidate) =>
    manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
  );
  return { x: target.x, y: target.y };
}

function defensiveAnchor(state: GameState, unit: Unit): Vec2 | null {
  if (
    state.missionKind !== "breakthrough" ||
    !["m3-chongchon", "m5-third-offensive", "m12-kumsong"].includes(state.missionId)
  )
    return null;
  const owned = state.objectives.filter(
    (objective) => objective.kind === "capture" && objective.owner === "enemy",
  );
  if (owned.length === 0) return null;
  const anchor = owned.reduce((closest, candidate) =>
    manhattan(unit, candidate) < manhattan(unit, closest) ? candidate : closest,
  );
  return manhattan(unit, anchor) <= 4 ? { x: anchor.x, y: anchor.y } : null;
}

function weakestHeldObjective(state: GameState): Vec2 | null {
  const held = state.objectives.filter(
    (objective) => objective.kind === "hold" && objective.owner === "player",
  );
  if (held.length === 0) return null;
  const strength = (objective: Vec2): number =>
    livingUnits(state, "player")
      .filter((unit) => manhattan(unit, objective) <= 2)
      .reduce((total, unit) => total + unit.hp, 0);
  const target = held.reduce((weakest, candidate) => {
    const delta = strength(candidate) - strength(weakest);
    if (delta < 0) return candidate;
    if (delta === 0 && candidate.id < weakest.id) return candidate;
    return weakest;
  });
  return { x: target.x, y: target.y };
}

function withdrawalCutoffGoal(state: GameState, unit: Unit): Vec2 | null {
  if (
    state.missionKind !== "withdraw" ||
    state.evacZone.length === 0 ||
    !["m4-chosin", "m7-chipyongni", "m9-cheorwon"].includes(state.missionId)
  )
    return null;
  const players = livingUnits(state, "player");
  if (players.length === 0) return null;
  const runner = players.reduce((closest, candidate) => {
    const candidateExit = Math.min(...state.evacZone.map((exit) => manhattan(candidate, exit)));
    const closestExit = Math.min(...state.evacZone.map((exit) => manhattan(closest, exit)));
    return candidateExit < closestExit ? candidate : closest;
  });
  const exit = state.evacZone.reduce((closest, candidate) =>
    manhattan(runner, candidate) < manhattan(runner, closest) ? candidate : closest,
  );
  const cutoffTeam = livingUnits(state, "enemy")
    .filter(
      (candidate) =>
        candidate.type !== "artillery" &&
        candidate.type !== "mortar" &&
        candidate.type !== "logistics",
    )
    .sort((a, b) => manhattan(a, exit) - manhattan(b, exit) || a.id.localeCompare(b.id))
    .slice(0, state.missionId === "m9-cheorwon" ? 1 : 2);
  return state.turn >= 2 && cutoffTeam.some((candidate) => candidate.id === unit.id)
    ? { x: exit.x, y: exit.y }
    : null;
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
    const target = weakestHeldObjective(state);
    if (target) return target;
  }

  if (state.missionKind === "hold") {
    const target = weakestHeldObjective(state);
    if (target) return target;
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
  battlePlan?: EnemyBattlePlan,
): ReachableTile | null {
  let best: ReachableTile | null = null;
  let bestScore = -Infinity;
  const focus = battlePlan?.focusTargetId
    ? state.units.find((candidate) => candidate.id === battlePlan.focusTargetId)
    : null;

  for (const tile of tiles) {
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    const distance = manhattan(tile, goal);
    const defense = tileAt(state, tile.x, tile.y).defense;
    let score = -distance * 18 + defense * 36 - tile.cost * 0.4;
    score += Math.min(20, formationSupportAt(state, unit, tile) * 6);
    // 只把已知火力当作风险提示；AI 不应像读取伤害表一样精确规避每个格子。
    score -= incomingThreatAt(state, unit, tile) * 0.14;
    if (focus && manhattan(tile, focus) === 1) {
      score +=
        (encirclementStatus(state, focus, unit.faction, {
          id: unit.id,
          x: tile.x,
          y: tile.y,
        }).multiplier -
          1) *
        120;
    }
    if (
      score > bestScore + 1e-9 ||
      (Math.abs(score - bestScore) < 1e-9 &&
        (!best || tile.y < best.y || (tile.y === best.y && tile.x < best.x)))
    ) {
      best = tile;
      bestScore = score;
    }
  }

  return best;
}

function flankingGoal(
  state: GameState,
  unit: Unit,
  battlePlan: EnemyBattlePlan,
): Vec2 | null {
  if (unit.type === "artillery" || unit.type === "mortar" || unit.type === "logistics") return null;
  const target = battlePlan.focusTargetId
    ? state.units.find((candidate) => candidate.id === battlePlan.focusTargetId && candidate.alive)
    : null;
  if (!target || manhattan(unit, target) > 7) return null;

  const candidates = orthogonalNeighbours(target).filter((tile) => {
    if (!canEnter(state, unit, tile.x, tile.y)) return false;
    const occupant = unitAt(state, tile.x, tile.y);
    return !occupant || occupant.id === unit.id;
  });
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (const tile of candidates) {
    const surround = encirclementStatus(state, target, unit.faction, {
      id: unit.id,
      x: tile.x,
      y: tile.y,
    });
    const score =
      (surround.multiplier - 1) * 180 -
      manhattan(unit, tile) * 7 -
      incomingThreatAt(state, unit, tile) * 0.18;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

function bestRetreatTile(
  state: GameState,
  unit: Unit,
  tiles: ReachableTile[],
): ReachableTile | null {
  const logistics = livingUnits(state, unit.faction).filter((ally) => ally.type === "logistics");
  let best: ReachableTile | null = null;
  let bestScore = -Infinity;
  for (const tile of tiles) {
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    const nearestLogistics = logistics.length
      ? Math.min(...logistics.map((ally) => manhattan(tile, ally)))
      : 6;
    const score =
      tileAt(state, tile.x, tile.y).defense * 55 +
      formationSupportAt(state, unit, tile) * 8 -
      incomingThreatAt(state, unit, tile) * 0.5 -
      nearestLogistics * 2;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

/** 确定性脚本 AI：同一状态永远产生同一批动作 */
export function runEnemyPhase(state: GameState, events: GameEvent[]): void {
  const order = livingUnits(state, "enemy")
    .slice()
    .sort((a, b) => {
      const priority: Record<Unit["type"], number> = {
        artillery: 0,
        mortar: 1,
        mg: 2,
        tank: 3,
        armored_car: 3,
        rifle: 4,
        logistics: 5,
      };
      return priority[a.type] - priority[b.type] || a.id.localeCompare(b.id);
    });

  for (const unit of order) {
    if (!unit.alive || unit.hasActed) continue;
    if (state.status !== "playing") return;
    const battlePlan = buildEnemyBattlePlan(state);

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
        const approach = bestApproachTile(state, unit, tiles, wounded, battlePlan);
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

    const plan = bestAttackPlan(state, unit, tiles, battlePlan);

    const onObjective = state.objectives.some(
      (objective) => objective.x === unit.x && objective.y === unit.y && objective.owner === "enemy",
    );
    const hasRecoveryLine = livingUnits(state, "enemy").some(
      (ally) => ally.type === "logistics" && manhattan(ally, unit) <= 5,
    );
    if (
      unit.hp / unit.maxHp < 0.34 &&
      !onObjective &&
      hasRecoveryLine &&
      formationSupportAt(state, unit, unit) > 0 &&
      (!plan || plan.score < 28)
    ) {
      const retreat = bestRetreatTile(state, unit, tiles);
      if (retreat && retreat.cost > 0) {
        performMove(state, unit, { x: retreat.x, y: retreat.y }, events);
      }
      if (unit.alive && !unit.hasActed) performWait(state, unit);
      continue;
    }

    if (plan) {
      if (plan.tile.cost > 0) {
        performMove(state, unit, { x: plan.tile.x, y: plan.tile.y }, events);
      }
      performAttack(state, unit, plan.target, events);
      continue;
    }

    const retakeGoal = ["m3-chongchon", "m6-hoengsong"].includes(state.missionId)
      ? lostObjective(state, unit)
      : null;
    const goal =
      retakeGoal ??
      defensiveAnchor(state, unit) ??
      withdrawalCutoffGoal(state, unit) ??
      flankingGoal(state, unit, battlePlan) ??
      goalFor(state, unit);
    if (goal) {
      const approach = bestApproachTile(state, unit, tiles, goal, battlePlan);
      if (approach && approach.cost > 0) {
        performMove(state, unit, { x: approach.x, y: approach.y }, events);
      }
    }

    if (unit.alive && !unit.hasActed) performWait(state, unit);
  }
}
