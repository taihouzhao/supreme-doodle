/** 16-bit signed wrap and toward-zero division. Original DOS integer behavior. */
export function i16(n: number): number {
  return (n << 16) >> 16;
}

export function i16Add(a: number, b: number): number {
  return i16(i16(a) + i16(b));
}

export function i16Sub(a: number, b: number): number {
  return i16(i16(a) - i16(b));
}

export function i16Mul(a: number, b: number): number {
  return i16(Math.imul(i16(a), i16(b)));
}

/** Toward-zero division, matching original integer division. */
export function i16Div(a: number, b: number): number {
  const x = i16(a);
  const y = i16(b);
  if (y === 0) return 0;
  return i16(Math.trunc(x / y));
}
