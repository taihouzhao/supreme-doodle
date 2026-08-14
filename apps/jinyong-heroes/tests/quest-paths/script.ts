import { suggestBattleAction } from "../../src/battle/engine";
import { dispatch } from "../../src/core/dispatch";
import { createInitialWorld } from "../../src/core/state";
import type { ContentPack, GameAction, Presentation, WorldState } from "../../src/core/types";

/** Walkthrough steps: goTo / talkTo / take / useOn, plus reconstructed battle auto. */
export type PathStep =
  | { goTo: string }
  | { talkTo: string }
  | { take: string }
  | { interact: string }
  | { useOn: { itemId: string; targetId: string } }
  | { battleMove: { unitId: string; x: number; y: number } }
  | { battleAttack: { unitId: string; targetId: string } }
  | { battleWait: { unitId: string } }
  | { battleAuto: true };

export function stepToAction(step: PathStep): GameAction | null {
  if ("goTo" in step) return { type: "GO_TO", locationId: step.goTo };
  if ("talkTo" in step) return { type: "TALK", actorId: step.talkTo };
  if ("take" in step) return { type: "TAKE", targetId: step.take };
  if ("interact" in step) return { type: "INTERACT", targetId: step.interact };
  if ("useOn" in step) return { type: "USE_ITEM", itemId: step.useOn.itemId, targetId: step.useOn.targetId };
  if ("battleMove" in step) {
    return { type: "BATTLE_MOVE", unitId: step.battleMove.unitId, x: step.battleMove.x, y: step.battleMove.y };
  }
  if ("battleAttack" in step) {
    return {
      type: "BATTLE_ATTACK",
      unitId: step.battleAttack.unitId,
      targetId: step.battleAttack.targetId,
    };
  }
  if ("battleWait" in step) return { type: "BATTLE_WAIT", unitId: step.battleWait.unitId };
  if ("battleAuto" in step) return null;
  const _never: never = step;
  return _never;
}

export function runPath(
  content: ContentPack,
  steps: PathStep[],
  seed = 1,
): { state: WorldState; presentations: Presentation[] } {
  let state = createInitialWorld(content, seed);
  const presentations: Presentation[] = [];
  for (const step of steps) {
    if ("battleAuto" in step) {
      const result = runBattleAuto(state, content);
      state = result.state;
      presentations.push(...result.presentations);
      continue;
    }
    const action = stepToAction(step);
    if (!action) continue;
    const result = dispatch(state, action, content);
    state = result.state;
    presentations.push(result.presentation);
  }
  return { state, presentations };
}

export function runBattleAuto(
  state: WorldState,
  content: ContentPack,
  maxSteps = 24,
): { state: WorldState; presentations: Presentation[] } {
  const presentations: Presentation[] = [];
  let current = state;
  for (let i = 0; i < maxSteps; i += 1) {
    if (!current.battle || current.battle.result !== "ongoing") break;
    const action = suggestBattleAction(current);
    if (!action) break;
    const result = dispatch(current, action, content);
    current = result.state;
    presentations.push(result.presentation);
  }
  return { state: current, presentations };
}
