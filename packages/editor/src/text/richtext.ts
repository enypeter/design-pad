import type { SpanStyle, TextSpan, TextStyle } from '@design-pad/core';

/**
 * Conversion between text spans and the contenteditable DOM used for
 * in-place editing. Paragraphs are <div class="dp-p">; each run is a <span>
 * whose inline style carries its resolved decoration and any overrides.
 */

const STYLE_KEYS: (keyof SpanStyle)[] = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'italic',
  'color',
  'underline',
  'strikethrough',
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cssFamily(family: string): string {
  return `"${family.replace(/"/g, '')}", sans-serif`;
}

export function spanCss(style: SpanStyle, base: TextStyle): string {
  const parts: string[] = [];
  if (style.fontFamily) parts.push(`font-family: ${cssFamily(style.fontFamily)}`);
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}px`);
  if (style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`);
  if (style.italic !== undefined) parts.push(`font-style: ${style.italic ? 'italic' : 'normal'}`);
  if (style.color) parts.push(`color: ${style.color}`);
  const underline = style.underline ?? base.underline;
  const strike = style.strikethrough ?? base.strikethrough;
  const deco =
    [underline && 'underline', strike && 'line-through'].filter(Boolean).join(' ') || 'none';
  parts.push(`text-decoration-line: ${deco}`);
  return parts.join('; ');
}

export function spansToHtml(spans: TextSpan[], base: TextStyle): string {
  const paragraphs: string[][] = [[]];
  for (const span of spans) {
    const parts = span.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part) {
        paragraphs[paragraphs.length - 1]!.push(
          `<span style="${spanCss(span.style ?? {}, base)}">${escapeHtml(part)}</span>`,
        );
      }
    });
  }
  return paragraphs
    .map((runs) => `<div class="dp-p">${runs.length ? runs.join('') : '<br>'}</div>`)
    .join('');
}

function rgbToHex(value: string): string {
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(value.trim());
  if (!m) return value;
  const h = (n: string) => Number(n).toString(16).padStart(2, '0');
  const alpha = m[4] !== undefined ? Math.round(Number(m[4]) * 255) : 255;
  return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}${alpha < 255 ? alpha.toString(16).padStart(2, '0') : ''}`;
}

function firstFamily(value: string): string {
  return value
    .split(',')[0]!
    .trim()
    .replace(/^["']|["']$/g, '');
}

/** Resolve the style of a text node by walking up to the editor root. */
function resolveNodeStyle(node: Node, root: HTMLElement, base: TextStyle): Required<SpanStyle> {
  const found: Partial<Record<keyof SpanStyle, unknown>> = {};
  let decoration: { underline: boolean; strike: boolean } | null = null;
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    const st = el.style;
    const tag = el.tagName;
    if (found.fontFamily === undefined && st.fontFamily)
      found.fontFamily = firstFamily(st.fontFamily);
    if (found.fontSize === undefined && st.fontSize.endsWith('px'))
      found.fontSize = Number.parseFloat(st.fontSize);
    if (found.fontWeight === undefined) {
      if (st.fontWeight)
        found.fontWeight =
          st.fontWeight === 'bold'
            ? 700
            : st.fontWeight === 'normal'
              ? 400
              : Number(st.fontWeight) || undefined;
      else if (tag === 'B' || tag === 'STRONG') found.fontWeight = 700;
    }
    if (found.italic === undefined) {
      if (st.fontStyle) found.italic = st.fontStyle === 'italic';
      else if (tag === 'I' || tag === 'EM') found.italic = true;
    }
    if (found.color === undefined && st.color) found.color = rgbToHex(st.color);
    if (!decoration) {
      const line = st.textDecorationLine || st.textDecoration;
      if (line)
        decoration = {
          underline: line.includes('underline'),
          strike: line.includes('line-through'),
        };
      else if (tag === 'U') decoration = { underline: true, strike: false };
      else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL')
        decoration = { underline: false, strike: true };
    }
  }
  return {
    fontFamily: (found.fontFamily as string) ?? base.fontFamily,
    fontSize: (found.fontSize as number) ?? base.fontSize,
    fontWeight: (found.fontWeight as number) ?? base.fontWeight,
    italic: (found.italic as boolean) ?? base.italic,
    color: (found.color as string) ?? base.color,
    underline: decoration ? decoration.underline : base.underline,
    strikethrough: decoration ? decoration.strike : base.strikethrough,
  };
}

function overrides(resolved: Required<SpanStyle>, base: TextStyle): SpanStyle | undefined {
  const out: SpanStyle = {};
  for (const k of STYLE_KEYS) {
    const v = resolved[k];
    const b = base[k];
    const differs = k === 'color' ? String(v).toLowerCase() !== String(b).toLowerCase() : v !== b;
    if (differs) (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const sameStyle = (a?: SpanStyle, b?: SpanStyle) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/** Merge adjacent runs with equal styles. */
export function normalizeSpans(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last.style, span.style)) last.text += span.text;
    else out.push(span.style ? { text: span.text, style: span.style } : { text: span.text });
  }
  return out.length ? out : [{ text: '' }];
}

const isBlock = (n: Node) => n instanceof HTMLElement && (n.tagName === 'DIV' || n.tagName === 'P');

/** Read spans back from the editor DOM. */
export function domToSpans(root: HTMLElement, base: TextStyle): TextSpan[] {
  const spans: TextSpan[] = [];
  let firstBlock = true;

  const walk = (node: Node, inBlock: boolean) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? '').replace(/​/g, '');
        if (text) spans.push({ text, style: overrides(resolveNodeStyle(child, root, base), base) });
      } else if (child instanceof HTMLElement) {
        if (child.tagName === 'BR') {
          // A lone <br> keeps an empty paragraph open; trailing <br>s are placeholders.
          const isLast = !child.nextSibling;
          if (!(inBlock && isLast)) spans.push({ text: '\n' });
        } else if (isBlock(child)) {
          if (!firstBlock) spans.push({ text: '\n' });
          firstBlock = false;
          walk(child, true);
        } else {
          walk(child, inBlock);
        }
      }
    }
  };
  // Text typed directly into the root (before any block) counts as the first paragraph.
  const hasBlocks = [...root.childNodes].some(isBlock);
  if (!hasBlocks) firstBlock = false;
  walk(root, false);
  return normalizeSpans(spans);
}

// -----------------------------------------------------------------------------
// Selection helpers
// -----------------------------------------------------------------------------

/** Selection for content that may live inside a shadow root. */
export function selectionFor(root: HTMLElement): Selection | null {
  const rn = root.getRootNode() as
    | (ShadowRoot & { getSelection?: () => Selection | null })
    | Document;
  if ('getSelection' in rn && rn !== root.ownerDocument && typeof rn.getSelection === 'function') {
    return rn.getSelection();
  }
  return root.ownerDocument.getSelection();
}

function textNodesIn(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** The current selection range if it lies inside `root` and is not collapsed. */
export function rangeIn(root: HTMLElement): Range | null {
  const sel = selectionFor(root);
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) return null;
  return range;
}

/** Text nodes covered by a range, splitting the boundary nodes. */
function splitToRange(range: Range, root: HTMLElement): Text[] {
  const { startContainer, startOffset, endContainer, endOffset } = range;
  let start = startContainer;
  let end = endContainer;
  let endOff = endOffset;
  if (
    start.nodeType === Node.TEXT_NODE &&
    startOffset > 0 &&
    startOffset < (start.textContent?.length ?? 0)
  ) {
    const tail = (start as Text).splitText(startOffset);
    if (end === start) {
      end = tail;
      endOff -= startOffset;
    }
    start = tail;
  }
  if (end.nodeType === Node.TEXT_NODE && endOff > 0 && endOff < (end.textContent?.length ?? 0)) {
    (end as Text).splitText(endOff);
  }
  const r = document.createRange();
  if (start.nodeType === Node.TEXT_NODE)
    r.setStart(start, start === startContainer ? startOffset : 0);
  else r.setStart(startContainer, startOffset);
  if (end.nodeType === Node.TEXT_NODE) r.setEnd(end, (end.textContent ?? '').length);
  else r.setEnd(endContainer, endOffset);
  return textNodesIn(root).filter((t) => {
    if (!t.textContent) return false;
    const tr = document.createRange();
    tr.selectNodeContents(t);
    return (
      r.compareBoundaryPoints(Range.START_TO_END, tr) > 0 &&
      r.compareBoundaryPoints(Range.END_TO_START, tr) < 0
    );
  });
}

function applyToSpan(span: HTMLElement, style: SpanStyle, base: TextStyle): void {
  if (style.fontFamily !== undefined) span.style.fontFamily = cssFamily(style.fontFamily);
  if (style.fontSize !== undefined) span.style.fontSize = `${style.fontSize}px`;
  if (style.fontWeight !== undefined) span.style.fontWeight = String(style.fontWeight);
  if (style.italic !== undefined) span.style.fontStyle = style.italic ? 'italic' : 'normal';
  if (style.color !== undefined) span.style.color = style.color;
  if (style.underline !== undefined || style.strikethrough !== undefined) {
    const cur = span.style.textDecorationLine || '';
    const underline = style.underline ?? (cur ? cur.includes('underline') : base.underline);
    const strike = style.strikethrough ?? (cur ? cur.includes('line-through') : base.strikethrough);
    span.style.textDecorationLine =
      [underline && 'underline', strike && 'line-through'].filter(Boolean).join(' ') || 'none';
  }
}

/**
 * Apply an inline style to the selected text. Returns false when there is
 * no usable selection (callers then style the whole text box).
 */
export function applyStyleToSelection(
  root: HTMLElement,
  style: SpanStyle,
  base: TextStyle,
): boolean {
  const range = rangeIn(root);
  if (!range) return false;
  const nodes = splitToRange(range, root);
  if (!nodes.length) return false;
  for (const node of nodes) {
    const parent = node.parentElement;
    let span: HTMLElement;
    if (parent && parent !== root && parent.tagName === 'SPAN' && parent.childNodes.length === 1) {
      span = parent;
    } else {
      span = document.createElement('span');
      node.parentNode!.insertBefore(span, node);
      span.appendChild(node);
    }
    applyToSpan(span, style, base);
  }
  const sel = selectionFor(root);
  if (sel) {
    const r = document.createRange();
    r.setStart(nodes[0]!, 0);
    const last = nodes[nodes.length - 1]!;
    r.setEnd(last, last.textContent?.length ?? 0);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  return true;
}

/** Resolved style values across the selected text: a value if uniform, 'mixed' otherwise. */
export function selectionStyle(
  root: HTMLElement,
  base: TextStyle,
): Partial<Record<keyof SpanStyle, unknown>> | null {
  const range = rangeIn(root);
  if (!range) return null;
  const nodes = textNodesIn(root).filter((t) => t.textContent && range.intersectsNode(t));
  if (!nodes.length) return null;
  const out: Partial<Record<keyof SpanStyle, unknown>> = {};
  nodes.forEach((n, i) => {
    const st = resolveNodeStyle(n, root, base);
    for (const k of STYLE_KEYS) {
      if (i === 0) out[k] = st[k];
      else if (out[k] !== st[k]) out[k] = 'mixed';
    }
  });
  return out;
}

/** Character offsets of the selection within the editor's text, for restoring after re-render. */
export function saveSelection(root: HTMLElement): { start: number; end: number } | null {
  const sel = selectionFor(root);
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const offsetOf = (container: Node, offset: number) => {
    const r = document.createRange();
    r.selectNodeContents(root);
    r.setEnd(container, offset);
    return r.toString().length;
  };
  return {
    start: offsetOf(range.startContainer, range.startOffset),
    end: offsetOf(range.endContainer, range.endOffset),
  };
}

export function restoreSelection(root: HTMLElement, saved: { start: number; end: number }): void {
  const nodes = textNodesIn(root);
  const locate = (target: number): [Node, number] => {
    let pos = 0;
    for (const n of nodes) {
      const len = n.textContent?.length ?? 0;
      if (target <= pos + len) return [n, target - pos];
      pos += len;
    }
    const last = nodes[nodes.length - 1];
    return last ? [last, last.textContent?.length ?? 0] : [root, root.childNodes.length];
  };
  const [sn, so] = locate(saved.start);
  const [en, eo] = locate(saved.end);
  const sel = selectionFor(root);
  if (!sel) return;
  const r = document.createRange();
  r.setStart(sn, so);
  r.setEnd(en, eo);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Select the word around the caret (double-click behaviour). */
export function selectWordAtCaret(root: HTMLElement): void {
  const sel = selectionFor(root);
  if (!sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return;
  const text = node.textContent ?? '';
  const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_'’-]/u.test(ch);
  let start = r.startOffset;
  let end = r.startOffset;
  while (start > 0 && isWord(text[start - 1])) start--;
  while (end < text.length && isWord(text[end])) end++;
  if (start === end) return;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Place the caret at a client point, falling back to the end. */
export function placeCaretAt(root: HTMLElement, x: number, y: number): void {
  const doc = root.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let range: Range | null = null;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos && root.contains(pos.offsetNode)) {
    range = doc.createRange();
    range.setStart(pos.offsetNode, pos.offset);
  } else {
    const r = doc.caretRangeFromPoint?.(x, y);
    if (r && root.contains(r.startContainer)) range = r;
  }
  const sel = selectionFor(root);
  if (!sel) return;
  if (!range) {
    range = doc.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function selectAll(root: HTMLElement): void {
  const sel = selectionFor(root);
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(root);
  sel.removeAllRanges();
  sel.addRange(r);
}
