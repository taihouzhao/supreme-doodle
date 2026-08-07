import type { UnitTypeId } from "../core/types";
import { UNIT_TYPES } from "./units";

/** 决战朝鲜式番号：一名主将只带一支部队 = 将领 + 兵种；级别另栏显示 */
export function typeLabel(type: UnitTypeId): string {
  return UNIT_TYPES[type].name;
}

export function designation(commander: string, type: UnitTypeId): string {
  return `${commander}${typeLabel(type)}`;
}
