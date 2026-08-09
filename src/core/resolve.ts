import { BALANCE } from "../content/balance";
import { ITEMS } from "../content/items";
import { LOGISTICS, PROGRESS, UNIT_TYPES } from "../content/units";
import { WEAPONS, secondaryDamageMultiplier, weaponPattern } from "../content/weapons";
import { effectiveStats, inventoryForUnit, syncLevelFromExp } from "./commander";
import { COUNTER_RATIO, canCounter, computeDamage, itemDamage, refreshMaxHp } from "./combat";
import {
  canAttack,
  findPath,
  livingUnits,
  manhattan,
  orthogonalNeighbours,
  pathCost,
  resupplyOutcome,
  resupplyTargets,
  secondaryAttackTiles,
  unitAt,
} from "./grid";
import { isEvacTile } from "./mission";
import { deriveSeed, nextInt, nextRange } from "./rng";
import type { AttackImpact, GameEvent, GameState, ItemId, Unit, Vec2 } from "./types";

const FATIGUE = BALANCE.fatigue;

function addFatigue(unit: Unit, amount: number): void {
  unit.fatigue = Math.max(FATIGUE.min, Math.min(FATIGUE.max, unit.fatigue + amount));
}

function grantExp(
  unit: Unit,
  amount: number,
  state?: GameState,
  events?: GameEvent[],
): void {
  unit.exp += amount;
  const promotion = syncLevelFromExp(unit);
  refreshMaxHp(unit, state);
  if (promotion && events) {
    events.push({
      type: "levelUp",
      unitId: unit.id,
      from: promotion.from,
      to: promotion.to,
    });
  }
}

/** 只改经验/等级，不立刻发事件；交战动画需要先播攻击再播晋升 */
function grantExpSilent(unit: Unit, amount: number, state?: GameState): GameEvent | null {
  unit.exp += amount;
  const promotion = syncLevelFromExp(unit);
  refreshMaxHp(unit, state);
  if (!promotion) return null;
  return {
    type: "levelUp",
    unitId: unit.id,
    from: promotion.from,
    to: promotion.to,
  };
}

export function routUnit(state: GameState, unit: Unit, events: GameEvent[]): void {
  if (!unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  if (unit.faction === "player") state.stats.playerRouted += 1;
  else state.stats.enemyRouted += 1;
  events.push({ type: "routed", unitId: unit.id, faction: unit.faction });

  // 敌军精英 / 主将击溃后在原地掉落精英道具，供友军拾取
  if (unit.faction === "enemy" && unit.dropOptions && unit.dropOptions.length > 0) {
    const draw = nextInt(state.rng, 0, unit.dropOptions.length - 1);
    state.rng = draw.state;
    const item = unit.dropOptions[draw.value]!;
    state.pendingLoot ??= [];
    state.pendingLoot.push(item);
    events.push({ type: "lootSecured", unitId: unit.id, item, source: "elite" });
  }

  // 装备战利品使用独立 equipmentLoot 派生流，不改变战斗/天气/增援结果。
  if (unit.faction === "enemy" && unit.dropWeapons && unit.dropWeapons.length > 0) {
    const draw = nextInt(
      deriveSeed(state.seed, `equipmentLoot:${unit.id}:weapon:${state.turn}`),
      0,
      unit.dropWeapons.length - 1,
    );
    const weapon = unit.dropWeapons[draw.value]!;
    state.fieldWeapons.push({ id: `elite-wpn-${unit.id}`, weapon, x: unit.x, y: unit.y });
  }
  if (unit.faction === "enemy" && unit.dropAttachments && unit.dropAttachments.length > 0) {
    const draw = nextInt(
      deriveSeed(state.seed, `equipmentLoot:${unit.id}:attachment:${state.turn}`),
      0,
      unit.dropAttachments.length - 1,
    );
    const attachment = unit.dropAttachments[draw.value]!;
    (state.fieldAttachments ??= []).push({
      id: `elite-att-${unit.id}`,
      attachment,
      x: unit.x,
      y: unit.y,
    });
  }
}

/** 落地结算：战场拾取与撤离带判定，移动与击溃推进共用 */
function settleTileEntry(state: GameState, unit: Unit, events: GameEvent[]): void {
  if (unit.faction !== "player") return;
  const { x, y } = unit;

  const place = state.places.find((entry) => entry.x === x && entry.y === y);
  if (place) {
    const placeId = place.id ?? `${place.x},${place.y}`;
    state.discoveredPlaceIds ??= [];
    if (!state.discoveredPlaceIds.includes(placeId)) {
      state.discoveredPlaceIds.push(placeId);
      state.stats.landmarksDiscovered = state.discoveredPlaceIds.length;
      events.push({
        type: "landmarkDiscovered",
        placeId,
        placeName: place.name,
        historicalContext: place.historicalContext,
        tacticalHint: place.tacticalHint,
      });
    }
  }

  const pickedIndex = state.fieldItems.findIndex((i) => i.x === x && i.y === y);
  const picked = state.fieldItems[pickedIndex];
  if (picked) {
    state.fieldItems.splice(pickedIndex, 1);
    state.pendingLoot ??= [];
    state.pendingLoot.push(picked.item);
    events.push({ type: "itemPicked", unitId: unit.id, item: picked.item });
    events.push({ type: "lootSecured", unitId: unit.id, item: picked.item, source: "field" });
  }

  const weaponIndex = state.fieldWeapons.findIndex((i) => i.x === x && i.y === y);
  const weaponDrop = state.fieldWeapons[weaponIndex];
  if (weaponDrop) {
    state.fieldWeapons.splice(weaponIndex, 1);
    state.pendingWeapons.push(weaponDrop.weapon);
    events.push({ type: "weaponPicked", unitId: unit.id, weapon: weaponDrop.weapon });
  }

  const attachmentIndex = (state.fieldAttachments ?? []).findIndex((i) => i.x === x && i.y === y);
  const attachmentDrop = (state.fieldAttachments ?? [])[attachmentIndex];
  if (attachmentDrop) {
    state.fieldAttachments!.splice(attachmentIndex, 1);
    (state.pendingAttachments ??= []).push(attachmentDrop.attachment);
    events.push({ type: "attachmentPicked", unitId: unit.id, attachment: attachmentDrop.attachment });
  }

  if (isEvacTile(state, x, y)) {
    unit.evacuated = true;
    unit.hasActed = true;
    unit.mpLeft = 0;
    state.stats.playerEvacuated += 1;
    events.push({ type: "evacuated", unitId: unit.id });
  }
}

export function performMove(state: GameState, unit: Unit, to: Vec2, events: GameEvent[]): boolean {
  const cost = pathCost(state, unit, to);
  if (cost === null) return false;
  const occupant = unitAt(state, to.x, to.y);
  if (occupant && occupant.id !== unit.id) return false;

  const from = { x: unit.x, y: unit.y };
  const path = findPath(state, unit, to, from) ?? [from, { ...to }];
  unit.x = to.x;
  unit.y = to.y;
  unit.mpLeft -= cost;
  if (cost > 0) {
    unit.movedThisTurn = true;
    addFatigue(unit, cost * FATIGUE.perMoveCost);
  }
  events.push({ type: "moved", unitId: unit.id, from, to: { ...to }, cost, path });
  settleTileEntry(state, unit, events);

  return true;
}

/**
 * 敌军溃散后不再自动推进。若条件允许，按确定性随机收容少量俘虏，
 * 优先进入最近的后勤队，其次才进入发动攻击的作战单位。
 */
function capturePrisoners(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  events: GameEvent[],
): void {
  if (attacker.faction !== "player" || defender.faction !== "enemy") return;

  const chance = nextRange(state.rng, 0, 1);
  state.rng = chance.state;
  if (chance.value > BALANCE.prisoners.chance) return;

  const recipients = livingUnits(state, "player")
    .filter((unit) => unit.type === "logistics" || unit.id === attacker.id)
    .sort((a, b) => {
      const aRoom = a.maxHp - a.hp;
      const bRoom = b.maxHp - b.hp;
      return bRoom - aRoom || manhattan(a, defender) - manhattan(b, defender) || a.id.localeCompare(b.id);
    });
  const recipient = recipients.find((unit) => unit.hp < unit.maxHp);
  if (!recipient) return;

  const draw = nextInt(state.rng, BALANCE.prisoners.min, BALANCE.prisoners.max);
  state.rng = draw.state;
  const amount = Math.min(draw.value, recipient.maxHp - recipient.hp);
  if (amount <= 0) return;

  recipient.hp += amount;
  state.stats.prisonersCaptured = (state.stats.prisonersCaptured ?? 0) + amount;
  events.push({ type: "prisonersCaptured", unitId: recipient.id, sourceId: defender.id, amount });
}

export function performAttack(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  events: GameEvent[],
): boolean {
  if (!canAttack(state, attacker, defender)) return false;

  const defenderHpFrom = defender.hp;
  const attackerHpFrom = attacker.hp;
  const attackerFrom = { x: attacker.x, y: attacker.y };
  const defenderFrom = { x: defender.x, y: defender.y };
  const pendingPromotes: GameEvent[] = [];
  const secondaryImpacts: AttackImpact[] = [];
  const secondaryRouted: Unit[] = [];

  const main = computeDamage(state, attacker, defender, state.rng);
  state.rng = main.rng;
  defender.hp -= main.damage;
  {
    const promote = grantExpSilent(attacker, main.damage * PROGRESS.expPerDamage, state);
    if (promote) pendingPromotes.push(promote);
  }
  if (attacker.faction === "player") state.stats.damageDealt += main.damage;
  else state.stats.damageTaken += main.damage;

  let counterDamage = 0;
  if (defender.hp > 0 && canCounter(state, attacker, defender)) {
    const counter = computeDamage(state, defender, attacker, state.rng);
    state.rng = counter.rng;
    counterDamage = Math.max(1, Math.round(counter.damage * COUNTER_RATIO));
    attacker.hp -= counterDamage;
    {
      const promote = grantExpSilent(defender, counterDamage * PROGRESS.expPerDamage, state);
      if (promote) pendingPromotes.push(promote);
    }
    if (defender.faction === "player") state.stats.damageDealt += counterDamage;
    else state.stats.damageTaken += counterDamage;
  }

  const defenderRouted = defender.hp <= 0;
  const attackerRouted = attacker.hp <= 0;

  for (const tile of secondaryAttackTiles(state, attacker, defender)) {
    const victim = unitAt(state, tile.x, tile.y);
    if (!victim || !victim.alive || victim.id === defender.id) continue;
    const { pattern } = weaponPattern(attacker.weapon, attacker.type);
    const multiplier = pattern.kind === "single" ? 0 : pattern.multiplier;
    const friendlyMultiplier = secondaryDamageMultiplier(attacker.faction, victim.faction);
    const secondaryDamage = Math.max(
      1,
      Math.round(main.damage * multiplier * friendlyMultiplier),
    );
    const hpFrom = victim.hp;
    victim.hp = Math.max(0, victim.hp - secondaryDamage);
    const routed = victim.hp <= 0;
    secondaryImpacts.push({
      unitId: victim.id,
      at: { ...tile },
      damage: secondaryDamage,
      hpFrom,
      hpTo: victim.hp,
      routed,
      friendly: victim.faction === attacker.faction,
    });
    if (victim.faction === "player") state.stats.damageTaken += secondaryDamage;
    else if (attacker.faction === "player") state.stats.damageDealt += secondaryDamage;
    if (routed) secondaryRouted.push(victim);
  }

  // 先发 attacked（带本击血量/溃散），再发晋升与 routed，保证 FX 时间线：命中→掉血→溃散→收容
  events.push({
    type: "attacked",
    attackerId: attacker.id,
    defenderId: defender.id,
    damage: main.damage,
    breakdown: main.breakdown,
    counterDamage,
    defenderHpFrom,
    defenderHpTo: Math.max(0, defender.hp),
    attackerHpFrom,
    attackerHpTo: Math.max(0, attacker.hp),
    defenderRouted,
    attackerRouted,
    attackerFrom,
    defenderFrom,
    weapon: attacker.weapon,
    effectProfile: weaponPattern(attacker.weapon, attacker.type).profile,
    secondaryHits: secondaryImpacts.length > 0 ? secondaryImpacts : undefined,
  });
  for (const promote of pendingPromotes) events.push(promote);

  if (defenderRouted) {
    routUnit(state, defender, events);
    grantExp(attacker, PROGRESS.expPerRout, state, events);
    capturePrisoners(state, attacker, defender, events);
  }

  const splashRatio = WEAPONS[attacker.weapon]?.splashRatio ?? 0;
  if (splashRatio > 0) {
    for (const pos of orthogonalNeighbours(defenderFrom)) {
      const splashTarget = unitAt(state, pos.x, pos.y);
      if (!splashTarget || splashTarget.faction === attacker.faction || !splashTarget.alive) continue;
      const splashDamage = Math.max(1, Math.round(main.damage * splashRatio));
      splashTarget.hp -= splashDamage;
      if (attacker.faction === "player") state.stats.damageDealt += splashDamage;
      else state.stats.damageTaken += splashDamage;
      const promote = grantExpSilent(attacker, splashDamage * PROGRESS.expPerDamage, state);
      if (promote) events.push(promote);
      if (splashTarget.hp <= 0) {
        routUnit(state, splashTarget, events);
        grantExp(attacker, PROGRESS.expPerRout, state, events);
        capturePrisoners(state, attacker, splashTarget, events);
      }
    }
  }
  if (attackerRouted) {
    routUnit(state, attacker, events);
    grantExp(defender, PROGRESS.expPerRout, state, events);
  }
  for (const victim of secondaryRouted) {
    if (!victim.alive) continue;
    routUnit(state, victim, events);
    if (victim.faction === "enemy") {
      grantExp(attacker, PROGRESS.expPerRout, state, events);
      capturePrisoners(state, attacker, victim, events);
    }
  }

  addFatigue(attacker, FATIGUE.perAttack);
  attacker.attackedThisTurn = true;
  const cooldown = WEAPONS[attacker.weapon]?.cooldownTurns ?? 0;
  if (cooldown > 0) attacker.weaponCooldownUntil = state.turn + cooldown;
  attacker.hasActed = true;
  attacker.mpLeft = 0;
  return true;
}

export function performCapture(state: GameState, unit: Unit, events: GameEvent[]): boolean {
  if (!UNIT_TYPES[unit.type].canCapture) return false;
  const objective = state.objectives.find(
    (o) => o.kind === "capture" && o.x === unit.x && o.y === unit.y,
  );
  if (!objective || objective.owner === unit.faction) return false;

  objective.owner = unit.faction;
  unit.hasActed = true;
  unit.mpLeft = 0;
  events.push({ type: "captured", objectiveId: objective.id, by: unit.faction });
  return true;
}

export function performWait(_state: GameState, unit: Unit): boolean {
  addFatigue(unit, FATIGUE.perWait);
  unit.hasActed = true;
  unit.mpLeft = 0;
  return true;
}

/** 后勤邻接补充：从后勤人员池转移兵员，并降低疲劳、恢复弹药窗口。 */
export function performResupply(
  state: GameState,
  unit: Unit,
  target: Unit,
  events: GameEvent[],
): boolean {
  if (unit.type !== "logistics") return false;
  if (!resupplyTargets(state, unit).some((ally) => ally.id === target.id)) return false;
  const preview = resupplyOutcome(state, unit, target);
  const { personnel, fatigueRelief } = preview;
  if (personnel <= 0 && fatigueRelief <= 0 && !preview.ammoRestored) return false;
  // 人员守恒：后勤减少多少，作战单位就增加多少，禁止凭空回血。
  unit.hp -= personnel;
  target.hp += personnel;
  addFatigue(target, -fatigueRelief);
  // 弹药恢复：显式补弹，或治疗/消疲时顺带恢复（仅玩家）
  if (
    target.faction === "player" &&
    state.scripted.some((rule) => rule.kind === "supplyWindow") &&
    (preview.ammoRestored || personnel > 0 || fatigueRelief > 0)
  ) {
    target.supplyRestoredUntil = state.turn + LOGISTICS.ammoRestoreTurns;
  }
  unit.hasActed = true;
  unit.mpLeft = 0;
  events.push({
    type: "resupplied",
    unitId: unit.id,
    targetId: target.id,
    personnel,
    heal: 0,
    fatigueRelief,
  });
  return true;
}

export interface ItemUsage {
  item: ItemId;
  targetId?: string;
  to?: Vec2;
}

export function performItem(
  state: GameState,
  unit: Unit,
  usage: ItemUsage,
  events: GameEvent[],
): boolean {
  const def = ITEMS[usage.item];
  const backpack = unit.backpack;
  const backpackIndex = backpack?.indexOf(usage.item) ?? -1;
  // 有明确背包时，道具所有权必须落在当前单位；旧存档无 backpack 才回退共享库存。
  if (backpack && backpackIndex < 0) return false;
  if ((state.inventory[usage.item] ?? 0) <= 0) return false;

  let heal = 0;
  let damage = 0;
  const targetIds: string[] = [];

  if (def.targeting === "self") {
    const canHeal = def.heal > 0 && unit.hp < unit.maxHp;
    const canFatigue = (def.fatigueRelief ?? 0) > 0 && unit.fatigue > 0;
    const canExp = (def.expGain ?? 0) > 0;
    if (!canHeal && !canFatigue && !canExp) return false;
    if (canHeal) {
      heal = Math.min(def.heal, unit.maxHp - unit.hp);
      unit.hp += heal;
    }
    if (canFatigue) {
      addFatigue(unit, -(def.fatigueRelief ?? 0));
    }
    if (canExp) {
      grantExp(unit, def.expGain ?? 0, state, events);
    }
    targetIds.push(unit.id);
  } else if (def.targeting === "target") {
    const target = state.units.find((u) => u.id === usage.targetId);
    if (!target || !target.alive || target.faction === unit.faction) return false;
    if (manhattan(unit, target) > def.range) return false;
    const dealt = itemDamage(usage.item, target, unit, state);
    if (dealt <= 0) return false;
    target.hp -= dealt;
    damage += dealt;
    targetIds.push(target.id);
    if (target.hp <= 0) {
      routUnit(state, target, events);
      grantExp(unit, PROGRESS.expPerRout, state, events);
      capturePrisoners(state, unit, target, events);
    }
  } else {
    const center = usage.to;
    if (!center) return false;
    if (manhattan(unit, center) > def.range) return false;
    const tiles = def.splash ? [center, ...orthogonalNeighbours(center)] : [center];
    const intellectScale =
      1 + Math.max(0, effectiveStats(unit, inventoryForUnit(unit, state.inventory)).intellect - 40) * 0.005;
    for (const tile of tiles) {
      const victim = unitAt(state, tile.x, tile.y);
      if (!victim || victim.faction === unit.faction) continue;
      const dealt = Math.round(def.damage * intellectScale);
      victim.hp -= dealt;
      damage += dealt;
      targetIds.push(victim.id);
      if (victim.hp <= 0) {
        routUnit(state, victim, events);
        grantExp(unit, PROGRESS.expPerRout, state, events);
        capturePrisoners(state, unit, victim, events);
      }
    }
    if (targetIds.length === 0) return false;
  }

  state.inventory[usage.item] -= 1;
  if (backpack && backpackIndex >= 0) backpack.splice(backpackIndex, 1);
  if (unit.faction === "player") state.stats.damageDealt += damage;
  unit.hasActed = true;
  unit.mpLeft = 0;
  events.push({ type: "itemUsed", unitId: unit.id, item: usage.item, targetIds, damage, heal });
  return true;
}

export function activeUnits(state: GameState, faction: Unit["faction"]): Unit[] {
  return livingUnits(state, faction).filter((u) => !u.hasActed);
}
