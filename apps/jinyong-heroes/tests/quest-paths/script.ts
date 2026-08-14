import { dispatch } from "../../src/core/dispatch";
import { createInitialWorld } from "../../src/core/state";
import type { ContentPack, GameAction, Presentation, WorldState } from "../../src/core/types";

/** Walkthrough steps from PRD 04: goTo / talkTo / take / useOn. */
export type PathStep =
  | { goTo: string }
  | { talkTo: string }
  | { take: string }
  | { interact: string }
  | { useOn: { itemId: string; targetId: string } }
  | { battleMove: { unitId: string; x: number; y: number } }
  | { battleAttack: { unitId: string; targetId: string } }
  | { battleWait: { unitId: string } };

export function stepToAction(step: PathStep): GameAction {
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
    const result = dispatch(state, stepToAction(step), content);
    state = result.state;
    presentations.push(result.presentation);
  }
  return { state, presentations };
}
