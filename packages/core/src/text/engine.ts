import type { TextElement } from '../model/types';
import { type CurvedTextLayout, layoutCurvedText } from './curve';
import { layoutStraightText, naturalTextWidth, type StraightTextLayout } from './layout';
import type { TextMeasurer } from './measure';

export type TextLayout =
  | { kind: 'straight'; straight: StraightTextLayout; width: number; height: number }
  | { kind: 'curved'; curved: CurvedTextLayout; width: number; height: number };

interface CacheEntry {
  spans: TextElement['spans'];
  style: TextElement['style'];
  width: number;
  curve: number;
  epoch: number;
  layout: TextLayout;
}

/** Lays out text elements and caches results per element. */
export class TextLayoutEngine {
  private cache = new Map<string, CacheEntry>();
  private _epoch = 0;

  constructor(readonly measurer: TextMeasurer) {}

  get epoch(): number {
    return this._epoch;
  }

  /** Invalidate every layout, e.g. after a web font loaded. */
  invalidate(): void {
    this._epoch++;
    this.measurer.clear();
    this.cache.clear();
  }

  layout(el: Pick<TextElement, 'id' | 'spans' | 'style' | 'width' | 'curve'>): TextLayout {
    const hit = this.cache.get(el.id);
    if (
      hit &&
      hit.spans === el.spans &&
      hit.style === el.style &&
      hit.width === el.width &&
      hit.curve === el.curve &&
      hit.epoch === this._epoch
    ) {
      return hit.layout;
    }
    let layout: TextLayout;
    if (el.curve) {
      const curved = layoutCurvedText(
        { spans: el.spans, style: el.style, curve: el.curve },
        this.measurer,
      );
      layout = { kind: 'curved', curved, width: curved.width, height: curved.height };
    } else {
      const straight = layoutStraightText(
        { spans: el.spans, style: el.style, width: el.width },
        this.measurer,
      );
      layout = { kind: 'straight', straight, width: el.width, height: straight.height };
    }
    if (this.cache.size > 2000) this.cache.clear();
    this.cache.set(el.id, {
      spans: el.spans,
      style: el.style,
      width: el.width,
      curve: el.curve,
      epoch: this._epoch,
      layout,
    });
    return layout;
  }

  naturalWidth(el: Pick<TextElement, 'spans' | 'style'>): number {
    return naturalTextWidth(el, this.measurer);
  }

  forget(id: string): void {
    this.cache.delete(id);
  }
}

/**
 * Return `el` with its box synced to its text layout: straight text gets
 * an auto height; curved text gets the arc's box, keeping its centre.
 */
export function syncTextBox(el: TextElement, engine: TextLayoutEngine): TextElement {
  const layout = engine.layout(el);
  if (layout.kind === 'straight') {
    const height = Math.max(1, layout.height);
    if (Math.abs(height - el.height) < 1e-6) return el;
    return { ...el, height };
  }
  const { width, height } = layout;
  if (Math.abs(width - el.width) < 1e-6 && Math.abs(height - el.height) < 1e-6) return el;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const next = { ...el, x: cx - width / 2, y: cy - height / 2, width, height };
  // Width changed, so the cached layout (keyed on width) must be re-associated.
  engine.layout(next);
  return next;
}
