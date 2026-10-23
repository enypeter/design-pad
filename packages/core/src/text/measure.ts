export interface FontSpec {
  family: string;
  size: number;
  weight: number;
  italic: boolean;
}

export interface FontMetrics {
  /** Distance from baseline to the top of the em box used for line layout. */
  ascent: number;
  /** Distance from baseline to the bottom of the em box used for line layout. */
  descent: number;
}

/** Quote a family name for use in a CSS / canvas font shorthand. */
export function quoteFamily(family: string): string {
  return `"${family.replace(/["\\]/g, '')}"`;
}

/** Canvas/CSS `font` shorthand for a spec, with a generic fallback. */
export function fontToCss(spec: FontSpec): string {
  const style = spec.italic ? 'italic ' : '';
  return `${style}${spec.weight} ${spec.size}px ${quoteFamily(spec.family)}, sans-serif`;
}

export interface TextMeasurer {
  /** Advance width of `text`. `letterSpacing` (px) is added after every character, like CSS. */
  measure(text: string, font: FontSpec, letterSpacing: number): number;
  metrics(font: FontSpec): FontMetrics;
  /** Drop cached measurements, e.g. after a web font finished loading. */
  clear(): void;
}

let segmenter: Intl.Segmenter | null | undefined;

/** Split text into user-perceived characters. */
export function graphemes(text: string): string[] {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null;
  }
  if (!segmenter) return Array.from(text);
  const out: string[] = [];
  for (const s of segmenter.segment(text)) out.push(s.segment);
  return out;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createContext(): Ctx2D | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (ctx) return ctx;
  }
  if (typeof document !== 'undefined') {
    return document.createElement('canvas').getContext('2d');
  }
  return null;
}

/** Measures with the browser's canvas text engine, which matches CSS layout. */
export class CanvasTextMeasurer implements TextMeasurer {
  private ctx: Ctx2D;
  private widths = new Map<string, number>();
  private metricsCache = new Map<string, FontMetrics>();
  private currentFont = '';
  private currentSpacing = 0;
  readonly nativeLetterSpacing: boolean;

  constructor(ctx?: Ctx2D) {
    const c = ctx ?? createContext();
    if (!c) throw new Error('CanvasTextMeasurer needs a 2D canvas');
    this.ctx = c;
    this.nativeLetterSpacing = 'letterSpacing' in c;
  }

  private setFont(css: string, spacing: number): void {
    if (css !== this.currentFont) {
      this.ctx.font = css;
      this.currentFont = css;
    }
    if (this.nativeLetterSpacing && spacing !== this.currentSpacing) {
      (this.ctx as CanvasRenderingContext2D).letterSpacing = `${spacing}px`;
      this.currentSpacing = spacing;
    }
  }

  measure(text: string, font: FontSpec, letterSpacing: number): number {
    if (!text) return 0;
    const css = fontToCss(font);
    const key = `${css}\u0001${letterSpacing}\u0001${text}`;
    const cached = this.widths.get(key);
    if (cached !== undefined) return cached;
    this.setFont(css, letterSpacing);
    let width = this.ctx.measureText(text).width;
    if (letterSpacing && !this.nativeLetterSpacing) width += letterSpacing * graphemes(text).length;
    if (this.widths.size > 20000) this.widths.clear();
    this.widths.set(key, width);
    return width;
  }

  metrics(font: FontSpec): FontMetrics {
    // Vertical metrics scale linearly with size: measure once per face at 100px.
    const unit = { ...font, size: 100 };
    const css = fontToCss(unit);
    let m = this.metricsCache.get(css);
    if (!m) {
      this.setFont(css, 0);
      const tm = this.ctx.measureText('Hgjy');
      const ascent = tm.fontBoundingBoxAscent ?? tm.actualBoundingBoxAscent ?? 80;
      const descent = tm.fontBoundingBoxDescent ?? tm.actualBoundingBoxDescent ?? 20;
      m = { ascent, descent };
      this.metricsCache.set(css, m);
    }
    const s = font.size / 100;
    return { ascent: m.ascent * s, descent: m.descent * s };
  }

  clear(): void {
    this.widths.clear();
    this.metricsCache.clear();
    this.currentFont = '';
  }
}

/**
 * Deterministic measurer for environments without a canvas (tests, Node).
 * Uses rough per-character advances.
 */
export class ApproximateTextMeasurer implements TextMeasurer {
  measure(text: string, font: FontSpec, letterSpacing: number): number {
    let w = 0;
    for (const ch of graphemes(text)) {
      let adv = 0.55;
      if (ch === ' ') adv = 0.28;
      else if (/[iljtf.,;:'!|]/.test(ch)) adv = 0.3;
      else if (/[mwMW]/.test(ch)) adv = 0.85;
      else if (/[A-Z]/.test(ch)) adv = 0.68;
      w += adv * font.size * (font.weight >= 600 ? 1.06 : 1) + letterSpacing;
    }
    return w;
  }

  metrics(font: FontSpec): FontMetrics {
    return { ascent: font.size * 0.92, descent: font.size * 0.24 };
  }

  clear(): void {}
}
