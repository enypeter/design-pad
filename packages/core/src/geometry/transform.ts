import type { Point } from '../model/types';
import { type BoxGeom, boxCenter, degToRad, normalizeAngle, radToDeg } from './box';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_SIGNS: Record<ResizeHandle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export const CORNER_HANDLES: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
export const SIDE_HANDLES: ResizeHandle[] = ['n', 'e', 's', 'w'];

export function isCornerHandle(h: ResizeHandle): boolean {
  return h.length === 2;
}

export interface ResizeOptions {
  /** Preserve the start aspect ratio. */
  keepAspect?: boolean;
  /** Resize symmetrically about the centre (Alt/Option). */
  fromCenter?: boolean;
  minWidth?: number;
  minHeight?: number;
}

export interface ResizeResult extends BoxGeom {
  scaleX: number;
  scaleY: number;
}

function rotateVec(v: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/**
 * Resize a (possibly rotated) box by dragging `handle` to `pointer`
 * (parent space). The opposite handle stays fixed unless `fromCenter`.
 */
export function resizeBox(
  start: BoxGeom,
  handle: ResizeHandle,
  pointer: Point,
  opts: ResizeOptions = {},
): ResizeResult {
  const [hx, hy] = HANDLE_SIGNS[handle];
  const minW = opts.minWidth ?? 1;
  const minH = opts.minHeight ?? 1;
  const theta = degToRad(start.rotation);
  const c0 = boxCenter(start);
  const w = Math.max(start.width, 1e-6);
  const h = Math.max(start.height, 1e-6);

  // Pointer in the box's unrotated frame, relative to its centre.
  const pl = rotateVec({ x: pointer.x - c0.x, y: pointer.y - c0.y }, -theta);

  // Anchor (the fixed point) relative to the centre.
  const anchor = opts.fromCenter ? { x: 0, y: 0 } : { x: (-hx * w) / 2, y: (-hy * h) / 2 };
  const spanFactor = opts.fromCenter ? 2 : 1;

  let newW = hx !== 0 ? hx * (pl.x - anchor.x) * spanFactor : w;
  let newH = hy !== 0 ? hy * (pl.y - anchor.y) * spanFactor : h;

  if (opts.keepAspect) {
    const ratio = w / h;
    if (hx !== 0 && hy !== 0) {
      // Project onto the diagonal so the handle tracks the pointer smoothly.
      const dx = hx * w;
      const dy = hy * h;
      const along = ((pl.x - anchor.x) * dx + (pl.y - anchor.y) * dy) / (dx * dx + dy * dy);
      const s = along * spanFactor;
      newW = w * s;
      newH = h * s;
    } else if (hx !== 0) {
      newH = newW / ratio;
    } else {
      newW = newH * ratio;
    }
    // Clamp while preserving ratio.
    const minScale = Math.max(minW / w, minH / h);
    const s = Math.max(newW / w, minScale);
    newW = w * s;
    newH = h * s;
  } else {
    newW = Math.max(minW, newW);
    newH = Math.max(minH, newH);
  }

  let centerLocal: Point;
  if (opts.fromCenter) {
    centerLocal = { x: 0, y: 0 };
  } else {
    centerLocal = {
      x: hx !== 0 ? anchor.x + (hx * newW) / 2 : 0,
      y: hy !== 0 ? anchor.y + (hy * newH) / 2 : 0,
    };
  }
  const offset = rotateVec(centerLocal, theta);
  const c1 = { x: c0.x + offset.x, y: c0.y + offset.y };
  return {
    x: c1.x - newW / 2,
    y: c1.y - newH / 2,
    width: newW,
    height: newH,
    rotation: start.rotation,
    scaleX: newW / w,
    scaleY: newH / h,
  };
}

/** Uniformly scale a box about `anchor` (parent space). Rotation is unchanged. */
export function scaleBoxAbout(box: BoxGeom, anchor: Point, scale: number): BoxGeom {
  const c = boxCenter(box);
  const nc = { x: anchor.x + (c.x - anchor.x) * scale, y: anchor.y + (c.y - anchor.y) * scale };
  const width = box.width * scale;
  const height = box.height * scale;
  return { x: nc.x - width / 2, y: nc.y - height / 2, width, height, rotation: box.rotation };
}

/** Rotate a box about `pivot` by `deltaDeg`. */
export function rotateBoxAbout(box: BoxGeom, pivot: Point, deltaDeg: number): BoxGeom {
  const c = boxCenter(box);
  const r = degToRad(deltaDeg);
  const dx = c.x - pivot.x;
  const dy = c.y - pivot.y;
  const nc = {
    x: pivot.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: pivot.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
  return {
    x: nc.x - box.width / 2,
    y: nc.y - box.height / 2,
    width: box.width,
    height: box.height,
    rotation: normalizeAngle(box.rotation + deltaDeg),
  };
}

/** Angle in degrees of `pointer` around `center`, 0 = pointing up (handle above). */
export function pointerAngle(center: Point, pointer: Point): number {
  return radToDeg(Math.atan2(pointer.y - center.y, pointer.x - center.x));
}

/**
 * Snap an angle to multiples of `step` when within `tolerance` degrees,
 * or always when `force` is set (Shift).
 */
export function snapAngle(deg: number, step = 45, tolerance = 4, force = false): number {
  const n = normalizeAngle(deg);
  const target = Math.round(n / step) * step;
  if (force || Math.abs(target - n) <= tolerance) return normalizeAngle(target);
  return n;
}
