import { BALANCE } from "../content/balance";
import { adaptFromPower, computePlayerPower } from "../content/enemyAdapt";
import { DEFAULT_CLASS_FOR_TYPE, resolveClassId } from "../content/evolution";
import { ITEM_IDS, ITEMS } from "../content/items";
import { TERRAIN_CHARS } from "../content/terrain";
import { addStats, allocatePoints, GROWTH_WEIGHTS, scaleEnemyExp } from "../content/progress";
import { UNIT_TYPES } from "../content/units";
import { WEAPONS, defaultWeaponFor, weaponForEquipment } from "../content/weapons";
import type { MissionConfig } from "../content/missions/schema";
import {
  agilityMoveBonus,
  effectiveMaxHp,
  effectiveStats,
  inventoryForUnit,
  makeEnemyCommander,
  makeStoryCommander,
} from "./commander";
import { inEnemyZoc, livingUnits, tileAt, unitAt } from "./grid";
import {
  barrageDefenseReduction,
  coldAttritionMultiplier,
  ignoresVehicleTerrain,
  isMotorized,
  movementModifier,
  snowMovePenaltyReduction,
  supplyPenaltyMultiplier,
} from "./equipment";
import { Rng, deriveSeed } from "./rng";
import type {
  CommanderKind,
  CommanderStats,
  EliteTier,
  FieldItem,
  FieldAttachment,
  FieldWeapon,
  GameEvent,
  GameState,
  ItemId,
  AttachmentId,
  Objective,
  TerrainId,
  Unit,
  UnitClassId,
  UnitPortraitGroup,
  Vec2,
  WeaponId,
} from "./types";

export interface RosterUnit {
  id: string;
  name: string;
  type: Unit["type"];
  hp: number;
  maxHp: number;
  exp: number;
  fatigue: number;
  missionsSurvived: number;
  /** 跨关稳定的主角标记；不会因为兵种或经验排序漂移。 */
  keyUnit: boolean;
  commanderKind: Extract<CommanderKind, "companion">;
  commanderName: string;
  portraitId?: string;
  backpack?: ItemId[];
  level: number;
  duty?: string;
  /** 史实简介（花名册 / 简报） */
  bio?: string;
  /** 1 级绝对底板；归队/降级时按此重算 */
  baseStats: CommanderStats;
  stats: CommanderStats;
  weapon: WeaponId;
  attachment?: AttachmentId;
  /** 玩家在军械库里手动指定过武器；自动换装不再覆盖 */
  manualWeapon?: boolean;
  classId?: UnitClassId;
  evolveCount?: number;
}

export interface MissionSetup {
  mission: MissionConfig;
  seed: number;
  roster: RosterUnit[];
  inventory: Record<ItemId, number>;
  /** 战役内自适应上下文；单关模拟省略 */
  adaptContext?: {
    missionIndex: number;
    priorWins: number;
  };
}

function parseMap(rows: string[]): { tiles: TerrainId[]; width: number; height: number } {
  const height = rows.length;
  const width = (rows[0] ?? "").length;
  const tiles: TerrainId[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`地图第 ${y} 行宽度为 ${row.length}，应为 ${width}`);
    }
    for (const char of row) {
      const terrain = TERRAIN_CHARS[char];
      if (!terrain) throw new Error(`未知地形字符: ${char}`);
      tiles.push(terrain);
    }
  });
  return { tiles, width, height };
}

function normalizeUnitBackpack(items: ItemId[] | undefined): ItemId[] | undefined {
  if (items === undefined) return undefined;
  const result: ItemId[] = [];
  let weight = 0;
  for (const item of items) {
    if (!ITEM_IDS.includes(item) || result.length >= 3) continue;
    const nextWeight = weight + (ITEMS[item].slotWeight ?? 1);
    if (nextWeight > 4) continue;
    result.push(item);
    weight = nextWeight;
  }
  return result;
}

function makeUnit(params: {
  id: string;
  rosterId: string | null;
  faction: Unit["faction"];
  type: Unit["type"];
  name: string;
  equipment?: string;
  weapon: WeaponId;
  commanderKind: CommanderKind;
  commanderName: string;
  eliteTier?: EliteTier;
  backpack?: ItemId[];
  portraitGroup?: UnitPortraitGroup;
  portraitIndex?: number;
  portraitId?: string;
  level: number;
  duty?: string;
  baseStats?: CommanderStats;
  stats: CommanderStats;
  x: number;
  y: number;
  exp: number;
  hp?: number;
  fatigue?: number;
  keyUnit?: boolean;
  attachment?: AttachmentId;
  classId?: UnitClassId;
  evolveCount?: number;
  dropOptions?: ItemId[];
  dropWeapons?: WeaponId[];
  dropAttachments?: AttachmentId[];
}): Unit {
  const draft: Unit = {
    id: params.id,
    rosterId: params.rosterId,
    faction: params.faction,
    type: params.type,
    name: params.name,
    equipment: params.equipment ?? WEAPONS[params.weapon]?.name ?? UNIT_TYPES[params.type].name,
    weapon: params.weapon,
    attachment: params.attachment,
    classId: params.classId ?? DEFAULT_CLASS_FOR_TYPE[params.type],
    evolveCount: params.evolveCount ?? 0,
    commanderKind: params.commanderKind,
    commanderName: params.commanderName,
    eliteTier: params.eliteTier ?? null,
    backpack: normalizeUnitBackpack(params.backpack),
    portraitGroup: params.portraitGroup,
    portraitIndex: params.portraitIndex,
    portraitId: params.portraitId,
    level: params.level,
    duty: params.duty,
    baseStats: params.baseStats,
    stats: params.stats,
    x: params.x,
    y: params.y,
    hp: 1,
    maxHp: 1,
    exp: params.exp,
    fatigue: params.fatigue ?? 0,
    mpLeft: 0,
    movedThisTurn: false,
    hasActed: false,
    alive: true,
    evacuated: false,
    keyUnit: params.keyUnit ?? false,
    dropOptions: params.dropOptions,
    dropWeapons: params.dropWeapons,
    dropAttachments: params.dropAttachments,
  };
  const maxHp = effectiveMaxHp(draft);
  draft.maxHp = maxHp;
  draft.hp = Math.min(params.hp ?? maxHp, maxHp);
  return draft;
}

export function createMissionState(setup: MissionSetup): GameState {
  const { mission, seed, roster, inventory } = setup;
  const { tiles, width, height } = parseMap(mission.map);

  const compRng = new Rng(deriveSeed(seed, "enemyComp"));
  const waveRng = new Rng(deriveSeed(seed, "reinforce"));
  const weatherRng = new Rng(deriveSeed(seed, "weather"));
  const itemRng = new Rng(deriveSeed(seed, "items"));
  const equipmentLootRng = new Rng(deriveSeed(seed, "equipmentLoot"));

  const portraitCounters: Record<UnitPortraitGroup, number> = {
    pva: 0,
    rok: 0,
    us: 0,
    uk: 0,
    fr: 0,
  };
  const nextPortrait = (group: UnitPortraitGroup): number => {
    const index = portraitCounters[group]++;
    if (index >= 8) {
      throw new Error(`${mission.id} 的 ${group} 单位超过 8 个独立肖像槽`);
    }
    return index;
  };
  const enemyPortraitGroup = (name: string): UnitPortraitGroup => {
    if (mission.id === "m1-onjong" || mission.id === "m12-kumsong" || /韩军|韩\d|韩国/.test(name)) {
      return "rok";
    }
    if (mission.id === "m8-imjin") return "uk";
    if (/法军|法国/.test(name)) return "fr";
    return "us";
  };

  const enemySpecs = mission.enemies.map((spec) => ({ ...spec }));
  for (const slot of mission.variantSlots) {
    const target = enemySpecs[slot.index];
    if (!target) continue;
    target.type = compRng.pick(slot.options);
  }

  const units: Unit[] = [];
  const backpackMode = roster.some((unit) => (unit.backpack?.length ?? 0) > 0);
  const era = mission.equipmentEra ?? "early";
  const keyRosterId = roster.find((unit) => unit.keyUnit)?.id;
  let spawnIndex = 0;

  roster.forEach((rosterUnit) => {
    const spawn = mission.playerSpawns[spawnIndex];
    if (!spawn) return;
    spawnIndex += 1;
    units.push(
      makeUnit({
        id: `p${units.length}`,
        rosterId: rosterUnit.id,
        faction: "player",
        type: rosterUnit.type,
        name: rosterUnit.name,
        // 花名册实际装备决定战斗结算与显示；关卡装备表只用于历史简报。
        equipment: WEAPONS[rosterUnit.weapon].name,
        weapon: rosterUnit.weapon,
        attachment: rosterUnit.attachment,
        classId: resolveClassId(rosterUnit.classId, rosterUnit.type),
        evolveCount: rosterUnit.evolveCount ?? 0,
        commanderKind: rosterUnit.commanderKind,
        commanderName: rosterUnit.commanderName,
        portraitGroup: "pva",
        portraitIndex: nextPortrait("pva"),
        portraitId: rosterUnit.portraitId,
        level: rosterUnit.level,
        duty: rosterUnit.duty,
        baseStats: rosterUnit.baseStats,
        stats: rosterUnit.stats,
        x: spawn.x,
        y: spawn.y,
        exp: rosterUnit.exp,
        hp: rosterUnit.hp,
        fatigue: rosterUnit.fatigue,
        keyUnit: rosterUnit.id === keyRosterId,
        backpack: backpackMode ? rosterUnit.backpack ?? [] : undefined,
      }),
    );
  });

  for (const ally of mission.storyAllies ?? []) {
    const spawn = mission.playerSpawns[spawnIndex];
    if (!spawn) break;
    spawnIndex += 1;
    const weapon = ally.weapon ?? defaultWeaponFor(ally.type, era);
    const profile = makeStoryCommander(ally.commander, ally.type, ally.level, weapon, ally.stats);
    units.push(
      makeUnit({
        id: `s${units.length}`,
        rosterId: null,
        faction: "player",
        type: ally.type,
        name: ally.commander,
        equipment: ally.equipment ?? WEAPONS[weapon].name,
        attachment: ally.attachment,
        ...profile,
        portraitGroup: "pva",
        portraitIndex: nextPortrait("pva"),
        duty: ally.duty ?? `临时配属${UNIT_TYPES[ally.type].name}分队`,
        x: spawn.x,
        y: spawn.y,
        keyUnit: false,
        backpack: backpackMode ? [] : undefined,
      }),
    );
  }

  const commandersById = new Map((mission.commanders ?? []).map((c) => [c.id, c]));

  const adapt = adaptFromPower(computePlayerPower(roster), setup.adaptContext);
  let eliteSlotsGranted = 0;

  const buildEnemyUnit = (
    spec: (typeof enemySpecs)[number],
    id: string,
    defaultDuty: string,
  ): Unit => {
    const linked = spec.commanderId ? commandersById.get(spec.commanderId) : undefined;
    let elite = Boolean(
      spec.commanderId ||
        spec.title ||
        (spec.dropOptions?.length ?? 0) > 0 ||
        (spec.dropWeapons?.length ?? 0) > 0 ||
        (spec.dropAttachments?.length ?? 0) > 0,
    );
    // 高战力时额外拔擢 0–1 个普通编制为精英（确定性：按 id 排序取第一个非精英）
    if (!elite && eliteSlotsGranted < adapt.eliteBonusSlots && !linked) {
      elite = true;
      eliteSlotsGranted += 1;
    }
    const name = linked
      ? `${linked.name}指挥部`
      : (spec.name ?? UNIT_TYPES[spec.type].name);
    const weapon = spec.weapon ?? weaponForEquipment(spec.type, spec.equipment, "enemy");
    const baseExp = scaleEnemyExp(mission.id, spec.exp ?? 0);
    const expBoost = Math.round((elite ? 22 : 0) * adapt.adaptFactor);
    const exp = baseExp + expBoost;
    const profile = makeEnemyCommander(spec.type, exp, weapon, name);
    const boss = Boolean(linked);
    const bonusPoints = boss ? 6 : elite ? 3 : 0;
    if (bonusPoints > 0) {
      profile.stats = addStats(
        profile.stats,
        allocatePoints(GROWTH_WEIGHTS[spec.type], bonusPoints, name.length + (boss ? 7 : 3)),
      );
    }
    const portraitGroup = enemyPortraitGroup(
      linked ? `${linked.formation} ${linked.name}` : name,
    );
    const duty = spec.title ?? (linked ? "敌军主将" : defaultDuty);
    const unit = makeUnit({
      id,
      rosterId: null,
      faction: "enemy",
      type: spec.type,
      name,
      equipment: spec.equipment ?? WEAPONS[weapon].name,
      ...profile,
      commanderName: linked?.name ?? profile.commanderName,
      portraitGroup,
      portraitIndex: nextPortrait(portraitGroup),
      portraitId: linked?.portrait,
      duty,
      x: spec.x,
      y: spec.y,
      hp: spec.hp,
      dropOptions: spec.dropOptions,
      eliteTier: boss ? "boss" : elite ? "elite" : null,
      dropWeapons: spec.dropWeapons,
      dropAttachments: spec.dropAttachments,
    });
    if (boss) {
      unit.maxHp = Math.round(unit.maxHp * 1.06);
      unit.hp = Math.min(unit.maxHp, Math.round((spec.hp ?? unit.hp) * 1.06));
    }
    return unit;
  };

  enemySpecs.forEach((spec, index) => {
    units.push(buildEnemyUnit(spec, `e${index}`, "敌军作战分队"));
  });

  const pending = mission.waves.map((wave, waveIndex) => {
    const lo = wave.window[0];
    const hi = wave.window[1];
    const turn = Math.max(lo, waveRng.int(lo, hi) - adapt.reinforceEarlyBias);
    const waveUnits = wave.units.map((spec, unitIndex) =>
      buildEnemyUnit(spec, `w${waveIndex}_${unitIndex}`, "敌军增援分队"),
    );
    return { turn, units: waveUnits };
  });

  const fieldItems: FieldItem[] = mission.itemDrops.map((drop, index) => ({
    id: `item${index}`,
    item: itemRng.pick(drop.options),
    x: drop.x,
    y: drop.y,
  }));

  const weaponRng = new Rng(deriveSeed(seed, "equipmentLoot:weapons"));
  const fieldWeapons: FieldWeapon[] = (mission.weaponDrops ?? []).map((drop, index) => ({
    id: `wpn${index}`,
    weapon: weaponRng.pick(drop.options),
    x: drop.x,
    y: drop.y,
  }));

  const fieldAttachments: FieldAttachment[] = (mission.attachmentDrops ?? []).map((drop, index) => ({
    id: `att${index}`,
    attachment: equipmentLootRng.pick(drop.options),
    x: drop.x,
    y: drop.y,
  }));

  const objectives: Objective[] = mission.objectives.map((spec) => ({
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    x: spec.x,
    y: spec.y,
    owner: spec.owner,
  }));

  const state: GameState = {
    missionId: mission.id,
    missionKind: mission.kind,
    seed,
    rng: deriveSeed(seed, "combat"),
    turn: 1,
    maxTurns: mission.maxTurns,
    enemyDamageMultiplier: (mission.enemyDamageMultiplier ?? 1) * adapt.adaptFactor,
    adaptFactor: adapt.adaptFactor,
    phase: "player",
    width,
    height,
    tiles,
    units,
    objectives,
    fieldItems,
    fieldWeapons,
    fieldAttachments,
    pendingWeapons: [],
    pendingLoot: [],
    pendingAttachments: [],
    evacZone: mission.evacZone.map((v) => ({ ...v })),
    evacOpensOnTurn: mission.victory.evacOpensOnTurn ?? 0,
    supplyPoints: (mission.supplyPoints ?? []).map((v) => ({ ...v })),
    smokeTiles: [],
    signalTiles: [],
    inventory: { ...emptyInventory(), ...inventory },
    weather: mission.weather
      ? weatherRng.pick(mission.weather.options)
      : weatherRng.chance(mission.rainChance ?? 0)
        ? "rain"
        : "clear",
    pending,
    captureStreak: 0,
    deployedCount: units.filter((u) => u.faction === "player").length,
    places: (mission.places ?? []).map((place) => ({ ...place })),
    discoveredPlaceIds: [],
    scripted: (mission.scripted ?? []).map((rule) => ({ ...rule })),
    status: "playing",
    stats: {
      playerRouted: 0,
      enemyRouted: 0,
      playerEvacuated: 0,
      damageDealt: 0,
      damageTaken: 0,
      prisonersCaptured: 0,
      landmarksDiscovered: 0,
    },
    resultReason: "",
  };

  beginPhase(state, "player");
  return state;
}

export function emptyInventory(): Record<ItemId, number> {
  const inventory = {} as Record<ItemId, number>;
  for (const id of ITEM_IDS) inventory[id] = 0;
  return inventory;
}

export function movementBudget(
  unit: Unit,
  weather: GameState["weather"],
  inventory?: GameState["inventory"],
): number {
  const base =
    UNIT_TYPES[unit.type].move +
    agilityMoveBonus(effectiveStats(unit, inventory)) +
    movementModifier(unit);
  const fatiguePenalty =
    1 - BALANCE.fatigue.movePenalty * (unit.fatigue / BALANCE.fatigue.max);
  const weatherPenalty =
    weather === "rain" || weather === "snow"
      ? Math.max(0, 1 - snowMovePenaltyReduction(unit))
      : 0;
  return Math.max(1, Math.floor(base * fatiguePenalty) - weatherPenalty);
}

export function beginPhase(state: GameState, faction: Unit["faction"]): void {
  state.phase = faction;
  state.smokeTiles = (state.smokeTiles ?? []).filter((tile) => tile.until > state.turn);
  state.signalTiles = (state.signalTiles ?? []).filter((tile) => tile.until > state.turn);
  for (const unit of state.units) {
    if (unit.faction !== faction || !unit.alive || unit.evacuated) continue;
    unit.mpLeft = movementBudget(unit, state.weather, inventoryForUnit(unit, state.inventory));
    unit.movedThisTurn = false;
    unit.attackedThisTurn = false;
    unit.hasActed = false;
  }
}

export function arriveWaves(state: GameState, events: GameEvent[]): void {
  const arriving = state.pending.filter((wave) => wave.turn <= state.turn);
  if (arriving.length === 0) return;
  state.pending = state.pending.filter((wave) => wave.turn > state.turn);

  const arrived: string[] = [];
  for (const wave of arriving) {
    for (const unit of wave.units) {
      const spot = findFreeSpot(state, unit);
      if (!spot) continue;
      unit.x = spot.x;
      unit.y = spot.y;
      unit.mpLeft = movementBudget(unit, state.weather, inventoryForUnit(unit, state.inventory));
      state.units.push(unit);
      arrived.push(unit.id);
    }
  }
  if (arrived.length > 0) events.push({ type: "reinforced", unitIds: arrived });
}

function findFreeSpot(state: GameState, unit: Unit): Vec2 | null {
  if (!unitAt(state, unit.x, unit.y)) return { x: unit.x, y: unit.y };
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
        const x = unit.x + dx;
        const y = unit.y + dy;
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        if (unitAt(state, x, y)) continue;
        if (isMotorized(unit) && !ignoresVehicleTerrain(unit) && !tileAt(state, x, y).vehiclePassable) continue;
        return { x, y };
      }
    }
  }
  return null;
}

export function runUpkeep(state: GameState, faction: Unit["faction"], events: GameEvent[]): void {
  for (const unit of livingUnits(state, faction)) {
    const regen = tileAt(state, unit.x, unit.y).regen;
    if (regen > 0 && unit.hp < unit.maxHp) {
      const amount = Math.min(regen, unit.maxHp - unit.hp);
      unit.hp += amount;
      events.push({ type: "healed", unitId: unit.id, amount });
    }
    // 补给点：站上恢复弹药窗口（与后勤邻接补给共用 supplyRestoredUntil）
    if (
      faction === "player" &&
      state.supplyPoints.some((p) => p.x === unit.x && p.y === unit.y)
    ) {
      unit.supplyRestoredUntil = Math.max(unit.supplyRestoredUntil ?? 0, state.turn + 1);
    }

    // 卫生员每关最多自动触发 3 次；移动或等待不算攻击，进入敌方控制区则不触发。
    if (
      unit.attachment === "medic_team" &&
      !unit.attackedThisTurn &&
      !inEnemyZoc(state, unit, unit.x, unit.y) &&
      unit.hp < unit.maxHp &&
      (unit.medicTriggersUsed ?? 0) < 3
    ) {
      const amount = Math.min(6, unit.maxHp - unit.hp);
      if (amount > 0) {
        unit.hp += amount;
        unit.medicTriggersUsed = (unit.medicTriggersUsed ?? 0) + 1;
        events.push({ type: "healed", unitId: unit.id, amount });
      }
    }
  }

  for (const objective of state.objectives) {
    if (objective.kind !== "hold") continue;
    const occupant = unitAt(state, objective.x, objective.y);
    if (occupant && occupant.faction !== objective.owner) {
      objective.owner = occupant.faction;
      events.push({ type: "captured", objectiveId: objective.id, by: occupant.faction });
    }
  }
}

/**
 * 回合开始时结算史实脚本：炮火准备与严寒消耗。
 * 夜袭与补给窗口是伤害修正，由 combat 直接读取。
 */
export function runScripted(state: GameState, events: GameEvent[]): void {
  for (const rule of state.scripted) {
    if (rule.kind === "barrage") {
      if (!rule.turns.includes(state.turn)) continue;
      const hit: string[] = [];
      for (const unit of livingUnits(state, rule.target ?? "player")) {
        const cover = tileAt(state, unit.x, unit.y).defense;
        const damage = Math.max(
          1,
          Math.round(rule.damage * (1 - Math.max(0, cover)) * (1 - barrageDefenseReduction(unit))),
        );
        unit.hp -= damage;
        hit.push(unit.id);
        if (unit.hp <= 0) routByScript(state, unit, events);
      }
      if (hit.length > 0) {
        events.push({
          type: "scripted",
          kind: rule.kind,
          note: rule.note,
          unitIds: hit,
          damage: rule.damage,
        });
      }
    } else if (rule.kind === "coldAttrition") {
      if (state.turn < rule.fromTurn) continue;
      const hit: string[] = [];
      // 严寒不分敌我，双方都在冻伤减员
      for (const unit of livingUnits(state)) {
        const shelter = tileAt(state, unit.x, unit.y).regen > 0 ? 0.5 : 1;
        const damage = Math.max(1, Math.round(rule.damage * shelter * coldAttritionMultiplier(unit)));
        if (unit.hp <= damage) {
          // 冻伤不直接打死单位，只压到残血，避免无操作败北
          unit.hp = Math.max(1, unit.hp);
          continue;
        }
        unit.hp -= damage;
        hit.push(unit.id);
      }
      if (hit.length > 0) {
        events.push({
          type: "scripted",
          kind: rule.kind,
          note: rule.note,
          unitIds: hit,
          damage: rule.damage,
        });
      }
    }
  }
}

function routByScript(state: GameState, unit: Unit, events: GameEvent[]): void {
  unit.alive = false;
  unit.hp = 0;
  if (unit.faction === "player") state.stats.playerRouted += 1;
  else state.stats.enemyRouted += 1;
  events.push({ type: "routed", unitId: unit.id, faction: unit.faction });
}

/** 夜袭加成：早期志愿军的夜间近战优势 */
export function nightAssaultBonus(state: GameState, unit: Unit, distance: number): number {
  if (unit.faction !== "player" || distance > 1) return 1;
  for (const rule of state.scripted) {
    if (rule.kind !== "nightAssault") continue;
    const [from, to] = rule.turns;
    if (state.turn >= from && state.turn <= to) return 1 + rule.attackBonus;
  }
  return 1;
}

/** 补给窗口：携行弹药打完之后攻击衰减；后勤邻接补给可短暂恢复 */
export function supplyPenalty(state: GameState, unit: Unit): number {
  if (unit.faction !== "player") return 1;
  if ((unit.supplyRestoredUntil ?? 0) >= state.turn) return 1;
  for (const rule of state.scripted) {
    if (rule.kind !== "supplyWindow") continue;
    if (state.turn > rule.untilTurn) {
      const penalty = rule.penalty * supplyPenaltyMultiplier(unit);
      return 1 - Math.min(0.95, Math.max(0, penalty));
    }
  }
  return 1;
}

/** 单位当前是否处于弹药短缺（有 supplyWindow 且未被后勤/补给点恢复） */
export function isAmmoStarved(state: GameState, unit: Unit): boolean {
  return supplyPenalty(state, unit) < 1 - 1e-9;
}

/** 回合结束时统计「全部目标是否仍在手里」的连续回合数 */
export function updateCaptureStreak(state: GameState, rule: MissionConfig["victory"]): void {
  const required = rule.requiredCaptures ?? 0;
  if (required === 0) return;
  const captured = state.objectives.filter(
    (o) => o.kind === "capture" && o.owner === "player",
  ).length;
  state.captureStreak = captured >= required ? state.captureStreak + 1 : 0;
}

export function isEvacTile(state: GameState, x: number, y: number): boolean {
  const opens = state.evacOpensOnTurn ?? 0;
  if (opens > 0 && state.turn < opens) return false;
  return state.evacZone.some((tile) => tile.x === x && tile.y === y);
}

/** 撤离通道已开放且单位站在撤离格上时立即撤离（用于开放当回合已就位的单位）。 */
export function tryEvacuateStandingUnits(state: GameState): void {
  const opens = state.evacOpensOnTurn ?? 0;
  if (opens > 0 && state.turn < opens) return;
  for (const unit of state.units) {
    if (unit.faction !== "player" || !unit.alive || unit.evacuated) continue;
    if (!state.evacZone.some((tile) => tile.x === unit.x && tile.y === unit.y)) continue;
    unit.evacuated = true;
    unit.hasActed = true;
    unit.mpLeft = 0;
    state.stats.playerEvacuated += 1;
  }
}

export interface VictoryVerdict {
  status: GameState["status"];
  reason: string;
}

/** 撤离要求按出战人数缩放，编制被打残时不会变成死档 */
export function requiredEvacuations(state: GameState, rule: MissionConfig["victory"]): number {
  const ratio = rule.evacuateRatio ?? 0;
  const scaled = Math.ceil(state.deployedCount * ratio);
  return Math.max(rule.minEvacuated ?? 0, scaled);
}

/**
 * 是否完成了「核心目标」。与胜利条件的区别在于不考虑伤亡上限等附加要求，
 * 用于判断某个种子是否根本无法通关。
 */
export function coreObjectiveMet(state: GameState, rule: MissionConfig["victory"]): boolean {
  if (state.missionKind === "withdraw") {
    const keyEvacuated = state.units.some((u) => u.keyUnit && u.evacuated);
    return (
      state.stats.playerEvacuated >= requiredEvacuations(state, rule) &&
      (!rule.requireKeyUnit || keyEvacuated) &&
      state.stats.enemyRouted >= (rule.minEnemiesRouted ?? 0)
    );
  }
  if (state.missionKind === "breakthrough") {
    const captured = state.objectives.filter(
      (o) => o.kind === "capture" && o.owner === "player",
    ).length;
    return captured >= (rule.requiredCaptures ?? 0);
  }
  const held = state.objectives.filter((o) => o.kind === "hold" && o.owner === "player").length;
  return held >= (rule.minPostsHeld ?? 1);
}

export interface VictoryProgress {
  /** 核心目标（占领数 / 据点数）是否已达成 */
  coreMet: boolean;
  /** 距离胜利还缺什么；已经满足时为 null */
  blocking: string | null;
  captured: number;
  required: number;
  holdTurns: number;
  streak: number;
  survivors: number;
  minSurvivors: number;
}

/**
 * 供界面展示「为什么还没结束」。与 `evaluateVictory` 读同一批计数，
 * 避免 HUD 说「已占领」而规则仍判定未完成。
 */
export function victoryProgress(state: GameState, rule: MissionConfig["victory"]): VictoryProgress {
  const survivors = livingUnits(state, "player").length;
  const minSurvivors = rule.minSurvivors ?? 0;
  const holdTurns = rule.holdTurns ?? 1;

  if (state.missionKind === "breakthrough") {
    const captured = state.objectives.filter(
      (o) => o.kind === "capture" && o.owner === "player",
    ).length;
    const required = rule.requiredCaptures ?? 0;
    const coreMet = captured >= required;
    let blocking: string | null = null;
    if (!coreMet) blocking = `还需占领 ${required - captured} 处目标`;
    else if (holdTurns > 1 && state.captureStreak < holdTurns)
      blocking = `还需坚守 ${holdTurns - state.captureStreak} 回合`;
    else if (survivors < minSurvivors) blocking = `存活不足 ${survivors}/${minSurvivors}`;
    return {
      coreMet,
      blocking,
      captured,
      required,
      holdTurns,
      streak: state.captureStreak,
      survivors,
      minSurvivors,
    };
  }

  if (state.missionKind === "hold") {
    const posts = state.objectives.filter((o) => o.kind === "hold");
    const held = posts.filter((o) => o.owner === "player").length;
    const required = rule.minPostsHeld ?? 1;
    const coreMet = held >= required;
    const turnsLeft = Math.max(0, state.maxTurns - state.turn + 1);
    let blocking: string | null = null;
    if (!coreMet) blocking = `据点失守，需夺回 ${required - held} 处`;
    else if (turnsLeft > 0) blocking = `还需坚守 ${turnsLeft} 回合`;
    else if (survivors < Math.max(1, minSurvivors))
      blocking = `存活不足 ${survivors}/${Math.max(1, minSurvivors)}`;
    return {
      coreMet,
      blocking,
      captured: held,
      required,
      holdTurns: state.maxTurns,
      streak: Math.min(state.turn, state.maxTurns),
      survivors,
      minSurvivors,
    };
  }

  const evacuated = state.stats.playerEvacuated;
  const required = requiredEvacuations(state, rule);
  const keyEvacuated = state.units.some((u) => u.keyUnit && u.evacuated);
  const pressureMet = state.stats.enemyRouted >= (rule.minEnemiesRouted ?? 0);
  const coreMet =
    evacuated >= required && (!rule.requireKeyUnit || keyEvacuated) && pressureMet;
  let blocking: string | null = null;
  if (evacuated < required) blocking = `还需撤离 ${required - evacuated} 个单位`;
  else if (rule.requireKeyUnit && !keyEvacuated) blocking = "主力尚未撤离";
  else if (!pressureMet)
    blocking = `还需击溃 ${(rule.minEnemiesRouted ?? 0) - state.stats.enemyRouted} 个外围守军`;
  return {
    coreMet,
    blocking,
    captured: evacuated,
    required,
    holdTurns: 0,
    streak: 0,
    survivors,
    minSurvivors,
  };
}

/**
 * @param atTurnEnd 是否处于回合结束结算点。需要连续坚守多回合的关卡只在回合结束判定，
 *                  这样敌方还有一次反扑机会；单回合要求与撤离、全灭为即时判定。
 */
export function evaluateVictory(
  state: GameState,
  rule: MissionConfig["victory"],
  atTurnEnd = false,
): VictoryVerdict {
  const playerAlive = livingUnits(state, "player");
  const enemyAlive = livingUnits(state, "enemy");
  const timeUp = state.turn > state.maxTurns;

  // 主力阵亡：任一关立即失败（撤离成功的主力不算阵亡）
  const keyFallen = state.units.some((u) => u.keyUnit && !u.alive && !u.evacuated);
  if (keyFallen) {
    return { status: "lost", reason: "主力重伤失去指挥，任务失败" };
  }

  if (state.missionKind === "withdraw") {
    const evacuated = state.stats.playerEvacuated;
    const required = requiredEvacuations(state, rule);
    const keyEvacuated = state.units.some((u) => u.keyUnit && u.evacuated);
    const pressureMet = state.stats.enemyRouted >= (rule.minEnemiesRouted ?? 0);
    if (evacuated >= required && (!rule.requireKeyUnit || keyEvacuated) && pressureMet) {
      return { status: "won", reason: `已撤离 ${evacuated} 个单位，主力安全脱离` };
    }
    if (playerAlive.length === 0) {
      return {
        status: "lost",
        reason:
          evacuated > 0
            ? `仅撤离 ${evacuated}/${required} 个单位，剩余部队被击溃`
            : "部队未能撤出，全部被击溃",
      };
    }
    if (timeUp) {
      const keyLost = rule.requireKeyUnit && !keyEvacuated;
      return {
        status: "lost",
        reason: keyLost
          ? "主力未能撤出"
          : !pressureMet
            ? `未完成外线牵制，仅击溃 ${state.stats.enemyRouted}/${rule.minEnemiesRouted ?? 0} 个敌军单位`
            : `仅撤离 ${evacuated}/${required} 个单位`,
      };
    }
    return { status: "playing", reason: "" };
  }

  if (playerAlive.length === 0) {
    return { status: "lost", reason: "部队被全歼" };
  }

  if (state.missionKind === "breakthrough") {
    const captured = state.objectives.filter(
      (o) => o.kind === "capture" && o.owner === "player",
    ).length;
    const required = rule.requiredCaptures ?? 0;
    const holdTurns = rule.holdTurns ?? 1;
    // 只要求「占领当回合」时立即结算，避免占下目标后还要空转一整回合
    const needsStreak = holdTurns > 1;
    const streakMet = !needsStreak || state.captureStreak >= holdTurns;
    if (
      (atTurnEnd || !needsStreak) &&
      captured >= required &&
      streakMet &&
      playerAlive.length >= (rule.minSurvivors ?? 0)
    ) {
      return { status: "won", reason: `守住全部目标，${playerAlive.length} 个单位可继续作战` };
    }
    if (timeUp) {
      if (captured < required) {
        return { status: "lost", reason: `回合耗尽，仅占领 ${captured}/${required} 个目标` };
      }
      if (playerAlive.length < (rule.minSurvivors ?? 0)) {
        return {
          status: "lost",
          reason: `目标已占领但伤亡过大，仅剩 ${playerAlive.length} 个单位`,
        };
      }
      return { status: "lost", reason: "未能把目标守到最后" };
    }
    return { status: "playing", reason: "" };
  }

  // hold
  const posts = state.objectives.filter((o) => o.kind === "hold");
  const held = posts.filter((o) => o.owner === "player").length;
  const requiredPosts = rule.minPostsHeld ?? 1;
  const minSurvivors = Math.max(1, rule.minSurvivors ?? 1);
  if (timeUp) {
    if (held >= requiredPosts && playerAlive.length >= minSurvivors) {
      return { status: "won", reason: `坚守到最后，保住 ${held}/${posts.length} 个据点` };
    }
    if (held < requiredPosts) {
      return { status: "lost", reason: `据点失守，仅剩 ${held}/${posts.length}` };
    }
    return { status: "lost", reason: `伤亡过大，仅剩 ${playerAlive.length} 个单位` };
  }
  if (enemyAlive.length === 0 && state.pending.length === 0) {
    if (held >= requiredPosts && playerAlive.length >= minSurvivors) {
      return { status: "won", reason: "击退了全部进攻" };
    }
    // holdUntilEnd 关卡允许在剩余回合里夺回阵地，而不是当场判负
    if (rule.holdUntilEnd) return { status: "playing", reason: "" };
    return { status: "lost", reason: `据点失守，仅剩 ${held}/${posts.length}` };
  }
  return { status: "playing", reason: "" };
}
