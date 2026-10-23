import { describe, expect, it } from 'vitest';
import { boxBounds, boxCorners, resizeBox, snapAngle, snapMove } from '../src';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('resizeBox', () => {
  it('keeps the opposite corner fixed (unrotated)', () => {
    const r = resizeBox({ x: 10, y: 10, width: 100, height: 50, rotation: 0 }, 'se', {
      x: 210,
      y: 110,
    });
    expect(r).toMatchObject({ x: 10, y: 10, width: 200, height: 100 });
  });

  it('keeps the opposite corner fixed when rotated', () => {
    const start = { x: 0, y: 0, width: 100, height: 100, rotation: 30 };
    const anchor = boxCorners(start)[0]!; // nw stays put when dragging se
    const r = resizeBox(start, 'se', { x: 150, y: 150 });
    const after = boxCorners(r)[0]!;
    close(after.x, anchor.x);
    close(after.y, anchor.y);
  });

  it('preserves aspect ratio on corners', () => {
    const r = resizeBox(
      { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
      'se',
      { x: 400, y: 120 },
      { keepAspect: true },
    );
    close(r.width / r.height, 2);
  });

  it('resizes from centre', () => {
    const r = resizeBox(
      { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      'e',
      { x: 150, y: 50 },
      { fromCenter: true },
    );
    expect(r).toMatchObject({ x: -50, width: 200, height: 100 });
  });

  it('clamps to minimum size', () => {
    const r = resizeBox(
      { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      'w',
      { x: 500, y: 50 },
      { minWidth: 10 },
    );
    expect(r.width).toBe(10);
    expect(r.x).toBe(90);
  });
});

describe('bounds', () => {
  it('computes rotated bounds', () => {
    const b = boxBounds({ x: 0, y: 0, width: 100, height: 100, rotation: 45 });
    close(b.width, Math.SQRT2 * 100);
  });
});

describe('snapping', () => {
  it('snaps edges and centres within threshold', () => {
    const res = snapMove(
      { x: 103, y: 50, width: 40, height: 40 },
      [{ rect: { x: 0, y: 0, width: 100, height: 400 }, kind: 'element' }],
      { threshold: 5 },
    );
    expect(res.dx).toBe(-3);
    expect(res.guides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
  });

  it('snaps angles near multiples of 45', () => {
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(80)).toBe(80);
    expect(snapAngle(80, 15, 0, true)).toBe(75);
  });
});
