import type { ContentPack, Presentation, UiMode, WorldState } from "./types";

export const SAVE_VERSION = 2;

export function emptyPresentation(): Presentation {
  return { dialogue: [], audio: [], animation: [] };
}

export function createInitialWorld(
  content: ContentPack,
  seed = 1,
  mode: UiMode = "classic",
): WorldState {
  const start = content.locations.find((location) => location.id === content.startLocationId);
  if (!start) {
    throw new Error(`start location missing: ${content.startLocationId}`);
  }

  const startScene = content.scenes[start.id];
  if (!startScene) {
    throw new Error(`start scene missing: ${start.id}`);
  }

  const npcAlive: Record<string, boolean> = {};
  for (const npc of content.interactables.filter((entry) => entry.kind === "npc")) {
    npcAlive[npc.id] = true;
  }

  return {
    saveVersion: SAVE_VERSION,
    mode,
    rngSeed: seed >>> 0,
    view: "scene",
    locationId: start.id,
    overworldX: start.worldX + startScene.leave.dx,
    overworldY: start.worldY + startScene.leave.dy,
    sceneX: startScene.spawn.x,
    sceneY: startScene.spawn.y,
    facing: startScene.spawn.facing,
    menuReturnView: "scene",
    knownLocations: [...content.startKnownLocations],
    visitedLocations: [start.id],
    inventory: { ...content.startInventory },
    flags: {},
    heavenBooks: [],
    moral: content.startMoral,
    reputation: 0,
    party: [content.playerId],
    partyMax: content.partyMax,
    npcAlive,
    battlesWon: [],
    battle: null,
    log: ["new-game"],
  };
}

export function cloneWorld(state: WorldState): WorldState {
  return {
    ...state,
    visitedLocations: [...state.visitedLocations],
    knownLocations: [...state.knownLocations],
    inventory: { ...state.inventory },
    flags: { ...state.flags },
    heavenBooks: [...state.heavenBooks],
    party: [...state.party],
    npcAlive: { ...state.npcAlive },
    battlesWon: [...state.battlesWon],
    battle: state.battle
      ? {
          ...state.battle,
          units: state.battle.units.map((unit) => ({ ...unit })),
          log: state.battle.log.map((entry) => ({ ...entry })),
        }
      : null,
    log: [...state.log],
  };
}
