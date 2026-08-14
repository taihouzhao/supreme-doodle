import { currentActor } from "../battle/engine";
import { ITEM_LABELS, STRINGS } from "../content/strings";
import { cellAt } from "../content/maps";
import { lianchengContent } from "../content/liancheng";
import { dispatch } from "../core/dispatch";
import { deserializeSave, serializeSave } from "../core/save";
import { createInitialWorld } from "../core/state";
import type { Facing, GameAction, WorldState } from "../core/types";
import { currentLocation } from "./scene";

const content = lianchengContent;
const SAVE_KEY = "jinyong-heroes-classic-v2";

const LOGICAL_W = 320;
const LOGICAL_H = 200;
const TILE = 16;
const MAP_H = 160;
const DIALOG_H = LOGICAL_H - MAP_H;

const PAL = {
  grass: "#3a5a38",
  grass2: "#324e31",
  cave: "#2a3a28",
  dirt: "#6b5d4a",
  wall: "#3d342a",
  wallHi: "#5c4e3e",
  floor: "#c4b08a",
  floor2: "#b39e76",
  door: "#7a5a3a",
  roof: "#8b2e2e",
  house: "#5c4033",
  player: "#c45c4a",
  npc: "#4a7a8c",
  chest: "#c9a227",
  ink: "#e8dcc4",
  muted: "#9a8b72",
  paper: "#1a1612",
  wash: "#2a231c",
  seal: "#8b2e2e",
  gridA: "#3a3126",
  gridB: "#2a231c",
  move: "#3d6b45",
  attack: "#8b2e2e",
};

type MenuTab = "status" | "items" | "skills" | "save";

const TABS: MenuTab[] = ["status", "items", "skills", "save"];
const TAB_LABEL: Record<MenuTab, string> = {
  status: "状态",
  items: "物品",
  skills: "武功",
  save: "存档",
};

let world: WorldState = createInitialWorld(content, 1);
let dialogue: string[] = ["攻略重建，占位像素，不是原版画面。方向键走，空格面对，ESC 菜单。"];
let menuTab: MenuTab = "status";
let menuIndex = 0;
let canvas: HTMLCanvasElement | undefined;
let keys = new Set<string>();
let lastStepAt = 0;

export function mountPlayCanvas(root: HTMLElement): void {
  root.innerHTML = "";
  const stage = document.createElement("div");
  stage.className = "dos-stage";

  canvas = document.createElement("canvas");
  canvas.className = "dos-canvas";
  canvas.width = LOGICAL_W;
  canvas.height = LOGICAL_H;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "金庸群侠传行走画面");

  const hint = document.createElement("p");
  hint.className = "dos-hint";
  hint.textContent = "占位外观 · 无原作资源 · 箭头移动 · 空格面对 · ESC 状态/物品/存档";

  const nav = document.createElement("nav");
  nav.className = "links";
  nav.innerHTML = `<a href="./index.html">返回说明页</a><a href="../games/index.html">游戏目录</a>`;

  stage.append(canvas, hint, nav);
  root.append(stage);
  canvas.focus();

  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("click", onClick);
  window.addEventListener("keydown", preventScroll, { passive: false });

  requestAnimationFrame(tick);
  paint();
}

function preventScroll(event: KeyboardEvent): void {
  if (!document.body.classList.contains("playing")) return;
  if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
  }
}

function tick(now: number): void {
  if (world.view !== "overworld" && world.view !== "scene") {
    requestAnimationFrame(tick);
    return;
  }
  const dir = heldDir();
  if (dir && now - lastStepAt > 120) {
    lastStepAt = now;
    handleMove(dir.dx, dir.dy);
  }
  requestAnimationFrame(tick);
}

function heldDir(): { dx: number; dy: number } | null {
  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) return { dx: 0, dy: -1 };
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) return { dx: 0, dy: 1 };
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) return { dx: -1, dy: 0 };
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) return { dx: 1, dy: 0 };
  return null;
}

function onKeyDown(event: KeyboardEvent): void {
  keys.add(event.key);
  if (event.key === "Escape") {
    event.preventDefault();
    apply(world.view === "menu" ? { type: "CLOSE_MENU" } : { type: "OPEN_MENU" });
    return;
  }
  if (world.view === "menu") {
    onMenuKey(event);
    return;
  }
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    handleConfirm();
    return;
  }
  const dir = keyDir(event.key);
  if (dir) {
    event.preventDefault();
    lastStepAt = performance.now();
    handleMove(dir.dx, dir.dy);
  }
}

function onKeyUp(event: KeyboardEvent): void {
  keys.delete(event.key);
}

function keyDir(key: string): { dx: number; dy: number } | null {
  if (key === "ArrowUp" || key === "w" || key === "W") return { dx: 0, dy: -1 };
  if (key === "ArrowDown" || key === "s" || key === "S") return { dx: 0, dy: 1 };
  if (key === "ArrowLeft" || key === "a" || key === "A") return { dx: -1, dy: 0 };
  if (key === "ArrowRight" || key === "d" || key === "D") return { dx: 1, dy: 0 };
  return null;
}

function onMenuKey(event: KeyboardEvent): void {
  const items = inventoryRows();
  if (event.key === "ArrowLeft") {
    menuTab = TABS.at((TABS.indexOf(menuTab) + TABS.length - 1) % TABS.length) ?? "status";
    menuIndex = 0;
    paint();
    return;
  }
  if (event.key === "ArrowRight") {
    menuTab = TABS.at((TABS.indexOf(menuTab) + 1) % TABS.length) ?? "status";
    menuIndex = 0;
    paint();
    return;
  }
  if (event.key === "ArrowUp") {
    menuIndex = Math.max(0, menuIndex - 1);
    paint();
    return;
  }
  if (event.key === "ArrowDown") {
    const max = menuTab === "items" ? Math.max(0, items.length - 1) : menuTab === "save" ? 2 : 0;
    menuIndex = Math.min(max, menuIndex + 1);
    paint();
    return;
  }
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    confirmMenu();
  }
}

function handleMove(dx: number, dy: number): void {
  if (world.view === "battle" && world.battle?.result === "ongoing") {
    const actor = world.battle ? currentActor(world.battle) : undefined;
    if (!actor || actor.side !== "player") return;
    apply({ type: "BATTLE_MOVE", unitId: actor.id, x: actor.x + dx, y: actor.y + dy });
    return;
  }
  apply({ type: "STEP", dx, dy });
}

function handleConfirm(): void {
  if (world.view === "battle" && world.battle?.result === "ongoing") {
    const battle = world.battle;
    const actor = currentActor(battle);
    if (!actor || actor.side !== "player") return;
    const foe = adjacentFoe(actor.x, actor.y, world.facing) ?? adjacentFoe(actor.x, actor.y);
    if (foe) apply({ type: "BATTLE_ATTACK", unitId: actor.id, targetId: foe.id });
    return;
  }
  apply({ type: "FACE_INTERACT" });
}

function adjacentFoe(x: number, y: number, facing?: Facing) {
  const battle = world.battle;
  if (!battle) return undefined;
  const deltas = facing
    ? [facingDelta(facing)]
    : [
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
      ];
  for (const delta of deltas) {
    const foe = battle.units.find(
      (unit) => unit.alive && unit.side === "enemy" && unit.x === x + delta.dx && unit.y === y + delta.dy,
    );
    if (foe) return foe;
  }
  return undefined;
}

function facingDelta(facing: Facing): { dx: number; dy: number } {
  if (facing === "north") return { dx: 0, dy: -1 };
  if (facing === "south") return { dx: 0, dy: 1 };
  if (facing === "west") return { dx: -1, dy: 0 };
  return { dx: 1, dy: 0 };
}

function onClick(event: MouseEvent): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * LOGICAL_W);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * LOGICAL_H);
  if (world.view === "menu") {
    handleMenuClick(x, y);
    return;
  }
  if (y >= MAP_H) {
    handleConfirm();
    return;
  }
  const tile = screenToTile(x, y);
  if (!tile) {
    handleConfirm();
    return;
  }
  const here = currentTile();
  const dx = Math.sign(tile.x - here.x);
  const dy = Math.sign(tile.y - here.y);
  if (tile.x === here.x && tile.y === here.y) {
    handleConfirm();
    return;
  }
  if (Math.abs(tile.x - here.x) + Math.abs(tile.y - here.y) === 0) return;
  if (dx !== 0 && dy !== 0) {
    handleMove(dx, 0);
    return;
  }
  handleMove(dx, dy);
}

function handleMenuClick(x: number, y: number): void {
  if (y < 24) {
    const tab = TABS[Math.floor(x / 80)];
    if (tab) {
      menuTab = tab;
      menuIndex = 0;
      paint();
    }
    return;
  }
  if (menuTab === "items") {
    const row = Math.floor((y - 32) / 12);
    if (row >= 0 && row < inventoryRows().length) {
      menuIndex = row;
      confirmMenu();
    }
    return;
  }
  if (menuTab === "save") {
    const row = Math.floor((y - 32) / 14);
    if (row >= 0 && row <= 2) {
      menuIndex = row;
      confirmMenu();
    }
  }
}

function confirmMenu(): void {
  if (menuTab === "items") {
    const row = inventoryRows()[menuIndex];
    if (row) apply({ type: "MENU_USE", itemId: row.id });
    return;
  }
  if (menuTab === "save") {
    if (menuIndex === 0) writeSave();
    else if (menuIndex === 1) readSave();
    else startOver();
  }
}

function say(id: string): string {
  return STRINGS[id] ?? id;
}

function writeSave(): void {
  localStorage.setItem(SAVE_KEY, serializeSave(world));
  dialogue = [say("save-written")];
  apply({ type: "CLOSE_MENU" });
}

function readSave(): void {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    dialogue = [say("save-missing")];
    paint();
    return;
  }
  try {
    world = deserializeSave(raw);
    dialogue = [say("save-loaded")];
    apply({ type: "CLOSE_MENU" });
  } catch {
    dialogue = [say("save-missing")];
    paint();
  }
}

function startOver(): void {
  world = createInitialWorld(content, 1);
  dialogue = [say("new-game")];
  apply({ type: "CLOSE_MENU" });
}

function apply(action: GameAction): void {
  const result = dispatch(world, action, content);
  world = result.state;
  if (result.presentation.dialogue.length > 0) {
    dialogue = result.presentation.dialogue.map((id) => STRINGS[id] ?? id);
  }
  paint();
}

function currentTile(): { x: number; y: number } {
  if (world.view === "overworld") return { x: world.overworldX, y: world.overworldY };
  if (world.view === "battle" && world.battle) {
    const actor = currentActor(world.battle);
    return { x: actor?.x ?? 0, y: actor?.y ?? 0 };
  }
  return { x: world.sceneX, y: world.sceneY };
}

function screenToTile(px: number, py: number): { x: number; y: number } | null {
  if (world.view === "battle" && world.battle) {
    const origin = battleOrigin(world.battle.width, world.battle.height);
    const x = Math.floor((px - origin.x) / TILE);
    const y = Math.floor((py - origin.y) / TILE);
    if (x < 0 || y < 0 || x >= world.battle.width || y >= world.battle.height) return null;
    return { x, y };
  }
  const cam = camera();
  return { x: Math.floor((px + cam.x) / TILE), y: Math.floor((py + cam.y) / TILE) };
}

function camera(): { x: number; y: number } {
  const here = currentTile();
  return {
    x: here.x * TILE - LOGICAL_W / 2 + TILE / 2,
    y: here.y * TILE - MAP_H / 2 + TILE / 2,
  };
}

function battleOrigin(width: number, height: number): { x: number; y: number } {
  return {
    x: Math.floor((LOGICAL_W - width * TILE) / 2),
    y: Math.floor((MAP_H - height * TILE) / 2),
  };
}

function inventoryRows(): { id: string; qty: number }[] {
  return Object.entries(world.inventory)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty }));
}

function paint(): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  const backdrop = world.view === "menu" ? world.menuReturnView : world.view;
  if (backdrop === "battle" && world.battle) drawBattle(ctx);
  else if (backdrop === "scene") drawScene(ctx);
  else drawOverworld(ctx);

  drawDialog(ctx);
  if (world.view === "menu") drawMenu(ctx);
}

function drawOverworld(ctx: CanvasRenderingContext2D): void {
  const cam = camera();
  const x0 = Math.floor(cam.x / TILE) - 1;
  const y0 = Math.floor(cam.y / TILE) - 1;
  const cols = Math.ceil(LOGICAL_W / TILE) + 2;
  const rows = Math.ceil(MAP_H / TILE) + 2;
  const size = content.overworld.size;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = x0 + col;
      const y = y0 + row;
      const px = x * TILE - cam.x;
      const py = y * TILE - cam.y;
      if (x < 0 || y < 0 || x >= size || y >= size) {
        ctx.fillStyle = PAL.paper;
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      ctx.fillStyle = (x + y) % 2 === 0 ? PAL.grass : PAL.grass2;
      ctx.fillRect(px, py, TILE, TILE);
    }
  }

  for (const building of content.overworld.buildings) {
    const px = building.x * TILE - cam.x;
    const py = building.y * TILE - cam.y;
    if (px > LOGICAL_W || py > MAP_H || px + building.w * TILE < 0 || py + building.h * TILE < 0) continue;
    if (building.hidden) {
      ctx.fillStyle = PAL.cave;
      ctx.fillRect(px, py, TILE, TILE);
      continue;
    }
    ctx.fillStyle = PAL.house;
    ctx.fillRect(px, py, building.w * TILE, building.h * TILE);
    ctx.fillStyle = PAL.roof;
    ctx.fillRect(px, py, building.w * TILE, 6);
  }

  drawActor(ctx, world.overworldX * TILE - cam.x, world.overworldY * TILE - cam.y, world.facing, PAL.player);
}

function drawScene(ctx: CanvasRenderingContext2D): void {
  const scene = content.scenes[world.locationId];
  const cam = camera();
  ctx.fillStyle = PAL.wall;
  ctx.fillRect(0, 0, LOGICAL_W, MAP_H);
  if (!scene) return;

  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const cell = cellAt(scene, x, y);
      const px = x * TILE - cam.x;
      const py = y * TILE - cam.y;
      if (cell === "#") {
        ctx.fillStyle = (x + y) % 2 === 0 ? PAL.wall : PAL.wallHi;
        ctx.fillRect(px, py, TILE, TILE);
      } else if (cell === "D") {
        ctx.fillStyle = PAL.door;
        ctx.fillRect(px, py, TILE, TILE);
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? PAL.floor : PAL.floor2;
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }

  for (const obj of scene.objects) {
    const px = obj.x * TILE - cam.x;
    const py = obj.y * TILE - cam.y;
    if (obj.kind === "npc") {
      drawActor(ctx, px, py, "south", PAL.npc);
    } else {
      ctx.fillStyle = PAL.chest;
      ctx.fillRect(px + 3, py + 5, TILE - 6, TILE - 8);
      ctx.fillStyle = PAL.dirt;
      ctx.fillRect(px + 3, py + 9, TILE - 6, 2);
    }
  }

  drawActor(ctx, world.sceneX * TILE - cam.x, world.sceneY * TILE - cam.y, world.facing, PAL.player);
}

function drawBattle(ctx: CanvasRenderingContext2D): void {
  const battle = world.battle;
  if (!battle) return;
  const origin = battleOrigin(battle.width, battle.height);
  const actor = currentActor(battle);

  for (let y = 0; y < battle.height; y += 1) {
    for (let x = 0; x < battle.width; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? PAL.gridA : PAL.gridB;
      ctx.fillRect(origin.x + x * TILE, origin.y + y * TILE, TILE, TILE);
    }
  }

  if (actor && actor.side === "player") {
    for (let y = 0; y < battle.height; y += 1) {
      for (let x = 0; x < battle.width; x += 1) {
        const dist = Math.abs(actor.x - x) + Math.abs(actor.y - y);
        if (dist > 0 && dist <= 2) {
          ctx.fillStyle = PAL.move;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(origin.x + x * TILE, origin.y + y * TILE, TILE, TILE);
          ctx.globalAlpha = 1;
        }
        if (dist === 1) {
          ctx.fillStyle = PAL.attack;
          ctx.globalAlpha = 0.2;
          ctx.fillRect(origin.x + x * TILE, origin.y + y * TILE, TILE, TILE);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  for (const unit of battle.units) {
    if (!unit.alive) continue;
    const color = unit.side === "player" ? PAL.player : PAL.npc;
    drawActor(ctx, origin.x + unit.x * TILE, origin.y + unit.y * TILE, "east", color);
    ctx.fillStyle = PAL.seal;
    ctx.fillRect(origin.x + unit.x * TILE + 2, origin.y + unit.y * TILE + TILE - 3, Math.floor(((TILE - 4) * unit.hp) / unit.maxHp), 2);
  }
}

function drawActor(ctx: CanvasRenderingContext2D, px: number, py: number, facing: Facing, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(px + 3, py + 2, 10, 12);
  ctx.fillStyle = PAL.paper;
  const eye =
    facing === "north"
      ? { x: px + 6, y: py + 4 }
      : facing === "south"
        ? { x: px + 6, y: py + 8 }
        : facing === "west"
          ? { x: px + 4, y: py + 6 }
          : { x: px + 10, y: py + 6 };
  ctx.fillRect(eye.x, eye.y, 3, 3);
}

function drawDialog(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(0, MAP_H, LOGICAL_W, DIALOG_H);
  ctx.strokeStyle = PAL.dirt;
  ctx.strokeRect(1, MAP_H + 1, LOGICAL_W - 2, DIALOG_H - 2);
  ctx.fillStyle = PAL.ink;
  ctx.font = "9px sans-serif";
  const location = currentLocation(world, content);
  const title =
    world.view === "overworld"
      ? `大地图 ${world.overworldX},${world.overworldY}`
      : `${location?.title ?? world.locationId}`;
  ctx.fillText(title, 6, MAP_H + 12);
  ctx.fillStyle = PAL.muted;
  const line = dialogue.at(-1) ?? "";
  wrapText(ctx, line, 6, MAP_H + 24, LOGICAL_W - 12, 11);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
): void {
  let line = "";
  let row = 0;
  for (const ch of text) {
    const next = line + ch;
    if (ctx.measureText(next).width > width) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = ch;
      row += 1;
      if (row > 1) break;
    } else {
      line = next;
    }
  }
  if (row <= 1) ctx.fillText(line, x, y + row * lineHeight);
}

function drawMenu(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(12, 10, 8, 0.82)";
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.fillStyle = PAL.wash;
  ctx.fillRect(16, 12, LOGICAL_W - 32, LOGICAL_H - 24);
  ctx.strokeStyle = PAL.dirt;
  ctx.strokeRect(16, 12, LOGICAL_W - 32, LOGICAL_H - 24);

  ctx.font = "10px sans-serif";
  TABS.forEach((tab, index) => {
    const x = 24 + index * 70;
    ctx.fillStyle = tab === menuTab ? PAL.ink : PAL.muted;
    ctx.fillText(TAB_LABEL[tab], x, 28);
    if (tab === menuTab) {
      ctx.fillStyle = PAL.seal;
      ctx.fillRect(x, 32, 28, 2);
    }
  });

  ctx.fillStyle = PAL.ink;
  ctx.font = "9px sans-serif";
  const lines = menuLines();
  lines.forEach((line, index) => {
    ctx.fillStyle = index === menuIndex ? PAL.ink : PAL.muted;
    if (index === menuIndex) ctx.fillText(">", 24, 52 + index * 12);
    ctx.fillText(line, 36, 52 + index * 12);
  });
}

function menuLines(): string[] {
  if (menuTab === "status") {
    const location = currentLocation(world, content);
    const compass =
      (world.inventory.compass ?? 0) > 0 ? `罗盘 ${world.overworldX},${world.overworldY}` : "还没有罗盘";
    return [
      `${location?.title ?? world.locationId}  品德 ${world.moral}`,
      `声望 ${world.reputation}  天书 ${world.heavenBooks.length}/14`,
      compass,
      `同行 ${world.party.length}/${world.partyMax}`,
    ];
  }
  if (menuTab === "items") {
    const rows = inventoryRows();
    return rows.length > 0
      ? rows.map((row) => `${ITEM_LABELS[row.id] ?? row.id} ×${row.qty}`)
      : ["行囊是空的。面对目标后再用。"];
  }
  if (menuTab === "skills") {
    return ["本片尚未重建武功栏。"];
  }
  return ["写入这个浏览器", "读取存档", "从自宅重新开始"];
}
