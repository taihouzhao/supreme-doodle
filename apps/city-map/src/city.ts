/** 程序化城市共享类型与车道取样。生成逻辑见 world.ts。 */

export type District = "cbd" | "oldtown" | "residential" | "suburb" | "industrial" | "park" | "farm" | "forest";

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

export interface ChunkModel {
  cx: number;
  cz: number;
  originX: number;
  originZ: number;
  size: number;
  seed: number;
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

/** 沿车道取样：返回位置与朝向角 */
export function sampleLane(lane: CarLane, t: number): { x: number; z: number; rot: number; wet: boolean } {
  const total = lane.total;
  if (total <= 0 || lane.pts.length < 2) {
    const p = lane.pts[0] ?? [0, 0];
    return { x: p[0], z: p[1], rot: 0, wet: false };
  }
  let tt = t % total;
  if (tt < 0) tt += total;
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
