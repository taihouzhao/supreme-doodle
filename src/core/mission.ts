import { BALANCE } from "../content/balance";
import { ITEM_IDS } from "../content/items";
import { TERRAIN_CHARS } from "../content/terrain";
import { UNIT_TYPES } from "../content/units";
import type { MissionConfig } from "../content/missions/schema";
import { effectiveMaxHp } from "./combat";
import { livingUnits, tileAt, unitAt } from "./grid";
import { Rng, deriveSeed } from "./rng";
import type {
  FieldItem,
  GameEvent,
  GameState,
  ItemId,
  Objective,
  TerrainId,
  Unit,
  Vec2,
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
}

export interface MissionSetup {
  mission: MissionConfig;
  seed: number;
  roster: RosterUnit[];
  inventory: Record<ItemId, number>;
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

function makeUnit(params: {
  id: string;
  rosterId: string | null;
  faction: Unit["faction"];
  type: Unit["type"];
  name: string;
  x: number;
  y: number;
  exp: number;
  hp?: number;
  fatigue?: number;
  keyUnit?: boolean;
}): Unit {
  const maxHp = effectiveMaxHp(params.type, params.exp);
  return {
    id: params.id,
    rosterId: params.rosterId,
    faction: params.faction,
    type: params.type,
    name: params.name,
    x: params.x,
    y: params.y,
    hp: Math.min(params.hp ?? maxHp, maxHp),
    maxHp,
    exp: params.exp,
    fatigue: params.fatigue ?? 0,
    mpLeft: 0,
    movedThisTurn: false,
    hasActed: false,
    alive: true,
    evacuated: false,
    keyUnit: params.keyUnit ?? false,
  };
}

export function createMissionState(setup: MissionSetup): GameState {
  const { mission, seed, roster, inventory } = setup;
  const { tiles, width, height } = parseMap(mission.map);

  const compRng = new Rng(deriveSeed(seed, "enemyComp"));
  const waveRng = new Rng(deriveSeed(seed, "reinforce"));
  const weatherRng = new Rng(deriveSeed(seed, "weather"));
  const itemRng = new Rng(deriveSeed(seed, "items"));

  const enemySpecs = mission.enemies.map((spec) => ({ ...spec }));
  for (const slot of mission.variantSlots) {
    const target = enemySpecs[slot.index];
    if (!target) continue;
    target.type = compRng.pick(slot.options);
  }

  const units: Unit[] = [];

  const keyRosterId = roster.reduce<RosterUnit | null>((best, unit) => {
    if (!best) return unit;
    if (unit.exp > best.exp) return unit;
    return best;
  }, null)?.id;

  roster.forEach((rosterUnit, index) => {
    const spawn = mission.playerSpawns[index];
    if (!spawn) return;
    units.push(
      makeUnit({
        id: `p${index}`,
        rosterId: rosterUnit.id,
        faction: "player",
        type: rosterUnit.type,
        name: rosterUnit.name,
        x: spawn.x,
        y: spawn.y,
        exp: rosterUnit.exp,
        hp: rosterUnit.hp,
        fatigue: rosterUnit.fatigue,
        keyUnit: rosterUnit.id === keyRosterId,
      }),
    );
  });

  enemySpecs.forEach((spec, index) => {
    units.push(
      makeUnit({
        id: `e${index}`,
        rosterId: null,
        faction: "enemy",
        type: spec.type,
        name: spec.name ?? UNIT_TYPES[spec.type].name,
        x: spec.x,
        y: spec.y,
        exp: spec.exp ?? 0,
      }),
    );
  });

  const pending = mission.waves.map((wave, waveIndex) => {
    const turn = waveRng.int(wave.window[0], wave.window[1]);
    const waveUnits = wave.units.map((spec, unitIndex) =>
      makeUnit({
        id: `w${waveIndex}_${unitIndex}`,
        rosterId: null,
        faction: "enemy",
        type: spec.type,
        name: spec.name ?? UNIT_TYPES[spec.type].name,
        x: spec.x,
        y: spec.y,
        exp: spec.exp ?? 0,
      }),
    );
    return { turn, units: waveUnits };
  });

  const fieldItems: FieldItem[] = mission.itemDrops.map((drop, index) => ({
    id: `item${index}`,
    item: itemRng.pick(drop.options),
    x: drop.x,
    y: drop.y,
  }));

  const objectives: Objective[] = mission.objectives.map((spec) => ({
    id: spec.id,
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
    phase: "player",
    width,
    height,
    tiles,
    units,
    objectives,
    fieldItems,
    evacZone: mission.evacZone.map((v) => ({ ...v })),
    inventory: { ...emptyInventory(), ...inventory },
    weather: weatherRng.chance(mission.rainChance) ? "rain" : "clear",
    pending,
    captureStreak: 0,
    deployedCount: units.filter((u) => u.faction === "player").length,
    status: "playing",
    stats: {
      playerRouted: 0,
      enemyRouted: 0,
      playerEvacuated: 0,
      damageDealt: 0,
      damageTaken: 0,
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

export function movementBudget(unit: Unit, weather: GameState["weather"]): number {
  const base = UNIT_TYPES[unit.type].move;
  const fatiguePenalty =
    1 - BALANCE.fatigue.movePenalty * (unit.fatigue / BALANCE.fatigue.max);
  const rainPenalty = weather === "rain" ? 1 : 0;
  return Math.max(1, Math.floor(base * fatiguePenalty) - rainPenalty);
}

export function beginPhase(state: GameState, faction: Unit["faction"]): void {
  state.phase = faction;
  for (const unit of state.units) {
    if (unit.faction !== faction || !unit.alive || unit.evacuated) continue;
    unit.mpLeft = movementBudget(unit, state.weather);
    unit.movedThisTurn = false;
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
      unit.mpLeft = movementBudget(unit, state.weather);
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
        if (UNIT_TYPES[unit.type].vehicle && !tileAt(state, x, y).vehiclePassable) continue;
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
  return state.evacZone.some((tile) => tile.x === x && tile.y === y);
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
      (!rule.requireKeyUnit || keyEvacuated)
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

/**
 * @param atTurnEnd 是否处于回合结束结算点。占领类胜利必须守住敌方的反扑，
 *                  因此只在回合结束判定；撤离与全灭为即时判定。
 */
export function evaluateVictory(
  state: GameState,
  rule: MissionConfig["victory"],
  atTurnEnd = false,
): VictoryVerdict {
  const playerAlive = livingUnits(state, "player");
  const enemyAlive = livingUnits(state, "enemy");
  const timeUp = state.turn > state.maxTurns;

  if (state.missionKind === "withdraw") {
    const evacuated = state.stats.playerEvacuated;
    const required = requiredEvacuations(state, rule);
    const keyEvacuated = state.units.some((u) => u.keyUnit && u.evacuated);
    if (evacuated >= required && (!rule.requireKeyUnit || keyEvacuated)) {
      return { status: "won", reason: `已撤离 ${evacuated} 个单位，主力安全脱离` };
    }
    if (playerAlive.length === 0) {
      return { status: "lost", reason: "部队未能撤出，全部被击溃" };
    }
    if (timeUp) {
      const keyLost = rule.requireKeyUnit && !keyEvacuated;
      return {
        status: "lost",
        reason: keyLost ? "主力未能撤出" : `仅撤离 ${evacuated}/${required} 个单位`,
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
    if (
      atTurnEnd &&
      captured >= required &&
      state.captureStreak >= holdTurns &&
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
  if (timeUp) {
    const posts = state.objectives.filter((o) => o.kind === "hold");
    const held = posts.filter((o) => o.owner === "player").length;
    const required = rule.minPostsHeld ?? 1;
    if (held >= required && playerAlive.length >= (rule.minSurvivors ?? 1)) {
      return { status: "won", reason: `坚守到最后，保住 ${held}/${posts.length} 个据点` };
    }
    if (held < required) {
      return { status: "lost", reason: `据点失守，仅剩 ${held}/${posts.length}` };
    }
    return { status: "lost", reason: `伤亡过大，仅剩 ${playerAlive.length} 个单位` };
  }
  if (enemyAlive.length === 0 && state.pending.length === 0) {
    return { status: "won", reason: "击退了全部进攻" };
  }
  return { status: "playing", reason: "" };
}
