import type {
  CommanderStats,
  Faction,
  ItemId,
  MissionKind,
  UnitTypeId,
  Vec2,
  WeaponId,
  Weather,
} from "../../core/types";

export interface HistoricalCommander {
  id: string;
  name: string;
  faction: Faction;
  role: string;
  formation: string;
  portrait?: string;
}

export interface WeatherSpec {
  /** 仅在史实合理的天气集合内按种子选择；单元素即固定天气。 */
  options: Weather[];
  label: string;
  detail: string;
}

export interface EnemySpec {
  type: UnitTypeId;
  x: number;
  y: number;
  exp?: number;
  hp?: number;
  name?: string;
  equipment?: string;
  weapon?: WeaponId;
}

/** 剧情将领：本关客串出战，不进入跨关花名册。 */
export interface StoryAllySpec {
  commander: string;
  type: UnitTypeId;
  level: number;
  weapon?: WeaponId;
  stats?: Partial<CommanderStats>;
  equipment?: string;
}

/** 受约束随机：只允许在预算内替换敌军编成 */
export interface VariantSlot {
  index: number;
  options: UnitTypeId[];
}

export interface WaveSpec {
  /** 到达回合窗口，闭区间 */
  window: [number, number];
  units: EnemySpec[];
}

export interface ItemDropSpec {
  x: number;
  y: number;
  options: ItemId[];
}

export interface WeaponDropSpec {
  x: number;
  y: number;
  options: WeaponId[];
}

export interface ObjectiveSpec {
  id: string;
  name: string;
  kind: "capture" | "hold";
  x: number;
  y: number;
  owner: "player" | "enemy" | "none";
}

export interface VictoryRule {
  /** 需要占领的目标数量 */
  requiredCaptures?: number;
  /** 占领后需要连续守住的回合数，避免「抢点即胜」和援军时间决定胜负 */
  holdTurns?: number;
  /** 胜利时至少存活的己方单位 */
  minSurvivors?: number;
  /** 需要坚守到回合结束 */
  holdUntilEnd?: boolean;
  /** 结束时至少仍持有的据点数 */
  minPostsHeld?: number;
  /** 需要撤离的单位数下限 */
  minEvacuated?: number;
  /** 需要撤离的出战比例，编制被打残时按比例缩放，避免形成死档 */
  evacuateRatio?: number;
  /** 必须包含指定主力单位 */
  requireKeyUnit?: boolean;
}

export interface MissionConfig {
  id: string;
  name: string;
  kind: MissionKind;
  brief: string;
  date?: string;
  location?: string;
  historicalOutcome?: string;
  historicalNote?: string;
  commanders?: HistoricalCommander[];
  /** 棋盘是战术抽象；此字段说明地图上真实地标与方向。 */
  mapNote?: string;
  weather?: WeatherSpec;
  playerEquipment?: Partial<Record<UnitTypeId, string>>;
  /** 装备时代，影响默认武器 */
  equipmentEra?: "early" | "late";
  maxTurns: number;
  map: string[];
  playerSpawns: Vec2[];
  /** 本关临时配属的剧情将领 */
  storyAllies?: StoryAllySpec[];
  enemies: EnemySpec[];
  variantSlots: VariantSlot[];
  waves: WaveSpec[];
  objectives: ObjectiveSpec[];
  evacZone: Vec2[];
  itemDrops: ItemDropSpec[];
  weaponDrops?: WeaponDropSpec[];
  /** 通关后写入军械库的武器 */
  weaponRewards?: WeaponId[];
  /** 旧关卡兼容；新关卡统一使用 weather。 */
  rainChance?: number;
  victory: VictoryRule;
}
