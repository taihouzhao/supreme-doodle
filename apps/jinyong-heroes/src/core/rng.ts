/**
 * Original-style shared LCG. Call order matters.
 * Formula from PRD 00; not yet byte-checked against a hashed DOS binary.
 */
export class ClassicRng {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  getSeed(): number {
    return this.seed >>> 0;
  }

  setSeed(seed: number): void {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (Math.imul(this.seed, 0x41c64e6d) + 0x3039) >>> 0;
    return (this.seed >>> 16) & 0x7fff;
  }

  bounded(n: number): number {
    if (n <= 1 || n > 30000) return 0;
    return this.next() % n;
  }

  clone(): ClassicRng {
    return new ClassicRng(this.seed);
  }
}
