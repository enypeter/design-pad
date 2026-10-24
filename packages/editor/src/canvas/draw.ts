import {
  boxMatrix,
  type Editor,
  gridCellRect,
  type Id,
  type ImageFill,
  imageRectFromCrop,
  type Mat,
  multiply,
  renderPage,
} from '@design-pad/core';
import { type Camera, pageLayout, visiblePages } from './camera';

type Ctx = CanvasRenderingContext2D;

export const WORKSPACE_BG = '#ebecf0';

/** The image fill being cropped and the window it sits in (local to the element). */
export function cropContext(editor: Editor): {
  id: Id;
  fill: ImageFill;
  window: { x: number; y: number; width: number; height: number };
} | null {
  const c = editor.session.state.cropping;
  if (!c) return null;
  const el = editor.getElement(c.id);
  if (!el) return null;
  if (el.type === 'image')
    return {
      id: el.id,
      fill: el.image,
      window: { x: 0, y: 0, width: el.width, height: el.height },
    };
  if (el.type === 'frame' && el.image)
    return {
      id: el.id,
      fill: el.image,
      window: { x: 0, y: 0, width: el.width, height: el.height },
    };
  if (el.type === 'grid' && c.cell !== undefined) {
    const image = el.cells[c.cell]?.image;
    if (image) return { id: el.id, fill: image, window: gridCellRect(el, c.cell) };
  }
  return null;
}

function setMatrix(ctx: Ctx, m: Mat): void {
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}

/** Paint the whole viewport: page shadows, page content, crop ghost. */
export function drawViewport(
  canvas: HTMLCanvasElement,
  editor: Editor,
  cam: Camera,
  dpr: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = Math.max(1, Math.round(cam.viewportW * dpr));
  const h = Math.max(1, Math.round(cam.viewportH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const doc = editor.getDocument();
  const pages = editor.getPages();
  const s = editor.session.state;
  const skip = new Set<Id>();
  if (s.editingId) skip.add(s.editingId);
  const crop = cropContext(editor);

  for (const i of visiblePages(cam, doc, pages.length)) {
    const page = pages[i]!;
    const { rect } = pageLayout(cam, doc, pages.length, i);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.shadowColor = 'rgba(15, 20, 40, 0.14)';
    ctx.shadowBlur = 6 * dpr;
    ctx.shadowOffsetY = 1 * dpr;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();

    const pageM: Mat = {
      a: dpr * cam.zoom,
      b: 0,
      c: 0,
      d: dpr * cam.zoom,
      e: dpr * rect.x,
      f: dpr * rect.y,
    };
    setMatrix(ctx, pageM);
    renderPage(ctx, editor, page, doc, { pixelRatio: dpr * cam.zoom, skip, placeholders: true });

    // Crop mode: show the whole image, dimmed, around the crop window.
    if (crop && editor.getPageIdOf(crop.id) === page.id) {
      const w = crop.window;
      const r = imageRectFromCrop(crop.fill.crop, w.width, w.height);
      const scale = dpr * cam.zoom;
      // The filtered image, so the dimmed surroundings match the visible part.
      const img = editor.resources.getFillImage(
        { ...crop.fill, crop: { x: 0, y: 0, width: 1, height: 1 } },
        r.width * scale,
        r.height * scale,
      );
      if (img) {
        const m = multiply(
          pageM,
          multiply(editor.getParentPageMatrix(crop.id), boxMatrix(editor.getElement(crop.id)!)),
        );
        setMatrix(ctx, m);
        ctx.save();
        ctx.translate(w.x, w.y);
        // Only paint outside the crop window: even-odd clip of (image rect) minus (window).
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.width, r.height);
        ctx.rect(0, 0, w.width, w.height);
        ctx.clip('evenodd');
        if (crop.fill.flipX || crop.fill.flipY) {
          ctx.translate(crop.fill.flipX ? w.width : 0, crop.fill.flipY ? w.height : 0);
          ctx.scale(crop.fill.flipX ? -1 : 1, crop.fill.flipY ? -1 : 1);
        }
        ctx.globalAlpha = 0.42;
        ctx.drawImage(img, r.x, r.y, r.width, r.height);
        ctx.restore();
      }
    }
  }
}
