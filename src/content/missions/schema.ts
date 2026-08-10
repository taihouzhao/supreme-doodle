import type {
  CommanderStats,
  AttachmentId,
  Faction,
  ItemId,
  MissionKind,
  PlaceLabel,
  ScriptedRule,
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
  /** 以本关发生时为准；志愿军写职务制而不是套用1955年军衔。 */
  historicalRank?: string;
  /** public/assets/ranks 下的历史徽记 id。 */
  rankInsignia?: string;
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
  /** 关联本关 commanders 的 id：用历史将领姓名与头衔命名该棋子 */
  commanderId?: string;
  /** 精英头衔，如「敌军主将」「精锐指挥官」，写入 unit.duty */
  title?: string;
  /** 击溃时原地掉落的道具池（精英道具） */
  dropOptions?: ItemId[];
  /** 击溃时原地掉落的有限装备；战后才进入军械库。 */
  dropWeapons?: WeaponId[];
  dropAttachments?: AttachmentId[];
}

/** 本关临时配属：真实人物客串出战，不进入跨关花名册。 */
export interface StoryAllySpec {
  commander: string;
  type: UnitTypeId;
  level: number;
  weapon?: WeaponId;
  attachment?: AttachmentId;
  stats?: Partial<CommanderStats>;
  equipment?: string;
  /** 真实职务 / 部队身份 */
  duty?: string;
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

export interface AttachmentDropSpec {
  x: number;
  y: number;
  options: AttachmentId[];
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
  /** 撤离前至少击溃的敌军单位；用于“接触施压后脱离”而非开局直奔出口 */
  minEnemiesRouted?: number;
  /** 撤离通道开放回合（含）；此前踩撤离格不撤离，避免增援到来前秒撤 */
  evacOpensOnTurn?: number;
}

/** 地图上的地名标注，只做展示，让战场读起来像那段战史 */
export type PlaceLabelSpec = PlaceLabel;

/**
 * 史实脚本事件。用少量可结算的规则表现各关的历史特征，
 * 而不是只靠简报文字描述：
 * - nightAssault 夜袭近战加成
 * - barrage 敌方炮火准备
 * - coldAttrition 严寒冻伤减员
 * - supplyWindow 携行弹药耗尽后的攻击衰减（礼拜攻势）
 */
export type ScriptedEventSpec = ScriptedRule;

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
  /** 关卡局部平衡：仅缩放该关敌军火力，不改变随机流。 */
  enemyDamageMultiplier?: number;
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
  /** 补给点坐标；站上可恢复 supplyWindow 弹药（与后勤共用模型） */
  supplyPoints?: Vec2[];
  itemDrops: ItemDropSpec[];
  weaponDrops?: WeaponDropSpec[];
  attachmentDrops?: AttachmentDropSpec[];
  /** 通关后写入军械库的武器 */
  weaponRewards?: WeaponId[];
  /** 通关后写入军械库的附件 */
  attachmentRewards?: AttachmentId[];
  /** 出击前写入军械库的史实换装（例如 M10 的 M-30 与 BM-13）。 */
  preMissionWeapons?: WeaponId[];
  preMissionAttachments?: AttachmentId[];
  /** 地图上标注的真实地名 */
  places?: PlaceLabelSpec[];
  /** 史实脚本事件 */
  scripted?: ScriptedEventSpec[];
  /** 旧关卡兼容；新关卡统一使用 weather。 */
  rainChance?: number;
  victory: VictoryRule;
}
