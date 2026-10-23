import { describe, expect, it } from 'vitest';
import {
  ApproximateTextMeasurer,
  createText,
  DEFAULT_TEXT_STYLE,
  layoutCurvedText,
  layoutStraightText,
  type TextMeasurer,
} from '../src';
import { makeEditor } from './helpers';

/** Monospace: every grapheme is 10px wide, ascent 8, descent 2 at size 10. */
const mono: TextMeasurer = {
  measure: (text, font, ls) => [...text].length * (font.size + ls),
  metrics: (font) => ({ ascent: font.size * 0.8, descent: font.size * 0.2 }),
  clear: () => {},
};

const style = { ...DEFAULT_TEXT_STYLE, fontSize: 10, lineHeight: 1, align: 'left' as const };

describe('layoutStraightText', () => {
  it('wraps at spaces and lets trailing spaces hang', () => {
    const l = layoutStraightText({ spans: [{ text: 'aaa bbb ccc' }], style, width: 75 }, mono);
    expect(l.lines.map((line) => line.fragments.map((f) => f.text).join(''))).toEqual([
      'aaa bbb',
      'ccc',
    ]);
    expect(l.lines[0]!.width).toBe(70);
    expect(l.height).toBe(20);
  });

  it('breaks words longer than the line', () => {
    const l = layoutStraightText({ spans: [{ text: 'abcdefghij' }], style, width: 40 }, mono);
    expect(l.lines.map((line) => line.fragments.map((f) => f.text).join(''))).toEqual([
      'abcd',
      'efgh',
      'ij',
    ]);
  });

  it('keeps paragraphs and empty lines', () => {
    const l = layoutStraightText({ spans: [{ text: 'a\n\nb' }], style, width: 100 }, mono);
    expect(l.lines).toHaveLength(3);
    expect(l.lines[1]!.fragments).toHaveLength(0);
  });

  it('centres and right-aligns lines', () => {
    const c = layoutStraightText(
      { spans: [{ text: 'ab' }], style: { ...style, align: 'center' }, width: 100 },
      mono,
    );
    expect(c.lines[0]!.left).toBe(40);
    const r = layoutStraightText(
      { spans: [{ text: 'ab' }], style: { ...style, align: 'right' }, width: 100 },
      mono,
    );
    expect(r.lines[0]!.left).toBe(80);
  });

  it('justifies all but the last line', () => {
    const l = layoutStraightText(
      { spans: [{ text: 'aa bb cc dd' }], style: { ...style, align: 'justify' }, width: 85 },
      mono,
    );
    expect(l.lines[0]!.width).toBeCloseTo(85);
    expect(l.lines[1]!.width).toBe(20);
  });

  it('grows the line box for larger inline runs (CSS half-leading)', () => {
    const l = layoutStraightText(
      { spans: [{ text: 'a' }, { text: 'B', style: { fontSize: 20 } }], style, width: 100 },
      mono,
    );
    // Strut: 10px line; the 20px run contributes ascent 16 + descent 4.
    expect(l.lines[0]!.height).toBe(20);
    expect(l.lines[0]!.baseline).toBe(16);
  });

  it('indents list paragraphs and numbers them', () => {
    const l = layoutStraightText(
      { spans: [{ text: 'one\ntwo' }], style: { ...style, list: 'number' }, width: 200 },
      mono,
    );
    expect(l.lines[0]!.marker?.text).toBe('1.');
    expect(l.lines[1]!.marker?.text).toBe('2.');
    expect(l.lines[0]!.left).toBe(15);
  });

  it('applies uppercase transform', () => {
    const l = layoutStraightText(
      { spans: [{ text: 'hey' }], style: { ...style, uppercase: true }, width: 100 },
      mono,
    );
    expect(l.lines[0]!.fragments[0]!.text).toBe('HEY');
  });

  it('adds letter spacing per character', () => {
    const l = layoutStraightText(
      { spans: [{ text: 'ab' }], style: { ...style, letterSpacing: 100 }, width: 100 },
      mono,
    );
    expect(l.lines[0]!.width).toBe(22);
  });
});

describe('curved text', () => {
  it('produces a box and one glyph per character', () => {
    const c = layoutCurvedText({ spans: [{ text: 'HELLO' }], style, curve: 50 }, mono);
    expect(c.glyphs).toHaveLength(5);
    expect(c.width).toBeGreaterThan(0);
    // Upward curve: outer glyphs sit lower than the middle one.
    expect(c.glyphs[0]!.y).toBeGreaterThan(c.glyphs[2]!.y);
  });
});

describe('editor text sync', () => {
  it('auto-sizes text height and keeps it in sync', () => {
    const editor = makeEditor();
    const id = editor.addElement(
      createText({ text: 'Hello world', width: 400, style: { fontSize: 20 } }),
    );
    const el = editor.getElement(id)!;
    expect(el.height).toBeGreaterThan(20);
    const h1 = el.height;
    editor.updateElement(id, { width: 60 });
    expect(editor.getElement(id)!.height).toBeGreaterThan(h1);
  });

  it('measures natural width for new text', () => {
    const editor = makeEditor();
    const w = editor.text.naturalWidth(createText({ text: 'Heading', style: { fontSize: 40 } }));
    expect(w).toBeGreaterThan(
      new ApproximateTextMeasurer().measure(
        'Heading',
        { family: 'x', size: 40, weight: 400, italic: false },
        0,
      ) - 1,
    );
  });
});
