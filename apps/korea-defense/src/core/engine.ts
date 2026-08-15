import { ENEMY_DEFINITIONS, TOWER_DEFINITIONS, WONJEONG_MISSION } from "../content/wonjeong";
import { DefenseRng } from "./rng";
import {
  TICKS_PER_SECOND,
  type ArmoryLevels,
  type DefenseCommand,
  type DefenseMissionConfig,
  type DefenseState,
  type EnemyState,
  type GameSpeed,
  type Point,
  type SimulationSnapshot,
  type StarResult,
  type TowerDefinition,
  type TowerState,
  type TowerType,
  type WaveRuntime,
} from "./types";

export const STARTING_DEPLOYMENT_POINTS = 120;
export const COMMAND_POST_MAX_INTEGRITY = 100;
export const WAVE_CLEAR_BONUS = 50;
/** 让六波垂直切片落在约 8–12 分钟的单局节奏；困难模式再由关卡修正缩短间隔。 */
export const WAVE_PACE_MULTIPLIER = 6;

const EMPTY_ARMORY: ArmoryLevels = {
  infantry: [0, 0, 0],
  machineGun: [0, 0, 0],
  mortar: [0, 0, 0],
};

function cloneArmory(armory?: ArmoryLevels): ArmoryLevels {
  return {
    infantry: [...(armory?.infantry ?? EMPTY_ARMORY.infantry)] as [number, number, number],
    machineGun: [...(armory?.machineGun ?? EMPTY_ARMORY.machineGun)] as [number, number, number],
    mortar: [...(armory?.mortar ?? EMPTY_ARMORY.mortar)] as [number, number, number],
  };
}

function routeLength(route: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]!;
    const current = route[index]!;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function pointAtDistance(route: readonly Point[], distance: number): Point {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]!;
    const current = route[index]!;
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (remaining <= segmentLength || index === route.length - 1) {
      const ratio = segmentLength === 0 ? 0 : Math.min(1, remaining / segmentLength);
      return {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      };
    }
    remaining -= segmentLength;
  }
  return route[route.length - 1] ?? { x: 0, y: 0 };
}

function effectiveDefinition(type: TowerType, armory: ArmoryLevels): TowerDefinition {
  const base = TOWER_DEFINITIONS[type];
  const upgrades = armory[type];
  const damageMultiplier = upgrades[0] > 0 ? 1.08 : 1;
  const rangeMultiplier = upgrades[1] > 0 ? 1.08 : 1;
  const costMultiplier = upgrades[2] > 0 ? 0.9 : 1;
  return {
    ...base,
    cost: Math.round(base.cost * costMultiplier),
    damage: base.damage * damageMultiplier,
    range: base.range * rangeMultiplier,
    minRange: base.minRange,
  };
}

export function getTowerDefinition(type: TowerType, level: 1 | 2 | 3 = 1, armory?: ArmoryLevels): TowerDefinition {
  const definition = effectiveDefinition(type, armory ?? EMPTY_ARMORY);
  const levelDamageMultiplier = level === 1 ? 1 : level === 2 ? 1.25 : 1.55;
  const levelRangeBonus = level === 1 ? 0 : level === 2 ? 0.45 : 0.9;
  return {
    ...definition,
    damage: definition.damage * levelDamageMultiplier,
    range: definition.range + levelRangeBonus,
  };
}

export function upgradeCost(type: TowerType, nextLevel: 2 | 3, armory?: ArmoryLevels): number {
  const base = effectiveDefinition(type, armory ?? EMPTY_ARMORY).cost;
  return Math.round(base * (nextLevel === 2 ? 0.75 : 1.25));
}

function buildSpawnPlan(config: DefenseMissionConfig, waveNumber: number, mode: "normal" | "hard"): { type: EnemyState["type"]; dueTick: number }[] {
  const wave = config.waves[waveNumber - 1];
  if (!wave) return [];
  const modifier = (mode === "hard" ? config.hardModifier.spawnIntervalMultiplier : 1) * WAVE_PACE_MULTIPLIER;
  const plan: { type: EnemyState["type"]; dueTick: number }[] = [];
  for (const spawn of wave.spawns) {
    const start = Math.round((spawn.startDelaySeconds ?? 0) * TICKS_PER_SECOND * modifier);
    const interval = Math.max(1, Math.round(spawn.intervalSeconds * TICKS_PER_SECOND * modifier));
    const count = mode === "hard" ? Math.ceil(spawn.count * config.hardModifier.spawnCountMultiplier) : spawn.count;
    for (let index = 0; index < count; index += 1) {
      plan.push({ type: spawn.type, dueTick: start + index * interval });
    }
  }
  plan.sort((left, right) => left.dueTick - right.dueTick);
  return plan;
}

function createWaveRuntime(config: DefenseMissionConfig, waveNumber: number, mode: "normal" | "hard"): WaveRuntime {
  const spawnPlan = buildSpawnPlan(config, waveNumber, mode);
  return {
    number: waveNumber,
    started: true,
    complete: false,
    spawnTicks: 0,
    nextSpawnIndex: 0,
    spawnedCount: 0,
    totalCount: spawnPlan.length,
    spawnPlan,
  };
}

function setNotice(state: DefenseState, message: string): void {
  state.notice = message;
}

export function createDefenseState(options: { mode?: "normal" | "hard"; seed?: number; mission?: DefenseMissionConfig; armory?: ArmoryLevels } = {}): DefenseState {
  const mission = options.mission ?? WONJEONG_MISSION;
  const mode = options.mode ?? "normal";
  const rng = new DefenseRng(options.seed ?? 0x57454e4a);
  const state: DefenseState = {
    mode,
    mission,
    armory: cloneArmory(options.armory),
    tick: 0,
    simulationSeconds: 0,
    speed: 1,
    paused: false,
    deploymentPoints: STARTING_DEPLOYMENT_POINTS,
    commandPostIntegrity: COMMAND_POST_MAX_INTEGRITY,
    currentWave: 0,
    activeWave: null,
    towers: [],
    enemies: [],
    projectiles: [],
    hitEffects: [],
    nextEntityId: 1,
    nextEffectId: 1,
    kills: 0,
    leaks: 0,
    result: "playing",
    notice: "选择部署点，或开始第一波。",
    rngState: rng.getState(),
  };
  return state;
}

function routeForEnemy(state: DefenseState): Point[] {
  if (state.mode === "hard" && state.nextEntityId % 3 === 0) {
    const prefix = state.mission.path.slice(0, 5);
    return [...prefix, ...state.mission.hardModifier.extraBranch];
  }
  return state.mission.path;
}

function spawnEnemy(state: DefenseState, type: EnemyState["type"]): void {
  const definition = ENEMY_DEFINITIONS[type];
  if (!definition) return;
  const route = routeForEnemy(state);
  const speedMultiplier = state.mode === "hard" ? state.mission.hardModifier.routeSpeedMultiplier : 1;
  const position = route[0] ?? { x: 0, y: 0 };
  state.enemies.push({
    id: `enemy-${state.nextEntityId}`,
    type,
    hp: definition.hp,
    maxHp: definition.hp,
    pathProgress: 0,
    speed: definition.speed * speedMultiplier,
    radius: definition.radius,
    leakDamage: definition.leakDamage,
    reward: definition.reward,
    x: position.x,
    y: position.y,
    route,
  });
  state.nextEntityId += 1;
}

function towerAtNode(state: DefenseState, nodeId: string): TowerState | undefined {
  return state.towers.find((tower) => tower.nodeId === nodeId);
}

function towerAtId(state: DefenseState, towerId: string): TowerState | undefined {
  return state.towers.find((tower) => tower.id === towerId);
}

function distanceToTower(tower: TowerState, enemy: EnemyState, state: DefenseState): number {
  const node = state.mission.buildNodes.find((candidate) => candidate.id === tower.nodeId);
  if (!node) return Number.POSITIVE_INFINITY;
  return Math.hypot(node.x - enemy.x, node.y - enemy.y);
}

function chooseTarget(state: DefenseState, tower: TowerState, definition: TowerDefinition): EnemyState | undefined {
  const candidates = state.enemies.filter((enemy) => {
    const distance = distanceToTower(tower, enemy, state);
    return distance <= definition.range && distance >= (definition.minRange ?? 0);
  });
  candidates.sort((left, right) => right.pathProgress - left.pathProgress || left.id.localeCompare(right.id));
  return candidates[0];
}

function addEffects(state: DefenseState, tower: TowerState, target: EnemyState, definition: TowerDefinition): void {
  const node = state.mission.buildNodes.find((candidate) => candidate.id === tower.nodeId);
  if (!node) return;
  const color = definition.type === "mortar" ? 0xf0ae4c : definition.type === "machineGun" ? 0x8ed0e5 : 0xdbe7c2;
  state.projectiles.push({
    id: state.nextEffectId++,
    x: node.x,
    y: node.y,
    targetX: target.x,
    targetY: target.y,
    color,
    lifeTicks: 8,
    maxLifeTicks: 8,
  });
  state.hitEffects.push({
    id: state.nextEffectId++,
    x: target.x,
    y: target.y,
    color,
    lifeTicks: 12,
    maxLifeTicks: 12,
    radius: definition.splashRadius ?? 0.35,
  });
}

function damageTarget(state: DefenseState, tower: TowerState, target: EnemyState, definition: TowerDefinition, rng: DefenseRng): void {
  const jitter = 0.92 + rng.nextFloat() * 0.16;
  const damage = Math.max(1, Math.round(definition.damage * jitter));
  const impactX = target.x;
  const impactY = target.y;
  if (definition.splashRadius) {
    for (const enemy of state.enemies) {
      if (Math.hypot(enemy.x - impactX, enemy.y - impactY) <= definition.splashRadius) {
        enemy.hp -= damage;
      }
    }
  } else {
    target.hp -= damage;
  }
  addEffects(state, tower, target, definition);
}

function removeDeadEnemies(state: DefenseState): void {
  const survivors: EnemyState[] = [];
  for (const enemy of state.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy);
      continue;
    }
    state.deploymentPoints += enemy.reward;
    state.kills += 1;
  }
  state.enemies = survivors;
}

function advanceEnemies(state: DefenseState): void {
  const survivors: EnemyState[] = [];
  for (const enemy of state.enemies) {
    enemy.pathProgress += enemy.speed / TICKS_PER_SECOND;
    const length = routeLength(enemy.route);
    const position = pointAtDistance(enemy.route, enemy.pathProgress);
    enemy.x = position.x;
    enemy.y = position.y;
    if (enemy.pathProgress >= length) {
      state.commandPostIntegrity = Math.max(0, state.commandPostIntegrity - enemy.leakDamage);
      state.leaks += 1;
      if (state.commandPostIntegrity <= 0) {
        state.result = "lost";
        setNotice(state, "温井指挥所失守。");
      }
    } else {
      survivors.push(enemy);
    }
  }
  state.enemies = survivors;
}

function advanceTowers(state: DefenseState, rng: DefenseRng): void {
  for (const tower of state.towers) {
    if (tower.cooldownTicks > 0) tower.cooldownTicks -= 1;
    if (tower.cooldownTicks > 0) continue;
    const definition = getTowerDefinition(tower.type, tower.level, state.armory);
    const target = chooseTarget(state, tower, definition);
    if (!target) continue;
    damageTarget(state, tower, target, definition, rng);
    tower.cooldownTicks = Math.max(1, Math.round(TICKS_PER_SECOND / definition.shotsPerSecond));
  }
}

function ageEffects(state: DefenseState): void {
  state.projectiles = state.projectiles.map((effect) => ({ ...effect, lifeTicks: effect.lifeTicks - 1 })).filter((effect) => effect.lifeTicks > 0);
  state.hitEffects = state.hitEffects.map((effect) => ({ ...effect, lifeTicks: effect.lifeTicks - 1 })).filter((effect) => effect.lifeTicks > 0);
}

function advanceWave(state: DefenseState): void {
  const active = state.activeWave;
  if (!active || state.result !== "playing") return;
  active.spawnTicks += 1;
  while (active.nextSpawnIndex < active.spawnPlan.length && active.spawnPlan[active.nextSpawnIndex]!.dueTick <= active.spawnTicks) {
    spawnEnemy(state, active.spawnPlan[active.nextSpawnIndex]!.type);
    active.nextSpawnIndex += 1;
    active.spawnedCount += 1;
  }
  if (active.nextSpawnIndex >= active.spawnPlan.length && state.enemies.length === 0) {
    active.complete = true;
    state.activeWave = null;
    if (active.number < state.mission.waves.length) {
      state.deploymentPoints += WAVE_CLEAR_BONUS;
      setNotice(state, `第 ${active.number} 波已清除，补给 +${WAVE_CLEAR_BONUS}。`);
    } else {
      state.result = "won";
      setNotice(state, "温井防线守住了。");
    }
  }
}

function simulateOneTick(state: DefenseState): void {
  if (state.paused || state.result !== "playing") return;
  state.tick += 1;
  state.simulationSeconds = state.tick / TICKS_PER_SECOND;
  const rng = new DefenseRng(state.rngState);
  advanceWave(state);
  advanceEnemies(state);
  advanceTowers(state, rng);
  removeDeadEnemies(state);
  ageEffects(state);
  state.rngState = rng.getState();
}

export function stepSimulation(state: DefenseState, elapsedTicks: number): void {
  if (!Number.isFinite(elapsedTicks) || elapsedTicks <= 0) return;
  const ticks = state.speed === 2 ? Math.ceil(elapsedTicks * 2) : state.speed === 0 ? 0 : Math.ceil(elapsedTicks);
  for (let index = 0; index < ticks; index += 1) simulateOneTick(state);
}

function deploy(state: DefenseState, type: TowerType, nodeId: string): boolean {
  if (state.result !== "playing") return false;
  if (!state.mission.buildNodes.some((node) => node.id === nodeId)) {
    setNotice(state, "这里不是可部署节点。");
    return false;
  }
  if (towerAtNode(state, nodeId)) {
    setNotice(state, "该节点已有部队。");
    return false;
  }
  const cost = getTowerDefinition(type, 1, state.armory).cost;
  if (state.deploymentPoints < cost) {
    setNotice(state, "部署点不足。");
    return false;
  }
  state.deploymentPoints -= cost;
  state.towers.push({ id: `tower-${state.nextEntityId++}`, type, nodeId, level: 1, cooldownTicks: 0, invested: cost });
  setNotice(state, `${TOWER_DEFINITIONS[type].name}已部署。`);
  return true;
}

function upgrade(state: DefenseState, towerId: string): boolean {
  const tower = towerAtId(state, towerId);
  if (!tower) return false;
  if (tower.level >= 3) {
    setNotice(state, "该部队已达到三级。");
    return false;
  }
  const nextLevel = (tower.level + 1) as 2 | 3;
  const cost = upgradeCost(tower.type, nextLevel, state.armory);
  if (state.deploymentPoints < cost) {
    setNotice(state, "升级所需部署点不足。");
    return false;
  }
  state.deploymentPoints -= cost;
  tower.level = nextLevel;
  tower.invested += cost;
  setNotice(state, `${TOWER_DEFINITIONS[tower.type].shortName}升级到 ${tower.level} 级。`);
  return true;
}

function sell(state: DefenseState, towerId: string): boolean {
  const index = state.towers.findIndex((tower) => tower.id === towerId);
  if (index < 0) return false;
  const tower = state.towers[index]!;
  const refund = Math.floor(tower.invested * 0.7);
  state.deploymentPoints += refund;
  state.towers.splice(index, 1);
  setNotice(state, `部队撤回，返还 ${refund} 部署点。`);
  return true;
}

export function dispatchCommand(state: DefenseState, command: DefenseCommand): boolean {
  if (command.type === "PAUSE") {
    state.paused = command.paused ?? !state.paused;
    setNotice(state, state.paused ? "模拟已暂停。" : "模拟继续。");
    return true;
  }
  if (command.type === "SET_SPEED") {
    state.speed = command.speed;
    state.paused = command.speed === 0;
    setNotice(state, command.speed === 0 ? "模拟已暂停。" : `模拟速度 ${command.speed}×。`);
    return true;
  }
  if (state.result !== "playing") return false;
  switch (command.type) {
    case "START_WAVE": {
      if (state.activeWave) {
        setNotice(state, "当前波次尚未结束。");
        return false;
      }
      const nextWave = state.currentWave + 1;
      if (nextWave > state.mission.waves.length) {
        setNotice(state, "所有波次已完成。");
        return false;
      }
      state.currentWave = nextWave;
      state.activeWave = createWaveRuntime(state.mission, nextWave, state.mode);
      state.paused = false;
      state.speed = state.speed === 0 ? 1 : state.speed;
      setNotice(state, `第 ${nextWave} 波：${state.mission.waves[nextWave - 1]?.label ?? "敌军来袭"}`);
      return true;
    }
    case "DEPLOY":
      return deploy(state, command.towerType, command.nodeId);
    case "UPGRADE":
      return upgrade(state, command.towerId);
    case "SELL":
      return sell(state, command.towerId);
  }
}

export function snapshot(state: DefenseState): SimulationSnapshot {
  return {
    tick: state.tick,
    simulationSeconds: state.simulationSeconds,
    speed: state.speed,
    paused: state.paused,
    deploymentPoints: state.deploymentPoints,
    commandPostIntegrity: state.commandPostIntegrity,
    currentWave: state.currentWave,
    activeWave: state.activeWave ? { ...state.activeWave, spawnPlan: state.activeWave.spawnPlan.map((entry) => ({ ...entry })) } : null,
    towers: state.towers.map((tower) => ({ ...tower })),
    enemies: state.enemies.map((enemy) => ({ ...enemy, route: enemy.route.map((point) => ({ ...point })) })),
    projectiles: state.projectiles.map((effect) => ({ ...effect })),
    hitEffects: state.hitEffects.map((effect) => ({ ...effect })),
    kills: state.kills,
    leaks: state.leaks,
    result: state.result,
    notice: state.notice,
  };
}

export function calculateStars(state: Pick<DefenseState, "result" | "commandPostIntegrity" | "simulationSeconds">): StarResult {
  if (state.result !== "won") return { stars: 0, medalReward: 0 };
  let stars: 1 | 2 | 3 = 1;
  if (state.commandPostIntegrity >= 60) stars = 2;
  if (state.commandPostIntegrity >= 85 && state.simulationSeconds <= 12 * 60) stars = 3;
  return { stars, medalReward: stars };
}

export function runToEnd(state: DefenseState, maxTicks = 100_000): DefenseState {
  if (!state.activeWave && state.currentWave < state.mission.waves.length) dispatchCommand(state, { type: "START_WAVE" });
  for (let index = 0; index < maxTicks && state.result === "playing"; index += 1) {
    if (!state.activeWave && state.currentWave < state.mission.waves.length) dispatchCommand(state, { type: "START_WAVE" });
    stepSimulation(state, 1);
  }
  return state;
}

export function defaultArmory(): ArmoryLevels {
  return cloneArmory();
}

export function speedLabel(speed: GameSpeed): string {
  return speed === 0 ? "暂停" : `${speed}×`;
}
