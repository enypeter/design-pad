import type { DesignElement, DropShadow, Stroke, TextElement, TextSpan } from '../model/types';

const scaleStroke = (s: Stroke | null, k: number): Stroke | null =>
  s ? { ...s, width: s.width * k } : null;

const scaleShadow = (s: DropShadow | null, k: number): DropShadow | null =>
  s ? { ...s, blur: s.blur * k, distance: s.distance * k } : null;

function scaleSpans(spans: TextSpan[], k: number): TextSpan[] {
  return spans.map((span) =>
    span.style?.fontSize
      ? { ...span, style: { ...span.style, fontSize: span.style.fontSize * k } }
      : span,
  );
}

/** Round font sizes to 0.1 so repeated scaling does not accumulate float noise. */
const roundSize = (n: number) => Math.round(n * 10) / 10;

export function scaleTextStyle(el: TextElement, k: number): TextElement {
  return {
    ...el,
    width: el.width * k,
    height: el.height * k,
    style: { ...el.style, fontSize: roundSize(el.style.fontSize * k) },
    spans: scaleSpans(el.spans, k),
  };
}

/**
 * Uniformly scale an element's intrinsic properties (size, font size,
 * stroke widths, radii...) by `k`. Position is left to the caller.
 * Group children are scaled separately (see Editor.scaleSubtree).
 */
export function scaleElementProps<T extends DesignElement>(el: T, k: number): T {
  const width = el.width * k;
  const height = el.height * k;
  switch (el.type) {
    case 'text':
      return scaleTextStyle(el, k) as T;
    case 'shape':
      return {
        ...el,
        width,
        height,
        cornerRadius: el.cornerRadius * k,
        stroke: scaleStroke(el.stroke, k),
        shadow: scaleShadow(el.shadow, k),
      };
    case 'line':
      return { ...el, width, height, stroke: { ...el.stroke, width: el.stroke.width * k } };
    case 'image':
      return {
        ...el,
        width,
        height,
        cornerRadius: el.cornerRadius * k,
        stroke: scaleStroke(el.stroke, k),
        shadow: scaleShadow(el.shadow, k),
      };
    case 'frame':
      return {
        ...el,
        width,
        height,
        cornerRadius: el.cornerRadius * k,
        stroke: scaleStroke(el.stroke, k),
      };
    case 'grid':
      return { ...el, width, height, gap: el.gap * k, cornerRadius: el.cornerRadius * k };
    case 'svg':
      return { ...el, width, height, shadow: scaleShadow(el.shadow, k) };
    case 'path':
      return { ...el, width, height, stroke: scaleStroke(el.stroke, k) };
    case 'group':
      return { ...el, width, height };
  }
}
