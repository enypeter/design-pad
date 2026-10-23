import type { TextSpan, TextStyle } from '../model/types';
import {
  type LayoutInput,
  letterSpacingPx,
  type ResolvedRunStyle,
  resolveRunStyle,
  runFont,
  toParagraphs,
} from './layout';
import { type FontSpec, graphemes, type TextMeasurer } from './measure';

export interface CurvedGlyph {
  text: string;
  /** Baseline centre of the glyph, box space. */
  x: number;
  y: number;
  /** Radians, clockwise. */
  rotation: number;
  width: number;
  style: ResolvedRunStyle;
  font: FontSpec;
  ascent: number;
  descent: number;
}

export interface CurvedTextLayout {
  glyphs: CurvedGlyph[];
  width: number;
  height: number;
  /** Radius of the baseline circle. */
  radius: number;
  letterSpacing: number;
}

/** Fraction of a full circle that curve = ±100 spans. */
const MAX_SWEEP = 0.98;
const PADDING_EM = 0.1;

/**
 * Lay text out along a circular arc (Canva's "Curve" effect). Positive
 * curve arches upward (∩), negative bends downward (∪). Paragraph breaks
 * are joined with spaces.
 */
export function layoutCurvedText(
  input: Omit<LayoutInput, 'width'> & { curve: number },
  measurer: TextMeasurer,
): CurvedTextLayout {
  const base: TextStyle = input.style;
  const spacing = letterSpacingPx(base);
  const paragraphs = toParagraphs(input.spans as TextSpan[], base);

  const chars: { g: string; style: ResolvedRunStyle }[] = [];
  paragraphs.forEach((pieces, i) => {
    if (i > 0) chars.push({ g: ' ', style: resolveRunStyle(base) });
    for (const piece of pieces)
      for (const g of graphemes(piece.text)) chars.push({ g, style: piece.style });
  });

  const measured = chars.map(({ g, style }) => {
    const font = runFont(style);
    const fm = measurer.metrics(font);
    return { g, style, font, width: measurer.measure(g, font, spacing), ...fm };
  });
  const total = measured.reduce((sum, c) => sum + c.width, 0);

  const sweep = Math.max(
    1e-3,
    (Math.min(100, Math.abs(input.curve)) / 100) * Math.PI * 2 * MAX_SWEEP,
  );
  const radius = Math.max(total, 1) / sweep;
  const up = input.curve > 0;

  // Place glyphs relative to the circle centre.
  const raw: CurvedGlyph[] = [];
  let s = 0;
  for (const c of measured) {
    const alpha = -sweep / 2 + (s + c.width / 2) / radius;
    s += c.width;
    if (up) {
      raw.push({
        text: c.g,
        x: radius * Math.sin(alpha),
        y: -radius * Math.cos(alpha),
        rotation: alpha,
        width: c.width,
        style: c.style,
        font: c.font,
        ascent: c.ascent,
        descent: c.descent,
      });
    } else {
      raw.push({
        text: c.g,
        x: radius * Math.sin(alpha),
        y: radius * Math.cos(alpha),
        rotation: -alpha,
        width: c.width,
        style: c.style,
        font: c.font,
        ascent: c.ascent,
        descent: c.descent,
      });
    }
  }

  // Bounding box of the rotated glyph boxes.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const g of raw) {
    const cos = Math.cos(g.rotation);
    const sin = Math.sin(g.rotation);
    const corners = [
      [-g.width / 2, -g.ascent],
      [g.width / 2, -g.ascent],
      [g.width / 2, g.descent],
      [-g.width / 2, g.descent],
    ] as const;
    for (const [lx, ly] of corners) {
      const px = g.x + lx * cos - ly * sin;
      const py = g.y + lx * sin + ly * cos;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  if (!raw.length) {
    const fm = measurer.metrics(runFont(resolveRunStyle(base)));
    return {
      glyphs: [],
      width: base.fontSize,
      height: fm.ascent + fm.descent,
      radius,
      letterSpacing: spacing,
    };
  }
  const pad = base.fontSize * PADDING_EM;
  const glyphs = raw.map((g) => ({ ...g, x: g.x - minX + pad, y: g.y - minY + pad }));
  return {
    glyphs,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    radius,
    letterSpacing: spacing,
  };
}
