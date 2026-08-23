import type { ContentPack, InteractableDefinition, LocationDefinition, WorldState } from "../core/types";

export function currentLocation(state: WorldState, content: ContentPack): LocationDefinition | undefined {
  return content.locations.find((location) => location.id === state.locationId);
}

export function sceneInteractables(state: WorldState, content: ContentPack): InteractableDefinition[] {
  const location = currentLocation(state, content);
  if (!location) return [];
  return content.interactables.filter((entry) => entry.sceneId === location.sceneId);
}

export function knownLocationList(state: WorldState, content: ContentPack): LocationDefinition[] {
  return content.locations.filter((location) => state.knownLocations.includes(location.id));
}
