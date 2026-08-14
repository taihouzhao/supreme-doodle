import { suggestBattleAction } from "../../src/battle/engine";
import { buildingAt, cellAt, objectAt } from "../../src/content/maps";
import { dispatch } from "../../src/core/dispatch";
import { createInitialWorld } from "../../src/core/state";
import type { ContentPack, GameAction, Presentation, SceneMap, WorldState } from "../../src/core/types";

/**
 * Walkthrough steps. `goTo` walks the overworld and enters a building;
 * it does not teleport. `jumpTo` is the enhanced/classic GO_TO action.
 */
export type PathStep =
  | { goTo: string }
  | { jumpTo: string }
  | { talkTo: string }
  | { take: string }
  | { interact: string }
  | { useOn: { itemId: string; targetId: string } }
  | { battleMove: { unitId: string; x: number; y: number } }
  | { battleAttack: { unitId: string; targetId: string } }
  | { battleWait: { unitId: string } }
  | { battleAuto: true };

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const;

export function runPath(
  content: ContentPack,
  steps: PathStep[],
  seed = 1,
): { state: WorldState; presentations: Presentation[] } {
  let state = createInitialWorld(content, seed);
  const presentations: Presentation[] = [];
  for (const step of steps) {
    if ("battleAuto" in step) {
      const result = runBattleAuto(state, content);
      state = result.state;
      presentations.push(...result.presentations);
      continue;
    }
    if ("goTo" in step) {
      const walked = walkToLocation(state, content, step.goTo);
      state = walked.state;
      presentations.push(...walked.presentations);
      continue;
    }
    if ("talkTo" in step) {
      const acted = approachAndInteract(state, content, step.talkTo);
      state = acted.state;
      presentations.push(...acted.presentations);
      continue;
    }
    if ("take" in step) {
      const acted = approachAndInteract(state, content, step.take);
      state = acted.state;
      presentations.push(...acted.presentations);
      continue;
    }
    if ("interact" in step) {
      const acted = approachAndInteract(state, content, step.interact);
      state = acted.state;
      presentations.push(...acted.presentations);
      continue;
    }
    if ("useOn" in step) {
      const acted = approachAndUse(state, content, step.useOn.itemId, step.useOn.targetId);
      state = acted.state;
      presentations.push(...acted.presentations);
      continue;
    }
    const action = stepToAction(step);
    if (!action) continue;
    const result = dispatch(state, action, content);
    state = result.state;
    presentations.push(result.presentation);
  }
  return { state, presentations };
}

export function runBattleAuto(
  state: WorldState,
  content: ContentPack,
  maxSteps = 24,
): { state: WorldState; presentations: Presentation[] } {
  const presentations: Presentation[] = [];
  let current = state;
  for (let i = 0; i < maxSteps; i += 1) {
    if (!current.battle || current.battle.result !== "ongoing") break;
    const action = suggestBattleAction(current);
    if (!action) break;
    const result = dispatch(current, action, content);
    current = result.state;
    presentations.push(result.presentation);
  }
  return { state: current, presentations };
}

export function walkToLocation(
  state: WorldState,
  content: ContentPack,
  locationId: string,
): { state: WorldState; presentations: Presentation[] } {
  const presentations: Presentation[] = [];
  let current = state;
  if (current.view === "scene" && current.locationId === locationId) {
    return { state: current, presentations };
  }
  if (current.view === "scene") {
    const left = leaveSceneByWalking(current, content);
    current = left.state;
    presentations.push(...left.presentations);
  }
  if (current.view === "battle") return { state: current, presentations };
  const entered = enterBuildingByWalking(current, content, locationId);
  current = entered.state;
  presentations.push(...entered.presentations);
  return { state: current, presentations };
}

function stepToAction(step: PathStep): GameAction | null {
  if ("jumpTo" in step) return { type: "GO_TO", locationId: step.jumpTo };
  if ("battleMove" in step) {
    return { type: "BATTLE_MOVE", unitId: step.battleMove.unitId, x: step.battleMove.x, y: step.battleMove.y };
  }
  if ("battleAttack" in step) {
    return {
      type: "BATTLE_ATTACK",
      unitId: step.battleAttack.unitId,
      targetId: step.battleAttack.targetId,
    };
  }
  if ("battleWait" in step) return { type: "BATTLE_WAIT", unitId: step.battleWait.unitId };
  return null;
}

function leaveSceneByWalking(
  state: WorldState,
  content: ContentPack,
): { state: WorldState; presentations: Presentation[] } {
  const scene = content.scenes[state.locationId];
  if (!scene || state.view !== "scene") return { state, presentations: [] };
  const doors: { x: number; y: number }[] = [];
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      if (cellAt(scene, x, y) === "D") doors.push({ x, y });
    }
  }
  const steps = shortestSteps(
    { x: state.sceneX, y: state.sceneY },
    (x, y) => doors.some((door) => door.x === x && door.y === y),
    (x, y) => indoorPassable(scene, x, y),
  );
  return playSteps(state, content, steps);
}

function enterBuildingByWalking(
  state: WorldState,
  content: ContentPack,
  locationId: string,
): { state: WorldState; presentations: Presentation[] } {
  const building = content.overworld.buildings.find((entry) => entry.locationId === locationId);
  if (!building) throw new Error(`no building ${locationId}`);
  const steps = shortestSteps(
    { x: state.overworldX, y: state.overworldY },
    (x, y) => tileInBuilding(building, x, y),
    (x, y) => overworldPassable(content, x, y, locationId),
    content.overworld.size * content.overworld.size,
  );
  return playSteps(state, content, steps);
}

function approachAndInteract(
  state: WorldState,
  content: ContentPack,
  targetId: string,
): { state: WorldState; presentations: Presentation[] } {
  const presentations: Presentation[] = [];
  let current = ensureAtTargetScene(state, content, targetId, presentations);
  const faced = walkToFace(current, content, targetId);
  current = faced.state;
  presentations.push(...faced.presentations);
  const result = dispatch(current, { type: "FACE_INTERACT" }, content);
  presentations.push(result.presentation);
  return { state: result.state, presentations };
}

function approachAndUse(
  state: WorldState,
  content: ContentPack,
  itemId: string,
  targetId: string,
): { state: WorldState; presentations: Presentation[] } {
  const presentations: Presentation[] = [];
  let current = ensureAtTargetScene(state, content, targetId, presentations);
  const faced = walkToFace(current, content, targetId);
  current = faced.state;
  presentations.push(...faced.presentations);
  const opened = dispatch(current, { type: "OPEN_MENU" }, content);
  current = opened.state;
  presentations.push(opened.presentation);
  const used = dispatch(current, { type: "MENU_USE", itemId }, content);
  presentations.push(used.presentation);
  return { state: used.state, presentations };
}

function ensureAtTargetScene(
  state: WorldState,
  content: ContentPack,
  targetId: string,
  presentations: Presentation[],
): WorldState {
  const sceneId = sceneIdOf(content, targetId);
  if (state.view === "scene" && state.locationId === sceneId) return state;
  const walked = walkToLocation(state, content, sceneId);
  presentations.push(...walked.presentations);
  return walked.state;
}

function walkToFace(
  state: WorldState,
  content: ContentPack,
  targetId: string,
): { state: WorldState; presentations: Presentation[] } {
  const scene = content.scenes[state.locationId];
  if (!scene) throw new Error(`no scene ${state.locationId}`);
  const target = scene.objects.find((entry) => entry.id === targetId);
  if (!target) throw new Error(`no object ${targetId} in ${state.locationId}`);
  const stands = DIRS.map((dir) => ({ x: target.x + dir.dx, y: target.y + dir.dy, dir })).filter((spot) =>
    indoorPassable(scene, spot.x, spot.y),
  );
  if (stands.length === 0) throw new Error(`no stand tile for ${targetId}`);
  const already = stands.find((spot) => spot.x === state.sceneX && spot.y === state.sceneY);
  let current = state;
  const presentations: Presentation[] = [];
  if (!already) {
    const goal = new Set(stands.map((spot) => `${spot.x},${spot.y}`));
    const steps = shortestSteps(
      { x: state.sceneX, y: state.sceneY },
      (x, y) => goal.has(`${x},${y}`),
      (x, y) => indoorPassable(scene, x, y),
    );
    const walked = playSteps(state, content, steps);
    current = walked.state;
    presentations.push(...walked.presentations);
  }
  const stand = stands.find((spot) => spot.x === current.sceneX && spot.y === current.sceneY);
  if (!stand) throw new Error(`failed to stand by ${targetId}`);
  const face = dispatch(current, { type: "STEP", dx: -stand.dir.dx, dy: -stand.dir.dy }, content);
  presentations.push(face.presentation);
  return { state: face.state, presentations };
}

function sceneIdOf(content: ContentPack, targetId: string): string {
  for (const scene of Object.values(content.scenes)) {
    if (scene.objects.some((entry) => entry.id === targetId)) return scene.locationId;
  }
  const listed = content.interactables.find((entry) => entry.id === targetId);
  if (listed) return listed.sceneId;
  throw new Error(`unknown target ${targetId}`);
}

function playSteps(
  state: WorldState,
  content: ContentPack,
  steps: { dx: number; dy: number }[],
): { state: WorldState; presentations: Presentation[] } {
  const presentations: Presentation[] = [];
  let current = state;
  const startView = state.view;
  for (const step of steps) {
    if (current.view === "battle") break;
    if (current.view !== startView) break;
    const result = dispatch(current, { type: "STEP", dx: step.dx, dy: step.dy }, content);
    current = result.state;
    presentations.push(result.presentation);
  }
  return { state: current, presentations };
}

function indoorPassable(scene: SceneMap, x: number, y: number): boolean {
  if (cellAt(scene, x, y) !== ".") return false;
  return !objectAt(scene, x, y);
}

function overworldPassable(content: ContentPack, x: number, y: number, allowId: string): boolean {
  if (x < 0 || y < 0 || x >= content.overworld.size || y >= content.overworld.size) return false;
  const hit = buildingAt(content.overworld.buildings, x, y);
  return !hit || hit.locationId === allowId;
}

function tileInBuilding(
  building: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
): boolean {
  return x >= building.x && x < building.x + building.w && y >= building.y && y < building.y + building.h;
}

function shortestSteps(
  start: { x: number; y: number },
  isGoal: (x: number, y: number) => boolean,
  passable: (x: number, y: number) => boolean,
  limit = 4096,
): { dx: number; dy: number }[] {
  if (isGoal(start.x, start.y)) return [];
  const key = (x: number, y: number) => `${x},${y}`;
  const prev = new Map<string, { x: number; y: number; dx: number; dy: number }>();
  const queue = [start];
  const seen = new Set([key(start.x, start.y)]);
  for (let i = 0; i < queue.length && seen.size < limit; i += 1) {
    const cur = queue[i];
    if (!cur) break;
    for (const dir of DIRS) {
      const x = cur.x + dir.dx;
      const y = cur.y + dir.dy;
      const id = key(x, y);
      if (seen.has(id)) continue;
      const goal = isGoal(x, y);
      if (!goal && !passable(x, y)) continue;
      seen.add(id);
      prev.set(id, { x: cur.x, y: cur.y, dx: dir.dx, dy: dir.dy });
      if (goal) return reconstruct(prev, start, { x, y });
      if (passable(x, y)) queue.push({ x, y });
    }
  }
  throw new Error(`no walk path from ${start.x},${start.y}`);
}

function reconstruct(
  prev: Map<string, { x: number; y: number; dx: number; dy: number }>,
  start: { x: number; y: number },
  goal: { x: number; y: number },
): { dx: number; dy: number }[] {
  const steps: { dx: number; dy: number }[] = [];
  let at = goal;
  while (at.x !== start.x || at.y !== start.y) {
    const parent = prev.get(`${at.x},${at.y}`);
    if (!parent) throw new Error("broken walk path");
    steps.push({ dx: parent.dx, dy: parent.dy });
    at = { x: parent.x, y: parent.y };
  }
  steps.reverse();
  return steps;
}
