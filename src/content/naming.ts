import type { UnitTypeId } from "../core/types";
import { UNIT_TYPES } from "./units";

/** 决战朝鲜式番号：将领 + 兵种 + 部队序号；级别（新兵/老兵/精锐）另栏显示 */
export function typeLabel(type: UnitTypeId): string {
  return UNIT_TYPES[type].name;
}

export function designation(commander: string, type: UnitTypeId, serial: number): string {
  return `${commander}${typeLabel(type)}${serial}`;
}
