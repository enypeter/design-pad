import type { Point } from '../model/types';

/** Subset of CanvasPath that Path2D and 2D contexts implement. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  closePath(): void;
}

export type ShapeCategory = 'basic' | 'polygon' | 'star' | 'arrow' | 'callout' | 'decorative';

export interface ShapeDef {
  id: string;
  name: string;
  category: ShapeCategory;
  /** Width/height when inserted. */
  aspect: number;
  /** Corner rounding applies to this shape. */
  rounding: boolean;
  /** Append the outline for a w×h box. `radius` is the corner rounding. */
  path(sink: PathSink, w: number, h: number, radius: number): void;
  tags?: string[];
}

/** Polygon through points, with each corner rounded by `radius` (clamped per corner). */
export function polygonPath(sink: PathSink, pts: Point[], radius = 0): void {
  const n = pts.length;
  if (n < 3) return;
  if (radius <= 0) {
    sink.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < n; i++) sink.lineTo(pts[i]!.x, pts[i]!.y);
    sink.closePath();
    return;
  }
  const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const start = pts[n - 1]!;
  const first = pts[0]!;
  sink.moveTo((start.x + first.x) / 2, (start.y + first.y) / 2);
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const r = Math.min(radius, len(prev, cur) / 2, len(cur, next) / 2);
    sink.arcTo(cur.x, cur.y, next.x, next.y, r);
  }
  sink.closePath();
}

export function roundRectPath(
  sink: PathSink,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) {
    sink.moveTo(x, y);
    sink.lineTo(x + w, y);
    sink.lineTo(x + w, y + h);
    sink.lineTo(x, y + h);
    sink.closePath();
    return;
  }
  sink.moveTo(x + rr, y);
  sink.lineTo(x + w - rr, y);
  sink.arcTo(x + w, y, x + w, y + rr, rr);
  sink.lineTo(x + w, y + h - rr);
  sink.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  sink.lineTo(x + rr, y + h);
  sink.arcTo(x, y + h, x, y + h - rr, rr);
  sink.lineTo(x, y + rr);
  sink.arcTo(x, y, x + rr, y, rr);
  sink.closePath();
}

/** Scale unit-space points (0..1) to the box. */
const fit = (pts: [number, number][], w: number, h: number): Point[] =>
  pts.map(([x, y]) => ({ x: x * w, y: y * h }));

/** Regular polygon / star vertices normalized to fill the 0..1 box. */
function radialPoints(
  count: number,
  inner: number | null,
  rotation = -Math.PI / 2,
): [number, number][] {
  const raw: [number, number][] = [];
  const steps = inner === null ? count : count * 2;
  for (let i = 0; i < steps; i++) {
    const r = inner !== null && i % 2 === 1 ? inner : 1;
    const a = rotation + (i * Math.PI * 2) / steps;
    raw.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  return raw.map(([x, y]) => [(x - minX) / spanX, (y - minY) / spanY]);
}

function polygonShape(
  id: string,
  name: string,
  category: ShapeCategory,
  unit: [number, number][],
  aspect = 1,
  tags?: string[],
): ShapeDef {
  return {
    id,
    name,
    category,
    aspect,
    rounding: true,
    tags,
    path: (sink, w, h, r) => polygonPath(sink, fit(unit, w, h), r),
  };
}

const HEART = (sink: PathSink, w: number, h: number) => {
  sink.moveTo(w * 0.5, h * 0.98);
  sink.bezierCurveTo(w * 0.18, h * 0.76, 0, h * 0.56, 0, h * 0.3);
  sink.bezierCurveTo(0, h * 0.12, w * 0.14, 0, w * 0.28, 0);
  sink.bezierCurveTo(w * 0.39, 0, w * 0.46, h * 0.06, w * 0.5, h * 0.15);
  sink.bezierCurveTo(w * 0.54, h * 0.06, w * 0.61, 0, w * 0.72, 0);
  sink.bezierCurveTo(w * 0.86, 0, w, h * 0.12, w, h * 0.3);
  sink.bezierCurveTo(w, h * 0.56, w * 0.82, h * 0.76, w * 0.5, h * 0.98);
  sink.closePath();
};

const CLOUD = (sink: PathSink, w: number, h: number) => {
  sink.moveTo(w * 0.23, h * 0.9);
  sink.bezierCurveTo(w * 0.06, h * 0.9, 0, h * 0.72, w * 0.06, h * 0.6);
  sink.bezierCurveTo(-w * 0.02, h * 0.45, w * 0.1, h * 0.28, w * 0.25, h * 0.33);
  sink.bezierCurveTo(w * 0.28, h * 0.12, w * 0.5, h * 0.02, w * 0.62, h * 0.18);
  sink.bezierCurveTo(w * 0.74, h * 0.08, w * 0.94, h * 0.18, w * 0.9, h * 0.4);
  sink.bezierCurveTo(w * 1.02, h * 0.48, w * 1.0, h * 0.86, w * 0.8, h * 0.9);
  sink.closePath();
};

const SPEECH = (sink: PathSink, w: number, h: number, r: number) => {
  const bh = h * 0.78;
  const rr = Math.max(0, Math.min(r || Math.min(w, bh) * 0.12, w / 2, bh / 2));
  sink.moveTo(rr, 0);
  sink.lineTo(w - rr, 0);
  sink.arcTo(w, 0, w, rr, rr);
  sink.lineTo(w, bh - rr);
  sink.arcTo(w, bh, w - rr, bh, rr);
  sink.lineTo(w * 0.42, bh);
  sink.lineTo(w * 0.22, h);
  sink.lineTo(w * 0.26, bh);
  sink.lineTo(rr, bh);
  sink.arcTo(0, bh, 0, bh - rr, rr);
  sink.lineTo(0, rr);
  sink.arcTo(0, 0, rr, 0, rr);
  sink.closePath();
};

const SPEECH_ROUND = (sink: PathSink, w: number, h: number) => {
  const ry = h * 0.4;
  sink.moveTo(w * 0.24, h * 0.74);
  sink.ellipse(w / 2, ry, w / 2, ry, 0, Math.PI * 0.72, Math.PI * 2.62);
  sink.lineTo(w * 0.12, h);
  sink.closePath();
};

const BLOB_A = (sink: PathSink, w: number, h: number) => {
  sink.moveTo(w * 0.52, 0);
  sink.bezierCurveTo(w * 0.8, 0, w, h * 0.18, w, h * 0.45);
  sink.bezierCurveTo(w, h * 0.78, w * 0.76, h, w * 0.47, h);
  sink.bezierCurveTo(w * 0.18, h, 0, h * 0.8, 0, h * 0.52);
  sink.bezierCurveTo(0, h * 0.2, w * 0.24, 0, w * 0.52, 0);
  sink.closePath();
};

const BLOB_B = (sink: PathSink, w: number, h: number) => {
  sink.moveTo(w * 0.62, h * 0.04);
  sink.bezierCurveTo(w * 0.88, h * 0.12, w * 1.0, h * 0.38, w * 0.94, h * 0.62);
  sink.bezierCurveTo(w * 0.88, h * 0.9, w * 0.6, h * 1.0, w * 0.36, h * 0.94);
  sink.bezierCurveTo(w * 0.1, h * 0.88, -w * 0.02, h * 0.62, w * 0.04, h * 0.38);
  sink.bezierCurveTo(w * 0.1, h * 0.1, w * 0.36, -h * 0.04, w * 0.62, h * 0.04);
  sink.closePath();
};

const ARCH = (sink: PathSink, w: number, h: number) => {
  const r = w / 2;
  const top = Math.min(r, h);
  sink.moveTo(0, h);
  sink.lineTo(0, top);
  sink.ellipse(w / 2, top, r, top, 0, Math.PI, Math.PI * 2);
  sink.lineTo(w, h);
  sink.closePath();
};

const RING = (sink: PathSink, w: number, h: number) => {
  sink.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  sink.closePath();
  sink.moveTo(w / 2 + w * 0.3, h / 2);
  sink.ellipse(w / 2, h / 2, w * 0.3, h * 0.3, 0, 0, Math.PI * 2, true);
  sink.closePath();
};

export const SHAPES: ShapeDef[] = [
  {
    id: 'rect',
    name: 'Square',
    category: 'basic',
    aspect: 1,
    rounding: true,
    path: (s, w, h, r) => roundRectPath(s, 0, 0, w, h, r),
    tags: ['rectangle', 'box'],
  },
  {
    id: 'rounded-rect',
    name: 'Rounded square',
    category: 'basic',
    aspect: 1,
    rounding: true,
    path: (s, w, h, r) => roundRectPath(s, 0, 0, w, h, r || Math.min(w, h) * 0.18),
    tags: ['rectangle', 'rounded'],
  },
  {
    id: 'ellipse',
    name: 'Circle',
    category: 'basic',
    aspect: 1,
    rounding: false,
    path: (s, w, h) => {
      s.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      s.closePath();
    },
    tags: ['circle', 'oval', 'round'],
  },
  polygonShape('triangle', 'Triangle', 'basic', [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ]),
  polygonShape('right-triangle', 'Right triangle', 'basic', [
    [0, 0],
    [1, 1],
    [0, 1],
  ]),
  polygonShape('diamond', 'Diamond', 'basic', [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ]),
  polygonShape('pentagon', 'Pentagon', 'polygon', radialPoints(5, null)),
  polygonShape('hexagon', 'Hexagon', 'polygon', radialPoints(6, null, 0), 1.15),
  polygonShape('octagon', 'Octagon', 'polygon', radialPoints(8, null, Math.PI / 8)),
  polygonShape(
    'parallelogram',
    'Parallelogram',
    'polygon',
    [
      [0.25, 0],
      [1, 0],
      [0.75, 1],
      [0, 1],
    ],
    1.6,
  ),
  polygonShape(
    'trapezoid',
    'Trapezoid',
    'polygon',
    [
      [0.2, 0],
      [0.8, 0],
      [1, 1],
      [0, 1],
    ],
    1.4,
  ),
  polygonShape(
    'cross',
    'Cross',
    'polygon',
    [
      [0.35, 0],
      [0.65, 0],
      [0.65, 0.35],
      [1, 0.35],
      [1, 0.65],
      [0.65, 0.65],
      [0.65, 1],
      [0.35, 1],
      [0.35, 0.65],
      [0, 0.65],
      [0, 0.35],
      [0.35, 0.35],
    ],
    1,
    ['plus'],
  ),
  polygonShape('star', 'Star', 'star', radialPoints(5, 0.45), 1.05),
  polygonShape('star-6', '6-point star', 'star', radialPoints(6, 0.55)),
  polygonShape('star-8', '8-point star', 'star', radialPoints(8, 0.6)),
  polygonShape('burst', 'Burst', 'star', radialPoints(16, 0.78), 1, ['badge', 'seal', 'sale']),
  polygonShape(
    'arrow-right',
    'Arrow right',
    'arrow',
    [
      [0, 0.3],
      [0.6, 0.3],
      [0.6, 0],
      [1, 0.5],
      [0.6, 1],
      [0.6, 0.7],
      [0, 0.7],
    ],
    1.6,
  ),
  polygonShape(
    'arrow-left',
    'Arrow left',
    'arrow',
    [
      [1, 0.3],
      [0.4, 0.3],
      [0.4, 0],
      [0, 0.5],
      [0.4, 1],
      [0.4, 0.7],
      [1, 0.7],
    ],
    1.6,
  ),
  polygonShape(
    'arrow-up',
    'Arrow up',
    'arrow',
    [
      [0.3, 1],
      [0.3, 0.4],
      [0, 0.4],
      [0.5, 0],
      [1, 0.4],
      [0.7, 0.4],
      [0.7, 1],
    ],
    0.625,
  ),
  polygonShape(
    'arrow-double',
    'Double arrow',
    'arrow',
    [
      [0, 0.5],
      [0.25, 0],
      [0.25, 0.3],
      [0.75, 0.3],
      [0.75, 0],
      [1, 0.5],
      [0.75, 1],
      [0.75, 0.7],
      [0.25, 0.7],
      [0.25, 1],
    ],
    2,
  ),
  polygonShape(
    'chevron',
    'Chevron',
    'arrow',
    [
      [0, 0],
      [0.7, 0],
      [1, 0.5],
      [0.7, 1],
      [0, 1],
      [0.3, 0.5],
    ],
    1.4,
  ),
  polygonShape(
    'pentagon-arrow',
    'Tag arrow',
    'arrow',
    [
      [0, 0],
      [0.75, 0],
      [1, 0.5],
      [0.75, 1],
      [0, 1],
    ],
    1.8,
    ['label', 'tag'],
  ),
  {
    id: 'heart',
    name: 'Heart',
    category: 'decorative',
    aspect: 1.08,
    rounding: false,
    path: (s, w, h) => HEART(s, w, h),
    tags: ['love'],
  },
  {
    id: 'cloud',
    name: 'Cloud',
    category: 'decorative',
    aspect: 1.5,
    rounding: false,
    path: (s, w, h) => CLOUD(s, w, h),
  },
  {
    id: 'speech',
    name: 'Speech bubble',
    category: 'callout',
    aspect: 1.3,
    rounding: true,
    path: SPEECH,
    tags: ['chat', 'quote'],
  },
  {
    id: 'speech-round',
    name: 'Round speech bubble',
    category: 'callout',
    aspect: 1.25,
    rounding: false,
    path: (s, w, h) => SPEECH_ROUND(s, w, h),
    tags: ['chat', 'thought'],
  },
  {
    id: 'arch',
    name: 'Arch',
    category: 'decorative',
    aspect: 0.8,
    rounding: false,
    path: (s, w, h) => ARCH(s, w, h),
  },
  {
    id: 'half-circle',
    name: 'Half circle',
    category: 'basic',
    aspect: 2,
    rounding: false,
    path: (s, w, h) => {
      s.moveTo(0, h);
      s.ellipse(w / 2, h, w / 2, h, 0, Math.PI, Math.PI * 2);
      s.closePath();
    },
  },
  {
    id: 'ring',
    name: 'Ring',
    category: 'decorative',
    aspect: 1,
    rounding: false,
    path: (s, w, h) => RING(s, w, h),
    tags: ['donut', 'circle'],
  },
  {
    id: 'blob-1',
    name: 'Blob',
    category: 'decorative',
    aspect: 1,
    rounding: false,
    path: (s, w, h) => BLOB_A(s, w, h),
    tags: ['organic'],
  },
  {
    id: 'blob-2',
    name: 'Pebble',
    category: 'decorative',
    aspect: 1,
    rounding: false,
    path: (s, w, h) => BLOB_B(s, w, h),
    tags: ['organic'],
  },
];

const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));

export function getShape(id: string): ShapeDef {
  return BY_ID.get(id) ?? BY_ID.get('rect')!;
}

/** Build a Path2D for a shape (browser only). */
export function shapePath2D(id: string, w: number, h: number, radius: number): Path2D {
  const p = new Path2D();
  getShape(id).path(p, w, h, radius);
  return p;
}

/** Shapes whose outline encloses holes and need the even-odd rule. */
export function shapeFillRule(id: string): CanvasFillRule {
  return id === 'ring' ? 'evenodd' : 'nonzero';
}
