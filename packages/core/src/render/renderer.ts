import type {
  DesignElement,
  DropShadow,
  FrameElement,
  GridElement,
  Id,
  ImageElement,
  ImageFill,
  LineCap,
  LineElement,
  PageRecord,
  PathElement,
  Rect,
  ShapeElement,
  Stroke,
  SvgElement,
  TextElement,
} from '../model/types';
import type { TextLayout } from '../text/engine';
import { fillStyle, isTransparentFill, withAlpha } from './paint';
import type { DrawableImage, ResourceManager } from './resources';
import { getShape, roundRectPath, shapeFillRule } from './shapes';
import { drawTextElement } from './text';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** What the renderer needs from the editor. */
export interface RenderSource {
  getChildren(parentId: Id): DesignElement[];
  readonly resources: ResourceManager;
  readonly text: { layout(el: TextElement): TextLayout };
}

export interface RenderOptions {
  /** Device pixels per design unit (zoom × devicePixelRatio, or export scale). */
  pixelRatio: number;
  /** Elements not to draw (e.g. the text being edited in the DOM). */
  skip?: ReadonlySet<Id>;
  /** Draw the page background. */
  background?: boolean;
  /** Draw placeholders for empty frames/grids and loading images. */
  placeholders?: boolean;
}

/** Cell rectangle of a grid in its local box, with the gap applied on inner edges. */
export function gridCellRect(
  el: Pick<GridElement, 'layout' | 'gap' | 'width' | 'height'>,
  index: number,
): Rect {
  const l = el.layout[index];
  if (!l) return { x: 0, y: 0, width: 0, height: 0 };
  const half = el.gap / 2;
  let x0 = l.x * el.width;
  let y0 = l.y * el.height;
  let x1 = (l.x + l.width) * el.width;
  let y1 = (l.y + l.height) * el.height;
  if (l.x > 1e-6) x0 += half;
  if (l.y > 1e-6) y0 += half;
  if (l.x + l.width < 1 - 1e-6) x1 -= half;
  if (l.y + l.height < 1 - 1e-6) y1 -= half;
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

function deviceScale(ctx: Ctx): number {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

function applyShadow(ctx: Ctx, shadow: DropShadow | null): void {
  if (!shadow || shadow.opacity <= 0) return;
  const m = ctx.getTransform();
  const a = (shadow.angle * Math.PI) / 180;
  const dx = Math.cos(a) * shadow.distance;
  const dy = Math.sin(a) * shadow.distance;
  ctx.shadowColor = withAlpha(shadow.color, shadow.opacity);
  ctx.shadowBlur = shadow.blur * deviceScale(ctx);
  ctx.shadowOffsetX = m.a * dx + m.c * dy;
  ctx.shadowOffsetY = m.b * dx + m.d * dy;
}

function clearShadow(ctx: Ctx): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function dashFor(stroke: Stroke): number[] {
  switch (stroke.dash) {
    case 'dashed':
      return [stroke.width * 3, stroke.width * 2];
    case 'dotted':
      return [0.001, stroke.width * 2];
    default:
      return [];
  }
}

/** Stroke drawn inside the path so borders never grow the element. */
function innerStroke(
  ctx: Ctx,
  path: Path2D,
  stroke: Stroke | null,
  rule: CanvasFillRule = 'nonzero',
): void {
  if (!stroke || stroke.width <= 0) return;
  ctx.save();
  ctx.clip(path, rule);
  ctx.lineWidth = stroke.width * 2;
  ctx.strokeStyle = stroke.color;
  ctx.setLineDash(dashFor(stroke).map((v) => v * 2));
  ctx.lineCap = stroke.dash === 'dotted' ? 'round' : 'butt';
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/** Draw an ImageFill covering the box (x, y, w, h) in the current local space. */
function drawImageFill(
  ctx: Ctx,
  src: RenderSource,
  fill: ImageFill,
  box: Rect,
  opts: RenderOptions,
): boolean {
  const scale = deviceScale(ctx);
  const img = src.resources.getFillImage(fill, box.width * scale, box.height * scale);
  if (!img) {
    if (opts.placeholders) {
      ctx.fillStyle = '#e9e9ee';
      ctx.fillRect(box.x, box.y, box.width, box.height);
    }
    return false;
  }
  drawCropped(ctx, img, fill, box);
  return true;
}

function drawCropped(ctx: Ctx, img: DrawableImage, fill: ImageFill, box: Rect): void {
  const iw = img.width;
  const ih = img.height;
  const sx = fill.crop.x * iw;
  const sy = fill.crop.y * ih;
  const sw = Math.max(1e-3, fill.crop.width * iw);
  const sh = Math.max(1e-3, fill.crop.height * ih);
  ctx.save();
  if (fill.flipX || fill.flipY) {
    ctx.translate(box.x + (fill.flipX ? box.width : 0), box.y + (fill.flipY ? box.height : 0));
    ctx.scale(fill.flipX ? -1 : 1, fill.flipY ? -1 : 1);
    ctx.translate(-box.x, -box.y);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // drawImage clips the source rect to the image; extend the destination accordingly so
  // crops that reach past the image edge (allowed while cropping) map correctly.
  const cx0 = Math.max(0, sx);
  const cy0 = Math.max(0, sy);
  const cx1 = Math.min(iw, sx + sw);
  const cy1 = Math.min(ih, sy + sh);
  if (cx1 > cx0 && cy1 > cy0) {
    const kx = box.width / sw;
    const ky = box.height / sh;
    ctx.drawImage(
      img,
      cx0,
      cy0,
      cx1 - cx0,
      cy1 - cy0,
      box.x + (cx0 - sx) * kx,
      box.y + (cy0 - sy) * ky,
      (cx1 - cx0) * kx,
      (cy1 - cy0) * ky,
    );
  }
  ctx.restore();
}

/** Small "picture" glyph for empty frames and grid cells. */
function placeholderIcon(ctx: Ctx, box: Rect): void {
  const s = Math.min(box.width, box.height) * 0.22;
  if (s < 6) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  ctx.save();
  ctx.fillStyle = '#b9bcc8';
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.55);
  ctx.lineTo(cx - s * 0.3, cy - s * 0.25);
  ctx.lineTo(cx + s * 0.1, cy + s * 0.2);
  ctx.lineTo(cx + s * 0.45, cy - s * 0.1);
  ctx.lineTo(cx + s, cy + s * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.45, cy - s * 0.55, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShape(ctx: Ctx, el: ShapeElement): void {
  const def = getShape(el.shape);
  const path = new Path2D();
  def.path(path, el.width, el.height, def.rounding ? el.cornerRadius : 0);
  const rule = shapeFillRule(el.shape);
  ctx.save();
  if (el.flipX || el.flipY) {
    ctx.translate(el.flipX ? el.width : 0, el.flipY ? el.height : 0);
    ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  }
  if (!isTransparentFill(el.fill)) {
    applyShadow(ctx, el.shadow);
    ctx.fillStyle = fillStyle(ctx, el.fill, el.width, el.height);
    ctx.fill(path, rule);
    clearShadow(ctx);
  }
  innerStroke(ctx, path, el.stroke, rule);
  ctx.restore();
}

function capLength(cap: LineCap, w: number): number {
  switch (cap) {
    case 'arrow':
    case 'triangle':
    case 'triangle-outline':
      return w * 2.5 + 4;
    case 'circle':
    case 'circle-outline':
    case 'square':
    case 'diamond':
      return w * 1.8 + 3;
    default:
      return 0;
  }
}

/** How far the stroke must stop short of the endpoint for a cap. */
function capInset(cap: LineCap, w: number): number {
  switch (cap) {
    case 'triangle':
    case 'triangle-outline':
      return capLength(cap, w) * 0.85;
    case 'circle':
    case 'circle-outline':
    case 'square':
    case 'diamond':
      return capLength(cap, w) / 2;
    default:
      return 0;
  }
}

/** Draw a cap at (x, y) pointing in direction `dir` (+1 = right, -1 = left). */
function drawCap(
  ctx: Ctx,
  cap: LineCap,
  x: number,
  y: number,
  dir: number,
  w: number,
  color: string,
): void {
  if (cap === 'none') return;
  const L = capLength(cap, w);
  const half = cap === 'arrow' ? L * 0.6 : L * 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  switch (cap) {
    case 'arrow':
      ctx.moveTo(-L, -half);
      ctx.lineTo(0, 0);
      ctx.lineTo(-L, half);
      ctx.stroke();
      break;
    case 'triangle':
    case 'triangle-outline':
      ctx.moveTo(0, 0);
      ctx.lineTo(-L, -half);
      ctx.lineTo(-L, half);
      ctx.closePath();
      if (cap === 'triangle') ctx.fill();
      else ctx.stroke();
      break;
    case 'circle':
    case 'circle-outline':
      ctx.arc(-L / 2, 0, L / 2, 0, Math.PI * 2);
      if (cap === 'circle') ctx.fill();
      else ctx.stroke();
      break;
    case 'square':
      ctx.rect(-L, -L / 2, L, L);
      ctx.fill();
      break;
    case 'diamond':
      ctx.moveTo(0, 0);
      ctx.lineTo(-L / 2, -L / 2);
      ctx.lineTo(-L, 0);
      ctx.lineTo(-L / 2, L / 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bar':
      ctx.moveTo(0, -w * 2.2);
      ctx.lineTo(0, w * 2.2);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawLine(ctx: Ctx, el: LineElement): void {
  const { stroke } = el;
  const y = el.height / 2;
  const w = stroke.width;
  const x0 = capInset(el.startCap, w);
  const x1 = el.width - capInset(el.endCap, w);
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = w;
  ctx.lineCap = stroke.dash === 'dotted' ? 'round' : 'butt';
  ctx.setLineDash(dashFor(stroke));
  if (x1 > x0) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  drawCap(ctx, el.startCap, 0, y, -1, w, stroke.color);
  drawCap(ctx, el.endCap, el.width, y, 1, w, stroke.color);
  ctx.restore();
}

function drawImageElement(
  ctx: Ctx,
  src: RenderSource,
  el: ImageElement,
  opts: RenderOptions,
): void {
  const box = { x: 0, y: 0, width: el.width, height: el.height };
  const radius = Math.min(el.cornerRadius, el.width / 2, el.height / 2);
  const path = new Path2D();
  roundRectPath(path, 0, 0, el.width, el.height, radius);
  if (el.shadow && el.shadow.opacity > 0) {
    const scale = deviceScale(ctx);
    const img = src.resources.getFillImage(el.image, el.width * scale, el.height * scale);
    ctx.save();
    applyShadow(ctx, el.shadow);
    if (radius === 0 && img) {
      // Unclipped: the shadow follows the image's alpha (stickers, cut-outs).
      drawCropped(ctx, img, el.image, box);
      ctx.restore();
      innerStroke(ctx, path, el.stroke);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fill(path);
    ctx.restore();
  }
  ctx.save();
  if (radius > 0) ctx.clip(path);
  drawImageFill(ctx, src, el.image, box, opts);
  ctx.restore();
  innerStroke(ctx, path, el.stroke);
}

function drawFrame(ctx: Ctx, src: RenderSource, el: FrameElement, opts: RenderOptions): void {
  const def = getShape(el.shape);
  const path = new Path2D();
  def.path(path, el.width, el.height, def.rounding ? el.cornerRadius : 0);
  const rule = shapeFillRule(el.shape);
  const box = { x: 0, y: 0, width: el.width, height: el.height };
  ctx.save();
  ctx.clip(path, rule);
  if (el.image) {
    const drawn = drawImageFill(ctx, src, el.image, box, opts);
    if (!drawn && !opts.placeholders) {
      ctx.fillStyle = el.color;
      ctx.fill(path, rule);
    }
  } else if (opts.placeholders) {
    ctx.fillStyle = el.color;
    ctx.fillRect(0, 0, el.width, el.height);
    placeholderIcon(ctx, box);
  }
  ctx.restore();
  innerStroke(ctx, path, el.stroke, rule);
}

function drawGrid(ctx: Ctx, src: RenderSource, el: GridElement, opts: RenderOptions): void {
  el.layout.forEach((_, i) => {
    const cell = el.cells[i] ?? { image: null, color: '#e6e6e9' };
    const r = gridCellRect(el, i);
    if (r.width <= 0 || r.height <= 0) return;
    const path = new Path2D();
    roundRectPath(path, r.x, r.y, r.width, r.height, el.cornerRadius);
    ctx.save();
    ctx.clip(path);
    if (cell.image) {
      drawImageFill(ctx, src, cell.image, r, opts);
    } else {
      ctx.fillStyle = cell.color;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      if (opts.placeholders) placeholderIcon(ctx, r);
    }
    ctx.restore();
  });
}

function drawSvg(ctx: Ctx, src: RenderSource, el: SvgElement): void {
  const img = src.resources.getSvgImage(el.assetId, el.colors);
  if (!img) return;
  ctx.save();
  if (el.flipX || el.flipY) {
    ctx.translate(el.flipX ? el.width : 0, el.flipY ? el.height : 0);
    ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  }
  applyShadow(ctx, el.shadow);
  ctx.drawImage(img, 0, 0, el.width, el.height);
  ctx.restore();
}

const pathCache = new Map<string, Path2D>();

function drawPath(ctx: Ctx, el: PathElement): void {
  let p = pathCache.get(el.d);
  if (!p) {
    p = new Path2D(el.d);
    if (pathCache.size > 500) pathCache.clear();
    pathCache.set(el.d, p);
  }
  ctx.save();
  if (el.flipX || el.flipY) {
    ctx.translate(el.flipX ? el.width : 0, el.flipY ? el.height : 0);
    ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  }
  const sx = el.width / Math.max(el.pathWidth, 1e-6);
  const sy = el.height / Math.max(el.pathHeight, 1e-6);
  ctx.scale(sx, sy);
  if (el.fill && !isTransparentFill(el.fill)) {
    ctx.fillStyle = fillStyle(ctx, el.fill, el.pathWidth, el.pathHeight);
    ctx.fill(p);
  }
  if (el.stroke && el.stroke.width > 0) {
    ctx.lineWidth = el.stroke.width / Math.sqrt(Math.abs(sx * sy));
    ctx.strokeStyle = el.stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashFor(el.stroke));
    ctx.stroke(p);
  }
  ctx.restore();
}

export function renderElement(
  ctx: Ctx,
  src: RenderSource,
  el: DesignElement,
  opts: RenderOptions,
): void {
  if (opts.skip?.has(el.id)) return;
  if (el.opacity <= 0) return;
  ctx.save();
  if (el.rotation) {
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-el.width / 2, -el.height / 2);
  } else {
    ctx.translate(el.x, el.y);
  }
  ctx.globalAlpha *= el.opacity;
  switch (el.type) {
    case 'text':
      drawTextElement(ctx, el, src.text.layout(el));
      break;
    case 'shape':
      drawShape(ctx, el);
      break;
    case 'line':
      drawLine(ctx, el);
      break;
    case 'image':
      drawImageElement(ctx, src, el, opts);
      break;
    case 'frame':
      drawFrame(ctx, src, el, opts);
      break;
    case 'grid':
      drawGrid(ctx, src, el, opts);
      break;
    case 'svg':
      drawSvg(ctx, src, el);
      break;
    case 'path':
      drawPath(ctx, el);
      break;
    case 'group':
      for (const child of src.getChildren(el.id)) renderElement(ctx, src, child, opts);
      break;
  }
  ctx.restore();
}

/** Draw a page (background and elements) into the current transform, in page units. */
export function renderPage(
  ctx: Ctx,
  src: RenderSource,
  page: PageRecord,
  size: { width: number; height: number },
  opts: RenderOptions,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size.width, size.height);
  ctx.clip();
  if (opts.background !== false) {
    const bg = page.background;
    ctx.fillStyle = fillStyle(ctx, bg.fill, size.width, size.height);
    ctx.fillRect(0, 0, size.width, size.height);
    if (bg.image)
      drawImageFill(ctx, src, bg.image, { x: 0, y: 0, ...size }, { ...opts, placeholders: false });
  }
  for (const el of src.getChildren(page.id)) renderElement(ctx, src, el, opts);
  ctx.restore();
}
