import { ITEMS } from "../content/items";
import { UNIT_TYPES, veterancyName } from "../content/units";
import { WEAPONS } from "../content/weapons";
import type { DamageBreakdown, GameEvent, GameState, Unit } from "../core/types";

export function factionLabel(faction: "player" | "enemy"): string {
  return faction === "player" ? "志愿军" : "联合军";
}

export function unitLabel(state: GameState, unitId: string): string {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return unitId;
  return `${factionLabel(unit.faction)}·${unitDisplayName(unit)}`;
}

/** 用户决策面统一显示将领名；编制番号保留在 duty/兵种副标题中。 */
export function unitDisplayName(unit: Pick<Unit, "name" | "commanderName">): string {
  return unit.commanderName?.trim() || unit.name;
}

export function unitTypeName(unit: Unit): string {
  return UNIT_TYPES[unit.type].name;
}

export interface Factor {
  label: string;
  value: number;
  /** 大于 1 表示对攻方有利 */
  favourable: boolean;
}

/** 把伤害构成拆成可读的因子，支撑「玩家能解释失败原因」 */
export function breakdownFactors(breakdown: DamageBreakdown): Factor[] {
  const entries: [string, number][] = [
    ["兵种克制", breakdown.matchup],
    ["等级", breakdown.veterancy],
    ["将领", breakdown.commander],
    ["武器", breakdown.weapon],
    ["疲劳", breakdown.fatigue],
    ["夹击", breakdown.flank],
    ["火力呼应", breakdown.coordination ?? 1],
    ["包围封锁", breakdown.encirclement ?? 1],
    ["目标地形", breakdown.terrain],
    ["目标防护", breakdown.defenderVeterancy],
    ["相互掩护", breakdown.defensiveSupport ?? 1],
    ["主力护卫", breakdown.keyGuard],
    ["天气", breakdown.weather],
    ["架设", breakdown.setup],
    ["居高临下", breakdown.highGround],
    ["战史加成", breakdown.scripted],
  ];
  return entries
    .filter(([, value]) => Math.abs(value - 1) > 0.001)
    .map(([label, value]) => ({ label, value, favourable: value > 1 }));
}

export function describeEvent(state: GameState, event: GameEvent): string | null {
  switch (event.type) {
    case "attacked": {
      const counter = event.counterDamage > 0 ? `，被反击 ${event.counterDamage}` : "";
      return `${unitLabel(state, event.attackerId)} 攻击 ${unitLabel(state, event.defenderId)}，造成 ${event.damage} 伤害${counter}`;
    }
    case "routed":
      return `${unitLabel(state, event.unitId)} 被击溃`;
    case "levelUp":
      return `${unitLabel(state, event.unitId)} 战斗等级提升（Lv.${event.from}→${event.to}）`;
    case "captured": {
      const objective = state.objectives.find((o) => o.id === event.objectiveId);
      const name = objective?.name ?? event.objectiveId;
      return `${factionLabel(event.by)} 控制了${name}`;
    }
    case "itemUsed": {
      const name = ITEMS[event.item].name;
      if (event.heal > 0) return `${unitLabel(state, event.unitId)} 使用${name}，回复 ${event.heal}`;
      return `${unitLabel(state, event.unitId)} 使用${name}，造成 ${event.damage} 伤害`;
    }
    case "resupplied": {
      const parts = [
        (event.personnel ?? 0) > 0 ? `调拨 ${event.personnel} 人` : "",
        event.heal > 0 ? `回复 ${event.heal}` : "",
        event.fatigueRelief > 0 ? `疲劳 -${event.fatigueRelief}` : "",
      ].filter(Boolean);
      return `${unitLabel(state, event.unitId)} 补充 ${unitLabel(state, event.targetId)}（${parts.join("，")}）`;
    }
    case "prisonersCaptured":
      return `${unitLabel(state, event.unitId)} 收容 ${event.amount} 名俘虏，转入编制（来自 ${unitLabel(state, event.sourceId)}）`;
    case "landmarkDiscovered": {
      const hint = event.tacticalHint ? `；${event.tacticalHint}` : "";
      return `抵达${event.placeName}：战地注记已解锁${hint}`;
    }
    case "itemPicked":
      return `${unitLabel(state, event.unitId)} 控制了${ITEMS[event.item].name}，战后结算`;
    case "lootSecured":
      return `${unitLabel(state, event.unitId)} 缴获${ITEMS[event.item].name}（${event.source === "elite" ? "精英掉落" : "地图物资"}）`;
    case "weaponPicked":
      return `${unitLabel(state, event.unitId)} 缴获了${WEAPONS[event.weapon].name}`;
    case "reinforced":
      return `联合军增援抵达（${event.unitIds.length} 个单位）`;
    case "evacuated":
      return `${unitLabel(state, event.unitId)} 已撤离，完整保留`;
    case "scripted":
      return `${event.note}（${event.unitIds.length} 个单位受影响）`;
    case "missionEnded":
      return `任务结束：${event.reason}`;
    default:
      return null;
  }
}

export function unitSummary(unit: Unit): string {
  return `${UNIT_TYPES[unit.type].name} · ${veterancyName(unit.exp)}`;
}
