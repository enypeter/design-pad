import type { Point } from '../model/types';

/**
 * 2D affine matrix using the canvas convention:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Mat = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

/** m1 · m2: applies m2 first, then m1. */
export function multiply(m1: Mat, m2: Mat): Mat {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function invert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return { ...IDENTITY };
  const inv = 1 / det;
  return {
    a: m.d * inv,
    b: -m.b * inv,
    c: -m.c * inv,
    d: m.a * inv,
    e: (m.c * m.f - m.d * m.e) * inv,
    f: (m.b * m.e - m.a * m.f) * inv,
  };
}

export function applyToPoint(m: Mat, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Apply only the linear part (no translation), e.g. for vectors. */
export function applyToVector(m: Mat, v: Point): Point {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

export function translation(tx: number, ty: number): Mat {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function rotation(radians: number): Mat {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function scaling(sx: number, sy = sx): Mat {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function compose(...ms: Mat[]): Mat {
  let out = IDENTITY;
  for (const m of ms) out = multiply(out, m);
  return out;
}

/** Uniform scale factor of a similarity transform (rotation + uniform scale). */
export function matrixScale(m: Mat): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

export function matrixRotation(m: Mat): number {
  return Math.atan2(m.b, m.a);
}

export function toDOMMatrixString(m: Mat): string {
  return `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
}
