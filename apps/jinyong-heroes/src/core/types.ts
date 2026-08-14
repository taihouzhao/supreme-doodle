export type UiMode = "classic" | "enhanced";

export type FlagValue = boolean | number | string;

export type ConditionTree =
  | { all: ConditionTree[] }
  | { any: ConditionTree[] }
  | { not: ConditionTree }
  | { flag: string; equals?: FlagValue }
  | { flagNotSet: string }
  | { hasItem: string; count?: number }
  | { inParty: string }
  | { partyFull: boolean }
  | { moral: { min?: number; max?: number } }
  | { reputation: { min?: number; max?: number } }
  | { locationKnown: string }
  | { heavenBookCount: { min: number } }
  | { npcAlive: string }
  | { battleWon: string };

export type EventTrigger =
  | "ENTER"
  | "TALK"
  | "INTERACT"
  | "USE_ITEM"
  | "BATTLE_WIN"
  | "BATTLE_LOSE"
  | "PARTY_CHANGE";

export type EventAction =
  | { type: "dialogue"; id: string }
  | { type: "setFlag"; flag: string; value?: FlagValue }
  | { type: "clearFlag"; flag: string }
  | { type: "addItem"; itemId: string; count?: number }
  | { type: "removeItem"; itemId: string; count?: number }
  | { type: "unlockLocation"; locationId: string }
  | { type: "addHeavenBook"; bookId: string }
  | { type: "startBattle"; battleId: string }
  | { type: "goto"; locationId: string }
  | { type: "addParty"; characterId: string }
  | { type: "moral"; delta: number }
  | { type: "reputation"; delta: number };

export interface EventDefinition {
  id: string;
  sceneId: string;
  trigger: EventTrigger;
  actorId?: string;
  targetId?: string;
  itemId?: string;
  conditions: ConditionTree;
  actions: EventAction[];
  priority: number;
  repeatable: boolean;
}

export interface LocationDefinition {
  id: string;
  sceneId: string;
  /** Reconstructed map label from public walkthroughs, not original art. */
  title: string;
  /** Overworld coordinates from public maps. Conflicts go in facts/. */
  worldX: number;
  worldY: number;
  /** Adjacent scene ids. World-map travel still requires the destination to be known. */
  exits: string[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  category: string;
  stackable: boolean;
}

export interface InteractableDefinition {
  id: string;
  sceneId: string;
  kind: "npc" | "object";
}

export type InternalType = "YIN" | "YANG" | "HARMONY" | "NONE";

export interface CharacterDefinition {
  id: string;
  name: string;
  level: number;
  maxHp: number;
  attack: number;
  defence: number;
  speed: number;
  internalType: InternalType;
}

export interface BattleUnit {
  id: string;
  side: "player" | "enemy";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defence: number;
  speed: number;
  /** Draft skill power for the community damage formula. */
  skillPower: number;
  alive: boolean;
}

export interface BattleState {
  id: string;
  /** unverified-vs-original until a hashed DOS binary is locked. */
  formulaStatus: "unverified-vs-original";
  seedAtStart: number;
  width: number;
  height: number;
  units: BattleUnit[];
  turnIndex: number;
  round: number;
  result: "ongoing" | "win" | "lose";
  log: BattleLogEntry[];
}

export interface BattleLogEntry {
  kind: "move" | "attack" | "wait" | "damage";
  actorId: string;
  targetId?: string;
  x?: number;
  y?: number;
  amount?: number;
}

export type GameAction =
  | { type: "GO_TO"; locationId: string }
  | { type: "TALK"; actorId: string }
  | { type: "INTERACT"; targetId: string }
  | { type: "TAKE"; targetId: string }
  | { type: "USE_ITEM"; itemId: string; targetId: string }
  | { type: "BATTLE_MOVE"; unitId: string; x: number; y: number }
  | { type: "BATTLE_ATTACK"; unitId: string; targetId: string }
  | { type: "BATTLE_WAIT"; unitId: string };

export interface Presentation {
  dialogue: string[];
  audio: string[];
  animation: string[];
}

export interface WorldState {
  saveVersion: number;
  mode: UiMode;
  rngSeed: number;
  locationId: string;
  knownLocations: string[];
  inventory: Record<string, number>;
  flags: Record<string, FlagValue>;
  heavenBooks: string[];
  moral: number;
  reputation: number;
  party: string[];
  partyMax: number;
  npcAlive: Record<string, boolean>;
  battlesWon: string[];
  battle: BattleState | null;
  log: string[];
}

export interface DispatchResult {
  state: WorldState;
  presentation: Presentation;
}

export type BattleTemplate = Omit<
  BattleState,
  "seedAtStart" | "turnIndex" | "round" | "result" | "log" | "formulaStatus"
>;

export interface ContentPack {
  id: string;
  startLocationId: string;
  startKnownLocations: string[];
  startMoral: number;
  startInventory: Record<string, number>;
  playerId: string;
  partyMax: number;
  locations: LocationDefinition[];
  items: ItemDefinition[];
  characters: CharacterDefinition[];
  interactables: InteractableDefinition[];
  events: EventDefinition[];
  battles: Record<string, BattleTemplate>;
}
