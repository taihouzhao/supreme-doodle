import type {
  ContentPack,
  EventDefinition,
  EventTrigger,
  Presentation,
  WorldState,
} from "../core/types";
import { applyEventAction } from "./apply";
import { evaluateCondition } from "./evaluate";

export function matchingEvents(
  state: WorldState,
  content: ContentPack,
  trigger: EventTrigger,
  ids: { actorId?: string; targetId?: string; itemId?: string } = {},
): EventDefinition[] {
  const location = content.locations.find((entry) => entry.id === state.locationId);
  const sceneId = location?.sceneId ?? state.locationId;

  return content.events
    .filter((event) => {
      if (event.trigger !== trigger) return false;
      if (event.sceneId !== sceneId) return false;
      if (!event.repeatable && state.flags[`event_done_${event.id}`]) return false;
      if (event.actorId && event.actorId !== ids.actorId) return false;
      if (event.targetId && event.targetId !== ids.targetId) return false;
      if (event.itemId && event.itemId !== ids.itemId) return false;
      return evaluateCondition(state, event.conditions);
    })
    .sort((a, b) => b.priority - a.priority);
}

export function runEvents(
  state: WorldState,
  content: ContentPack,
  events: EventDefinition[],
  presentation: Presentation,
): void {
  for (const event of events) {
    for (const action of event.actions) {
      applyEventAction(state, content, action, presentation);
    }
    if (!event.repeatable) {
      state.flags[`event_done_${event.id}`] = true;
    }
    state.log.push(`event:${event.id}`);
  }
}
