export const TICKS_PER_SECOND = 20;

export type DefenseMode = "normal" | "hard";
export type DefenseVariant = "road-raids" | "ridge-relief" | "night-attack";
export type GameSpeed = 0 | 1 | 2;
export type TowerType = "infantry" | "machineGun" | "mortar";
export type EnemyType = "rifle" | "runner" | "heavy" | "armored";
export type TerrainType = "plain" | "road" | "forest" | "hill" | "river" | "command";
export type MissionResult = "playing" | "won" | "lost";

export interface Point {
  x: number;
  y: number;
}

export interface TowerDefinition {
  type: TowerType;
  name: string;
  shortName: string;
  cost: number;
  range: number;
  minRange?: number;
  damage: number;
  shotsPerSecond: number;
  splashRadius?: number;
  description: string;
  icon: string;
}

export interface EnemyDefinition {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  leakDamage: number;
  reward: number;
  radius: number;
  color: number;
  damageTakenMultiplier?: Partial<Record<TowerType, number>>;
}

export interface BuildNode {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface WaveEnemySpawn {
  type: EnemyType;
  count: number;
  intervalSeconds: number;
  startDelaySeconds?: number;
}

export interface WaveDefinition {
  number: number;
  label: string;
  intermissionSeconds: number;
  spawns: WaveEnemySpawn[];
}

export interface DefenseMissionConfig {
  id: string;
  name: string;
  subtitle: string;
  historicalNote: string;
  width: number;
  height: number;
  terrain: TerrainType[];
  path: Point[];
  alternatePath: Point[];
  commandPost: Point;
  buildNodes: BuildNode[];
  waves: WaveDefinition[];
  hardModifier: {
    spawnIntervalMultiplier: number;
    spawnCountMultiplier: number;
    routeSpeedMultiplier: number;
    extraBranch: Point[];
  };
}

export interface TowerState {
  id: string;
  type: TowerType;
  nodeId: string;
  level: 1 | 2 | 3;
  cooldownTicks: number;
  invested: number;
}

export interface EnemyState {
  id: string;
  type: EnemyType;
  hp: number;
  maxHp: number;
  pathProgress: number;
  speed: number;
  radius: number;
  leakDamage: number;
  reward: number;
  x: number;
  y: number;
  route: Point[];
}

export interface ProjectileEffect {
  id: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: number;
  lifeTicks: number;
  maxLifeTicks: number;
}

export interface HitEffect {
  id: number;
  x: number;
  y: number;
  color: number;
  lifeTicks: number;
  maxLifeTicks: number;
  radius: number;
}

export interface WaveRuntime {
  number: number;
  started: boolean;
  complete: boolean;
  spawnTicks: number;
  nextSpawnIndex: number;
  spawnedCount: number;
  totalCount: number;
  spawnPlan: { type: EnemyType; dueTick: number }[];
}

export interface DefenseState {
  mode: DefenseMode;
  variant: DefenseVariant;
  mission: DefenseMissionConfig;
  armory: ArmoryLevels;
  tick: number;
  simulationSeconds: number;
  speed: GameSpeed;
  paused: boolean;
  deploymentPoints: number;
  commandPostIntegrity: number;
  currentWave: number;
  activeWave: WaveRuntime | null;
  intermissionTicks: number;
  towers: TowerState[];
  enemies: EnemyState[];
  projectiles: ProjectileEffect[];
  hitEffects: HitEffect[];
  nextEntityId: number;
  nextEffectId: number;
  kills: number;
  leaks: number;
  result: MissionResult;
  notice: string;
  rngState: number;
}

export interface SimulationSnapshot {
  tick: number;
  simulationSeconds: number;
  speed: GameSpeed;
  paused: boolean;
  deploymentPoints: number;
  commandPostIntegrity: number;
  currentWave: number;
  activeWave: WaveRuntime | null;
  intermissionTicks: number;
  variant: DefenseVariant;
  towers: readonly TowerState[];
  enemies: readonly EnemyState[];
  projectiles: readonly ProjectileEffect[];
  hitEffects: readonly HitEffect[];
  kills: number;
  leaks: number;
  result: MissionResult;
  notice: string;
}

export type DefenseCommand =
  | { type: "START_WAVE" }
  | { type: "DEPLOY"; towerType: TowerType; nodeId: string }
  | { type: "UPGRADE"; towerId: string }
  | { type: "SELL"; towerId: string }
  | { type: "PAUSE"; paused?: boolean }
  | { type: "SET_SPEED"; speed: GameSpeed };

export interface StarResult {
  stars: 0 | 1 | 2 | 3;
  medalReward: number;
}

export type ArmoryLevels = Record<TowerType, [number, number, number]>;
