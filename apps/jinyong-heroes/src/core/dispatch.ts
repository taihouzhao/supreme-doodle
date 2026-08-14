import { clearFinishedBattle, tryBattleAttack, tryBattleMove, tryBattleWait } from "../battle/engine";
import { matchingEvents, runEvents } from "../event/engine";
import { cloneWorld, emptyPresentation } from "./state";
import type {
  ContentPack,
  DispatchResult,
  GameAction,
  Presentation,
  WorldState,
} from "./types";

/**
 * Pure-function game step. The renderer may only consume `presentation`.
 * It must not write flags, inventory, moral, or other world fields.
 */
export function dispatch(state: WorldState, action: GameAction, content: ContentPack): DispatchResult {
  const next = cloneWorld(state);
  const presentation = emptyPresentation();

  switch (action.type) {
    case "GO_TO":
      travel(next, content, action.locationId, presentation);
      break;
    case "TALK":
      talk(next, content, action.actorId, presentation);
      break;
    case "INTERACT":
    case "TAKE":
      interact(next, content, action.targetId, presentation);
      break;
    case "USE_ITEM":
      useItem(next, content, action.itemId, action.targetId, presentation);
      break;
    case "BATTLE_MOVE":
      if (!tryBattleMove(next, action.unitId, action.x, action.y, presentation)) {
        presentation.dialogue.push("invalid-battle-move");
      }
      onBattleResolved(next, content, presentation);
      break;
    case "BATTLE_ATTACK":
      if (!tryBattleAttack(next, action.unitId, action.targetId, presentation)) {
        presentation.dialogue.push("invalid-battle-attack");
      }
      onBattleResolved(next, content, presentation);
      break;
    case "BATTLE_WAIT":
      if (!tryBattleWait(next, action.unitId, presentation)) {
        presentation.dialogue.push("invalid-battle-wait");
      }
      onBattleResolved(next, content, presentation);
      break;
    default: {
      const _never: never = action;
      void _never;
    }
  }

  return { state: next, presentation };
}

function travel(
  state: WorldState,
  content: ContentPack,
  locationId: string,
  presentation: Presentation,
): void {
  if (state.battle?.result === "ongoing") {
    presentation.dialogue.push("cannot-travel-in-battle");
    return;
  }
  const location = content.locations.find((entry) => entry.id === locationId);
  if (!location) {
    presentation.dialogue.push("unknown-location");
    return;
  }
  if (!state.knownLocations.includes(locationId)) {
    presentation.dialogue.push("location-unknown");
    return;
  }
  state.locationId = location.id;
  state.log.push(`travel:${location.id}`);
  presentation.animation.push(`scene:${location.id}`);
  runEvents(state, content, matchingEvents(state, content, "ENTER"), presentation);
}

function talk(
  state: WorldState,
  content: ContentPack,
  actorId: string,
  presentation: Presentation,
): void {
  if (state.battle?.result === "ongoing") {
    presentation.dialogue.push("cannot-talk-in-battle");
    return;
  }
  runEvents(state, content, matchingEvents(state, content, "TALK", { actorId }), presentation);
}

function interact(
  state: WorldState,
  content: ContentPack,
  targetId: string,
  presentation: Presentation,
): void {
  if (state.battle?.result === "ongoing") {
    presentation.dialogue.push("cannot-interact-in-battle");
    return;
  }
  runEvents(state, content, matchingEvents(state, content, "INTERACT", { targetId }), presentation);
}

function useItem(
  state: WorldState,
  content: ContentPack,
  itemId: string,
  targetId: string,
  presentation: Presentation,
): void {
  if (state.battle?.result === "ongoing") {
    presentation.dialogue.push("cannot-use-item-in-battle");
    return;
  }
  if ((state.inventory[itemId] ?? 0) < 1) {
    presentation.dialogue.push("missing-item");
    return;
  }
  runEvents(state, content, matchingEvents(state, content, "USE_ITEM", { itemId, targetId }), presentation);
}

function onBattleResolved(state: WorldState, content: ContentPack, presentation: Presentation): void {
  const battle = state.battle;
  if (!battle || battle.result === "ongoing") return;
  const trigger = battle.result === "win" ? "BATTLE_WIN" : "BATTLE_LOSE";
  runEvents(state, content, matchingEvents(state, content, trigger, { targetId: battle.id }), presentation);
  clearFinishedBattle(state);
}
