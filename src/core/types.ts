export type Faction = "player" | "enemy";

export type UnitTypeId = "rifle" | "mg" | "mortar" | "tank";

export type TerrainId =
  | "road"
  | "plain"
  | "forest"
  | "hill"
  | "village"
  | "river"
  | "fort"
  | "cliff";

export type ItemId =
  | "medkit"
  | "bandage"
  | "ration"
  | "at_charge"
  | "satchel"
  | "arty_support"
  | "field_manual";

export type WeaponId =
  | "type38"
  | "zhongzheng"
  | "mosin"
  | "ppsh50"
  | "zb26"
  | "dp28"
  | "mortar60"
  | "mortar82"
  | "bazooka"
  | "t34_85"
  | "m1_garand"
  | "m1_carbine"
  | "m1919"
  | "m1_mortar"
  | "sherman";

export type Weather = "clear" | "overcast" | "rain" | "snow" | "fog";

export type MissionKind = "breakthrough" | "hold" | "withdraw";

export type MissionStatus = "playing" | "won" | "lost";

/** companion=伴随成长；story=剧情客串（不跨关继承）；enemy=敌军合成 */
export type CommanderKind = "companion" | "story" | "enemy";

export interface CommanderStats {
  leadership: number;
  intellect: number;
  might: number;
  stamina: number;
  agility: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface UnitTypeDef {
  id: UnitTypeId;
  name: string;
  /** 移动力，配合地形消耗使用 */
  move: number;
  minRange: number;
  maxRange: number;
  attack: number;
  maxHp: number;
  /** 车辆无法进入部分地形 */
  vehicle: boolean;
  /** 只有该标记的兵种可以占领目标 */
  canCapture: boolean;
  /** 曲射：目标地形防御减半，且不受反击 */
  indirect: boolean;
  /** 本回合未移动时的伤害加成，机枪架设 */
  setupBonus: number;
  role: string;
}

export interface TerrainDef {
  id: TerrainId;
  name: string;
  moveCost: number;
  /** 防御修正，正数表示减伤 */
  defense: number;
  /** 车辆是否可进入 */
  vehiclePassable: boolean;
  /** 步兵/车辆是否可进入；峭壁等为 false */
  passable: boolean;
  /** 回合结束恢复的生命 */
  regen: number;
  /** 站立单位获得的射程加成 */
  rangeBonus: number;
  /** 站立单位获得的伤害加成 */
  attackBonus: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  /** target: 需要选择敌方单位；tile: 需要选择格子；self: 作用于自身 */
  targeting: "self" | "target" | "tile";
  description: string;
  heal: number;
  damage: number;
  /** 仅对车辆有效 */
  antiArmorOnly: boolean;
  range: number;
  /** 溅射到正交邻格 */
  splash: boolean;
  /** 使用后降低疲劳 */
  fatigueRelief?: number;
  /** 使用后获得经验 */
  expGain?: number;
}

export interface Unit {
  id: string;
  rosterId: string | null;
  faction: Faction;
  type: UnitTypeId;
  name: string;
  /** 显示用装备名；数值以 weapon + stats 为准 */
  equipment: string;
  weapon: WeaponId;
  commanderKind: CommanderKind;
  commanderName: string;
  level: number;
  rank: string;
  /** 已含成长、不含武器/物资被动的将领五维 */
  stats: CommanderStats;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  exp: number;
  fatigue: number;
  mpLeft: number;
  movedThisTurn: boolean;
  hasActed: boolean;
  alive: boolean;
  evacuated: boolean;
  /** 固定主力标记；高大全在撤离关中也是必需撤离单位。 */
  keyUnit: boolean;
}

export interface Objective {
  id: string;
  name: string;
  kind: "capture" | "hold";
  x: number;
  y: number;
  owner: Faction | "none";
}

export interface FieldItem {
  id: string;
  item: ItemId;
  x: number;
  y: number;
}

export interface FieldWeapon {
  id: string;
  weapon: WeaponId;
  x: number;
  y: number;
}

export interface PendingReinforcement {
  turn: number;
  units: Unit[];
}

export interface MissionStats {
  playerRouted: number;
  enemyRouted: number;
  playerEvacuated: number;
  damageDealt: number;
  damageTaken: number;
}

export interface GameState {
  missionId: string;
  missionKind: MissionKind;
  seed: number;
  rng: number;
  turn: number;
  maxTurns: number;
  phase: Faction;
  width: number;
  height: number;
  tiles: TerrainId[];
  units: Unit[];
  objectives: Objective[];
  fieldItems: FieldItem[];
  fieldWeapons: FieldWeapon[];
  /** 本关拾取、通关后并入战役军械库 */
  pendingWeapons: WeaponId[];
  evacZone: Vec2[];
  inventory: Record<ItemId, number>;
  weather: Weather;
  pending: PendingReinforcement[];
  /** 连续守住全部占领目标的回合数 */
  captureStreak: number;
  /** 本关出战的我方单位数，用于按比例缩放撤离要求 */
  deployedCount: number;
  status: MissionStatus;
  stats: MissionStats;
  /** 胜负原因，供界面与报告使用 */
  resultReason: string;
}

export type Action =
  | { kind: "move"; unitId: string; to: Vec2 }
  | { kind: "attack"; unitId: string; targetId: string }
  | { kind: "useItem"; unitId: string; item: ItemId; targetId?: string; to?: Vec2 }
  | { kind: "capture"; unitId: string }
  | { kind: "wait"; unitId: string }
  | { kind: "endTurn" };

export interface DamageBreakdown {
  base: number;
  matchup: number;
  veterancy: number;
  commander: number;
  weapon: number;
  fatigue: number;
  flank: number;
  terrain: number;
  defenderVeterancy: number;
  weather: number;
  setup: number;
  highGround: number;
  jitter: number;
  total: number;
}

export type GameEvent =
  | { type: "moved"; unitId: string; from: Vec2; to: Vec2; cost: number }
  | {
      type: "attacked";
      attackerId: string;
      defenderId: string;
      damage: number;
      breakdown: DamageBreakdown;
      counterDamage: number;
    }
  | { type: "routed"; unitId: string; faction: Faction }
  | { type: "captured"; objectiveId: string; by: Faction }
  | { type: "itemUsed"; unitId: string; item: ItemId; targetIds: string[]; damage: number; heal: number }
  | { type: "itemPicked"; unitId: string; item: ItemId }
  | { type: "weaponPicked"; unitId: string; weapon: WeaponId }
  | { type: "reinforced"; unitIds: string[] }
  | { type: "healed"; unitId: string; amount: number }
  | { type: "evacuated"; unitId: string }
  | { type: "phaseChanged"; phase: Faction; turn: number }
  | { type: "missionEnded"; status: MissionStatus; reason: string };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
