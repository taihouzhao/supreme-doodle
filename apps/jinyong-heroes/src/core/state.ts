import type { ContentPack, Presentation, UiMode, WorldState } from "./types";

export const SAVE_VERSION = 1;

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

  const npcAlive: Record<string, boolean> = {};
  for (const npc of content.interactables.filter((entry) => entry.kind === "npc")) {
    npcAlive[npc.id] = true;
  }

  return {
    saveVersion: SAVE_VERSION,
    mode,
    rngSeed: seed >>> 0,
    locationId: start.id,
    knownLocations: [...content.startKnownLocations],
    inventory: {},
    flags: {},
    heavenBooks: [],
    moral: 0,
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
