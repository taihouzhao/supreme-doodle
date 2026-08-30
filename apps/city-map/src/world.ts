/**
 * 无限世界模拟：确定性世界函数 + 按区块生成景观。
 * 同一 (seed, cx, cz) 永远长出同一块地。
 */

import type {
  Arterial,
  BuildingKind,
  ChunkModel,
  District,
} from "./city";
import { hash2, makeNoise2D, Rng } from "./rng";

export const CHUNK_SIZE = 800;
const ART_SPACING = 340;
const CORE_CELL = 8000;

const CONCRETE = [0xb8b2a6, 0xcfc9bd, 0xa8a49c, 0xd8d2c4, 0x9b968c, 0xc4bcae];
const GLASS = [0x6f8fa8, 0x7d95ac, 0x5c7d96, 0x8aa3b8, 0x63808f];
const OLDTOWN = [0xa8846a, 0xb5926f, 0x8f6f52, 0x9c7a5e, 0x8d8378, 0xb09a80];
const HOUSE_ROOF = [0x7a5a48, 0x6e4f3e, 0x8a6a52, 0x55575c, 0x625048, 0x84624e];
const INDUSTRIAL = [0xcdd0d2, 0xe0e2e3, 0xb4bcc4, 0x9aa4b0, 0xc8c4b8];
export const CAR_COLORS = [0xdedede, 0xc8c8c8, 0x2a2c30, 0x8a8f96, 0xa03028, 0x2c4a78, 0xd8d8d0, 0xefefef, 0x506078, 0x303030];

function jitterColor(rng: Rng, hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const f = 1 + rng.range(-amount, amount);
  const cr = Math.max(0, Math.min(255, Math.round(r * f)));
  const cg = Math.max(0, Math.min(255, Math.round(g * f)));
  const cb = Math.max(0, Math.min(255, Math.round(b * f)));
  return (cr << 16) | (cg << 8) | cb;
}

function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

export interface CityCore {
  x: number;
  z: number;
  radius: number;
  oldAng: number;
  indAng: number;
}

export interface World {
  seed: number;
  warp: (x: number, z: number) => [number, number];
  streetAngle: (x: number, z: number) => number;
  riverX: (z: number, family: number) => number;
  riverHalfW: (z: number, family: number) => number;
  nearestRiver: (x: number, z: number) => { family: number; x: number; halfW: number };
  isWater: (x: number, z: number) => boolean;
  nearestCore: (x: number, z: number) => CityCore | null;
  districtAt: (x: number, z: number) => District;
  arterialsX: (min: number, max: number) => Arterial[];
  arterialsZ: (min: number, max: number) => Arterial[];
}

const RIVER_SPACING = 14000;

export function createWorld(seed: number): World {
  const warpNX = makeNoise2D(seed + 11);
  const warpNZ = makeNoise2D(seed + 23);
  const districtNoise = makeNoise2D(seed + 41);
  const parkNoise = makeNoise2D(seed + 57);
  const riverNoise = makeNoise2D(seed + 69);
  const ruralNoise = makeNoise2D(seed + 83);

  const WARP_AMP = 85;
  const WARP_FREQ = 1 / 1500;
  const warp = (x: number, z: number): [number, number] => [
    x + WARP_AMP * (warpNX(x * WARP_FREQ, z * WARP_FREQ) * 2 - 1),
    z + WARP_AMP * (warpNZ(x * WARP_FREQ, z * WARP_FREQ) * 2 - 1),
  ];

  const streetAngle = (x: number, z: number): number => {
    const e = 24;
    const [ax, az] = warp(x - e, z);
    const [bx, bz] = warp(x + e, z);
    return Math.atan2(-(bz - az), bx - ax);
  };

  const riverX = (z: number, family: number): number => {
    const h = hash2(family, 0, seed + 201);
    const offset = (h - 0.5) * 900;
    const phase = hash2(family, 1, seed + 202) * Math.PI * 2;
    const amp = 500 + hash2(family, 2, seed + 203) * 400;
    return family * RIVER_SPACING + offset + amp * Math.sin(z * 3.1e-4 + phase) + 420 * (riverNoise(z * 6.5e-4, family * 3.7) - 0.5);
  };

  const riverHalfW = (z: number, family: number): number => {
    const lakeZ = (hash2(family, 3, seed + 204) - 0.5) * 8000;
    const g = (z - lakeZ) / 430;
    return 42 + 26 * riverNoise(z * 1.1e-3, family * 8.2) + 250 * Math.exp(-g * g);
  };

  const nearestRiver = (x: number, z: number): { family: number; x: number; halfW: number } => {
    const fam = Math.round(x / RIVER_SPACING);
    let best = fam;
    let bestD = Infinity;
    for (let f = fam - 1; f <= fam + 1; f++) {
      const rx = riverX(z, f);
      const d = Math.abs(x - rx);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return { family: best, x: riverX(z, best), halfW: riverHalfW(z, best) };
  };

  const isWater = (x: number, z: number): boolean => {
    const r = nearestRiver(x, z);
    return Math.abs(x - r.x) < r.halfW;
  };

  const coreAtCell = (ix: number, iz: number): CityCore | null => {
    const forced = ix === 0 && iz === 0;
    const h = hash2(ix, iz, seed + 99);
    if (!forced && h > 0.48) return null;
    const jx = hash2(ix, iz, seed + 7);
    const jz = hash2(ix, iz, seed + 13);
    if (forced) {
      return { x: 0, z: 0, radius: 2800, oldAng: jx * Math.PI * 2, indAng: jz * Math.PI * 2 };
    }
    return {
      x: (ix + 0.32 + jx * 0.36) * CORE_CELL,
      z: (iz + 0.32 + jz * 0.36) * CORE_CELL,
      radius: 2100 + hash2(ix, iz, seed + 19) * 1300,
      oldAng: jx * Math.PI * 2,
      indAng: jz * Math.PI * 2,
    };
  };

  const nearestCore = (x: number, z: number): CityCore | null => {
    const ix = Math.floor(x / CORE_CELL);
    const iz = Math.floor(z / CORE_CELL);
    let best: CityCore | null = null;
    let bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = coreAtCell(ix + dx, iz + dz);
        if (!c) continue;
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.radius + 500 && d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  };

  const districtAt = (x: number, z: number): District => {
    const core = nearestCore(x, z);
    if (!core) return ruralNoise(x * 6e-4, z * 6e-4) > 0.62 ? "forest" : "farm";
    const r = Math.hypot(x - core.x, z - core.z) + 620 * (districtNoise(x * 7e-4, z * 7e-4) - 0.5);
    const scale = 2800 / core.radius;
    const nr = r * scale;
    const ang = Math.atan2(z - core.z, x - core.x);
    if (nr < 820) return "cbd";
    if (nr < 1400 && angDiff(ang, core.oldAng) < 1.15) return "oldtown";
    if (nr > 1150 && nr < 2750 && angDiff(ang, core.indAng) < 0.52) return "industrial";
    if (nr > 2480) {
      if (nr > 3000) return ruralNoise(x * 6e-4, z * 6e-4) > 0.7 ? "forest" : "farm";
      return "suburb";
    }
    if (parkNoise(x * 9e-4, z * 9e-4) > 0.74) return "park";
    return "residential";
  };

  const arterialAt = (axis: 0 | 1, i: number): Arterial => {
    const h = hash2(i, axis === 0 ? 17 : 31, seed);
    const pos = i * ART_SPACING + (h - 0.5) * 70;
    const major = ((i % 3) + 3) % 3 === 0;
    return { pos, width: major ? 26 : 15, major };
  };

  const arterialsInRange = (min: number, max: number, axis: 0 | 1): Arterial[] => {
    const i0 = Math.floor(min / ART_SPACING) - 2;
    const i1 = Math.ceil(max / ART_SPACING) + 2;
    const out: Arterial[] = [];
    for (let i = i0; i <= i1; i++) {
      const a = arterialAt(axis, i);
      if (a.pos >= min - 40 && a.pos <= max + 40) out.push(a);
    }
    out.sort((a, b) => a.pos - b.pos);
    return out;
  };

  return {
    seed,
    warp,
    streetAngle,
    riverX,
    riverHalfW,
    nearestRiver,
    isWater,
    nearestCore,
    districtAt,
    arterialsX: (min, max) => arterialsInRange(min, max, 0),
    arterialsZ: (min, max) => arterialsInRange(min, max, 1),
  };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunk(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) };
}

export function generateChunk(world: World, cx: number, cz: number): ChunkModel {
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const rng = new Rng((hash2(cx, cz, world.seed) * 0xffffffff) >>> 0);
  const { warp, streetAngle, isWater } = world;

  const model: ChunkModel = {
    cx,
    cz,
    originX,
    originZ,
    size: CHUNK_SIZE,
    seed: world.seed,
    artX: world.arterialsX(originX - 80, originX + CHUNK_SIZE + 80),
    artZ: world.arterialsZ(originZ - 80, originZ + CHUNK_SIZE + 80),
    minorRoads: [],
    cells: [],
    paved: [],
    parkPaths: [],
    river: [],
    buildings: [],
    roofUnits: [],
    trees: [],
    bridges: [],
    boats: [],
    lanes: [],
    cars: [],
    parkedCars: [],
  };

  const inChunk = (ux: number, uz: number): boolean =>
    ux >= originX && ux < originX + CHUNK_SIZE && uz >= originZ && uz < originZ + CHUNK_SIZE;

  const addBuilding = (
    ux: number,
    uz: number,
    rot: number,
    w: number,
    d: number,
    h: number,
    color: number,
    kind: BuildingKind,
  ): void => {
    if (isWater(ux, uz)) return;
    const [x, z] = warp(ux, uz);
    model.buildings.push({ x, z, rot, w, d, h, color, kind });
    if (kind !== "house" && h >= 24 && rng.chance(0.85)) {
      const n = rng.int(1, Math.min(4, Math.floor(w / 12) + 1));
      for (let k = 0; k < n; k++) {
        const uw = rng.range(2, Math.min(6, w * 0.28));
        const ud = rng.range(2, Math.min(6, d * 0.28));
        const uh = rng.range(1.5, 3.4);
        const ox = rng.range(-0.3, 0.3) * w;
        const oz = rng.range(-0.3, 0.3) * d;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        model.roofUnits.push({
          x: x + ox * cos + oz * sin,
          z: z - ox * sin + oz * cos,
          y: h + uh / 2,
          rot,
          w: uw,
          d: ud,
          h: uh,
        });
      }
    }
  };

  const addTree = (ux: number, uz: number, scale = 1): void => {
    if (isWater(ux, uz)) return;
    const [x, z] = warp(ux, uz);
    const r = rng.range(2.4, 5.2) * scale;
    const hue = rng.range(0.24, 0.35);
    const sat = rng.range(0.32, 0.55);
    const lig = rng.range(0.18, 0.32);
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
    const p = 2 * lig - q;
    const f = (t: number): number => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const color =
      (Math.round(f(hue + 1 / 3) * 255) << 16) | (Math.round(f(hue) * 255) << 8) | Math.round(f(hue - 1 / 3) * 255);
    model.trees.push({ x, z, r, h: r * rng.range(1.15, 1.6), color });
  };

  function fillCbd(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const nx = Math.max(1, Math.round(w / 85));
    const nz = Math.max(1, Math.round(d / 85));
    const sw = w / nx;
    const sd = d / nz;
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < nz; b++) {
        const ux = x0 + (a + 0.5) * sw;
        const uz = z0 + (b + 0.5) * sd;
        if (rng.chance(0.14)) {
          const [px, pz] = warp(ux, uz);
          model.paved.push({ x: px, z: pz, rot, w: sw * 0.8, d: sd * 0.8, kind: "plaza" });
          for (let t = 0; t < 4; t++) addTree(ux + rng.range(-sw * 0.3, sw * 0.3), uz + rng.range(-sd * 0.3, sd * 0.3), 0.9);
          continue;
        }
        const glass = rng.chance(0.55);
        const fw = Math.min(sw * 0.62, rng.range(26, 48));
        const fd = Math.min(sd * 0.62, rng.range(26, 48));
        let h = 55 + 265 * Math.pow(rng.next(), 2.3);
        if (rng.chance(0.02)) h = rng.range(320, 390);
        addBuilding(ux, uz, rot, fw, fd, h, jitterColor(rng, glass ? rng.pick(GLASS) : rng.pick(CONCRETE), 0.08), glass ? "glass" : "flat");
      }
    }
  }

  function fillOldtown(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const d = z1 - z0;
    const rows = Math.max(1, Math.floor(d / 30));
    const rowD = d / rows;
    for (let r = 0; r < rows; r++) {
      const uz = z0 + (r + 0.5) * rowD;
      if (r > 0 && r % 2 === 0) {
        model.minorRoads.push({ x1: x0, z1: z0 + r * rowD, x2: x1, z2: z0 + r * rowD, width: 6 });
      }
      let ux = x0 + 4;
      while (ux < x1 - 10) {
        const lw = rng.range(10, 18);
        if (ux + lw > x1 - 2) break;
        if (rng.chance(0.92)) {
          addBuilding(ux + lw / 2, uz, rot, lw - 1.4, Math.min(rowD - 4, rng.range(11, 16)), rng.range(7, 19), jitterColor(rng, rng.pick(OLDTOWN), 0.1), "flat");
        } else {
          addTree(ux + lw / 2, uz, 0.8);
        }
        ux += lw;
      }
    }
  }

  function fillSlabBlock(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w < 45 || d < 45) return;
    const rows = Math.max(1, Math.floor(d / 42));
    const rowD = d / rows;
    for (let r = 0; r < rows; r++) {
      const uz = z0 + (r + 0.5) * rowD;
      let ux = x0 + 6;
      while (ux < x1 - 24) {
        const slabW = Math.min(x1 - 6 - ux, rng.range(28, 58));
        if (slabW < 20) break;
        if (rng.chance(0.88)) {
          addBuilding(ux + slabW / 2, uz, rot, slabW - 3, rng.range(12, 15), rng.range(18, 58), jitterColor(rng, rng.pick(CONCRETE), 0.07), "flat");
        }
        ux += slabW + rng.range(4, 14);
      }
      const nTrees = Math.floor(w / 26);
      for (let t = 0; t < nTrees; t++) addTree(x0 + rng.range(6, w - 6), uz + rowD * rng.range(-0.42, 0.42), 0.85);
    }
  }

  function fillResidential(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const splitX = w > 250;
    const splitZ = d > 250;
    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;
    if (splitX) model.minorRoads.push({ x1: midX, z1: z0, x2: midX, z2: z1, width: 9 });
    if (splitZ) model.minorRoads.push({ x1: x0, z1: midZ, x2: x1, z2: midZ, width: 9 });
    const xs = splitX ? [x0, midX - 5, midX + 5, x1] : [x0, x1];
    const zs = splitZ ? [z0, midZ - 5, midZ + 5, z1] : [z0, z1];
    for (let a = 0; a + 1 < xs.length; a += 2) {
      for (let b = 0; b + 1 < zs.length; b += 2) {
        fillSlabBlock(xs[a]!, xs[a + 1]!, zs[b]!, zs[b + 1]!, rot);
      }
    }
  }

  function fillSuburb(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const d = z1 - z0;
    const rows = Math.max(1, Math.floor(d / 46));
    const rowD = d / rows;
    for (let r = 0; r < rows; r++) {
      if (r > 0) model.minorRoads.push({ x1: x0, z1: z0 + r * rowD, x2: x1, z2: z0 + r * rowD, width: 7 });
      for (const side of [-1, 1]) {
        const uz = z0 + r * rowD + rowD / 2 + side * rowD * 0.22;
        let ux = x0 + 6;
        while (ux < x1 - 20) {
          const lotW = rng.range(18, 26);
          if (ux + lotW > x1 - 4) break;
          if (rng.chance(0.86)) {
            addBuilding(ux + lotW / 2 + rng.range(-2, 2), uz + rng.range(-3, 3), rot + rng.range(-0.06, 0.06), rng.range(8, 12), rng.range(7, 10), rng.range(3.5, 6), jitterColor(rng, rng.pick(HOUSE_ROOF), 0.1), "house");
          }
          if (rng.chance(0.7)) addTree(ux + lotW / 2 + rng.range(-8, 8), uz + rng.range(-10, 10), 0.9);
          ux += lotW;
        }
      }
    }
  }

  function addParkedRows(ux: number, uz: number, rot: number, w: number, d: number): void {
    const rows = Math.max(1, Math.floor(d / 8));
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const [x, z] = warp(ux, uz);
    for (let r = 0; r < rows; r++) {
      const oz = (r + 0.5) * (d / rows) - d / 2;
      for (let ox = -w / 2 + 2.4; ox < w / 2 - 2.4; ox += 3.1) {
        if (!rng.chance(0.55)) continue;
        model.parkedCars.push({
          x: x + ox * cos + oz * sin,
          z: z - ox * sin + oz * cos,
          rot: rot + Math.PI / 2,
          color: rng.pick(CAR_COLORS),
        });
      }
    }
  }

  function fillIndustrial(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const nx = Math.max(1, Math.round(w / 120));
    const nz = Math.max(1, Math.round(d / 120));
    const sw = w / nx;
    const sd = d / nz;
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < nz; b++) {
        const ux = x0 + (a + 0.5) * sw;
        const uz = z0 + (b + 0.5) * sd;
        if (rng.chance(0.18)) continue;
        const fw = Math.min(sw * 0.66, rng.range(42, 88));
        const fd = Math.min(sd * 0.62, rng.range(28, 62));
        addBuilding(ux, uz, rot, fw, fd, rng.range(8, 15), jitterColor(rng, rng.pick(INDUSTRIAL), 0.06), "flat");
        if (rng.chance(0.75) && !isWater(ux, uz + fd)) {
          const pw = fw * rng.range(0.7, 1);
          const pd = rng.range(16, 26);
          const puz = uz + fd / 2 + pd / 2 + 5;
          if (!isWater(ux, puz)) {
            const [px, pz] = warp(ux, puz);
            model.paved.push({ x: px, z: pz, rot, w: pw, d: pd, kind: "parking" });
            addParkedRows(ux, puz, rot, pw, pd);
          }
        }
      }
    }
  }

  function fillPark(x0: number, x1: number, z0: number, z1: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const n = Math.floor((w * d) / 260);
    for (let t = 0; t < n; t++) addTree(x0 + rng.range(2, w - 2), z0 + rng.range(2, d - 2), rng.range(0.9, 1.5));
    for (let p = 0; p < 2; p++) {
      const pts: [number, number][] = [];
      const vertical = p === 0;
      for (let s = 0; s <= 8; s++) {
        const f = s / 8;
        const ux = vertical ? x0 + w * (0.3 + 0.4 * hash2(s, p, world.seed + 9)) : x0 + w * f;
        const uz = vertical ? z0 + d * f : z0 + d * (0.3 + 0.4 * hash2(s, p + 5, world.seed + 9));
        pts.push(warp(ux, uz));
      }
      model.parkPaths.push({ pts, width: 4 });
    }
  }

  function fillFarm(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    if (rng.chance(0.22) && w > 60 && d > 60) {
      addBuilding(x0 + w * rng.range(0.3, 0.7), z0 + d * rng.range(0.3, 0.7), rot, rng.range(10, 18), rng.range(8, 14), rng.range(4, 7), jitterColor(rng, rng.pick(HOUSE_ROOF), 0.1), "house");
    }
    const n = Math.floor((w * d) / 2200);
    for (let t = 0; t < n; t++) addTree(x0 + rng.range(4, w - 4), z0 + rng.range(4, d - 4), rng.range(0.8, 1.3));
  }

  function fillForest(x0: number, x1: number, z0: number, z1: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const n = Math.floor((w * d) / 180);
    for (let t = 0; t < n; t++) addTree(x0 + rng.range(2, w - 2), z0 + rng.range(2, d - 2), rng.range(1.0, 1.6));
  }

  for (let i = 0; i < model.artX.length - 1; i++) {
    const gx0 = model.artX[i]!;
    const gx1 = model.artX[i + 1]!;
    for (let j = 0; j < model.artZ.length - 1; j++) {
      const gz0 = model.artZ[j]!;
      const gz1 = model.artZ[j + 1]!;
      const x0 = gx0.pos + gx0.width / 2 + 6;
      const x1 = gx1.pos - gx1.width / 2 - 6;
      const z0 = gz0.pos + gz0.width / 2 + 6;
      const z1 = gz1.pos - gz1.width / 2 - 6;
      if (x1 - x0 < 40 || z1 - z0 < 40) continue;
      const ccx = (x0 + x1) / 2;
      const ccz = (z0 + z1) / 2;
      if (!inChunk(ccx, ccz)) continue;

      const district = world.districtAt(ccx, ccz);
      model.cells.push({
        poly: [warp(x0, z0), warp(x1, z0), warp(x1, z1), warp(x0, z1)],
        district,
      });
      const rot = streetAngle(ccx, ccz);
      switch (district) {
        case "cbd":
          fillCbd(x0, x1, z0, z1, rot);
          break;
        case "oldtown":
          fillOldtown(x0, x1, z0, z1, rot);
          break;
        case "residential":
          fillResidential(x0, x1, z0, z1, rot);
          break;
        case "suburb":
          fillSuburb(x0, x1, z0, z1, rot);
          break;
        case "industrial":
          fillIndustrial(x0, x1, z0, z1, rot);
          break;
        case "park":
          fillPark(x0, x1, z0, z1);
          break;
        case "farm":
          fillFarm(x0, x1, z0, z1, rot);
          break;
        case "forest":
          fillForest(x0, x1, z0, z1);
          break;
      }
    }
  }

  // 行道树（仅本块路段）
  for (const a of model.artX) {
    if (a.pos < originX - 10 || a.pos > originX + CHUNK_SIZE + 10) continue;
    for (let z = originZ + 10; z < originZ + CHUNK_SIZE - 10; z += 13) {
      for (const side of [-1, 1] as const) {
        if (!rng.chance(0.82)) continue;
        addTree(a.pos + side * (a.width / 2 + 4.5), z + rng.range(-3, 3), 0.8);
      }
    }
  }
  for (const a of model.artZ) {
    if (a.pos < originZ - 10 || a.pos > originZ + CHUNK_SIZE + 10) continue;
    for (let x = originX + 10; x < originX + CHUNK_SIZE - 10; x += 13) {
      for (const side of [-1, 1] as const) {
        if (!rng.chance(0.82)) continue;
        addTree(x + rng.range(-3, 3), a.pos + side * (a.width / 2 + 4.5), 0.8);
      }
    }
  }

  // 河流采样
  for (let z = originZ - 80; z <= originZ + CHUNK_SIZE + 80; z += 40) {
    const r = world.nearestRiver(originX + CHUNK_SIZE / 2, z);
    model.river.push({ z, x: r.x, halfW: r.halfW });
  }

  // 桥梁：水平主干跨河且交点在本块
  const bridgedZ = new Set<number>();
  for (const a of model.artZ) {
    if (!a.major) continue;
    const r = world.nearestRiver(originX + CHUNK_SIZE / 2, a.pos);
    if (r.x < originX - 20 || r.x > originX + CHUNK_SIZE + 20) continue;
    if (r.halfW > 160 && !rng.chance(0.4)) continue;
    const [bx, bz] = warp(r.x, a.pos);
    model.bridges.push({ x: bx, z: bz, rot: streetAngle(r.x, a.pos), len: r.halfW * 2 + 44, width: a.width + 5 });
    bridgedZ.add(a.pos);
  }

  // 船只
  for (let b = 0; b < 4; b++) {
    const uz = originZ + rng.range(20, CHUNK_SIZE - 20);
    const r = world.nearestRiver(originX + CHUNK_SIZE / 2, uz);
    if (r.x < originX || r.x > originX + CHUNK_SIZE) continue;
    if (r.halfW < 34) continue;
    const ux = r.x + rng.range(-0.55, 0.55) * r.halfW;
    const [x, z] = warp(ux, uz);
    model.boats.push({
      x,
      z,
      rot: rng.range(0, Math.PI * 2),
      len: rng.range(8, r.halfW > 150 ? 30 : 16),
      width: rng.range(2.6, 5),
      color: rng.pick([0xf0f0ea, 0xe8e4da, 0xc0392b, 0x2c3e50, 0xdddddd]),
    });
  }

  const buildLane = (arterial: Arterial, vertical: boolean): void => {
    const pts: [number, number][] = [];
    const wet: boolean[] = [];
    const along0 = vertical ? originZ : originX;
    const along1 = along0 + CHUNK_SIZE;
    for (let s = along0; s <= along1; s += 50) {
      const ux = vertical ? arterial.pos : s;
      const uz = vertical ? s : arterial.pos;
      pts.push(warp(ux, uz));
      wet.push(isWater(ux, uz));
    }
    if (pts.length < 2) return;
    const cum: number[] = [0];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1]!;
      const [bx, bz] = pts[k]!;
      total += Math.hypot(bx - ax, bz - az);
      cum.push(total);
    }
    if (total < 8) return;
    const bridged = !vertical && bridgedZ.has(arterial.pos);
    const laneIdx = model.lanes.length;
    model.lanes.push({ pts, cum, total, wet, bridged, roadWidth: arterial.width });
    const density = arterial.major ? 42 : 70;
    const n = Math.max(1, Math.floor(total / density));
    for (let c = 0; c < n; c++) {
      model.cars.push({
        lane: laneIdx,
        t: rng.range(0, total),
        dir: rng.chance(0.5) ? 1 : -1,
        speed: rng.range(7, 17),
        color: rng.pick(CAR_COLORS),
      });
    }
  };
  for (const a of model.artX) {
    if (a.pos >= originX - 30 && a.pos <= originX + CHUNK_SIZE + 30) buildLane(a, true);
  }
  for (const a of model.artZ) {
    if (a.pos >= originZ - 30 && a.pos <= originZ + CHUNK_SIZE + 30) buildLane(a, false);
  }

  return model;
}
