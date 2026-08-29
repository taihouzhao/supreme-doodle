/**
 * 程序化城市生成器。
 *
 * 思路：在「规整网格空间」里做所有布局决策（干道网格、街区细分、地块摆放、
 * 水体判定），再通过一个平滑噪声扭曲函数 warp() 把坐标映射到最终世界坐标，
 * 让笔直的路网变成微弯的有机形态，接近真实城市的航拍观感。
 */

import { Rng, makeNoise2D } from "./rng";

export type District = "cbd" | "oldtown" | "residential" | "suburb" | "industrial" | "park";

export type BuildingKind = "flat" | "glass" | "house";

export interface Building {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  h: number;
  color: number;
  kind: BuildingKind;
}

export interface RoofUnit {
  x: number;
  z: number;
  y: number;
  rot: number;
  w: number;
  d: number;
  h: number;
}

export interface Tree {
  x: number;
  z: number;
  r: number;
  h: number;
  color: number;
}

export interface Bridge {
  x: number;
  z: number;
  rot: number;
  len: number;
  width: number;
}

export interface Boat {
  x: number;
  z: number;
  rot: number;
  len: number;
  width: number;
  color: number;
}

export interface Arterial {
  pos: number;
  width: number;
  major: boolean;
}

export interface MinorRoad {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
}

export interface CellPaint {
  poly: [number, number][];
  district: District;
}

export interface PavedRect {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  kind: "plaza" | "parking";
}

export interface ParkPath {
  pts: [number, number][];
  width: number;
}

/** 车道：沿一条干道的折线（已扭曲），带累计弧长与「水面」掩码 */
export interface CarLane {
  pts: [number, number][];
  cum: number[];
  total: number;
  wet: boolean[];
  bridged: boolean;
  roadWidth: number;
}

export interface Car {
  lane: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  color: number;
}

export interface ParkedCar {
  x: number;
  z: number;
  rot: number;
  color: number;
}

export interface RiverSample {
  z: number;
  x: number;
  halfW: number;
}

export interface CityModel {
  seed: number;
  half: number;
  warp: (x: number, z: number) => [number, number];
  streetAngle: (x: number, z: number) => number;
  isWater: (x: number, z: number) => boolean;
  artX: Arterial[];
  artZ: Arterial[];
  minorRoads: MinorRoad[];
  cells: CellPaint[];
  paved: PavedRect[];
  parkPaths: ParkPath[];
  river: RiverSample[];
  buildings: Building[];
  roofUnits: RoofUnit[];
  trees: Tree[];
  bridges: Bridge[];
  boats: Boat[];
  lanes: CarLane[];
  cars: Car[];
  parkedCars: ParkedCar[];
}

export const CITY_SIZE = 6400;
const HALF = CITY_SIZE / 2;

const CONCRETE = [0xb8b2a6, 0xcfc9bd, 0xa8a49c, 0xd8d2c4, 0x9b968c, 0xc4bcae];
const GLASS = [0x6f8fa8, 0x7d95ac, 0x5c7d96, 0x8aa3b8, 0x63808f];
const OLDTOWN = [0xa8846a, 0xb5926f, 0x8f6f52, 0x9c7a5e, 0x8d8378, 0xb09a80];
const HOUSE_ROOF = [0x7a5a48, 0x6e4f3e, 0x8a6a52, 0x55575c, 0x625048, 0x84624e];
const INDUSTRIAL = [0xcdd0d2, 0xe0e2e3, 0xb4bcc4, 0x9aa4b0, 0xc8c4b8];
const CAR_COLORS = [0xdedede, 0xc8c8c8, 0x2a2c30, 0x8a8f96, 0xa03028, 0x2c4a78, 0xd8d8d0, 0xefefef, 0x506078, 0x303030];

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

export function generateCity(seed: number): CityModel {
  const rng = new Rng(seed);
  const warpNX = makeNoise2D(seed + 11);
  const warpNZ = makeNoise2D(seed + 23);
  const districtNoise = makeNoise2D(seed + 41);
  const parkNoise = makeNoise2D(seed + 57);
  const riverNoise = makeNoise2D(seed + 69);

  const WARP_AMP = 85;
  const WARP_FREQ = 1 / 1500;
  const warp = (x: number, z: number): [number, number] => [
    x + WARP_AMP * (warpNX(x * WARP_FREQ, z * WARP_FREQ) * 2 - 1),
    z + WARP_AMP * (warpNZ(x * WARP_FREQ, z * WARP_FREQ) * 2 - 1),
  ];

  /** 该点处「网格 x 轴」经扭曲后的方向角（用于建筑贴合街道朝向） */
  const streetAngle = (x: number, z: number): number => {
    const e = 24;
    const [ax, az] = warp(x - e, z);
    const [bx, bz] = warp(x + e, z);
    return Math.atan2(-(bz - az), bx - ax);
  };

  // —— 河流 ——
  const riverOffset = rng.range(-700, 700);
  const riverPhase = rng.range(0, Math.PI * 2);
  const riverAmp = rng.range(500, 850);
  const lakeZ = rng.range(-1600, 1600);
  const riverX = (z: number): number =>
    riverOffset + riverAmp * Math.sin(z * 3.1e-4 + riverPhase) + 420 * (riverNoise(z * 6.5e-4, 3.7) - 0.5);
  const riverHalfW = (z: number): number => {
    const g = (z - lakeZ) / 430;
    return 42 + 26 * riverNoise(z * 1.1e-3, 8.2) + 250 * Math.exp(-g * g);
  };
  const isWater = (x: number, z: number): boolean => Math.abs(x - riverX(z)) < riverHalfW(z);

  const river: RiverSample[] = [];
  for (let z = -HALF - 200; z <= HALF + 200; z += 40) {
    river.push({ z, x: riverX(z), halfW: riverHalfW(z) });
  }

  // —— 干道网格（规整空间） ——
  const makeAxis = (): Arterial[] => {
    const arr: Arterial[] = [];
    let p = -HALF;
    let i = 0;
    while (p < HALF - 180) {
      const major = i % 3 === 1;
      arr.push({ pos: p, width: major ? 26 : 15, major });
      p += rng.range(260, 400);
      i++;
    }
    arr.push({ pos: HALF, width: 26, major: true });
    return arr;
  };
  const artX = makeAxis(); // 竖直干道（x 为常数，沿 z 延伸）
  const artZ = makeAxis(); // 水平干道（z 为常数，沿 x 延伸）

  // —— 分区 ——
  const oldAng = rng.range(-Math.PI, Math.PI);
  let indAng = rng.range(-Math.PI, Math.PI);
  if (angDiff(indAng, oldAng) < 1.4) indAng = oldAng + Math.PI;
  const districtFor = (cx: number, cz: number): District => {
    const r = Math.hypot(cx, cz) + 620 * (districtNoise(cx * 7e-4, cz * 7e-4) - 0.5);
    const ang = Math.atan2(cz, cx);
    if (r < 820) return "cbd";
    if (r < 1400 && angDiff(ang, oldAng) < 1.15) return "oldtown";
    if (r > 1150 && r < 2750 && angDiff(ang, indAng) < 0.52) return "industrial";
    if (r > 2480) return "suburb";
    return "residential";
  };

  const model: CityModel = {
    seed,
    half: HALF,
    warp,
    streetAngle,
    isWater,
    artX,
    artZ,
    minorRoads: [],
    cells: [],
    paved: [],
    parkPaths: [],
    river,
    buildings: [],
    roofUnits: [],
    trees: [],
    bridges: [],
    boats: [],
    lanes: [],
    cars: [],
    parkedCars: [],
  };

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
    // 手工 HSL → RGB（避免在生成层引入 three 依赖）
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

  // —— 逐街区生成 ——
  for (let i = 0; i < artX.length - 1; i++) {
    const gx0 = artX[i]!;
    const gx1 = artX[i + 1]!;
    for (let j = 0; j < artZ.length - 1; j++) {
      const gz0 = artZ[j]!;
      const gz1 = artZ[j + 1]!;
      const x0 = gx0.pos + gx0.width / 2 + 6;
      const x1 = gx1.pos - gx1.width / 2 - 6;
      const z0 = gz0.pos + gz0.width / 2 + 6;
      const z1 = gz1.pos - gz1.width / 2 - 6;
      if (x1 - x0 < 40 || z1 - z0 < 40) continue;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;

      let district = districtFor(cx, cz);
      const pn = parkNoise(cx * 9e-4, cz * 9e-4);
      if (district !== "cbd" && pn > 0.74) district = "park";

      model.cells.push({
        poly: [warp(x0, z0), warp(x1, z0), warp(x1, z1), warp(x0, z1)],
        district,
      });

      const rot = streetAngle(cx, cz);
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
      }
    }
  }

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
          // 留白做广场
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
        addBuilding(
          ux,
          uz,
          rot,
          fw,
          fd,
          h,
          jitterColor(rng, glass ? rng.pick(GLASS) : rng.pick(CONCRETE), 0.08),
          glass ? "glass" : "flat",
        );
      }
    }
  }

  function fillOldtown(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const d = z1 - z0;
    const rows = Math.max(1, Math.floor(d / 30));
    const rowD = d / rows;
    for (let r = 0; r < rows; r++) {
      const uz = z0 + (r + 0.5) * rowD;
      // 每两排之间画一条小巷
      if (r > 0 && r % 2 === 0) {
        model.minorRoads.push({ x1: x0, z1: z0 + r * rowD, x2: x1, z2: z0 + r * rowD, width: 6 });
      }
      let ux = x0 + 4;
      while (ux < x1 - 10) {
        const lw = rng.range(10, 18);
        if (ux + lw > x1 - 2) break;
        if (rng.chance(0.92)) {
          addBuilding(
            ux + lw / 2,
            uz,
            rot,
            lw - 1.4,
            Math.min(rowD - 4, rng.range(11, 16)),
            rng.range(7, 19),
            jitterColor(rng, rng.pick(OLDTOWN), 0.1),
            "flat",
          );
        } else {
          addTree(ux + lw / 2, uz, 0.8);
        }
        ux += lw;
      }
    }
  }

  function fillResidential(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    // 大街区先切成 2×2 子块并画内部支路
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

  function fillSlabBlock(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w < 45 || d < 45) return;
    // 板楼排布：沿 z 向排行，楼间留出院落并种树
    const rows = Math.max(1, Math.floor(d / 42));
    const rowD = d / rows;
    for (let r = 0; r < rows; r++) {
      const uz = z0 + (r + 0.5) * rowD;
      let ux = x0 + 6;
      while (ux < x1 - 24) {
        const slabW = Math.min(x1 - 6 - ux, rng.range(28, 58));
        if (slabW < 20) break;
        if (rng.chance(0.88)) {
          addBuilding(
            ux + slabW / 2,
            uz,
            rot,
            slabW - 3,
            rng.range(12, 15),
            rng.range(18, 58),
            jitterColor(rng, rng.pick(CONCRETE), 0.07),
            "flat",
          );
        }
        ux += slabW + rng.range(4, 14);
      }
      // 院落树
      const nTrees = Math.floor(w / 26);
      for (let t = 0; t < nTrees; t++) {
        addTree(x0 + rng.range(6, w - 6), uz + rowD * rng.range(-0.42, 0.42), 0.85);
      }
    }
  }

  function fillSuburb(x0: number, x1: number, z0: number, z1: number, rot: number): void {
    const d = z1 - z0;
    const rows = Math.max(1, Math.floor(d / 46));
    const rowD = d / rows;
    for (let r = 0; r < rows; r++) {
      if (r > 0) {
        model.minorRoads.push({ x1: x0, z1: z0 + r * rowD, x2: x1, z2: z0 + r * rowD, width: 7 });
      }
      for (const side of [-1, 1]) {
        const uz = z0 + r * rowD + rowD / 2 + side * rowD * 0.22;
        let ux = x0 + 6;
        while (ux < x1 - 20) {
          const lotW = rng.range(18, 26);
          if (ux + lotW > x1 - 4) break;
          if (rng.chance(0.86)) {
            addBuilding(
              ux + lotW / 2 + rng.range(-2, 2),
              uz + rng.range(-3, 3),
              rot + rng.range(-0.06, 0.06),
              rng.range(8, 12),
              rng.range(7, 10),
              rng.range(3.5, 6),
              jitterColor(rng, rng.pick(HOUSE_ROOF), 0.1),
              "house",
            );
          }
          if (rng.chance(0.7)) addTree(ux + lotW / 2 + rng.range(-8, 8), uz + rng.range(-10, 10), 0.9);
          ux += lotW;
        }
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
        // 厂房旁配停车场 + 停放车辆
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

  function addParkedRows(ux: number, uz: number, rot: number, w: number, d: number): void {
    const rows = Math.max(1, Math.floor(d / 8));
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let r = 0; r < rows; r++) {
      const oz = (r + 0.5) * (d / rows) - d / 2;
      for (let ox = -w / 2 + 2.4; ox < w / 2 - 2.4; ox += 3.1) {
        if (!rng.chance(0.55)) continue;
        const [x, z] = warp(ux, uz);
        model.parkedCars.push({
          x: x + ox * cos + oz * sin,
          z: z - ox * sin + oz * cos,
          rot: rot + Math.PI / 2,
          color: rng.pick(CAR_COLORS),
        });
      }
    }
  }

  function fillPark(x0: number, x1: number, z0: number, z1: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const n = Math.floor((w * d) / 260);
    for (let t = 0; t < n; t++) {
      addTree(x0 + rng.range(2, w - 2), z0 + rng.range(2, d - 2), rng.range(0.9, 1.5));
    }
    // 两条弯曲步道
    for (let p = 0; p < 2; p++) {
      const pts: [number, number][] = [];
      const vertical = p === 0;
      const steps = 8;
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const ux = vertical ? x0 + w * (0.3 + 0.4 * riverNoise(f * 3, p * 9 + 1)) : x0 + w * f;
        const uz = vertical ? z0 + d * f : z0 + d * (0.3 + 0.4 * riverNoise(f * 3, p * 9 + 5));
        pts.push(warp(ux, uz));
      }
      model.parkPaths.push({ pts, width: 4 });
    }
  }

  // —— 行道树 ——
  for (const a of artX) {
    if (Math.abs(a.pos) >= HALF) continue;
    for (let z = -HALF + 10; z < HALF - 10; z += 13) {
      for (const side of [-1, 1]) {
        if (!rng.chance(0.82)) continue;
        addTree(a.pos + side * (a.width / 2 + 4.5), z + rng.range(-3, 3), 0.8);
      }
    }
  }
  for (const a of artZ) {
    if (Math.abs(a.pos) >= HALF) continue;
    for (let x = -HALF + 10; x < HALF - 10; x += 13) {
      for (const side of [-1, 1]) {
        if (!rng.chance(0.82)) continue;
        addTree(x + rng.range(-3, 3), a.pos + side * (a.width / 2 + 4.5), 0.8);
      }
    }
  }

  // —— 桥梁（主水平干道跨河） ——
  const bridgedZ = new Set<number>();
  for (const a of artZ) {
    if (!a.major || Math.abs(a.pos) >= HALF) continue;
    const rx = riverX(a.pos);
    if (Math.abs(rx) > HALF - 50) continue;
    const hw = riverHalfW(a.pos);
    if (hw > 160 && !rng.chance(0.4)) continue; // 湖面上少架桥
    const [bx, bz] = warp(rx, a.pos);
    model.bridges.push({ x: bx, z: bz, rot: streetAngle(rx, a.pos), len: hw * 2 + 44, width: a.width + 5 });
    bridgedZ.add(a.pos);
  }

  // —— 船只 ——
  for (let b = 0; b < 22; b++) {
    const uz = rng.range(-HALF + 100, HALF - 100);
    const hw = riverHalfW(uz);
    if (hw < 34) continue;
    const ux = riverX(uz) + rng.range(-0.55, 0.55) * hw;
    const [x, z] = warp(ux, uz);
    model.boats.push({
      x,
      z,
      rot: rng.range(0, Math.PI * 2),
      len: rng.range(8, hw > 150 ? 30 : 16),
      width: rng.range(2.6, 5),
      color: rng.pick([0xf0f0ea, 0xe8e4da, 0xc0392b, 0x2c3e50, 0xdddddd]),
    });
  }

  // —— 车道与车流 ——
  const buildLane = (arterial: Arterial, verticalAxis: boolean): void => {
    if (Math.abs(arterial.pos) >= HALF) return;
    const pts: [number, number][] = [];
    const wet: boolean[] = [];
    const step = 50;
    for (let s = -HALF; s <= HALF; s += step) {
      const ux = verticalAxis ? arterial.pos : s;
      const uz = verticalAxis ? s : arterial.pos;
      pts.push(warp(ux, uz));
      wet.push(isWater(ux, uz));
    }
    const cum: number[] = [0];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1]!;
      const [bx, bz] = pts[k]!;
      total += Math.hypot(bx - ax, bz - az);
      cum.push(total);
    }
    const bridged = !verticalAxis && bridgedZ.has(arterial.pos);
    const lane: CarLane = { pts, cum, total, wet, bridged, roadWidth: arterial.width };
    const laneIdx = model.lanes.length;
    model.lanes.push(lane);
    const density = arterial.major ? 42 : 70; // 米/辆
    const n = Math.floor(total / density);
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
  for (const a of artX) buildLane(a, true);
  for (const a of artZ) buildLane(a, false);

  return model;
}

/** 沿车道取样：返回位置与朝向角 */
export function sampleLane(lane: CarLane, t: number): { x: number; z: number; rot: number; wet: boolean } {
  const total = lane.total;
  let tt = t % total;
  if (tt < 0) tt += total;
  // 二分查找所在段
  let lo = 0;
  let hi = lane.cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lane.cum[mid]! <= tt) lo = mid;
    else hi = mid;
  }
  const segStart = lane.cum[lo]!;
  const segLen = lane.cum[lo + 1]! - segStart || 1;
  const f = (tt - segStart) / segLen;
  const [ax, az] = lane.pts[lo]!;
  const [bx, bz] = lane.pts[lo + 1]!;
  return {
    x: ax + (bx - ax) * f,
    z: az + (bz - az) * f,
    rot: Math.atan2(-(bz - az), bx - ax),
    wet: lane.wet[lo]! || lane.wet[lo + 1]!,
  };
}
