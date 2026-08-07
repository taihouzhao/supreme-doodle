import type { Rng } from "../core/rng";
import type { Action, GameState } from "../core/types";

export interface Agent {
  id: string;
  name: string;
  /** 返回本阶段的下一个动作；必须是合法动作 */
  decide(state: GameState, rng: Rng): Action;
}
