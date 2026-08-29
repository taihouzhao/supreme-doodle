/**
 * 地面卫星贴图绘制：把分区底色、路网、标线、步道、停车场、河流、
 * 以及逐像素颗粒噪声都画进一张大 Canvas，作为城市地面的贴图。
 */

import type { CityModel, District } from "./city";

const DISTRICT_FILL: Record<District, string> = {
  cbd: "#767470",
  oldtown: "#807869",
  residential: "#7e7b71",
  suburb: "#71795c",
  industrial: "#7f7e78",
  park: "#5d7a45",
};

export function paintCityTexture(model: CityModel, size = 4096): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const ppm = size / (model.half * 2);
  const px = (x: number): number => (x + model.half) * ppm;
  const pz = (z: number): number => (z + model.half) * ppm;

  // 1) 城市基底
  ctx.fillStyle = "#7c786c";
  ctx.fillRect(0, 0, size, size);

  // 2) 分区底色
  for (const cell of model.cells) {
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

  // 3) 广场与停车场
  for (const r of model.paved) {
    ctx.save();
    ctx.translate(px(r.x), pz(r.z));
    ctx.rotate(-r.rot);
    ctx.fillStyle = r.kind === "plaza" ? "#9b978c" : "#6b6a66";
    ctx.fillRect((-r.w / 2) * ppm, (-r.d / 2) * ppm, r.w * ppm, r.d * ppm);
    ctx.restore();
  }

  // 4) 道路：人行道底 → 支路 → 干道 → 标线
  const strokeArterialPolyline = (vertical: boolean, pos: number, width: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * ppm);
    ctx.lineCap = "round";
    ctx.beginPath();
    let started = false;
    for (let s = -model.half; s <= model.half; s += 40) {
      const [wx, wz] = model.warp(vertical ? pos : s, vertical ? s : pos);
      if (!started) {
        ctx.moveTo(px(wx), pz(wz));
        started = true;
      } else {
        ctx.lineTo(px(wx), pz(wz));
      }
    }
    ctx.stroke();
  };

  for (const a of model.artX) strokeArterialPolyline(true, a.pos, a.width + 9, "#8f8c83");
  for (const a of model.artZ) strokeArterialPolyline(false, a.pos, a.width + 9, "#8f8c83");

  ctx.lineCap = "round";
  for (const r of model.minorRoads) {
    const [ax, az] = model.warp(r.x1, r.z1);
    const [mx, mz] = model.warp((r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2);
    const [bx, bz] = model.warp(r.x2, r.z2);
    ctx.strokeStyle = "#5b5954";
    ctx.lineWidth = Math.max(1, r.width * ppm);
    ctx.beginPath();
    ctx.moveTo(px(ax), pz(az));
    ctx.quadraticCurveTo(px(mx), pz(mz), px(bx), pz(bz));
    ctx.stroke();
  }

  for (const a of model.artX) strokeArterialPolyline(true, a.pos, a.width, a.major ? "#454543" : "#4d4c49");
  for (const a of model.artZ) strokeArterialPolyline(false, a.pos, a.width, a.major ? "#454543" : "#4d4c49");

  // 干道中线（主干道虚线）
  ctx.setLineDash([5, 6]);
  for (const a of model.artX) {
    if (!a.major) continue;
    strokeArterialPolyline(true, a.pos, 1.2, "#b9b485");
  }
  for (const a of model.artZ) {
    if (!a.major) continue;
    strokeArterialPolyline(false, a.pos, 1.2, "#b9b485");
  }
  ctx.setLineDash([]);

  // 5) 公园步道
  for (const path of model.parkPaths) {
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

  // 6) 河流（覆盖道路，再画中心浅色水纹）
  const bankLeft: [number, number][] = [];
  const bankRight: [number, number][] = [];
  for (const s of model.river) {
    bankLeft.push(model.warp(s.x - s.halfW, s.z));
    bankRight.push(model.warp(s.x + s.halfW, s.z));
  }
  // 岸线沙带
  ctx.beginPath();
  const bl0 = bankLeft[0]!;
  ctx.moveTo(px(bl0[0]), pz(bl0[1]));
  for (let i = 1; i < bankLeft.length; i++) ctx.lineTo(px(bankLeft[i]![0]), pz(bankLeft[i]![1]));
  for (let i = bankRight.length - 1; i >= 0; i--) ctx.lineTo(px(bankRight[i]![0]), pz(bankRight[i]![1]));
  ctx.closePath();
  ctx.save();
  ctx.strokeStyle = "#8b8468";
  ctx.lineWidth = 6 * ppm;
  ctx.stroke();
  ctx.fillStyle = "#2e4d5c";
  ctx.fill();
  ctx.restore();

  // 水面中心浅色带与波纹
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px(bl0[0]), pz(bl0[1]));
  for (let i = 1; i < bankLeft.length; i++) ctx.lineTo(px(bankLeft[i]![0]), pz(bankLeft[i]![1]));
  for (let i = bankRight.length - 1; i >= 0; i--) ctx.lineTo(px(bankRight[i]![0]), pz(bankRight[i]![1]));
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = "rgba(80, 130, 145, 0.5)";
  for (let i = 0; i < model.river.length - 1; i++) {
    const s = model.river[i]!;
    const n = model.river[i + 1]!;
    const [ax, az] = model.warp(s.x, s.z);
    const [bx, bz] = model.warp(n.x, n.z);
    ctx.lineWidth = Math.max(2, s.halfW * 0.55 * ppm);
    ctx.beginPath();
    ctx.moveTo(px(ax), pz(az));
    ctx.lineTo(px(bx), pz(bz));
    ctx.stroke();
  }
  ctx.restore();

  // 7) 全图颗粒噪声（航拍质感）
  applyGrain(ctx, size, model.seed);

  return canvas;
}

function applyGrain(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  let s = seed >>> 0 || 0x1234567;
  for (let i = 0; i < data.length; i += 4) {
    // xorshift32
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

/** 城市外围的农田拼布贴图（平铺使用） */
export function paintFarmlandTexture(seed: number, size = 1024): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  let s = (seed ^ 0x5f3759df) >>> 0 || 0x9e3779b9;
  const rnd = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  ctx.fillStyle = "#67793f";
  ctx.fillRect(0, 0, size, size);
  const fieldColors = ["#75884a", "#5f7239", "#8a9455", "#4f6a35", "#7d7a4b", "#697e42", "#94925e"];
  const cols = 8;
  const cw = size / cols;
  for (let a = 0; a < cols; a++) {
    for (let b = 0; b < cols; b++) {
      ctx.fillStyle = fieldColors[Math.floor(rnd() * fieldColors.length)]!;
      ctx.fillRect(a * cw + 1, b * cw + 1, cw - 2, cw - 2);
      if (rnd() < 0.22) {
        // 林地斑块
        ctx.fillStyle = "#3d5a2e";
        ctx.beginPath();
        ctx.ellipse(a * cw + rnd() * cw, b * cw + rnd() * cw, cw * (0.2 + rnd() * 0.3), cw * (0.15 + rnd() * 0.25), rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // 颗粒
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const n = ((s >>> 0) / 4294967296 - 0.5) * 18;
    data[i] = Math.max(0, Math.min(255, data[i]! + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
