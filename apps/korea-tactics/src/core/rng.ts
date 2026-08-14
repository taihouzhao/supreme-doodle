/**
 * 确定性随机：mulberry32。
 * 状态以数字形式随 GameState 一起流转，保证 applyAction 是纯函数。
 */

export interface RngDraw {
  state: number;
  value: number;
}

export function nextRandom(state: number): RngDraw {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  a = a | 0;
  return { state: a, value };
}

export function nextRange(state: number, min: number, max: number): RngDraw {
  const draw = nextRandom(state);
  return { state: draw.state, value: min + draw.value * (max - min) };
}

export function nextInt(state: number, minInclusive: number, maxInclusive: number): RngDraw {
  const draw = nextRandom(state);
  const span = maxInclusive - minInclusive + 1;
  return { state: draw.state, value: minInclusive + Math.floor(draw.value * span) };
}

/** 从一个主种子派生互不干扰的子流种子 */
export function deriveSeed(seed: number, label: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i += 1) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x85ebca6b);
    h = (h ^ (h >>> 13)) | 0;
  }
  return h | 0;
}

/** 供关卡装载等一次性流程使用的有状态包装 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  next(): number {
    const draw = nextRandom(this.state);
    this.state = draw.state;
    return draw.value;
  }

  int(minInclusive: number, maxInclusive: number): number {
    const draw = nextInt(this.state, minInclusive, maxInclusive);
    this.state = draw.state;
    return draw.value;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick 需要非空数组");
    const index = this.int(0, items.length - 1);
    return items[index] as T;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  getState(): number {
    return this.state;
  }
}
