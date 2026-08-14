import type {
  AttachmentCategoryId,
  AttachmentId,
  CommanderStats,
  GearCategoryId,
  ItemCategoryId,
  UnitClassId,
  UnitTypeId,
  WeaponCategoryId,
  WeaponId,
} from "../core/types";
import { addStats } from "./progress";

export interface UnitClassDef {
  id: UnitClassId;
  name: string;
  /** 战斗资历装饰文案（非史实军衔） */
  decorationLabel: string;
  branch: "rifle" | "mg" | "fire" | "logistics" | "armor";
  stage: number;
  type: UnitTypeId;
  /** 相对底板叠加的编制修正 */
  statMods: Partial<CommanderStats>;
  /** 该阶累计解锁的大类（含更低阶） */
  unlockCategories: GearCategoryId[];
  /** 装饰资源键：public/assets/ui/class/{decoration}.svg */
  decoration: string;
  /** 阵地机枪等特殊 setup 加成（叠加在兵种 setupBonus 上） */
  setupBonusExtra?: number;
  /** 后勤补给效率倍率 */
  resupplyEfficiency?: number;
  /** 弹药窗口额外回合 */
  ammoRestoreBonus?: number;
  /** 后勤 personnel 调拨额外上限 */
  personnelBonus?: number;
  /** 进化到此阶时若附件库没有则发放 */
  grantAttachment?: AttachmentId;
}

const BASE_RIFLE_CATS: GearCategoryId[] = [
  "infantry_rifle",
  "med_field",
  "ration_stamina",
  "demo_at",
  "attach_engineer",
  "attach_medic",
];

const BASE_MG_CATS: GearCategoryId[] = [
  "mg_lmg",
  "med_field",
  "ration_stamina",
  "attach_engineer",
  "attach_ammo",
  "attach_conceal",
];

const BASE_MORTAR_CATS: GearCategoryId[] = [
  "mortar_light",
  "mortar_medium",
  "med_field",
  "ration_stamina",
  "attach_ammo",
  "attach_optics",
  "attach_conceal",
];

const BASE_LOGI_CATS: GearCategoryId[] = [
  "logi_train",
  "med_field",
  "ration_stamina",
  "attach_engineer",
  "attach_medic",
];

export const UNIT_CLASSES: Record<UnitClassId, UnitClassDef> = {
  rifle_line: {
    id: "rifle_line",
    name: "步枪手",
    decorationLabel: "步兵细铜环",
    branch: "rifle",
    stage: 0,
    type: "rifle",
    statMods: {},
    unlockCategories: BASE_RIFLE_CATS,
    decoration: "rifle_0",
  },
  rifle_assault: {
    id: "rifle_assault",
    name: "突击步兵",
    decorationLabel: "步兵绿麦穗半环",
    branch: "rifle",
    stage: 1,
    type: "rifle",
    statMods: { might: 4, stamina: 2, agility: 2 },
    unlockCategories: [...BASE_RIFLE_CATS, "infantry_smg", "attach_armor"],
    decoration: "rifle_1",
  },
  rifle_marksman: {
    id: "rifle_marksman",
    name: "特等射手",
    decorationLabel: "步兵绿麦穗全环",
    branch: "rifle",
    stage: 2,
    type: "rifle",
    statMods: { intellect: 4, might: 3, leadership: 2 },
    unlockCategories: [...BASE_RIFLE_CATS, "infantry_smg", "infantry_marksman", "attach_armor", "attach_comms"],
    decoration: "rifle_2",
  },
  rifle_vanguard: {
    id: "rifle_vanguard",
    name: "尖刀步兵",
    decorationLabel: "步兵金麦穗全环",
    branch: "rifle",
    stage: 3,
    type: "rifle",
    statMods: { leadership: 4, might: 3, stamina: 3 },
    unlockCategories: [
      ...BASE_RIFLE_CATS,
      "infantry_smg",
      "infantry_marksman",
      "infantry_at",
      "attach_armor",
      "attach_comms",
    ],
    decoration: "rifle_3",
  },
  mg_gunner: {
    id: "mg_gunner",
    name: "机枪手",
    decorationLabel: "机枪细铜环",
    branch: "mg",
    stage: 0,
    type: "mg",
    statMods: {},
    unlockCategories: BASE_MG_CATS,
    decoration: "mg_0",
  },
  mg_section: {
    id: "mg_section",
    name: "机枪火力组",
    decorationLabel: "机枪铁灰齿环",
    branch: "mg",
    stage: 1,
    type: "mg",
    statMods: { leadership: 3, might: 3, stamina: 2 },
    unlockCategories: [...BASE_MG_CATS, "attach_armor", "attach_medic", "attach_comms"],
    decoration: "mg_1",
  },
  mg_heavy: {
    id: "mg_heavy",
    name: "重机枪组",
    decorationLabel: "机枪铁灰全环",
    branch: "mg",
    stage: 2,
    type: "mg",
    statMods: { might: 4, stamina: 3, intellect: 2 },
    unlockCategories: [...BASE_MG_CATS, "mg_mmg", "attach_armor", "attach_medic", "attach_comms"],
    decoration: "mg_2",
  },
  mg_fortress: {
    id: "mg_fortress",
    name: "阵地机枪",
    decorationLabel: "机枪黑金阵地铁环",
    branch: "mg",
    stage: 3,
    type: "mg",
    statMods: { leadership: 4, stamina: 4, agility: -2 },
    unlockCategories: [
      ...BASE_MG_CATS,
      "mg_mmg",
      "mg_hmg",
      "attach_armor",
      "attach_medic",
      "attach_comms",
    ],
    decoration: "mg_3",
    setupBonusExtra: 0.08,
  },
  mortar_crew: {
    id: "mortar_crew",
    name: "迫击炮班",
    decorationLabel: "曲射蓝细环",
    branch: "fire",
    stage: 0,
    type: "mortar",
    statMods: {},
    unlockCategories: BASE_MORTAR_CATS,
    decoration: "fire_0",
  },
  mortar_heavy: {
    id: "mortar_heavy",
    name: "重迫击炮",
    decorationLabel: "曲射蓝半环",
    branch: "fire",
    stage: 1,
    type: "mortar",
    statMods: { intellect: 4, stamina: 2 },
    unlockCategories: [...BASE_MORTAR_CATS, "mortar_heavy", "attach_conceal"],
    decoration: "fire_1",
  },
  arty_field: {
    id: "arty_field",
    name: "野战炮兵",
    decorationLabel: "炮兵绯红半环",
    branch: "fire",
    stage: 2,
    type: "artillery",
    statMods: { intellect: 3, leadership: 2, agility: -3 },
    unlockCategories: [
      "arty_gun",
      "arty_heavy",
      "med_field",
      "ration_stamina",
      "attach_ammo",
      "attach_optics",
      "attach_motor",
      "attach_pack",
      "attach_conceal",
      "attach_comms",
    ],
    decoration: "fire_2",
  },
  arty_rocket: {
    id: "arty_rocket",
    name: "火箭炮兵",
    decorationLabel: "炮兵绯红火箭星环",
    branch: "fire",
    stage: 3,
    type: "artillery",
    statMods: { intellect: 4, leadership: 3, stamina: 2 },
    unlockCategories: [
      "arty_gun",
      "arty_heavy",
      "arty_rocket",
      "med_field",
      "ration_stamina",
      "attach_ammo",
      "attach_optics",
      "attach_motor",
      "attach_pack",
      "attach_conceal",
      "attach_comms",
    ],
    decoration: "fire_3",
  },
  logi_porter: {
    id: "logi_porter",
    name: "辎重兵",
    decorationLabel: "后勤赭石细环",
    branch: "logistics",
    stage: 0,
    type: "logistics",
    statMods: {},
    unlockCategories: BASE_LOGI_CATS,
    decoration: "logi_0",
  },
  logi_pack: {
    id: "logi_pack",
    name: "骡马辎重",
    decorationLabel: "后勤赭石骡马饰",
    branch: "logistics",
    stage: 1,
    type: "logistics",
    statMods: { stamina: 4, agility: 2 },
    unlockCategories: [...BASE_LOGI_CATS, "attach_pack"],
    decoration: "logi_1a",
    grantAttachment: "pack_train",
    resupplyEfficiency: 1.1,
  },
  logi_motor: {
    id: "logi_motor",
    name: "汽车辎重",
    decorationLabel: "后勤赭石轮形饰",
    branch: "logistics",
    stage: 1,
    type: "logistics",
    statMods: { stamina: 2, agility: 4, leadership: 2 },
    unlockCategories: [...BASE_LOGI_CATS, "attach_motor"],
    decoration: "logi_1b",
    grantAttachment: "motor_transport",
    resupplyEfficiency: 1.1,
  },
  logi_column: {
    id: "logi_column",
    name: "运输纵队",
    decorationLabel: "后勤纵队半环",
    branch: "logistics",
    stage: 2,
    type: "logistics",
    statMods: { leadership: 4, stamina: 3 },
    unlockCategories: [...BASE_LOGI_CATS, "attach_pack", "attach_motor", "attach_comms"],
    decoration: "logi_2",
    personnelBonus: 4,
    resupplyEfficiency: 1.15,
  },
  logi_depot: {
    id: "logi_depot",
    name: "野战兵站",
    decorationLabel: "后勤兵站全环",
    branch: "logistics",
    stage: 3,
    type: "logistics",
    statMods: { leadership: 4, intellect: 3, stamina: 3 },
    unlockCategories: [
      ...BASE_LOGI_CATS,
      "attach_pack",
      "attach_motor",
      "attach_comms",
      "attach_conceal",
    ],
    decoration: "logi_3",
    personnelBonus: 4,
    resupplyEfficiency: 1.2,
    ammoRestoreBonus: 1,
  },
  ac_scout: {
    id: "ac_scout",
    name: "装甲车队",
    decorationLabel: "装甲钢青细环",
    branch: "armor",
    stage: 0,
    type: "armored_car",
    statMods: {},
    unlockCategories: ["ac_cannon", "med_field", "ration_stamina", "demo_at"],
    decoration: "armor_0",
  },
  ac_gun: {
    id: "ac_gun",
    name: "火力装甲车",
    decorationLabel: "装甲钢青半环",
    branch: "armor",
    stage: 1,
    type: "armored_car",
    statMods: { might: 4, stamina: 3 },
    unlockCategories: ["ac_cannon", "med_field", "ration_stamina", "demo_at"],
    decoration: "armor_1",
  },
  tank_crew: {
    id: "tank_crew",
    name: "坦克乘员",
    decorationLabel: "坦克钢金半环",
    branch: "armor",
    stage: 2,
    type: "tank",
    statMods: { might: 3, stamina: 4, agility: 2 },
    unlockCategories: ["tank_gun", "ac_cannon", "med_field", "ration_stamina", "demo_at"],
    decoration: "armor_2",
  },
  tank_ace: {
    id: "tank_ace",
    name: "装甲尖刀",
    decorationLabel: "坦克钢金麦穗全环",
    branch: "armor",
    stage: 3,
    type: "tank",
    statMods: { might: 4, leadership: 3, stamina: 3 },
    unlockCategories: ["tank_gun", "ac_cannon", "med_field", "ration_stamina", "demo_at"],
    decoration: "armor_3",
  },
};

/** 各体系可进化的下一阶（后勤 1 阶分叉）。 */
export const EVOLUTION_OPTIONS: Record<UnitClassId, UnitClassId[]> = {
  rifle_line: ["rifle_assault"],
  rifle_assault: ["rifle_marksman"],
  rifle_marksman: ["rifle_vanguard"],
  rifle_vanguard: [],
  mg_gunner: ["mg_section"],
  mg_section: ["mg_heavy"],
  mg_heavy: ["mg_fortress"],
  mg_fortress: [],
  mortar_crew: ["mortar_heavy"],
  mortar_heavy: ["arty_field"],
  arty_field: ["arty_rocket"],
  arty_rocket: [],
  logi_porter: ["logi_pack", "logi_motor"],
  logi_pack: ["logi_column"],
  logi_motor: ["logi_column"],
  logi_column: ["logi_depot"],
  logi_depot: [],
  ac_scout: ["ac_gun"],
  ac_gun: ["tank_crew"],
  tank_crew: ["tank_ace"],
  tank_ace: [],
};

export const DEFAULT_CLASS_FOR_TYPE: Record<UnitTypeId, UnitClassId> = {
  rifle: "rifle_line",
  mg: "mg_gunner",
  mortar: "mortar_crew",
  artillery: "arty_field",
  tank: "tank_crew",
  armored_car: "ac_scout",
  logistics: "logi_porter",
};

export const LEVELS_PER_EVOLVE = 6;

export function classDef(classId: UnitClassId): UnitClassDef {
  return UNIT_CLASSES[classId];
}

export function resolveClassId(classId: UnitClassId | undefined, type: UnitTypeId): UnitClassId {
  if (classId && UNIT_CLASSES[classId]) return classId;
  return DEFAULT_CLASS_FOR_TYPE[type];
}

export function evolveTokensAvailable(level: number, evolveCount: number): number {
  const earned = Math.min(3, Math.floor(Math.max(0, level) / LEVELS_PER_EVOLVE));
  return Math.max(0, earned - Math.max(0, evolveCount));
}

export function canEvolveTo(
  current: UnitClassId,
  next: UnitClassId,
  level: number,
  evolveCount: number,
): boolean {
  if (!EVOLUTION_OPTIONS[current]?.includes(next)) return false;
  if (evolveTokensAvailable(level, evolveCount) <= 0) return false;
  const needLevel = LEVELS_PER_EVOLVE * (evolveCount + 1);
  return level >= needLevel;
}

export function unlockedCategories(classId: UnitClassId): Set<GearCategoryId> {
  return new Set(UNIT_CLASSES[classId].unlockCategories);
}

export function applyClassStatMods(stats: CommanderStats, classId: UnitClassId): CommanderStats {
  return addStats(stats, UNIT_CLASSES[classId].statMods);
}

export const WEAPON_CATEGORY_TYPES: Record<WeaponCategoryId, UnitTypeId[]> = {
  infantry_rifle: ["rifle"],
  infantry_smg: ["rifle"],
  infantry_marksman: ["rifle"],
  infantry_at: ["rifle"],
  mg_lmg: ["mg"],
  mg_mmg: ["mg"],
  mg_hmg: ["mg"],
  mortar_light: ["mortar"],
  mortar_medium: ["mortar"],
  mortar_heavy: ["mortar"],
  arty_gun: ["artillery"],
  arty_heavy: ["artillery"],
  arty_rocket: ["artillery"],
  ac_cannon: ["armored_car"],
  tank_gun: ["tank"],
  logi_train: ["logistics"],
};

export const ITEM_CATEGORIES: Record<ItemCategoryId, { name: string }> = {
  med_field: { name: "战地救护" },
  ration_stamina: { name: "给养" },
  demo_at: { name: "爆破/反装甲" },
  fire_support_call: { name: "火力呼叫" },
  doctrine: { name: "复盘/训练" },
  signal: { name: "通信" },
};

export const ATTACHMENT_CATEGORIES: Record<AttachmentCategoryId, { name: string }> = {
  attach_engineer: { name: "工兵器材" },
  attach_pack: { name: "骡马驮载" },
  attach_motor: { name: "机动车" },
  attach_comms: { name: "通信器材" },
  attach_ammo: { name: "弹药携行" },
  attach_conceal: { name: "伪装防寒" },
  attach_medic: { name: "卫生组" },
  attach_optics: { name: "观瞄器材" },
  attach_armor: { name: "单兵防护" },
};

export const WEAPON_CATEGORY_LABELS: Record<WeaponCategoryId, string> = {
  infantry_rifle: "步枪/卡宾",
  infantry_smg: "冲锋枪",
  infantry_marksman: "特等射手步枪",
  infantry_at: "步兵反装甲",
  mg_lmg: "轻机枪",
  mg_mmg: "通用/重机枪",
  mg_hmg: "大口径机枪",
  mortar_light: "轻迫击炮",
  mortar_medium: "中口径迫击炮",
  mortar_heavy: "重迫击炮",
  arty_gun: "野战炮/山炮",
  arty_heavy: "重榴/加农",
  arty_rocket: "火箭炮",
  ac_cannon: "装甲车炮",
  tank_gun: "坦克炮",
  logi_train: "辎重装具",
};

/** 默认武器大类（未在 WeaponDef 上标注时）。 */
export function inferWeaponCategory(weapon: WeaponId, forTypes: UnitTypeId[]): WeaponCategoryId {
  const map: Partial<Record<WeaponId, WeaponCategoryId>> = {
    type38: "infantry_rifle",
    zhongzheng: "infantry_rifle",
    mosin: "infantry_rifle",
    m1_garand: "infantry_rifle",
    m1_carbine: "infantry_rifle",
    lee_enfield: "infantry_rifle",
    arsks: "infantry_rifle",
    type53_carbine: "infantry_rifle",
    ppsh50: "infantry_smg",
    pps43: "infantry_smg",
    thompson: "infantry_smg",
    ppsh_drum_elite: "infantry_smg",
    mosin_m44_marksman: "infantry_marksman",
    m1d_sniper: "infantry_marksman",
    mosin_scoped_hero: "infantry_marksman",
    bazooka: "infantry_at",
    rpg43: "infantry_at",
    panzerfaust: "infantry_at",
    zb26: "mg_lmg",
    dp28: "mg_lmg",
    bren: "mg_lmg",
    mac24: "mg_lmg",
    bar_m1918a2: "mg_lmg",
    m1919: "mg_mmg",
    sg43: "mg_mmg",
    type24_maxim: "mg_mmg",
    m2hb: "mg_hmg",
    m2hb_quad: "mg_hmg",
    mortar60: "mortar_light",
    m2_mortar: "mortar_light",
    mortar70_type: "mortar_light",
    mortar82: "mortar_medium",
    m1_mortar: "mortar_medium",
    mortar120: "mortar_heavy",
    m2_4_2_mortar: "mortar_heavy",
    mortar120_guard: "mortar_heavy",
    type75: "arty_gun",
    type92_infantry_gun: "arty_gun",
    type41_75: "arty_gun",
    m2a1_howitzer: "arty_gun",
    qf25: "arty_gun",
    zis3: "arty_gun",
    m30_122: "arty_heavy",
    m1_155: "arty_heavy",
    bm13: "arty_rocket",
    bm13_guards: "arty_rocket",
    ba64: "ac_cannon",
    m8_greyhound: "ac_cannon",
    su76: "ac_cannon",
    m24_chaffee: "ac_cannon",
    t34_85: "tank_gun",
    sherman: "tank_gun",
    centurion: "tank_gun",
    t34_85_215: "tank_gun",
    supply_cart: "logi_train",
  };
  if (map[weapon]) return map[weapon]!;
  if (forTypes.includes("rifle")) return "infantry_rifle";
  if (forTypes.includes("mg")) return "mg_lmg";
  if (forTypes.includes("mortar")) return "mortar_medium";
  if (forTypes.includes("artillery")) return "arty_gun";
  if (forTypes.includes("armored_car")) return "ac_cannon";
  if (forTypes.includes("tank")) return "tank_gun";
  return "logi_train";
}
