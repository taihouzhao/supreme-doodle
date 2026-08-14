import { buildingAt, cellAt, FACING_DELTA, facingFromDelta, objectAt } from "../content/maps";
import { matchingEvents, runEvents } from "../event/engine";
import type { ContentPack, Facing, Presentation, WorldState } from "./types";

export function enterLocation(
  state: WorldState,
  content: ContentPack,
  locationId: string,
  presentation: Presentation,
): void {
  const location = content.locations.find((entry) => entry.id === locationId);
  const scene = content.scenes[locationId];
  if (!location || !scene) {
    presentation.dialogue.push("unknown-location");
    return;
  }
  state.locationId = location.id;
  state.view = "scene";
  state.sceneX = scene.spawn.x;
  state.sceneY = scene.spawn.y;
  state.facing = scene.spawn.facing;
  markVisited(state, locationId);
  state.log.push(`enter:${locationId}`);
  presentation.animation.push(`scene:${locationId}`);
  runEvents(state, content, matchingEvents(state, content, "ENTER"), presentation);
}

export function stepWorld(
  state: WorldState,
  content: ContentPack,
  dx: number,
  dy: number,
  presentation: Presentation,
): void {
  if (state.view === "menu" || state.view === "battle" || state.battle?.result === "ongoing") {
    presentation.dialogue.push("cannot-walk-now");
    return;
  }
  const facing = facingFromDelta(dx, dy);
  if (facing) state.facing = facing;
  if (state.view === "overworld") {
    stepOverworld(state, content, dx, dy, presentation);
    return;
  }
  if (state.view === "scene") {
    stepScene(state, content, dx, dy, presentation);
  }
}

export function faceInteract(
  state: WorldState,
  content: ContentPack,
  presentation: Presentation,
  useItemId?: string,
): void {
  if (state.view !== "scene") {
    presentation.dialogue.push("nothing-here");
    return;
  }
  if (state.battle?.result === "ongoing") {
    presentation.dialogue.push("cannot-interact-in-battle");
    return;
  }
  const scene = content.scenes[state.locationId];
  if (!scene) return;
  const delta = FACING_DELTA[state.facing];
  const x = state.sceneX + delta.dx;
  const y = state.sceneY + delta.dy;
  const target = objectAt(scene, x, y);
  if (!target) {
    presentation.dialogue.push("nothing-here");
    return;
  }
  const events = useItemId
    ? matchingEvents(state, content, "USE_ITEM", { itemId: useItemId, targetId: target.id })
    : target.kind === "npc"
      ? matchingEvents(state, content, "TALK", { actorId: target.id })
      : matchingEvents(state, content, "INTERACT", { targetId: target.id });
  if (useItemId && (state.inventory[useItemId] ?? 0) < 1) {
    presentation.dialogue.push("missing-item");
    return;
  }
  if (events.length === 0) {
    presentation.dialogue.push("nothing-here");
    return;
  }
  runEvents(state, content, events, presentation);
}

export function facingTileId(state: WorldState, content: ContentPack): string | undefined {
  if (state.view !== "scene") return undefined;
  const scene = content.scenes[state.locationId];
  if (!scene) return undefined;
  const delta = FACING_DELTA[state.facing];
  return objectAt(scene, state.sceneX + delta.dx, state.sceneY + delta.dy)?.id;
}

function stepOverworld(
  state: WorldState,
  content: ContentPack,
  dx: number,
  dy: number,
  presentation: Presentation,
): void {
  const x = state.overworldX + dx;
  const y = state.overworldY + dy;
  if (x < 0 || y < 0 || x >= content.overworld.size || y >= content.overworld.size) return;
  const hit = buildingAt(content.overworld.buildings, x, y);
  if (hit) {
    enterLocation(state, content, hit.locationId, presentation);
    return;
  }
  state.overworldX = x;
  state.overworldY = y;
  presentation.animation.push(`step:${x},${y}`);
}

function stepScene(
  state: WorldState,
  content: ContentPack,
  dx: number,
  dy: number,
  presentation: Presentation,
): void {
  const scene = content.scenes[state.locationId];
  if (!scene) return;
  const x = state.sceneX + dx;
  const y = state.sceneY + dy;
  const cell = cellAt(scene, x, y);
  if (cell === "D") {
    leaveScene(state, content, presentation);
    return;
  }
  if (cell !== ".") return;
  if (objectAt(scene, x, y)) return;
  state.sceneX = x;
  state.sceneY = y;
  presentation.animation.push(`step:${x},${y}`);
}

function leaveScene(state: WorldState, content: ContentPack, presentation: Presentation): void {
  const location = content.locations.find((entry) => entry.id === state.locationId);
  const scene = content.scenes[state.locationId];
  if (!location || !scene) return;
  state.view = "overworld";
  state.overworldX = location.worldX + scene.leave.dx;
  state.overworldY = location.worldY + scene.leave.dy;
  state.facing = "south";
  state.log.push("leave-scene");
  presentation.animation.push("overworld");
}

function markVisited(state: WorldState, locationId: string): void {
  if (!state.visitedLocations.includes(locationId)) {
    state.visitedLocations.push(locationId);
  }
  if (!state.knownLocations.includes(locationId)) {
    state.knownLocations.push(locationId);
  }
}

export function setFacing(state: WorldState, facing: Facing): void {
  state.facing = facing;
}
