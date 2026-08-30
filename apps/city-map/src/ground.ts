/**
 * 分块卫星贴图：只画本区块的分区、路网、河流与颗粒。
 */

import type { ChunkModel, District } from "./city";
import type { World } from "./world";

const DISTRICT_FILL: Record<District, string> = {
  cbd: "#767470",
  oldtown: "#807869",
  residential: "#7e7b71",
  suburb: "#71795c",
  industrial: "#7f7e78",
  park: "#5d7a45",
  farm: "#6d7d48",
  forest: "#3f5c32",
};

export function paintChunkTexture(world: World, chunk: ChunkModel, size = 1024): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const ppm = size / chunk.size;
  const px = (x: number): number => (x - chunk.originX) * ppm;
  const pz = (z: number): number => (z - chunk.originZ) * ppm;

  const rural = chunk.cells.length === 0 || chunk.cells.every((c) => c.district === "farm" || c.district === "forest");
  ctx.fillStyle = rural ? "#67793f" : "#7c786c";
  ctx.fillRect(0, 0, size, size);

  for (const cell of chunk.cells) {
    ctx.fillStyle = DISTRICT_FILL[cell.district];
    ctx.beginPath();
    const first = cell.poly[0]!;
    ctx.moveTo(px(first[0]), pz(first[1]));
    for (let i = 1; i < cell.poly.length; i++) {
      const p = cell.poly[i]!;
      ctx.lineTo(px(p[0]), pz(p[1]));
    }
    ctx.closePath();
    ctx.fill();
  }

  for (const r of chunk.paved) {
    ctx.save();
    ctx.translate(px(r.x), pz(r.z));
    ctx.rotate(-r.rot);
    ctx.fillStyle = r.kind === "plaza" ? "#9b978c" : "#6b6a66";
    ctx.fillRect((-r.w / 2) * ppm, (-r.d / 2) * ppm, r.w * ppm, r.d * ppm);
    ctx.restore();
  }

  const strokeArterial = (vertical: boolean, pos: number, width: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * ppm);
    ctx.lineCap = "round";
    ctx.beginPath();
    const along0 = vertical ? chunk.originZ - 40 : chunk.originX - 40;
    const along1 = along0 + chunk.size + 80;
    let started = false;
    for (let s = along0; s <= along1; s += 40) {
      const [wx, wz] = world.warp(vertical ? pos : s, vertical ? s : pos);
      if (!started) {
        ctx.moveTo(px(wx), pz(wz));
        started = true;
      } else {
        ctx.lineTo(px(wx), pz(wz));
      }
    }
    ctx.stroke();
  };

  for (const a of chunk.artX) strokeArterial(true, a.pos, a.width + 9, "#8f8c83");
  for (const a of chunk.artZ) strokeArterial(false, a.pos, a.width + 9, "#8f8c83");

  ctx.lineCap = "round";
  for (const r of chunk.minorRoads) {
    const [ax, az] = world.warp(r.x1, r.z1);
    const [mx, mz] = world.warp((r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2);
    const [bx, bz] = world.warp(r.x2, r.z2);
    ctx.strokeStyle = "#5b5954";
    ctx.lineWidth = Math.max(1, r.width * ppm);
    ctx.beginPath();
    ctx.moveTo(px(ax), pz(az));
    ctx.quadraticCurveTo(px(mx), pz(mz), px(bx), pz(bz));
    ctx.stroke();
  }

  for (const a of chunk.artX) strokeArterial(true, a.pos, a.width, a.major ? "#454543" : "#4d4c49");
  for (const a of chunk.artZ) strokeArterial(false, a.pos, a.width, a.major ? "#454543" : "#4d4c49");

  ctx.setLineDash([5, 6]);
  for (const a of chunk.artX) {
    if (a.major) strokeArterial(true, a.pos, 1.2, "#b9b485");
  }
  for (const a of chunk.artZ) {
    if (a.major) strokeArterial(false, a.pos, 1.2, "#b9b485");
  }
  ctx.setLineDash([]);

  for (const path of chunk.parkPaths) {
    ctx.strokeStyle = "#b3a47c";
    ctx.lineWidth = Math.max(1, path.width * ppm);
    ctx.beginPath();
    const first = path.pts[0]!;
    ctx.moveTo(px(first[0]), pz(first[1]));
    for (let i = 1; i < path.pts.length; i++) {
      const p = path.pts[i]!;
      ctx.lineTo(px(p[0]), pz(p[1]));
    }
    ctx.stroke();
  }

  if (chunk.river.length >= 2) {
    const bankLeft: [number, number][] = [];
    const bankRight: [number, number][] = [];
    for (const s of chunk.river) {
      bankLeft.push(world.warp(s.x - s.halfW, s.z));
      bankRight.push(world.warp(s.x + s.halfW, s.z));
    }
    ctx.beginPath();
    const bl0 = bankLeft[0]!;
    ctx.moveTo(px(bl0[0]), pz(bl0[1]));
    for (let i = 1; i < bankLeft.length; i++) ctx.lineTo(px(bankLeft[i]![0]), pz(bankLeft[i]![1]));
    for (let i = bankRight.length - 1; i >= 0; i--) ctx.lineTo(px(bankRight[i]![0]), pz(bankRight[i]![1]));
    ctx.closePath();
    ctx.strokeStyle = "#8b8468";
    ctx.lineWidth = 6 * ppm;
    ctx.stroke();
    ctx.fillStyle = "#2e4d5c";
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(80, 130, 145, 0.5)";
    for (let i = 0; i < chunk.river.length - 1; i++) {
      const s = chunk.river[i]!;
      const n = chunk.river[i + 1]!;
      const [ax, az] = world.warp(s.x, s.z);
      const [bx, bz] = world.warp(n.x, n.z);
      ctx.lineWidth = Math.max(2, s.halfW * 0.55 * ppm);
      ctx.beginPath();
      ctx.moveTo(px(ax), pz(az));
      ctx.lineTo(px(bx), pz(bz));
      ctx.stroke();
    }
    ctx.restore();
  }

  applyGrain(ctx, size, world.seed ^ (chunk.cx * 374761393) ^ (chunk.cz * 668265263));
  return canvas;
}

function applyGrain(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  let s = seed >>> 0 || 0x1234567;
  for (let i = 0; i < data.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const n = ((s >>> 0) / 4294967296 - 0.5) * 22;
    data[i] = Math.max(0, Math.min(255, data[i]! + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);
}
