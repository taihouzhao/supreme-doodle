import { ATTACHMENTS } from "../content/attachments";
import { UNIT_TYPES } from "../content/units";
import { WEAPONS } from "../content/weapons";
import type { GameState, Unit } from "./types";

export function weaponFor(unit: Unit) {
  return WEAPONS[unit.weapon];
}

export function attachmentFor(unit: Unit) {
  return unit.attachment ? ATTACHMENTS[unit.attachment] : undefined;
}

/** 单位的最终车辆属性。BM-13 自带车辆；汽车/牵引车附件也会把单位变成车辆。 */
export function isMotorized(unit: Unit): boolean {
  return Boolean(
    UNIT_TYPES[unit.type].vehicle ||
      weaponFor(unit)?.motorized ||
      weaponFor(unit)?.vehicle ||
      attachmentFor(unit)?.vehicle,
  );
}

/** 骡马驮载不受车辆地形限制；其他摩托化装备沿用车辆规则。 */
export function ignoresVehicleTerrain(unit: Unit): boolean {
  return Boolean(attachmentFor(unit)?.ignoresVehicleTerrain);
}

export function movementModifier(unit: Unit): number {
  return (weaponFor(unit)?.moveModifier ?? 0) + (attachmentFor(unit)?.moveModifier ?? 0);
}

export function effectiveIndirect(unit: Unit): boolean {
  return weaponFor(unit)?.directFire === true ? false : UNIT_TYPES[unit.type].indirect;
}

export function requiresSetup(unit: Unit): boolean {
  return Boolean(weaponFor(unit)?.requiresSetup || unit.attachment === "artillery_tractor");
}

export function hasWeaponCooldown(unit: Unit, turn: number): boolean {
  // `weaponCooldownUntil` is inclusive: a two-turn cooldown fired on T blocks
  // T+1 and T+2, then becomes available on T+3.
  return (unit.weaponCooldownUntil ?? 0) >= turn;
}

export function equipmentDamageMultiplier(unit: Unit, state: GameState, defender?: Unit): number {
  const weapon = weaponFor(unit);
  const attachment = attachmentFor(unit);
  let value = weapon?.damageMultiplier ?? 1;
  if (unit.movedThisTurn) value *= weapon?.movingDamageMultiplier ?? 1;
  if (attachment?.forTypes.includes(unit.type) && attachment.id === "rangefinder" && !unit.movedThisTurn) {
    value *= 1.05;
  }
  if (defender && tileIsFort(state, defender) && weapon?.fortDamageMultiplier) {
    value *= weapon.fortDamageMultiplier;
  }
  if (defender && tileIsFort(state, defender) && attachment?.fortDamageMultiplier) {
    value *= attachment.fortDamageMultiplier;
  }
  return value;
}

export function matchupMultiplier(unit: Unit, defender: Unit): number {
  return weaponFor(unit)?.matchupModifiers?.[defender.type] ?? 1;
}

export function supplyPenaltyMultiplier(unit: Unit): number {
  return (weaponFor(unit)?.supplyPenaltyMultiplier ?? 1) * (attachmentFor(unit)?.supplyPenaltyMultiplier ?? 1);
}

export function equipmentDefenseReduction(unit: Unit, ranged: boolean): number {
  const weapon = weaponFor(unit);
  const attachment = attachmentFor(unit);
  let reduction = weapon?.defenseBonus ?? 0;
  if (attachment?.defenseReduction && (!attachment.stationaryOnly || !unit.movedThisTurn)) {
    reduction = 1 - (1 - reduction) * (1 - attachment.defenseReduction);
  }
  if (ranged && attachment?.rangedDefenseReduction && (!attachment.stationaryOnly || !unit.movedThisTurn)) {
    reduction = 1 - (1 - reduction) * (1 - attachment.rangedDefenseReduction);
  }
  // 装备减伤总和封顶 15%，避免叠加形成绝对防御。
  return Math.min(0.15, Math.max(0, reduction));
}

export function barrageDefenseReduction(unit: Unit): number {
  return Math.min(0.15, attachmentFor(unit)?.barrageDefenseReduction ?? 0);
}

export function coldAttritionMultiplier(unit: Unit): number {
  return attachmentFor(unit)?.coldAttritionMultiplier ?? 1;
}

export function snowMovePenaltyReduction(unit: Unit): number {
  return attachmentFor(unit)?.snowMovePenaltyReduction ?? 0;
}

export function resupplyRange(unit: Unit): number {
  return 1 + (attachmentFor(unit)?.resupplyRangeBonus ?? 0);
}

export function coordinationRelay(unit: Unit): { radius: number; staticOnly: boolean; label: string } | null {
  const attachment = attachmentFor(unit);
  if (!attachment?.coordinationRelayRadius) return null;
  return {
    radius: attachment.coordinationRelayRadius,
    staticOnly: Boolean(attachment.coordinationStaticOnly),
    label: attachment.id === "scr300_radio" ? "SCR-300移动中继" : "野战电话静止中继",
  };
}

function tileIsFort(state: GameState, unit: Unit): boolean {
  return state.tiles[unit.y * state.width + unit.x] === "fort";
}
