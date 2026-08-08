import { ITEMS, ITEM_IDS } from "../content/items";
import { getMission } from "../content/missions";
import { UNIT_TYPES } from "../content/units";
import { runEnemyPhase } from "./enemyAi";
import { attackableTargets, livingUnits, manhattan, reachableTiles, unitAt } from "./grid";
import {
  arriveWaves,
  beginPhase,
  evaluateVictory,
  runScripted,
  runUpkeep,
  updateCaptureStreak,
} from "./mission";
import { performAttack, performCapture, performItem, performMove, performWait } from "./resolve";
import type { Action, ApplyResult, GameEvent, GameState, Unit } from "./types";

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function findUnit(state: GameState, unitId: string): Unit {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new IllegalActionError(`未知单位: ${unitId}`);
  return unit;
}

function requireActivePlayerUnit(state: GameState, unitId: string): Unit {
  const unit = findUnit(state, unitId);
  if (unit.faction !== state.phase) throw new IllegalActionError(`${unit.name} 不在当前阶段`);
  if (!unit.alive || unit.evacuated) throw new IllegalActionError(`${unit.name} 已离场`);
  if (unit.hasActed) throw new IllegalActionError(`${unit.name} 本回合已行动`);
  return unit;
}

function settleStatus(state: GameState, events: GameEvent[], atTurnEnd = false): boolean {
  if (state.status !== "playing") return true;
  const verdict = evaluateVictory(state, getMission(state.missionId).victory, atTurnEnd);
  if (verdict.status === "playing") return false;
  state.status = verdict.status;
  state.resultReason = verdict.reason;
  events.push({ type: "missionEnded", status: verdict.status, reason: verdict.reason });
  return true;
}

function advanceTurn(state: GameState, events: GameEvent[]): void {
  runUpkeep(state, "player", events);
  if (settleStatus(state, events)) return;

  beginPhase(state, "enemy");
  events.push({ type: "phaseChanged", phase: "enemy", turn: state.turn });
  runEnemyPhase(state, events);
  runUpkeep(state, "enemy", events);
  updateCaptureStreak(state, getMission(state.missionId).victory);
  if (settleStatus(state, events, true)) return;

  state.turn += 1;
  arriveWaves(state, events);
  runScripted(state, events);
  if (settleStatus(state, events, true)) return;
  beginPhase(state, "player");
  events.push({ type: "phaseChanged", phase: "player", turn: state.turn });
  settleStatus(state, events, true);
}

export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.status !== "playing") {
    return { state, events: [] };
  }

  const next = clone(state);
  const events: GameEvent[] = [];

  switch (action.kind) {
    case "move": {
      const unit = requireActivePlayerUnit(next, action.unitId);
      if (!performMove(next, unit, action.to, events)) {
        throw new IllegalActionError(`${unit.name} 无法移动到 (${action.to.x},${action.to.y})`);
      }
      break;
    }
    case "attack": {
      const unit = requireActivePlayerUnit(next, action.unitId);
      const target = findUnit(next, action.targetId);
      if (!performAttack(next, unit, target, events)) {
        throw new IllegalActionError(`${unit.name} 无法攻击 ${target.name}`);
      }
      break;
    }
    case "capture": {
      const unit = requireActivePlayerUnit(next, action.unitId);
      if (!performCapture(next, unit, events)) {
        throw new IllegalActionError(`${unit.name} 无法在此占领`);
      }
      break;
    }
    case "useItem": {
      const unit = requireActivePlayerUnit(next, action.unitId);
      const usage =
        action.to !== undefined
          ? { item: action.item, targetId: action.targetId, to: action.to }
          : { item: action.item, targetId: action.targetId };
      if (!performItem(next, unit, usage, events)) {
        throw new IllegalActionError(`${unit.name} 无法使用 ${ITEMS[action.item].name}`);
      }
      break;
    }
    case "wait": {
      const unit = requireActivePlayerUnit(next, action.unitId);
      performWait(next, unit);
      break;
    }
    case "endTurn": {
      advanceTurn(next, events);
      return { state: next, events };
    }
  }

  settleStatus(next, events);
  return { state: next, events };
}

/** 枚举当前阶段的全部合法动作，供随机 Agent 与界面高亮使用 */
export function legalActions(state: GameState): Action[] {
  if (state.status !== "playing") return [];
  const actions: Action[] = [{ kind: "endTurn" }];

  for (const unit of livingUnits(state, state.phase)) {
    if (unit.hasActed) continue;

    if (unit.mpLeft > 0) {
      for (const tile of reachableTiles(state, unit)) {
        if (tile.cost === 0) continue;
        const occupant = unitAt(state, tile.x, tile.y);
        if (occupant && occupant.id !== unit.id) continue;
        actions.push({ kind: "move", unitId: unit.id, to: { x: tile.x, y: tile.y } });
      }
    }

    for (const target of attackableTargets(state, unit)) {
      actions.push({ kind: "attack", unitId: unit.id, targetId: target.id });
    }

    if (UNIT_TYPES[unit.type].canCapture) {
      const objective = state.objectives.find(
        (o) => o.kind === "capture" && o.x === unit.x && o.y === unit.y && o.owner !== unit.faction,
      );
      if (objective) actions.push({ kind: "capture", unitId: unit.id });
    }

    if (unit.faction === "player") {
      for (const item of ITEM_IDS) {
        if ((state.inventory[item] ?? 0) <= 0) continue;
        const def = ITEMS[item];
        if (def.targeting === "self") {
          const canHeal = def.heal > 0 && unit.hp < unit.maxHp;
          const canFatigue = (def.fatigueRelief ?? 0) > 0 && unit.fatigue > 0;
          const canExp = (def.expGain ?? 0) > 0;
          if (canHeal || canFatigue || canExp) {
            actions.push({ kind: "useItem", unitId: unit.id, item });
          }
        } else if (def.targeting === "target") {
          for (const enemy of livingUnits(state, "enemy")) {
            if (manhattan(unit, enemy) > def.range) continue;
            if (def.antiArmorOnly && !UNIT_TYPES[enemy.type].vehicle) continue;
            actions.push({ kind: "useItem", unitId: unit.id, item, targetId: enemy.id });
          }
        } else {
          for (const enemy of livingUnits(state, "enemy")) {
            if (manhattan(unit, enemy) > def.range) continue;
            actions.push({
              kind: "useItem",
              unitId: unit.id,
              item,
              to: { x: enemy.x, y: enemy.y },
            });
          }
        }
      }
    }

    actions.push({ kind: "wait", unitId: unit.id });
  }

  return actions;
}

/** 状态哈希，用于确定性与重放测试 */
export function hashState(state: GameState): string {
  const parts: string[] = [
    state.missionId,
    String(state.turn),
    state.phase,
    state.status,
    String(state.rng),
    state.weather,
  ];
  for (const unit of state.units) {
    parts.push(
      [
        unit.id,
        unit.x,
        unit.y,
        unit.hp,
        Math.round(unit.exp * 100),
        Math.round(unit.fatigue * 100),
        unit.alive ? 1 : 0,
        unit.evacuated ? 1 : 0,
      ].join(":"),
    );
  }
  for (const objective of state.objectives) parts.push(`${objective.id}=${objective.owner}`);
  for (const item of ITEM_IDS) parts.push(`${item}=${state.inventory[item]}`);

  const joined = parts.join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
