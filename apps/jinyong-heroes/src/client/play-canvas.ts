import { currentActor } from "../battle/engine";
import { ITEM_LABELS, STRINGS } from "../content/strings";
import { cellAt } from "../content/maps";
import { lianchengContent } from "../content/liancheng";
import { dispatch } from "../core/dispatch";
import { deserializeSave, serializeSave } from "../core/save";
import { createInitialWorld } from "../core/state";
import type { Facing, GameAction, WorldState } from "../core/types";
import { currentLocation } from "./scene";
import {
  PAL,
  drawActor,
  drawCaveTile,
  drawDoorTile,
  drawFloorTile,
  drawGrassTile,
  drawHouse,
  drawSceneObject,
  drawWallTile,
} from "./sprites";
import { pickBattleTile, pickDevicePixelRatio, pickDialogHeight, pickTileSize } from "./view";

const content = lianchengContent;
const SAVE_KEY = "jinyong-heroes-classic-v2";
const FONT = '"Noto Sans SC", "Noto Serif SC", sans-serif';

type MenuTab = "status" | "items" | "skills" | "save";

const TABS: MenuTab[] = ["status", "items", "skills", "save"];
const TAB_LABEL: Record<MenuTab, string> = {
  status: "状态",
  items: "物品",
  skills: "武功",
  save: "存档",
};

let world: WorldState = createInitialWorld(content, 1);
let dialogue: string[] = ["攻略重建，自绘高清占位，不是原版贴图。方向键走，空格面对，ESC 菜单。"];
let menuTab: MenuTab = "status";
let menuIndex = 0;
let canvas: HTMLCanvasElement | undefined;
let keys = new Set<string>();
let lastStepAt = 0;

let viewW = 1280;
let viewH = 720;
let tile = 64;
let mapH = 600;
let dialogH = 120;
let dpr = 1;

export function mountPlayCanvas(root: HTMLElement): void {
  root.innerHTML = "";
  const stage = document.createElement("div");
  stage.className = "play-stage";

  const wrap = document.createElement("div");
  wrap.className = "play-canvas-wrap";

  canvas = document.createElement("canvas");
  canvas.className = "play-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "金庸群侠传行走画面");

  const hint = document.createElement("p");
  hint.className = "play-hint";
  hint.textContent = "自绘高清占位 · 无原作资源 · 箭头移动 · 空格面对 · ESC 状态/物品/存档";

  const nav = document.createElement("nav");
  nav.className = "links";
  nav.innerHTML = `<a href="./index.html">返回说明页</a><a href="../games/index.html">游戏目录</a>`;

  wrap.append(canvas);
  stage.append(wrap, hint, nav);
  root.append(stage);
  canvas.focus();

  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("click", onClick);
  window.addEventListener("keydown", preventScroll, { passive: false });
  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(tick);
}

function resize(): void {
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  viewW = Math.max(640, Math.floor(rect.width));
  viewH = Math.max(400, Math.floor(rect.height));
  dpr = pickDevicePixelRatio(window.devicePixelRatio || 1);
  dialogH = pickDialogHeight(viewH);
  mapH = viewH - dialogH;
  tile = pickTileSize(viewW, mapH);
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
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
  const x = ((event.clientX - rect.left) / rect.width) * viewW;
  const y = ((event.clientY - rect.top) / rect.height) * viewH;
  if (world.view === "menu") {
    handleMenuClick(x, y);
    return;
  }
  if (y >= mapH) {
    handleConfirm();
    return;
  }
  const tileHit = screenToTile(x, y);
  if (!tileHit) {
    handleConfirm();
    return;
  }
  const here = currentTile();
  const dx = Math.sign(tileHit.x - here.x);
  const dy = Math.sign(tileHit.y - here.y);
  if (tileHit.x === here.x && tileHit.y === here.y) {
    handleConfirm();
    return;
  }
  if (dx !== 0 && dy !== 0) {
    handleMove(dx, 0);
    return;
  }
  handleMove(dx, dy);
}

function menuLayout(): { x: number; y: number; w: number; h: number; tabH: number; lineH: number } {
  return {
    x: Math.round(viewW * 0.08),
    y: Math.round(viewH * 0.08),
    w: Math.round(viewW * 0.84),
    h: Math.round(viewH * 0.72),
    tabH: 52,
    lineH: 36,
  };
}

function handleMenuClick(x: number, y: number): void {
  const box = menuLayout();
  if (x < box.x || y < box.y || x > box.x + box.w || y > box.y + box.h) return;
  if (y < box.y + box.tabH) {
    const tab = TABS[Math.floor((x - box.x) / (box.w / TABS.length))];
    if (tab) {
      menuTab = tab;
      menuIndex = 0;
      paint();
    }
    return;
  }
  const row = Math.floor((y - box.y - box.tabH - 12) / box.lineH);
  if (menuTab === "items") {
    if (row >= 0 && row < inventoryRows().length) {
      menuIndex = row;
      confirmMenu();
    }
    return;
  }
  if (menuTab === "save" && row >= 0 && row <= 2) {
    menuIndex = row;
    confirmMenu();
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
    const cell = pickBattleTile(viewW, mapH, world.battle.width, world.battle.height);
    const origin = battleOrigin(world.battle.width, world.battle.height, cell);
    const x = Math.floor((px - origin.x) / cell);
    const y = Math.floor((py - origin.y) / cell);
    if (x < 0 || y < 0 || x >= world.battle.width || y >= world.battle.height) return null;
    return { x, y };
  }
  const cam = camera();
  return { x: Math.floor((px + cam.x) / tile), y: Math.floor((py + cam.y) / tile) };
}

function camera(): { x: number; y: number } {
  const here = currentTile();
  return {
    x: here.x * tile - viewW / 2 + tile / 2,
    y: here.y * tile - mapH / 2 + tile / 2,
  };
}

function battleOrigin(width: number, height: number, cell: number): { x: number; y: number } {
  return {
    x: Math.floor((viewW - width * cell) / 2),
    y: Math.floor((mapH - height * cell) / 2),
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(0, 0, viewW, viewH);

  const backdrop = world.view === "menu" ? world.menuReturnView : world.view;
  if (backdrop === "battle" && world.battle) drawBattle(ctx);
  else if (backdrop === "scene") drawScene(ctx);
  else drawOverworld(ctx);

  drawDialog(ctx);
  if (world.view === "menu") drawMenu(ctx);
}

function drawOverworld(ctx: CanvasRenderingContext2D): void {
  const cam = camera();
  const x0 = Math.floor(cam.x / tile) - 1;
  const y0 = Math.floor(cam.y / tile) - 1;
  const cols = Math.ceil(viewW / tile) + 2;
  const rows = Math.ceil(mapH / tile) + 2;
  const size = content.overworld.size;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = x0 + col;
      const y = y0 + row;
      const px = x * tile - cam.x;
      const py = y * tile - cam.y;
      if (x < 0 || y < 0 || x >= size || y >= size) {
        ctx.fillStyle = PAL.paper;
        ctx.fillRect(px, py, tile, tile);
        continue;
      }
      drawGrassTile(ctx, px, py, tile, x, y);
    }
  }

  for (const building of content.overworld.buildings) {
    const px = building.x * tile - cam.x;
    const py = building.y * tile - cam.y;
    const bw = building.w * tile;
    const bh = building.h * tile;
    if (px > viewW || py > mapH || px + bw < 0 || py + bh < 0) continue;
    if (building.hidden) {
      drawCaveTile(ctx, px, py, tile);
      continue;
    }
    drawHouse(ctx, px, py, bw, bh, building.locationId);
  }

  drawActor(ctx, world.overworldX * tile - cam.x, world.overworldY * tile - cam.y, tile, world.facing, "player");
}

function drawScene(ctx: CanvasRenderingContext2D): void {
  const scene = content.scenes[world.locationId];
  const cam = camera();
  ctx.fillStyle = PAL.wall;
  ctx.fillRect(0, 0, viewW, mapH);
  if (!scene) return;

  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const cell = cellAt(scene, x, y);
      const px = x * tile - cam.x;
      const py = y * tile - cam.y;
      if (cell === "#") drawWallTile(ctx, px, py, tile, x, y);
      else if (cell === "D") drawDoorTile(ctx, px, py, tile);
      else drawFloorTile(ctx, px, py, tile, x, y);
    }
  }

  for (const obj of scene.objects) {
    const px = obj.x * tile - cam.x;
    const py = obj.y * tile - cam.y;
    if (obj.kind === "npc") drawActor(ctx, px, py, tile, "south", "npc");
    else drawSceneObject(ctx, obj.id, px, py, tile);
  }

  drawActor(ctx, world.sceneX * tile - cam.x, world.sceneY * tile - cam.y, tile, world.facing, "player");
}

function drawBattle(ctx: CanvasRenderingContext2D): void {
  const battle = world.battle;
  if (!battle) return;
  const cell = pickBattleTile(viewW, mapH, battle.width, battle.height);
  const origin = battleOrigin(battle.width, battle.height, cell);
  const actor = currentActor(battle);

  ctx.fillStyle = "#1c1814";
  ctx.fillRect(0, 0, viewW, mapH);

  for (let y = 0; y < battle.height; y += 1) {
    for (let x = 0; x < battle.width; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? PAL.gridA : PAL.gridB;
      ctx.fillRect(origin.x + x * cell, origin.y + y * cell, cell - 2, cell - 2);
    }
  }

  if (actor && actor.side === "player") {
    for (let y = 0; y < battle.height; y += 1) {
      for (let x = 0; x < battle.width; x += 1) {
        const dist = Math.abs(actor.x - x) + Math.abs(actor.y - y);
        if (dist > 0 && dist <= 2) {
          ctx.fillStyle = PAL.move;
          ctx.globalAlpha = 0.28;
          ctx.fillRect(origin.x + x * cell, origin.y + y * cell, cell - 2, cell - 2);
          ctx.globalAlpha = 1;
        }
        if (dist === 1) {
          ctx.fillStyle = PAL.attack;
          ctx.globalAlpha = 0.18;
          ctx.fillRect(origin.x + x * cell, origin.y + y * cell, cell - 2, cell - 2);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  for (const unit of battle.units) {
    if (!unit.alive) continue;
    const role = unit.side === "player" ? "player" : "enemy";
    drawActor(ctx, origin.x + unit.x * cell, origin.y + unit.y * cell, cell, "east", role);
    const barW = cell - 16;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(origin.x + unit.x * cell + 8, origin.y + unit.y * cell + cell - 12, barW, 6);
    ctx.fillStyle = PAL.seal;
    ctx.fillRect(
      origin.x + unit.x * cell + 8,
      origin.y + unit.y * cell + cell - 12,
      Math.floor((barW * unit.hp) / unit.maxHp),
      6,
    );
  }
}

function drawDialog(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(18, 14, 12, 0.94)";
  ctx.fillRect(0, mapH, viewW, dialogH);
  ctx.strokeStyle = "rgba(201, 184, 150, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, mapH + 8, viewW - 16, dialogH - 16);

  const location = currentLocation(world, content);
  const title =
    world.view === "overworld" || (world.view === "menu" && world.menuReturnView === "overworld")
      ? `大地图  ${world.overworldX}，${world.overworldY}`
      : `${location?.title ?? world.locationId}`;

  ctx.fillStyle = PAL.ink;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText(title, 24, mapH + 36);
  ctx.fillStyle = PAL.muted;
  ctx.font = `16px ${FONT}`;
  const line = dialogue.at(-1) ?? "";
  wrapText(ctx, line, 24, mapH + 62, viewW - 48, 22, 3);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maxRows: number,
): void {
  let line = "";
  let row = 0;
  for (const ch of text) {
    const next = line + ch;
    if (ctx.measureText(next).width > width) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = ch;
      row += 1;
      if (row >= maxRows) return;
    } else {
      line = next;
    }
  }
  if (row < maxRows) ctx.fillText(line, x, y + row * lineHeight);
}

function drawMenu(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
  ctx.fillRect(0, 0, viewW, viewH);
  const box = menuLayout();
  ctx.fillStyle = PAL.wash;
  roundMenu(ctx, box.x, box.y, box.w, box.h, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(201, 184, 150, 0.4)";
  ctx.lineWidth = 2;
  roundMenu(ctx, box.x, box.y, box.w, box.h, 16);
  ctx.stroke();

  ctx.font = `600 20px ${FONT}`;
  TABS.forEach((tab, index) => {
    const x = box.x + 28 + index * (box.w / TABS.length);
    ctx.fillStyle = tab === menuTab ? PAL.ink : PAL.muted;
    ctx.fillText(TAB_LABEL[tab], x, box.y + 34);
    if (tab === menuTab) {
      ctx.fillStyle = PAL.seal;
      ctx.fillRect(x, box.y + 42, 36, 3);
    }
  });

  ctx.font = `18px ${FONT}`;
  const lines = menuLines();
  lines.forEach((line, index) => {
    ctx.fillStyle = index === menuIndex ? PAL.ink : PAL.muted;
    const y = box.y + box.tabH + 28 + index * box.lineH;
    if (index === menuIndex) ctx.fillText("▸", box.x + 24, y);
    ctx.fillText(line, box.x + 52, y);
  });
}

function roundMenu(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
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
