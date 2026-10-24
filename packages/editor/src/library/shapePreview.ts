import { getShape, type PathSink } from '@design-pad/core';

const f = (n: number) => Math.round(n * 100) / 100;

/** PathSink that records SVG path data (for crisp previews and SVG export). */
export class SvgPathSink implements PathSink {
  d = '';
  private cx = 0;
  private cy = 0;
  private sx = 0;
  private sy = 0;
  private hasPoint = false;

  moveTo(x: number, y: number): void {
    this.d += `M${f(x)} ${f(y)}`;
    this.cx = this.sx = x;
    this.cy = this.sy = y;
    this.hasPoint = true;
  }

  lineTo(x: number, y: number): void {
    if (!this.hasPoint) {
      this.moveTo(x, y);
      return;
    }
    this.d += `L${f(x)} ${f(y)}`;
    this.cx = x;
    this.cy = y;
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.hasPoint) this.moveTo(c1x, c1y);
    this.d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x)} ${f(y)}`;
    this.cx = x;
    this.cy = y;
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.hasPoint) this.moveTo(cx, cy);
    this.d += `Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`;
    this.cx = x;
    this.cy = y;
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    if (!this.hasPoint) {
      this.moveTo(x1, y1);
      return;
    }
    const v1x = this.cx - x1;
    const v1y = this.cy - y1;
    const v2x = x2 - x1;
    const v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (r <= 0 || l1 < 1e-9 || l2 < 1e-9) {
      this.lineTo(x1, y1);
      return;
    }
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
    const angle = Math.acos(cos);
    if (angle < 1e-6 || Math.abs(angle - Math.PI) < 1e-6) {
      this.lineTo(x1, y1);
      return;
    }
    const t = r / Math.tan(angle / 2);
    const t1 = { x: x1 + (v1x / l1) * t, y: y1 + (v1y / l1) * t };
    const t2 = { x: x1 + (v2x / l2) * t, y: y1 + (v2y / l2) * t };
    const cross = -v1x * v2y - -v1y * v2x;
    const sweep = cross > 0 ? 1 : 0;
    this.lineTo(t1.x, t1.y);
    this.d += `A${f(r)} ${f(r)} 0 0 ${sweep} ${f(t2.x)} ${f(t2.y)}`;
    this.cx = t2.x;
    this.cy = t2.y;
  }

  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    _rotation: number,
    a0: number,
    a1: number,
    ccw = false,
  ): void {
    const p0 = { x: x + rx * Math.cos(a0), y: y + ry * Math.sin(a0) };
    if (this.hasPoint) this.lineTo(p0.x, p0.y);
    else this.moveTo(p0.x, p0.y);
    let sweepAngle = ccw ? a0 - a1 : a1 - a0;
    if (sweepAngle < 0) sweepAngle += Math.PI * 2;
    const flag = ccw ? 0 : 1;
    if (sweepAngle >= Math.PI * 2 - 1e-6) {
      const mid = a0 + (ccw ? -Math.PI : Math.PI);
      const pm = { x: x + rx * Math.cos(mid), y: y + ry * Math.sin(mid) };
      this.d += `A${f(rx)} ${f(ry)} 0 0 ${flag} ${f(pm.x)} ${f(pm.y)}A${f(rx)} ${f(ry)} 0 0 ${flag} ${f(p0.x)} ${f(p0.y)}`;
      this.cx = p0.x;
      this.cy = p0.y;
      return;
    }
    const p1 = { x: x + rx * Math.cos(a1), y: y + ry * Math.sin(a1) };
    this.d += `A${f(rx)} ${f(ry)} 0 ${sweepAngle > Math.PI ? 1 : 0} ${flag} ${f(p1.x)} ${f(p1.y)}`;
    this.cx = p1.x;
    this.cy = p1.y;
  }

  closePath(): void {
    this.d += 'Z';
    this.cx = this.sx;
    this.cy = this.sy;
  }
}

export function shapeSvgPath(id: string, w: number, h: number, radius = 0): string {
  const sink = new SvgPathSink();
  const def = getShape(id);
  def.path(sink, w, h, def.rounding ? radius : 0);
  return sink.d;
}
