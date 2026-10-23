import type { Fill, GradientStop } from '../model/types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Gradient line for a CSS-style linear gradient angle over a w×h box. */
export function linearGradientPoints(
  angleDeg: number,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  return {
    x0: cx - (dx * len) / 2,
    y0: cy - (dy * len) / 2,
    x1: cx + (dx * len) / 2,
    y1: cy + (dy * len) / 2,
  };
}

function addStops(g: CanvasGradient, stops: GradientStop[]): CanvasGradient {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  for (const s of sorted) g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
  return g;
}

/** Canvas paint for a fill over the box (x, y, w, h). */
export function fillStyle(
  ctx: Ctx,
  fill: Fill,
  w: number,
  h: number,
  x = 0,
  y = 0,
): string | CanvasGradient {
  switch (fill.type) {
    case 'solid':
      return fill.color;
    case 'linear': {
      const p = linearGradientPoints(fill.angle, w, h);
      return addStops(ctx.createLinearGradient(x + p.x0, y + p.y0, x + p.x1, y + p.y1), fill.stops);
    }
    case 'radial': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.hypot(w, h) / 2;
      return addStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, r), fill.stops);
    }
  }
}

/** CSS `background` value for a fill (UI swatches, DOM previews). */
export function fillToCss(fill: Fill): string {
  const stops = (s: GradientStop[]) =>
    [...s]
      .sort((a, b) => a.offset - b.offset)
      .map((st) => `${st.color} ${Math.round(st.offset * 100)}%`)
      .join(', ');
  switch (fill.type) {
    case 'solid':
      return fill.color;
    case 'linear':
      return `linear-gradient(${fill.angle}deg, ${stops(fill.stops)})`;
    case 'radial':
      return `radial-gradient(circle farthest-corner, ${stops(fill.stops)})`;
  }
}

/** True if the fill paints nothing. */
export function isTransparentFill(fill: Fill | null | undefined): boolean {
  if (!fill) return true;
  if (fill.type !== 'solid') return false;
  const c = fill.color.trim().toLowerCase();
  return c === 'transparent' || /^#[0-9a-f]{6}00$/.test(c) || /^rgba\([^)]*,\s*0\)$/.test(c);
}

/** Parse #rgb / #rrggbb / #rrggbbaa into 0..255 components. */
export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3 || h.length === 4)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseHexColor(color);
  if (!c) return color;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, Math.min(1, alpha * c.a))})`;
}

/** Mix a colour towards white by t (0..1). */
export function lighten(color: string, t: number): string {
  const c = parseHexColor(color);
  if (!c) return color;
  const mix = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${mix(c.r)}, ${mix(c.g)}, ${mix(c.b)})`;
}

/** Relative luminance (0..1) of a hex colour, for picking contrasting UI. */
export function luminance(color: string): number {
  const c = parseHexColor(color);
  if (!c) return 1;
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}
