import type { Point, Rect } from '@design-pad/core';

/** Pages are stacked vertically like Canva: header row, page, gap, ..., "Add page" button. */
export const LAYOUT = {
  padTop: 20,
  header: 44,
  gapBelow: 24,
  addPage: 72,
  padBottom: 48,
  padSide: 48,
};

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

export interface Camera {
  zoom: number;
  scrollX: number;
  scrollY: number;
  viewportW: number;
  viewportH: number;
  /** Keep re-fitting on resize until the user zooms manually. */
  fit: boolean;
}

export interface DocSize {
  width: number;
  height: number;
}

export function slotHeight(doc: DocSize, zoom: number): number {
  return LAYOUT.header + doc.height * zoom + LAYOUT.gapBelow;
}

export function contentSize(cam: Camera, doc: DocSize, pageCount: number, showAddPage: boolean) {
  const width = Math.max(cam.viewportW, doc.width * cam.zoom + LAYOUT.padSide * 2);
  const height =
    LAYOUT.padTop +
    pageCount * slotHeight(doc, cam.zoom) +
    (showAddPage ? LAYOUT.addPage : 0) +
    LAYOUT.padBottom;
  return { width, height };
}

/** Vertical offset that centres short content in the viewport. */
function offsetY(cam: Camera, doc: DocSize, pageCount: number, showAddPage: boolean): number {
  const { height } = contentSize(cam, doc, pageCount, showAddPage);
  return height < cam.viewportH ? (cam.viewportH - height) / 2 : 0;
}

export interface PageLayout {
  index: number;
  /** Page rectangle in screen (viewport) pixels. */
  rect: Rect;
  /** Header row above the page, screen pixels. */
  header: Rect;
}

export function pageLayout(
  cam: Camera,
  doc: DocSize,
  pageCount: number,
  index: number,
  showAddPage = true,
): PageLayout {
  const { width } = contentSize(cam, doc, pageCount, showAddPage);
  const w = doc.width * cam.zoom;
  const h = doc.height * cam.zoom;
  const x = (width - w) / 2 - cam.scrollX;
  const top =
    offsetY(cam, doc, pageCount, showAddPage) +
    LAYOUT.padTop +
    index * slotHeight(doc, cam.zoom) -
    cam.scrollY;
  return {
    index,
    header: { x, y: top, width: w, height: LAYOUT.header },
    rect: { x, y: top + LAYOUT.header, width: w, height: h },
  };
}

export function addPageButtonRect(cam: Camera, doc: DocSize, pageCount: number): Rect {
  const last = pageLayout(cam, doc, pageCount, pageCount - 1);
  return {
    x: last.rect.x,
    y: last.rect.y + last.rect.height + LAYOUT.gapBelow / 2,
    width: last.rect.width,
    height: LAYOUT.addPage - LAYOUT.gapBelow,
  };
}

/** Page index under (or nearest to) a screen point, plus the point in page coordinates. */
export function screenToPage(
  cam: Camera,
  doc: DocSize,
  pageCount: number,
  sx: number,
  sy: number,
): { index: number; point: Point; inside: boolean } {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pageCount; i++) {
    const { rect } = pageLayout(cam, doc, pageCount, i);
    const dy =
      sy < rect.y ? rect.y - sy : sy > rect.y + rect.height ? sy - (rect.y + rect.height) : 0;
    if (dy < bestDist) {
      bestDist = dy;
      best = i;
    }
    if (dy === 0) break;
  }
  const { rect } = pageLayout(cam, doc, pageCount, best);
  const point = { x: (sx - rect.x) / cam.zoom, y: (sy - rect.y) / cam.zoom };
  const inside = point.x >= 0 && point.y >= 0 && point.x <= doc.width && point.y <= doc.height;
  return { index: best, point, inside };
}

export function pageToScreen(
  cam: Camera,
  doc: DocSize,
  pageCount: number,
  index: number,
  p: Point,
): Point {
  const { rect } = pageLayout(cam, doc, pageCount, index);
  return { x: rect.x + p.x * cam.zoom, y: rect.y + p.y * cam.zoom };
}

export function fitZoom(doc: DocSize, viewportW: number, viewportH: number): number {
  const availW = Math.max(50, viewportW - LAYOUT.padSide * 2);
  const availH = Math.max(50, viewportH - LAYOUT.header - LAYOUT.padTop - 56);
  return clampZoom(Math.min(availW / doc.width, availH / doc.height));
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function clampScroll(cam: Camera, doc: DocSize, pageCount: number): Camera {
  const { width, height } = contentSize(cam, doc, pageCount, true);
  const maxX = Math.max(0, width - cam.viewportW);
  const maxY = Math.max(0, height - cam.viewportH);
  const scrollX = Math.min(maxX, Math.max(0, cam.scrollX));
  const scrollY = Math.min(maxY, Math.max(0, cam.scrollY));
  if (scrollX === cam.scrollX && scrollY === cam.scrollY) return cam;
  return { ...cam, scrollX, scrollY };
}

/** Change zoom keeping the page point under `anchor` (screen) fixed. */
export function zoomAt(
  cam: Camera,
  doc: DocSize,
  pageCount: number,
  zoom: number,
  anchor: Point,
): Camera {
  const z = clampZoom(zoom);
  if (z === cam.zoom) return cam;
  const hit = screenToPage(cam, doc, pageCount, anchor.x, anchor.y);
  const next: Camera = { ...cam, zoom: z, fit: false };
  const before = pageLayout(next, doc, pageCount, hit.index);
  // Where the anchor's page point lands with the new zoom at the current scroll:
  const landed = { x: before.rect.x + hit.point.x * z, y: before.rect.y + hit.point.y * z };
  next.scrollX += landed.x - anchor.x;
  next.scrollY += landed.y - anchor.y;
  return clampScroll(next, doc, pageCount);
}

/** Scroll so page `index` is at the top of the viewport. */
export function scrollToPage(cam: Camera, doc: DocSize, pageCount: number, index: number): Camera {
  const atZero = pageLayout({ ...cam, scrollY: 0 }, doc, pageCount, index);
  return clampScroll({ ...cam, scrollY: atZero.header.y - 8 }, doc, pageCount);
}

/** Scroll the minimum needed for a page to be fully visible (if it fits). */
export function revealPage(cam: Camera, doc: DocSize, pageCount: number, index: number): Camera {
  const { rect, header } = pageLayout(cam, doc, pageCount, index);
  if (header.y >= 0 && rect.y + rect.height <= cam.viewportH) return cam;
  return scrollToPage(cam, doc, pageCount, index);
}

/** Which pages intersect the viewport (with a margin). */
export function visiblePages(cam: Camera, doc: DocSize, pageCount: number, margin = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    const { rect } = pageLayout(cam, doc, pageCount, i);
    if (rect.y + rect.height >= -margin && rect.y <= cam.viewportH + margin) out.push(i);
  }
  return out;
}
