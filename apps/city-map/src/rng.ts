/** 可复现的种子随机与二维值噪声，供整座城市的程序化生成使用。 */

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  /** mulberry32，返回 [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type Noise2D = (x: number, z: number) => number;

/** 平滑二维值噪声，返回 [0,1) */
export function makeNoise2D(seed: number): Noise2D {
  return (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz, seed);
    const b = hash2(ix + 1, iz, seed);
    const c = hash2(ix, iz + 1, seed);
    const d = hash2(ix + 1, iz + 1, seed);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
}

export function makeFbm(seed: number, octaves = 4): Noise2D {
  const layers: Noise2D[] = [];
  for (let i = 0; i < octaves; i++) layers.push(makeNoise2D(seed + i * 101));
  return (x, z) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let total = 0;
    for (const n of layers) {
      sum += amp * n(x * freq, z * freq);
      total += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / total;
  };
}
