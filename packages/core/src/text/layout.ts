import type { SpanStyle, TextSpan, TextStyle } from '../model/types';
import { type FontSpec, graphemes, type TextMeasurer } from './measure';

/**
 * Rich-text line layout that mirrors CSS inline layout for a block with
 * `white-space: pre-wrap; overflow-wrap: break-word`. The in-place text
 * editor is a contenteditable styled the same way, so text does not jump
 * when editing starts or ends.
 */

export interface ResolvedRunStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  color: string;
  underline: boolean;
  strikethrough: boolean;
}

export interface LayoutFragment {
  text: string;
  /** Left edge in box space. */
  x: number;
  width: number;
  style: ResolvedRunStyle;
  font: FontSpec;
  ascent: number;
  descent: number;
}

export interface LayoutLine {
  fragments: LayoutFragment[];
  top: number;
  height: number;
  baseline: number;
  /** x of the first glyph (box space). */
  left: number;
  /** Content width excluding hanging trailing spaces. */
  width: number;
  paragraph: number;
  marker: LayoutFragment | null;
}

export interface StraightTextLayout {
  lines: LayoutLine[];
  width: number;
  height: number;
  /** Widest line content. */
  contentWidth: number;
  /** Letter spacing in px applied to every run. */
  letterSpacing: number;
}

/** Hanging indent for list paragraphs, in ems of the base font size. */
export const LIST_INDENT_EM = 1.5;
/** Marker inset from the left edge, in ems of the base font size. */
export const LIST_MARKER_EM = 0.35;

const EPSILON = 1 / 64;
const CJK = /[ᄀ-ᇿ⺀-⿟぀-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/;
const SPACE = /^[ \t]$/;

export function resolveRunStyle(base: TextStyle, override?: SpanStyle): ResolvedRunStyle {
  return {
    fontFamily: override?.fontFamily ?? base.fontFamily,
    fontSize: override?.fontSize ?? base.fontSize,
    fontWeight: override?.fontWeight ?? base.fontWeight,
    italic: override?.italic ?? base.italic,
    color: override?.color ?? base.color,
    underline: override?.underline ?? base.underline,
    strikethrough: override?.strikethrough ?? base.strikethrough,
  };
}

export function runFont(style: ResolvedRunStyle): FontSpec {
  return {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    italic: style.italic,
  };
}

export function letterSpacingPx(style: TextStyle): number {
  return (style.letterSpacing / 1000) * style.fontSize;
}

export interface Piece {
  text: string;
  style: ResolvedRunStyle;
}

/** Split spans into paragraphs of styled pieces, applying text transforms. */
export function toParagraphs(spans: TextSpan[], base: TextStyle): Piece[][] {
  const paragraphs: Piece[][] = [[]];
  for (const span of spans) {
    const style = resolveRunStyle(base, span.style);
    const text = base.uppercase ? span.text.toUpperCase() : span.text;
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part) paragraphs[paragraphs.length - 1]!.push({ text: part, style });
    });
  }
  return paragraphs;
}

interface AtomFragment {
  text: string;
  style: ResolvedRunStyle;
  width: number;
}

interface Atom {
  fragments: AtomFragment[];
  isSpace: boolean;
  spaceCount: number;
  width: number;
  breakAfter: boolean;
  breakBefore: boolean;
}

class Measure {
  constructor(
    private measurer: TextMeasurer,
    private spacing: number,
  ) {}
  width(text: string, style: ResolvedRunStyle): number {
    return this.measurer.measure(text, runFont(style), this.spacing);
  }
}

function makeAtom(isSpace: boolean): Atom {
  return { fragments: [], isSpace, spaceCount: 0, width: 0, breakAfter: false, breakBefore: false };
}

function appendGrapheme(atom: Atom, g: string, style: ResolvedRunStyle): void {
  const last = atom.fragments[atom.fragments.length - 1];
  if (last && last.style === style) last.text += g;
  else atom.fragments.push({ text: g, style, width: 0 });
  if (atom.isSpace) atom.spaceCount++;
}

function tokenize(pieces: Piece[]): Atom[] {
  const atoms: Atom[] = [];
  let current: Atom | null = null;
  const close = () => {
    if (current?.fragments.length) atoms.push(current);
    current = null;
  };
  // Flatten to graphemes with their style so look-ahead works across pieces.
  const chars: { g: string; style: ResolvedRunStyle }[] = [];
  for (const piece of pieces)
    for (const g of graphemes(piece.text)) chars.push({ g, style: piece.style });

  for (let i = 0; i < chars.length; i++) {
    const { g, style } = chars[i]!;
    const next = chars[i + 1]?.g ?? '';
    if (SPACE.test(g)) {
      if (!current?.isSpace) {
        close();
        current = makeAtom(true);
      }
      appendGrapheme(current, g, style);
      continue;
    }
    if (CJK.test(g)) {
      close();
      const atom = makeAtom(false);
      appendGrapheme(atom, g, style);
      atom.breakAfter = true;
      atom.breakBefore = true;
      atoms.push(atom);
      continue;
    }
    if (!current || current.isSpace) {
      close();
      current = makeAtom(false);
    }
    appendGrapheme(current, g, style);
    const isHyphen = g === '-' || g === '‐' || g === '–';
    const isEmDash = g === '—';
    if ((isHyphen && next && !/[\s\d]/.test(next)) || (isEmDash && next && !SPACE.test(next))) {
      current.breakAfter = true;
      close();
    }
  }
  close();
  return atoms;
}

function measureAtoms(atoms: Atom[], m: Measure): void {
  for (const atom of atoms) {
    let w = 0;
    for (const f of atom.fragments) {
      f.width = m.width(f.text, f.style);
      w += f.width;
    }
    atom.width = w;
  }
}

/** Split an atom that is wider than the line into chunks that fit (overflow-wrap: break-word). */
function breakAtom(atom: Atom, avail: number, m: Measure): Atom[] {
  const chunks: Atom[] = [];
  let chunk = makeAtom(false);
  for (const frag of atom.fragments) {
    for (const g of graphemes(frag.text)) {
      const gw = m.width(g, frag.style);
      if (chunk.fragments.length && chunk.width + gw > avail + EPSILON) {
        chunks.push(chunk);
        chunk = makeAtom(false);
      }
      const last = chunk.fragments[chunk.fragments.length - 1];
      if (last && last.style === frag.style) {
        last.text += g;
        last.width += gw;
      } else {
        chunk.fragments.push({ text: g, style: frag.style, width: gw });
      }
      chunk.width += gw;
    }
  }
  if (chunk.fragments.length) chunks.push(chunk);
  chunks[chunks.length - 1]!.breakAfter = atom.breakAfter;
  return chunks;
}

/** Break atoms into lines. Trailing spaces stay on the line they follow. */
function breakLines(atoms: Atom[], avail: number, m: Measure): Atom[][] {
  const lines: Atom[][] = [];
  let line: Atom[] = [];
  let lineWidth = 0;
  for (const atom of atoms) {
    if (atom.isSpace) {
      line.push(atom);
      lineWidth += atom.width;
      continue;
    }
    const prev = line[line.length - 1];
    const canBreak = !!prev && (prev.isSpace || prev.breakAfter || atom.breakBefore);
    if (canBreak && lineWidth + atom.width > avail + EPSILON) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    const lineHasContent = line.some((a) => !a.isSpace);
    if (atom.width > avail + EPSILON && !lineHasContent) {
      const chunks = breakAtom(atom, Math.max(avail - lineWidth, 1), m);
      for (let i = 0; i < chunks.length - 1; i++) {
        line.push(chunks[i]!);
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      const last = chunks[chunks.length - 1]!;
      line.push(last);
      lineWidth += last.width;
      continue;
    }
    line.push(atom);
    lineWidth += atom.width;
  }
  lines.push(line);
  return lines;
}

export interface LayoutInput {
  spans: TextSpan[];
  style: TextStyle;
  width: number;
}

export function layoutStraightText(input: LayoutInput, measurer: TextMeasurer): StraightTextLayout {
  const base = input.style;
  const spacing = letterSpacingPx(base);
  const m = new Measure(measurer, spacing);
  const baseRun = resolveRunStyle(base);
  const baseFont = runFont(baseRun);
  const strut = measurer.metrics(baseFont);
  const lhFactor = base.lineHeight;

  const paragraphs = toParagraphs(input.spans, base);
  const boxWidth = Math.max(1, input.width);
  const isList = base.list !== 'none';
  const indent = isList ? base.fontSize * LIST_INDENT_EM : 0;
  const avail = Math.max(1, boxWidth - indent);

  const lines: LayoutLine[] = [];
  let y = 0;
  let contentWidth = 0;
  let listNumber = 0;

  paragraphs.forEach((pieces, pIndex) => {
    const atoms = tokenize(pieces);
    measureAtoms(atoms, m);
    const atomLines = breakLines(atoms, avail, m);
    listNumber++;

    atomLines.forEach((atomLine, lineIndex) => {
      // Content width: everything except trailing spaces (they hang).
      let end = atomLine.length;
      while (end > 0 && atomLine[end - 1]!.isSpace) end--;
      let width = 0;
      let innerSpaces = 0;
      for (let i = 0; i < end; i++) {
        width += atomLine[i]!.width;
        if (atomLine[i]!.isSpace) innerSpaces += atomLine[i]!.spaceCount;
      }

      const isLastLine = lineIndex === atomLines.length - 1;
      let offset = 0;
      let extraPerSpace = 0;
      switch (base.align) {
        case 'center':
          offset = (avail - width) / 2;
          break;
        case 'right':
          offset = avail - width;
          break;
        case 'justify':
          if (!isLastLine && innerSpaces > 0 && width < avail) {
            extraPerSpace = (avail - width) / innerSpaces;
          }
          break;
      }

      // Vertical metrics: CSS half-leading model with the block's strut.
      const strutLh = base.fontSize * lhFactor;
      const strutHalf = (strutLh - (strut.ascent + strut.descent)) / 2;
      let ascent = strut.ascent + strutHalf;
      let descent = strut.descent + strutHalf;

      const fragments: LayoutFragment[] = [];
      let x = indent + offset;
      for (let i = 0; i < end; i++) {
        const atom = atomLine[i]!;
        for (const f of atom.fragments) {
          const font = runFont(f.style);
          const fm = measurer.metrics(font);
          const lh = f.style.fontSize * lhFactor;
          const half = (lh - (fm.ascent + fm.descent)) / 2;
          ascent = Math.max(ascent, fm.ascent + half);
          descent = Math.max(descent, fm.descent + half);
          let fw = f.width;
          if (atom.isSpace && extraPerSpace) fw += extraPerSpace * graphemes(f.text).length;
          const prev = fragments[fragments.length - 1];
          if (prev && prev.style === f.style && !extraPerSpace) {
            prev.text += f.text;
            prev.width += fw;
          } else {
            fragments.push({
              text: f.text,
              x,
              width: fw,
              style: f.style,
              font,
              ascent: fm.ascent,
              descent: fm.descent,
            });
          }
          x += fw;
        }
      }

      const height = ascent + descent;
      let marker: LayoutFragment | null = null;
      if (isList && lineIndex === 0) {
        const text = base.list === 'bullet' ? '•' : `${listNumber}.`;
        marker = {
          text,
          x: base.fontSize * LIST_MARKER_EM,
          width: m.width(text, baseRun),
          style: baseRun,
          font: baseFont,
          ascent: strut.ascent,
          descent: strut.descent,
        };
      }
      lines.push({
        fragments,
        top: y,
        height,
        baseline: y + ascent,
        left: indent + offset,
        width: width + (extraPerSpace ? extraPerSpace * innerSpaces : 0),
        paragraph: pIndex,
        marker,
      });
      contentWidth = Math.max(contentWidth, width + indent);
      y += height;
    });
  });

  return { lines, width: boxWidth, height: y, contentWidth, letterSpacing: spacing };
}

/** Width the text needs to sit on one line per paragraph (used when inserting new text). */
export function naturalTextWidth(
  input: Omit<LayoutInput, 'width'>,
  measurer: TextMeasurer,
): number {
  const base = input.style;
  const m = new Measure(measurer, letterSpacingPx(base));
  const indent = base.list !== 'none' ? base.fontSize * LIST_INDENT_EM : 0;
  let max = 0;
  for (const pieces of toParagraphs(input.spans, base)) {
    let w = 0;
    for (const piece of pieces) w += m.width(piece.text, piece.style);
    max = Math.max(max, w);
  }
  return Math.ceil(max + indent + 1);
}
