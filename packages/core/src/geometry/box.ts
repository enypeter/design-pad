import type { Point, Rect } from '../model/types';
import { applyToPoint, compose, type Mat, rotation, translation } from './matrix';

export interface BoxGeom {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise. */
  rotation: number;
}

export const degToRad = (deg: number) => (deg * Math.PI) / 180;
export const radToDeg = (rad: number) => (rad * 180) / Math.PI;

/** Normalize to (-180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}

/** Maps box-local coordinates (0..w, 0..h) into parent space. */
export function boxMatrix(box: BoxGeom): Mat {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (!box.rotation) return translation(box.x, box.y);
  return compose(
    translation(cx, cy),
    rotation(degToRad(box.rotation)),
    translation(-box.width / 2, -box.height / 2),
  );
}

export function boxCenter(box: BoxGeom): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Corners in parent space: top-left, top-right, bottom-right, bottom-left. */
export function boxCorners(box: BoxGeom, m: Mat = boxMatrix(box)): Point[] {
  return [
    applyToPoint(m, { x: 0, y: 0 }),
    applyToPoint(m, { x: box.width, y: 0 }),
    applyToPoint(m, { x: box.width, y: box.height }),
    applyToPoint(m, { x: 0, y: box.height }),
  ];
}

export function boundsOfPoints(points: Point[]): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Number.POSITIVE_INFINITY) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boxBounds(box: BoxGeom): Rect {
  if (!box.rotation) return { x: box.x, y: box.y, width: box.width, height: box.height };
  return boundsOfPoints(boxCorners(box));
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function expandRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 };
}

/** Point in a convex polygon given in clockwise or counter-clockwise order. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function project(poly: Point[], axis: Point): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    const v = p.x * axis.x + p.y * axis.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Separating-axis test for two convex polygons. */
export function polygonsIntersect(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % poly.length]!;
      const axis = { x: p2.y - p1.y, y: p1.x - p2.x };
      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

export function rectToPolygon(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from point p to segment ab. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function rotatePoint(p: Point, center: Point, degrees: number): Point {
  const r = degToRad(degrees);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}
