import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildImagePdf,
  colorOp,
  ensureSvgSize,
  extractSvgColors,
  gridCellRect,
  isIdentityParams,
  linearGradientPoints,
  normalizeColor,
  type PathSink,
  polygonPath,
  processPixels,
  recolorSvg,
  resolveProcessParams,
  SHAPES,
  sanitizeSvg,
} from '../src';

class RecordingSink implements PathSink {
  ops: string[] = [];
  moveTo(x: number, y: number) {
    this.ops.push(`M${x},${y}`);
  }
  lineTo(x: number, y: number) {
    this.ops.push(`L${x},${y}`);
  }
  bezierCurveTo() {
    this.ops.push('C');
  }
  quadraticCurveTo() {
    this.ops.push('Q');
  }
  arcTo() {
    this.ops.push('A');
  }
  ellipse() {
    this.ops.push('E');
  }
  closePath() {
    this.ops.push('Z');
  }
}

describe('shapes', () => {
  it('every shape produces a closed path', () => {
    for (const shape of SHAPES) {
      const sink = new RecordingSink();
      shape.path(sink, 100, 80, shape.rounding ? 10 : 0);
      expect(sink.ops.length, shape.id).toBeGreaterThan(1);
      expect(sink.ops.includes('Z'), shape.id).toBe(true);
    }
  });

  it('rounds polygon corners with arcTo', () => {
    const sink = new RecordingSink();
    polygonPath(sink, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2);
    expect(sink.ops.filter((o) => o === 'A')).toHaveLength(3);
  });

  it('has unique ids', () => {
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length);
  });
});

describe('paint', () => {
  it('maps CSS gradient angles', () => {
    const p = linearGradientPoints(90, 200, 100);
    expect(p.x0).toBeCloseTo(0);
    expect(p.y0).toBeCloseTo(50);
    expect(p.x1).toBeCloseTo(200);
    expect(p.y1).toBeCloseTo(50);
    const q = linearGradientPoints(180, 200, 100);
    expect(q.x0).toBeCloseTo(100);
    expect(q.y0).toBeCloseTo(0);
    expect(q.y1).toBeCloseTo(100);
  });
});

describe('grid cells', () => {
  it('applies the gap only between cells', () => {
    const grid = {
      width: 200,
      height: 100,
      gap: 10,
      layout: [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.5, height: 1 },
      ],
    };
    expect(gridCellRect(grid, 0)).toEqual({ x: 0, y: 0, width: 95, height: 100 });
    expect(gridCellRect(grid, 1)).toEqual({ x: 105, y: 0, width: 95, height: 100 });
  });
});

describe('svg utilities', () => {
  const svg =
    '<svg viewBox="0 0 24 12"><path fill="#F00" d="M0 0h1"/><circle style="fill: rgb(0, 0, 255)"/><rect fill="none"/></svg>';

  it('normalizes colours', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('rgb(255, 0, 10)')).toBe('#ff000a');
    expect(normalizeColor('white')).toBe('#ffffff');
    expect(normalizeColor('none')).toBeNull();
  });

  it('extracts and replaces colours', () => {
    expect(extractSvgColors(svg)).toEqual(['#ff0000', '#0000ff']);
    const out = recolorSvg(svg, { '#ff0000': '#00ff00' });
    expect(extractSvgColors(out)).toEqual(['#00ff00', '#0000ff']);
  });

  it('adds intrinsic size from the viewBox', () => {
    const r = ensureSvgSize(svg);
    expect(r.width).toBe(24);
    expect(r.height).toBe(12);
    expect(r.markup).toContain('width="24"');
    expect(r.markup).toContain('xmlns=');
  });

  it('strips scripts and handlers', () => {
    const dirty = '<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:x"><rect/></a></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('alert');
    expect(clean).not.toContain('javascript:');
  });
});

describe('image pipeline', () => {
  it('neutral params are identity', () => {
    const p = resolveProcessParams({}, null);
    expect(isIdentityParams(p)).toBe(true);
    const px = new Uint8ClampedArray([10, 120, 240, 255]);
    processPixels(px, 1, 1, p);
    expect([...px]).toEqual([10, 120, 240, 255]);
  });

  it('scales a filter by intensity', () => {
    const full = resolveProcessParams({}, { name: 'mono', intensity: 100 });
    const half = resolveProcessParams({}, { name: 'mono', intensity: 50 });
    expect(full.grayscale).toBe(1);
    expect(half.grayscale).toBe(0.5);
  });

  it('brightness and saturation move pixels the right way', () => {
    const base = resolveProcessParams({}, null);
    const [r0] = colorOp([0.5, 0.5, 0.5], 0.5, 0.5, base);
    const [r1] = colorOp([0.5, 0.5, 0.5], 0.5, 0.5, { ...base, brightness: 0.5 });
    expect(r1).toBeGreaterThan(r0);
    const desat = colorOp([0.9, 0.1, 0.1], 0.5, 0.5, { ...base, saturation: -1 });
    expect(Math.abs(desat[0] - desat[1])).toBeLessThan(1e-6);
  });

  it('vignette darkens corners more than the centre', () => {
    const p = { ...resolveProcessParams({}, null), vignette: 1 };
    const centre = colorOp([0.8, 0.8, 0.8], 0.5, 0.5, p);
    const corner = colorOp([0.8, 0.8, 0.8], 0, 0, p);
    expect(corner[0]).toBeLessThan(centre[0]);
  });
});

describe('pdf writer', () => {
  it('writes a structurally valid PDF with a correct xref', () => {
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    const bytes = buildImagePdf(
      [{ widthPt: 72, heightPt: 36, image: { kind: 'rgb', data: rgb, pixelWidth: 2, pixelHeight: 2 } }],
      { title: 'Café ☕' },
    );
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 72 36]');

    // Every xref offset must point at "n 0 obj".
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    const xref = text.slice(startxref);
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBe(6);
    offsets.forEach((off, i) => {
      expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });

    // The image stream inflates back to the pixels.
    const start = text.indexOf('stream\n', text.indexOf('/Subtype /Image')) + 7;
    const len = Number(/\/Subtype \/Image[^>]*\/Length (\d+)/.exec(text)![1]);
    expect([...unzlibSync(bytes.slice(start, start + len))]).toEqual([...rgb]);
    // Non-ASCII titles are UTF-16 hex strings.
    expect(text).toContain('/Title <FEFF');
  });
});
