import type { TextEffect, TextElement } from '../model/types';
import type { CurvedTextLayout } from '../text/curve';
import type { TextLayout } from '../text/engine';
import type { LayoutFragment, StraightTextLayout } from '../text/layout';
import { fontToCss } from '../text/measure';
import { lighten, withAlpha } from './paint';
import { roundRectPath } from './shapes';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A drawable glyph run: text at a baseline origin, optionally rotated about its baseline centre. */
interface Run {
  text: string;
  x: number;
  y: number;
  width: number;
  color: string;
  font: string;
  size: number;
  underline: boolean;
  strikethrough: boolean;
  /** Curved text: rotation (radians) about (x + width/2, y). */
  rotation?: number;
}

const nativeLetterSpacing = (ctx: Ctx) => 'letterSpacing' in ctx;

function runsFromStraight(layout: StraightTextLayout): Run[] {
  const runs: Run[] = [];
  const add = (f: LayoutFragment, baseline: number) => {
    if (!f.text.trim() && !f.style.underline && !f.style.strikethrough) return;
    runs.push({
      text: f.text,
      x: f.x,
      y: baseline,
      width: f.width,
      color: f.style.color,
      font: fontToCss(f.font),
      size: f.font.size,
      underline: f.style.underline,
      strikethrough: f.style.strikethrough,
    });
  };
  for (const line of layout.lines) {
    if (line.marker) add(line.marker, line.baseline);
    for (const f of line.fragments) add(f, line.baseline);
  }
  return runs;
}

function runsFromCurved(layout: CurvedTextLayout): Run[] {
  return layout.glyphs.map((g) => ({
    text: g.text,
    x: g.x - g.width / 2,
    y: g.y,
    width: g.width,
    color: g.style.color,
    font: fontToCss(g.font),
    size: g.font.size,
    underline: g.style.underline,
    strikethrough: g.style.strikethrough,
    rotation: g.rotation,
  }));
}

type Paint = 'fill' | 'stroke';

/** Draw every run once with the given paint. `color` overrides run colours. */
function paintRuns(
  ctx: Ctx,
  runs: Run[],
  spacing: number,
  paint: Paint,
  color?: string,
  dx = 0,
  dy = 0,
): void {
  const native = nativeLetterSpacing(ctx);
  if (native) (ctx as CanvasRenderingContext2D).letterSpacing = `${spacing}px`;
  for (const r of runs) {
    ctx.font = r.font;
    const style = color ?? r.color;
    if (paint === 'fill') ctx.fillStyle = style;
    else ctx.strokeStyle = style;
    if (r.rotation !== undefined) {
      ctx.save();
      ctx.translate(r.x + r.width / 2 + dx, r.y + dy);
      ctx.rotate(r.rotation);
      drawString(ctx, r.text, -r.width / 2, 0, spacing, native, paint);
      ctx.restore();
    } else {
      drawString(ctx, r.text, r.x + dx, r.y + dy, spacing, native, paint);
    }
    if (paint === 'fill' && (r.underline || r.strikethrough) && r.rotation === undefined) {
      const t = Math.max(r.size * 0.06, 0.5);
      if (r.underline) ctx.fillRect(r.x + dx, r.y + dy + r.size * 0.09, r.width, t);
      if (r.strikethrough) ctx.fillRect(r.x + dx, r.y + dy - r.size * 0.3, r.width, t);
    }
  }
  if (native) (ctx as CanvasRenderingContext2D).letterSpacing = '0px';
}

function drawString(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  spacing: number,
  native: boolean,
  paint: Paint,
): void {
  if (!spacing || native) {
    if (paint === 'fill') ctx.fillText(text, x, y);
    else ctx.strokeText(text, x, y);
    return;
  }
  // Fallback for engines without ctx.letterSpacing: place characters one by one.
  let cx = x;
  for (const ch of text) {
    if (paint === 'fill') ctx.fillText(ch, cx, y);
    else ctx.strokeText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

/** Current uniform scale from local units to device pixels. */
function deviceScale(ctx: Ctx): number {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

/** Map a local offset to device space (canvas shadows ignore the transform). */
function deviceOffset(ctx: Ctx, dx: number, dy: number): { x: number; y: number } {
  const m = ctx.getTransform();
  return { x: m.a * dx + m.c * dy, y: m.b * dx + m.d * dy };
}

interface ShadowSpec {
  color: string;
  blur: number;
  dx: number;
  dy: number;
}

/**
 * Draw only the shadow of `draw`: the content is rendered far outside the
 * canvas and the shadow offset brings the shadow back into place.
 */
function shadowOnly(ctx: Ctx, spec: ShadowSpec, draw: () => void): void {
  const m = ctx.getTransform();
  const far = 4 * Math.max(ctx.canvas.width, ctx.canvas.height, 4096);
  const det = m.a * m.d - m.b * m.c;
  if (!det) return;
  // Local vector that maps to (far, 0) in device space.
  const lx = (m.d * far) / det;
  const ly = (-m.b * far) / det;
  const off = deviceOffset(ctx, spec.dx, spec.dy);
  const scale = deviceScale(ctx);
  ctx.save();
  ctx.shadowColor = spec.color;
  ctx.shadowBlur = spec.blur * scale;
  ctx.shadowOffsetX = off.x + far;
  ctx.shadowOffsetY = off.y;
  ctx.translate(-lx, -ly);
  draw();
  ctx.restore();
}

const dirVector = (directionDeg: number, distance: number) => {
  const a = (directionDeg * Math.PI) / 180;
  return { x: Math.cos(a) * distance, y: -Math.sin(a) * distance };
};

/** Effect parameters in design units, shared with the DOM text editor (CSS text-shadow). */
export function effectGeometry(effect: TextEffect, fontSize: number) {
  switch (effect.type) {
    case 'shadow': {
      const v = dirVector(effect.direction, (effect.offset / 100) * fontSize * 0.25);
      return {
        dx: v.x,
        dy: v.y,
        blur: (effect.blur / 100) * fontSize * 0.5,
        alpha: 1 - effect.transparency / 100,
      };
    }
    case 'lift':
      return {
        dx: 0,
        dy: fontSize * 0.05,
        blur: fontSize * (0.1 + 0.3 * (effect.intensity / 100)),
        alpha: 0.15 + 0.5 * (effect.intensity / 100),
      };
    case 'splice':
    case 'echo':
    case 'glitch': {
      const v = dirVector(effect.direction, (effect.offset / 100) * fontSize * 0.25);
      return { dx: v.x, dy: v.y, blur: 0, alpha: 1 };
    }
    default:
      return { dx: 0, dy: 0, blur: 0, alpha: 1 };
  }
}

export function strokeWidthFor(thickness: number, fontSize: number): number {
  return fontSize * (0.01 + (thickness / 100) * 0.08);
}

function lineBackgrounds(
  ctx: Ctx,
  layout: StraightTextLayout,
  effect: Extract<TextEffect, { type: 'background' }>,
  base: TextElement,
): void {
  const size = base.style.fontSize;
  const pad = size * (0.15 + (effect.spread / 100) * 0.5);
  ctx.fillStyle = withAlpha(effect.color, 1 - effect.transparency / 100);
  for (const line of layout.lines) {
    if (!line.fragments.length) continue;
    const h = line.height;
    const x = line.left - pad;
    const w = line.width + pad * 2;
    const y = line.top - pad * 0.35;
    const hh = h + pad * 0.7;
    const r = (effect.roundness / 100) * (hh / 2);
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, hh, r);
    ctx.fill();
  }
}

/** Paint a laid-out text element (local box space) with its effect. */
export function drawTextElement(ctx: Ctx, el: TextElement, layout: TextLayout): void {
  const runs =
    layout.kind === 'straight' ? runsFromStraight(layout.straight) : runsFromCurved(layout.curved);
  if (!runs.length) return;
  const spacing =
    layout.kind === 'straight' ? layout.straight.letterSpacing : layout.curved.letterSpacing;
  const size = el.style.fontSize;
  const effect = el.effect;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  if (!effect) {
    paintRuns(ctx, runs, spacing, 'fill');
    return;
  }

  switch (effect.type) {
    case 'shadow':
    case 'lift': {
      const g = effectGeometry(effect, size);
      const color =
        effect.type === 'shadow' ? withAlpha(effect.color, g.alpha) : `rgba(0,0,0,${g.alpha})`;
      shadowOnly(ctx, { color, blur: g.blur, dx: g.dx, dy: g.dy }, () =>
        paintRuns(ctx, runs, spacing, 'fill'),
      );
      paintRuns(ctx, runs, spacing, 'fill');
      return;
    }
    case 'hollow': {
      ctx.lineWidth = strokeWidthFor(effect.thickness, size);
      paintRuns(ctx, runs, spacing, 'stroke');
      return;
    }
    case 'splice': {
      const g = effectGeometry(effect, size);
      paintRuns(ctx, runs, spacing, 'fill', effect.color, g.dx, g.dy);
      ctx.lineWidth = strokeWidthFor(effect.thickness, size);
      paintRuns(ctx, runs, spacing, 'stroke');
      return;
    }
    case 'outline': {
      ctx.lineWidth = strokeWidthFor(effect.thickness, size) * 2;
      paintRuns(ctx, runs, spacing, 'stroke', effect.color);
      paintRuns(ctx, runs, spacing, 'fill');
      return;
    }
    case 'echo': {
      const g = effectGeometry(effect, size);
      ctx.save();
      ctx.globalAlpha *= 0.25;
      paintRuns(ctx, runs, spacing, 'fill', effect.color, g.dx * 2, g.dy * 2);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= 0.5;
      paintRuns(ctx, runs, spacing, 'fill', effect.color, g.dx, g.dy);
      ctx.restore();
      paintRuns(ctx, runs, spacing, 'fill');
      return;
    }
    case 'glitch': {
      const g = effectGeometry(effect, size);
      paintRuns(ctx, runs, spacing, 'fill', effect.colorA, -g.dx, -g.dy);
      paintRuns(ctx, runs, spacing, 'fill', effect.colorB, g.dx, g.dy);
      paintRuns(ctx, runs, spacing, 'fill');
      return;
    }
    case 'neon': {
      const k = effect.intensity / 100;
      for (const r of [0.6, 0.3, 0.12]) {
        for (const run of runs) {
          shadowOnly(ctx, { color: run.color, blur: size * r * (0.4 + k), dx: 0, dy: 0 }, () =>
            paintRuns(ctx, [run], spacing, 'fill'),
          );
        }
      }
      paintRuns(
        ctx,
        runs.map((r) => ({ ...r, color: lighten(r.color, 0.55 + 0.25 * k) })),
        spacing,
        'fill',
      );
      return;
    }
    case 'background': {
      if (layout.kind === 'straight') lineBackgrounds(ctx, layout.straight, effect, el);
      paintRuns(ctx, runs, spacing, 'fill');
      return;
    }
  }
}
