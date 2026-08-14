import type { AttachmentId, UnitTypeId } from "../core/types";

/**
 * 附件是有限收藏品，不获得经验，也不按评分自动替换。
 * 规则层读取这些通用字段，缺省值代表没有该类效果。
 */
export interface AttachmentDef {
  id: AttachmentId;
  name: string;
  forTypes: UnitTypeId[];
  description: string;
  history: string;
  moveModifier?: number;
  defenseReduction?: number;
  rangedDefenseReduction?: number;
  barrageDefenseReduction?: number;
  stationaryOnly?: boolean;
  fortDamageMultiplier?: number;
  coldAttritionMultiplier?: number;
  snowMovePenaltyReduction?: number;
  supplyPenaltyMultiplier?: number;
  resupplyRangeBonus?: number;
  coordinationRelayRadius?: number;
  coordinationStaticOnly?: boolean;
  autoHealAmount?: number;
  autoHealLimit?: number;
  vehicle?: boolean;
  ignoresVehicleTerrain?: boolean;
}

export const ATTACHMENTS: Record<AttachmentId, AttachmentDef> = {
  engineer_tools: {
    id: "engineer_tools",
    name: "工兵镐铲组",
    forTypes: ["rifle", "mg", "mortar", "artillery", "logistics"],
    description: "静止时减伤 8%，攻击工事伤害 +10%。",
    history: "志愿军徒步工事构筑与近战器材",
    defenseReduction: 0.08,
    stationaryOnly: true,
    fortDamageMultiplier: 1.1,
  },
  pack_train: {
    id: "pack_train",
    name: "骡马驮载组",
    forTypes: ["logistics", "artillery"],
    description: "移动力 +1；不受车辆地形限制。",
    history: "朝鲜山地骡马运输与驮载炮兵",
    moveModifier: 1,
    ignoresVehicleTerrain: true,
  },
  field_telephone: {
    id: "field_telephone",
    name: "野战电话组",
    forTypes: ["rifle", "mg", "logistics", "artillery"],
    description: "静止时建立 5 格协同中继。",
    history: "美军与志愿军阵地间的有线野战电话",
    coordinationRelayRadius: 5,
    coordinationStaticOnly: true,
  },
  ammo_carrier: {
    id: "ammo_carrier",
    name: "弹药携行组",
    forTypes: ["mg", "mortar", "artillery"],
    description: "补给惩罚减半；移动力 -1。",
    history: "班组弹药携行员与炮弹人力运输",
    supplyPenaltyMultiplier: 0.5,
    moveModifier: -1,
  },
  camouflage_net: {
    id: "camouflage_net",
    name: "伪装网",
    forTypes: ["mg", "mortar", "artillery", "logistics"],
    description: "静止远程减伤 10%；炮击减伤 25%。",
    history: "阵地伪装与炮兵遮蔽网",
    rangedDefenseReduction: 0.1,
    barrageDefenseReduction: 0.25,
    stationaryOnly: true,
  },
  winter_kit: {
    id: "winter_kit",
    name: "防寒被服",
    forTypes: ["rifle", "mg", "mortar", "artillery", "logistics"],
    description: "严寒伤害 -60%；取消雪地额外移动惩罚。",
    history: "1950 年冬季严寒下的防寒被服与保暖装备",
    coldAttritionMultiplier: 0.4,
    snowMovePenaltyReduction: 1,
  },
  medic_team: {
    id: "medic_team",
    name: "卫生员组",
    forTypes: ["rifle", "mg", "mortar", "logistics"],
    description: "单位未攻击且不在敌方控制区时，回合末自动回复 6 人；每关最多 3 次。",
    history: "志愿军基层卫生员与战场简易救护组",
    autoHealAmount: 6,
    autoHealLimit: 3,
  },
  motor_transport: {
    id: "motor_transport",
    name: "汽车运输分队",
    forTypes: ["logistics"],
    description: "移动力 +2；补给距离增至 2 格；转为车辆地形规则。",
    history: "汽车运输分队与有限公路机动",
    moveModifier: 2,
    resupplyRangeBonus: 1,
    vehicle: true,
  },
  artillery_tractor: {
    id: "artillery_tractor",
    name: "炮兵牵引车组",
    forTypes: ["artillery"],
    description: "移动力 +2；转为车辆规则；移动后不能射击。",
    history: "火炮牵引车与炮兵阵地转移",
    moveModifier: 2,
    vehicle: true,
  },
  scr300_radio: {
    id: "scr300_radio",
    name: "缴获 SCR-300 电台",
    forTypes: ["rifle", "logistics", "artillery"],
    description: "移动状态下提供 7 格协同中继。",
    history: "美军 SCR-300 背负式无线电台缴获与改用",
    coordinationRelayRadius: 7,
  },
  rangefinder: {
    id: "rangefinder",
    name: "炮队镜与测距器",
    forTypes: ["mortar", "artillery"],
    description: "静止射程 +1；伤害 +5%。",
    history: "炮队镜、测距器与炮兵观察所器材",
    moveModifier: 0,
  },
  t52_vest: {
    id: "t52_vest",
    name: "T-52 防破片背心",
    forTypes: ["rifle", "mg"],
    description: "减伤 8%；移动力 -1。",
    history: "美军 T-52 防破片背心（越战前身的防护装备记录）",
    defenseReduction: 0.08,
    moveModifier: -1,
  },
};

export const ATTACHMENT_IDS = Object.keys(ATTACHMENTS) as AttachmentId[];

export function attachmentFits(attachment: AttachmentId, type: UnitTypeId): boolean {
  const def = ATTACHMENTS[attachment];
  return Boolean(def) && def.forTypes.includes(type);
}
