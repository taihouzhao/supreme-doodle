import { SAVE_VERSION, cloneWorld } from "./state";
import type { WorldState } from "./types";

export interface SaveBlob {
  format: "jinyong-classic-save";
  saveVersion: number;
  world: WorldState;
}

export function serializeSave(state: WorldState): string {
  const blob: SaveBlob = {
    format: "jinyong-classic-save",
    saveVersion: state.saveVersion,
    world: cloneWorld(state),
  };
  return JSON.stringify(blob);
}

export function deserializeSave(raw: string): WorldState {
  const parsed = JSON.parse(raw) as SaveBlob;
  if (parsed.format !== "jinyong-classic-save") {
    throw new Error("not a jinyong classic save");
  }
  if (parsed.saveVersion !== SAVE_VERSION) {
    throw new Error(`unsupported saveVersion ${parsed.saveVersion}`);
  }
  return cloneWorld(parsed.world);
}
