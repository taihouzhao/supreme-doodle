import { startBattle } from "../battle/engine";
import { i16Add } from "../core/i16";
import type { ContentPack, EventAction, Presentation, WorldState } from "../core/types";

export function applyEventAction(
  state: WorldState,
  content: ContentPack,
  action: EventAction,
  presentation: Presentation,
): void {
  switch (action.type) {
    case "dialogue":
      presentation.dialogue.push(action.id);
      state.log.push(`dialogue:${action.id}`);
      return;
    case "setFlag":
      state.flags[action.flag] = action.value === undefined ? true : action.value;
      state.log.push(`flag:${action.flag}`);
      return;
    case "clearFlag":
      delete state.flags[action.flag];
      state.log.push(`flag-clear:${action.flag}`);
      return;
    case "addItem": {
      const qty = action.count ?? 1;
      state.inventory[action.itemId] = (state.inventory[action.itemId] ?? 0) + qty;
      state.log.push(`item+${action.itemId}:${qty}`);
      return;
    }
    case "removeItem": {
      const qty = action.count ?? 1;
      const have = state.inventory[action.itemId] ?? 0;
      const next = have - qty;
      if (next <= 0) {
        delete state.inventory[action.itemId];
      } else {
        state.inventory[action.itemId] = next;
      }
      state.log.push(`item-${action.itemId}:${qty}`);
      return;
    }
    case "unlockLocation":
      if (!state.knownLocations.includes(action.locationId)) {
        state.knownLocations.push(action.locationId);
        state.log.push(`unlock:${action.locationId}`);
      }
      return;
    case "addHeavenBook":
      if (!state.heavenBooks.includes(action.bookId)) {
        state.heavenBooks.push(action.bookId);
        state.flags[`heaven_book_${action.bookId}`] = true;
        state.log.push(`heaven-book:${action.bookId}`);
      }
      return;
    case "startBattle":
      startBattle(state, content, action.battleId);
      presentation.animation.push(`battle:${action.battleId}`);
      return;
    case "goto": {
      const location = content.locations.find((entry) => entry.id === action.locationId);
      if (!location) {
        throw new Error(`unknown location ${action.locationId}`);
      }
      state.locationId = location.id;
      if (!state.knownLocations.includes(location.id)) {
        state.knownLocations.push(location.id);
      }
      state.log.push(`goto:${location.id}`);
      presentation.animation.push(`scene:${location.id}`);
      return;
    }
    case "moral":
      state.moral = i16Add(state.moral, action.delta);
      return;
    case "reputation":
      state.reputation = i16Add(state.reputation, action.delta);
      return;
    default: {
      const _never: never = action;
      void _never;
    }
  }
}
