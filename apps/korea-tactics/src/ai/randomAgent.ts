import { legalActions } from "../core/engine";
import type { Rng } from "../core/rng";
import type { Action, GameState } from "../core/types";
import type { Agent } from "./types";

/** 在合法动作里均匀随机，用作能力梯度的下界 */
export const randomAgent: Agent = {
  id: "random",
  name: "随机行动",
  decide(state: GameState, rng: Rng): Action {
    const actions = legalActions(state);
    if (actions.length === 0) return { kind: "endTurn" };
    return rng.pick(actions);
  },
};
