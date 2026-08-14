import type { Facing } from "../core/types";

export const PAL = {
  grass: "#4a7a45",
  grassDeep: "#3a6238",
  grassLite: "#6a9a58",
  cave: "#243428",
  caveRim: "#1a241c",
  dirt: "#7a6548",
  wall: "#5a4a3c",
  wallLite: "#7a6554",
  plaster: "#d8c4a0",
  floor: "#c4a06a",
  floorGrain: "#a88850",
  door: "#6b3e28",
  doorLite: "#8a5340",
  roof: "#9a3434",
  roofDeep: "#6e2020",
  house: "#8a6a4e",
  houseLite: "#b08a68",
  player: "#c45c4a",
  playerDeep: "#8a3228",
  playerCloth: "#e8d2b0",
  npc: "#4a7a8c",
  npcDeep: "#2c5564",
  enemy: "#6a3a7a",
  enemyDeep: "#3e2148",
  chest: "#d4a024",
  chestDeep: "#8a6410",
  ink: "#efe6d4",
  muted: "#b4a48c",
  paper: "#16120e",
  wash: "#2c241c",
  seal: "#b03a3a",
  gridA: "#3e3428",
  gridB: "#2c241c",
  move: "#4a8a58",
  attack: "#b03a3a",
  shadow: "rgba(12, 10, 8, 0.35)",
  water: "#4a7a88",
};

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Deterministic 0..1 from tile coords — client paint only. */
export function tileNoise(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function drawGrassTile(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, tx: number, ty: number): void {
  const n = tileNoise(tx, ty);
  ctx.fillStyle = n > 0.55 ? PAL.grass : n > 0.22 ? PAL.grassDeep : PAL.grassLite;
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(px, py, size, 2);
  ctx.fillStyle = PAL.grassLite;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(px + size * 0.2, py + size * (0.3 + n * 0.4), size * 0.18, size * 0.08);
  ctx.fillRect(px + size * 0.62, py + size * (0.45 + n * 0.25), size * 0.16, size * 0.07);
  ctx.globalAlpha = 1;
}

export function drawCaveTile(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  drawGrassTile(ctx, px, py, size, 0, 0);
  ctx.fillStyle = PAL.shadow;
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.58, size * 0.38, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.caveRim;
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.5, size * 0.28, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.cave;
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.5, size * 0.18, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawWallTile(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, tx: number, ty: number): void {
  const n = tileNoise(tx, ty);
  ctx.fillStyle = n > 0.5 ? PAL.wall : PAL.wallLite;
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(px, py + size - 4, size, 4);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(px + 3, py + 3, size - 6, 3);
}

export function drawFloorTile(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, tx: number, ty: number): void {
  ctx.fillStyle = (tx + ty) % 2 === 0 ? PAL.floor : PAL.floorGrain;
  ctx.fillRect(px, py, size, size);
  ctx.strokeStyle = "rgba(80, 50, 20, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py + size * 0.5);
  ctx.lineTo(px + size, py + size * 0.5);
  ctx.stroke();
}

export function drawDoorTile(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = PAL.wall;
  ctx.fillRect(px, py, size, size);
  const inset = size * 0.12;
  const grd = ctx.createLinearGradient(px, py, px, py + size);
  grd.addColorStop(0, PAL.doorLite);
  grd.addColorStop(1, PAL.door);
  ctx.fillStyle = grd;
  roundRect(ctx, px + inset, py + inset * 0.4, size - inset * 2, size - inset * 0.6, size * 0.08);
  ctx.fill();
  ctx.fillStyle = "#d4b060";
  ctx.beginPath();
  ctx.arc(px + size * 0.72, py + size * 0.55, Math.max(2, size * 0.05), 0, Math.PI * 2);
  ctx.fill();
}

export function drawHouse(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number,
  h: number,
  locationId: string,
): void {
  const roof = locationId.includes("temple") ? "#8a2a28" : locationId.includes("inn") ? "#6a3030" : PAL.roof;
  const wall = locationId.includes("temple") ? "#d8c8a8" : PAL.house;
  ctx.fillStyle = PAL.shadow;
  roundRect(ctx, px + w * 0.06, py + h * 0.78, w * 0.9, h * 0.18, 6);
  ctx.fill();

  ctx.fillStyle = wall;
  roundRect(ctx, px + w * 0.08, py + h * 0.32, w * 0.84, h * 0.58, 6);
  ctx.fill();
  ctx.fillStyle = PAL.houseLite;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(px + w * 0.12, py + h * 0.36, w * 0.2, h * 0.48);
  ctx.globalAlpha = 1;

  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(px + w * 0.02, py + h * 0.38);
  ctx.lineTo(px + w * 0.5, py + h * 0.02);
  ctx.lineTo(px + w * 0.98, py + h * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.roofDeep;
  ctx.fillRect(px + w * 0.08, py + h * 0.34, w * 0.84, h * 0.06);

  ctx.fillStyle = PAL.door;
  roundRect(ctx, px + w * 0.42, py + h * 0.58, w * 0.16, h * 0.3, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(180, 220, 230, 0.55)";
  roundRect(ctx, px + w * 0.18, py + h * 0.5, w * 0.14, h * 0.14, 2);
  ctx.fill();
  roundRect(ctx, px + w * 0.68, py + h * 0.5, w * 0.14, h * 0.14, 2);
  ctx.fill();
}

export function drawActor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  facing: Facing,
  role: "player" | "npc" | "enemy",
): void {
  const body = role === "player" ? PAL.player : role === "enemy" ? PAL.enemy : PAL.npc;
  const deep = role === "player" ? PAL.playerDeep : role === "enemy" ? PAL.enemyDeep : PAL.npcDeep;
  const cx = px + size / 2;
  const feet = py + size * 0.9;

  ctx.fillStyle = PAL.shadow;
  ctx.beginPath();
  ctx.ellipse(cx, feet, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = deep;
  roundRect(ctx, px + size * 0.28, py + size * 0.42, size * 0.44, size * 0.42, size * 0.08);
  ctx.fill();
  ctx.fillStyle = body;
  roundRect(ctx, px + size * 0.3, py + size * 0.4, size * 0.4, size * 0.38, size * 0.08);
  ctx.fill();

  if (role === "player") {
    ctx.fillStyle = PAL.playerCloth;
    ctx.fillRect(px + size * 0.34, py + size * 0.52, size * 0.32, size * 0.08);
  }

  ctx.fillStyle = "#f0d8c0";
  ctx.beginPath();
  ctx.arc(cx, py + size * 0.3, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.arc(cx, py + size * 0.24, size * 0.16, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PAL.ink;
  const eye =
    facing === "north"
      ? { x: cx, y: py + size * 0.26 }
      : facing === "south"
        ? { x: cx, y: py + size * 0.34 }
        : facing === "west"
          ? { x: cx - size * 0.07, y: py + size * 0.3 }
          : { x: cx + size * 0.07, y: py + size * 0.3 };
  ctx.beginPath();
  ctx.arc(eye.x, eye.y, Math.max(2, size * 0.035), 0, Math.PI * 2);
  ctx.fill();
}

export function drawChest(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = PAL.shadow;
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.82, size * 0.32, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  const grd = ctx.createLinearGradient(px, py, px, py + size);
  grd.addColorStop(0, PAL.chest);
  grd.addColorStop(1, PAL.chestDeep);
  ctx.fillStyle = grd;
  roundRect(ctx, px + size * 0.18, py + size * 0.38, size * 0.64, size * 0.4, 6);
  ctx.fill();
  ctx.fillStyle = PAL.chest;
  roundRect(ctx, px + size * 0.16, py + size * 0.3, size * 0.68, size * 0.16, 5);
  ctx.fill();
  ctx.fillStyle = "#e8d080";
  ctx.fillRect(px + size * 0.46, py + size * 0.42, size * 0.08, size * 0.28);
  ctx.beginPath();
  ctx.arc(px + size / 2, py + size * 0.52, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCabinet(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = PAL.shadow;
  roundRect(ctx, px + size * 0.22, py + size * 0.78, size * 0.56, size * 0.12, 4);
  ctx.fill();
  ctx.fillStyle = PAL.doorLite;
  roundRect(ctx, px + size * 0.22, py + size * 0.18, size * 0.56, size * 0.64, 4);
  ctx.fill();
  ctx.strokeStyle = PAL.door;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + size / 2, py + size * 0.22);
  ctx.lineTo(px + size / 2, py + size * 0.76);
  ctx.stroke();
  ctx.fillStyle = "#d4b060";
  ctx.beginPath();
  ctx.arc(px + size * 0.44, py + size * 0.48, 3, 0, Math.PI * 2);
  ctx.arc(px + size * 0.56, py + size * 0.48, 3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawMirror(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = PAL.door;
  roundRect(ctx, px + size * 0.28, py + size * 0.16, size * 0.44, size * 0.62, 8);
  ctx.fill();
  const glass = ctx.createLinearGradient(px, py, px + size, py + size);
  glass.addColorStop(0, "#c8dce8");
  glass.addColorStop(1, "#6a8898");
  ctx.fillStyle = glass;
  roundRect(ctx, px + size * 0.34, py + size * 0.22, size * 0.32, size * 0.48, 6);
  ctx.fill();
}

export function drawBasin(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = PAL.shadow;
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.72, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a8a82";
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.52, size * 0.3, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.water;
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.5, size * 0.22, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawStatue(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = PAL.shadow;
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.86, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c8b898";
  roundRect(ctx, px + size * 0.28, py + size * 0.48, size * 0.44, size * 0.36, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + size / 2, py + size * 0.34, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9a8868";
  ctx.fillRect(px + size * 0.22, py + size * 0.78, size * 0.56, size * 0.08);
}

export function drawCell(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = "#3a342c";
  roundRect(ctx, px + size * 0.16, py + size * 0.12, size * 0.68, size * 0.76, 4);
  ctx.fill();
  ctx.strokeStyle = "#c0b090";
  ctx.lineWidth = Math.max(2, size * 0.04);
  for (let i = 0; i < 4; i += 1) {
    const x = px + size * (0.28 + i * 0.14);
    ctx.beginPath();
    ctx.moveTo(x, py + size * 0.18);
    ctx.lineTo(x, py + size * 0.82);
    ctx.stroke();
  }
}

export function drawSceneObject(ctx: CanvasRenderingContext2D, id: string, px: number, py: number, size: number): void {
  if (id.includes("mirror")) {
    drawMirror(ctx, px, py, size);
    return;
  }
  if (id.includes("cabinet") || id.includes("chest") || id.includes("poetry")) {
    if (id.includes("cabinet")) drawCabinet(ctx, px, py, size);
    else drawChest(ctx, px, py, size);
    return;
  }
  if (id.includes("basin")) {
    drawBasin(ctx, px, py, size);
    return;
  }
  if (id.includes("statue")) {
    drawStatue(ctx, px, py, size);
    return;
  }
  if (id.includes("cell")) {
    drawCell(ctx, px, py, size);
    return;
  }
  drawChest(ctx, px, py, size);
}
