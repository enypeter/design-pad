import type { Rect } from '../model/types';

export interface SnapTarget {
  rect: Rect;
  kind: 'page' | 'element';
}

/** A guide line to draw: vertical (axis 'x') at `position`, spanning start..end on the other axis. */
export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
  kind: 'page' | 'element';
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export interface SnapOptions {
  /** Snap distance in design units. */
  threshold: number;
  snapX?: boolean;
  snapY?: boolean;
}

type Edge = 'start' | 'center' | 'end';
const EDGES: Edge[] = ['start', 'center', 'end'];

function edgeValue(r: Rect, axis: 'x' | 'y', edge: Edge): number {
  const start = axis === 'x' ? r.x : r.y;
  const size = axis === 'x' ? r.width : r.height;
  if (edge === 'start') return start;
  if (edge === 'center') return start + size / 2;
  return start + size;
}

interface Candidate {
  delta: number;
  target: SnapTarget;
  value: number;
}

function bestOnAxis(
  moving: Rect,
  targets: SnapTarget[],
  axis: 'x' | 'y',
  threshold: number,
  movingEdges: Edge[],
): { delta: number; matches: Candidate[] } | null {
  let best: number | null = null;
  const all: Candidate[] = [];
  for (const target of targets) {
    for (const te of EDGES) {
      // Page targets only snap to their own edges and centre, element
      // targets to all three lines.
      const value = edgeValue(target.rect, axis, te);
      for (const me of movingEdges) {
        const delta = value - edgeValue(moving, axis, me);
        if (Math.abs(delta) > threshold) continue;
        all.push({ delta, target, value });
        if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
      }
    }
  }
  if (best === null) return null;
  const matches = all.filter((c) => Math.abs(c.delta - best!) < 0.01);
  return { delta: best, matches };
}

function guidesFor(moved: Rect, axis: 'x' | 'y', matches: Candidate[]): SnapGuide[] {
  const guides = new Map<string, SnapGuide>();
  for (const m of matches) {
    const r = m.target.rect;
    let start: number;
    let end: number;
    if (axis === 'x') {
      start = Math.min(moved.y, r.y);
      end = Math.max(moved.y + moved.height, r.y + r.height);
    } else {
      start = Math.min(moved.x, r.x);
      end = Math.max(moved.x + moved.width, r.x + r.width);
    }
    const key = `${m.value.toFixed(2)}`;
    const existing = guides.get(key);
    if (existing) {
      existing.start = Math.min(existing.start, start);
      existing.end = Math.max(existing.end, end);
      if (m.target.kind === 'element') existing.kind = 'element';
    } else {
      guides.set(key, { axis, position: m.value, start, end, kind: m.target.kind });
    }
  }
  return [...guides.values()];
}

/** Snap a moving rectangle against targets. Returns the correction and guides to show. */
export function snapMove(moving: Rect, targets: SnapTarget[], opts: SnapOptions): SnapResult {
  const x = opts.snapX === false ? null : bestOnAxis(moving, targets, 'x', opts.threshold, EDGES);
  const y = opts.snapY === false ? null : bestOnAxis(moving, targets, 'y', opts.threshold, EDGES);
  const dx = x?.delta ?? 0;
  const dy = y?.delta ?? 0;
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: SnapGuide[] = [];
  if (x) guides.push(...guidesFor(moved, 'x', x.matches));
  if (y) guides.push(...guidesFor(moved, 'y', y.matches));
  return { dx, dy, guides };
}

/**
 * Snap specific edges of a rectangle being resized. `edgesX`/`edgesY` list
 * which edges move ('start' = left/top, 'end' = right/bottom).
 */
export function snapEdges(
  rect: Rect,
  targets: SnapTarget[],
  edgesX: Edge[],
  edgesY: Edge[],
  threshold: number,
): SnapResult {
  const x = edgesX.length ? bestOnAxis(rect, targets, 'x', threshold, edgesX) : null;
  const y = edgesY.length ? bestOnAxis(rect, targets, 'y', threshold, edgesY) : null;
  const dx = x?.delta ?? 0;
  const dy = y?.delta ?? 0;
  const guides: SnapGuide[] = [];
  if (x) guides.push(...guidesFor(rect, 'x', x.matches));
  if (y) guides.push(...guidesFor(rect, 'y', y.matches));
  return { dx, dy, guides };
}
