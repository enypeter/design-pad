import {
  type AssetRecord,
  applyToPoint,
  type ClipboardPayload,
  coverCropForAsset,
  createElementId,
  createFrame,
  createGrid,
  createImageFill,
  DEFAULT_TEXT_STYLE,
  type DesignElement,
  type DesignFile,
  type ElementType,
  type ExportOptions,
  type ExportResult,
  exportDesign,
  gridCellRect,
  type Id,
  invert,
  isClipboardPayload,
  migrateDesignFile,
  type Point,
  scaleElementProps,
} from '@design-pad/core';
import { IMAGE_MIME } from './assets';
import { pageLayout } from './canvas/camera';
import type { PhotoResult, UploadedAsset } from './config';
import type { DesignPadContextValue } from './context';
import { showToast } from './state/ui';

type Ctx = DesignPadContextValue;

// -----------------------------------------------------------------------------
// Placement
// -----------------------------------------------------------------------------

/** Centre of the visible part of the current page (where Canva drops new elements). */
export function visibleCenter(ctx: Ctx): { pageId: Id; point: Point } {
  const { editor } = ctx;
  const cam = ctx.camera.get();
  const doc = editor.getDocument();
  const pages = editor.getPages();
  const pageId = editor.getCurrentPageId();
  const index = Math.max(
    0,
    pages.findIndex((p) => p.id === pageId),
  );
  const { rect } = pageLayout(cam, doc, pages.length, index);
  const x0 = Math.max(rect.x, 0);
  const y0 = Math.max(rect.y, 0);
  const x1 = Math.min(rect.x + rect.width, cam.viewportW);
  const y1 = Math.min(rect.y + rect.height, cam.viewportH);
  if (x1 <= x0 || y1 <= y0) return { pageId, point: { x: doc.width / 2, y: doc.height / 2 } };
  return {
    pageId,
    point: { x: ((x0 + x1) / 2 - rect.x) / cam.zoom, y: ((y0 + y1) / 2 - rect.y) / cam.zoom },
  };
}

/** Insert an element centred at a point (default: visible centre of the current page). */
export function insertElement(
  ctx: Ctx,
  init: Partial<DesignElement> & { type: ElementType },
  at?: { pageId: Id; point: Point },
): Id {
  const { editor } = ctx;
  const target = at ?? visibleCenter(ctx);
  const w = init.width ?? 100;
  const h = init.height ?? 100;
  editor.stopTextEditing();
  editor.stopCropping();
  const id = editor.createElements(
    [
      {
        ...init,
        x: target.point.x - w / 2,
        y: target.point.y - h / 2,
      } as Partial<DesignElement> & { type: ElementType },
    ],
    { pageId: target.pageId },
  )[0]!;
  ctx.viewport.current?.revealPage(target.pageId);
  return id;
}

/** Default size for a new image: fit inside half the page, keeping aspect. */
export function defaultImageSize(
  ctx: Ctx,
  w: number,
  h: number,
): { width: number; height: number } {
  const doc = ctx.editor.getDocument();
  const max = Math.min(doc.width, doc.height) * 0.5;
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(8, w * k), height: Math.max(8, h * k) };
}

// -----------------------------------------------------------------------------
// Assets & images
// -----------------------------------------------------------------------------

/** Register an uploaded/stock asset with the design. */
export function registerAsset(ctx: Ctx, asset: UploadedAsset): AssetRecord {
  const kind = asset.mime === 'image/svg+xml' ? 'svg' : 'image';
  const existing = ctx.editor.getAssets().find((a) => a.src === asset.src);
  if (existing) return existing;
  return ctx.editor.addAsset({
    kind,
    src: asset.src,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    name: asset.name,
  });
}

export interface DropTarget {
  id: Id;
  cell?: number;
}

/** Find a frame or grid cell under a page point, for drag-and-drop of images. */
export function findImageDropTarget(ctx: Ctx, pageId: Id, point: Point): DropTarget | null {
  const { editor } = ctx;
  const visit = (parentId: Id): DropTarget | null => {
    const children = editor.getChildren(parentId);
    for (let i = children.length - 1; i >= 0; i--) {
      const el = children[i]!;
      if (el.type === 'group') {
        const inner = visit(el.id);
        if (inner) return inner;
        continue;
      }
      if (el.type !== 'frame' && el.type !== 'grid') continue;
      if (el.locked) continue;
      const local = applyToPoint(invert(editor.getElementPageMatrix(el.id)), point);
      if (local.x < 0 || local.y < 0 || local.x > el.width || local.y > el.height) continue;
      if (el.type === 'frame') return { id: el.id };
      const cell = el.layout.findIndex((_, k) => {
        const r = gridCellRect(el, k);
        return (
          local.x >= r.x && local.y >= r.y && local.x <= r.x + r.width && local.y <= r.y + r.height
        );
      });
      if (cell >= 0) return { id: el.id, cell };
    }
    return null;
  };
  return visit(pageId);
}

/** Put an image asset into a frame or grid cell. */
export function fillTarget(ctx: Ctx, target: DropTarget, asset: AssetRecord): void {
  const { editor } = ctx;
  const el = editor.getElement(target.id);
  if (!el) return;
  if (el.type === 'frame') {
    editor.updateElement(el.id, {
      image: {
        assetId: asset.id,
        crop: coverCropForAsset(asset, el.width, el.height),
        flipX: false,
        flipY: false,
      },
    });
  } else if (el.type === 'grid' && target.cell !== undefined) {
    const r = gridCellRect(el, target.cell);
    const cells = el.cells.map((c, i) =>
      i === target.cell
        ? {
            ...c,
            image: {
              assetId: asset.id,
              crop: coverCropForAsset(asset, r.width, r.height),
              flipX: false,
              flipY: false,
            },
          }
        : c,
    );
    editor.updateElement(el.id, { cells });
  }
  editor.select([el.id]);
}

/** Insert an asset as an image (or SVG graphic), or into a frame/grid cell. */
export function insertAsset(
  ctx: Ctx,
  uploaded: UploadedAsset,
  opts: { at?: { pageId: Id; point: Point }; target?: DropTarget | null } = {},
): Id | null {
  const asset = registerAsset(ctx, uploaded);
  if (opts.target && asset.kind === 'image') {
    fillTarget(ctx, opts.target, asset);
    return opts.target.id;
  }
  const size = defaultImageSize(ctx, asset.width, asset.height);
  if (asset.kind === 'svg') {
    return insertElement(
      ctx,
      { type: 'svg', assetId: asset.id, ...size, colors: {} } as never,
      opts.at,
    );
  }
  return insertElement(
    ctx,
    {
      type: 'image',
      image: createImageFill(asset.id, asset.width, asset.height, size.width, size.height),
      ...size,
    } as never,
    opts.at,
  );
}

export function photoToUpload(photo: PhotoResult): UploadedAsset {
  return {
    id: photo.id,
    src: photo.url,
    mime: 'image/jpeg',
    width: photo.width,
    height: photo.height,
    name: photo.author ? `Photo by ${photo.author}` : 'Photo',
  };
}

/** Upload files through the host adapter and insert them. */
export async function uploadAndInsert(
  ctx: Ctx,
  files: File[],
  opts: { at?: { pageId: Id; point: Point }; target?: DropTarget | null; insert?: boolean } = {},
): Promise<UploadedAsset[]> {
  const images = files.filter((f) => IMAGE_MIME.test(f.type));
  if (!images.length) {
    if (files.length) showToast(ctx.ui, 'Only image files can be added', 'error');
    return [];
  }
  const out: UploadedAsset[] = [];
  for (const [i, file] of images.entries()) {
    try {
      const uploaded = await ctx.assets.upload(file);
      out.push(uploaded);
      if (opts.insert !== false) {
        const at =
          opts.at && i > 0
            ? { ...opts.at, point: { x: opts.at.point.x + i * 24, y: opts.at.point.y + i * 24 } }
            : opts.at;
        insertAsset(ctx, uploaded, { at, target: i === 0 ? opts.target : null });
      }
    } catch (err) {
      console.error(err);
      showToast(ctx.ui, `Could not upload ${file.name}`, 'error');
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Selection commands
// -----------------------------------------------------------------------------

export function deleteSelection(ctx: Ctx): void {
  const { editor } = ctx;
  const crop = editor.session.state.cropping;
  if (crop) {
    editor.stopCropping();
    return;
  }
  const ids = editor.getSelectedIds();
  if (!ids.length) return;
  if (editor.getSelectedElements().every((e) => e.locked)) {
    showToast(ctx.ui, 'Unlock the element to delete it');
    return;
  }
  editor.deleteElements(ids);
}

export function duplicateSelection(ctx: Ctx): void {
  const ids = ctx.editor.getSelectedIds();
  if (ids.length) ctx.editor.duplicateElements(ids);
}

export function toggleLock(ctx: Ctx): void {
  const sel = ctx.editor.getSelectedElements();
  if (!sel.length) return;
  ctx.editor.setLocked(
    sel.map((e) => e.id),
    !sel.every((e) => e.locked),
  );
}

// -----------------------------------------------------------------------------
// Clipboard
// -----------------------------------------------------------------------------

let internalClipboard: ClipboardPayload | null = null;
const MARKER = 'design-pad-clipboard:';

function encodePayload(payload: ClipboardPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodePayload(b64: string): ClipboardPayload | null {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return isClipboardPayload(value) ? value : null;
  } catch {
    return null;
  }
}

function plainText(payload: ClipboardPayload): string {
  return payload.elements
    .filter((e) => e.type === 'text')
    .map((e) => (e.type === 'text' ? e.spans.map((s) => s.text).join('') : ''))
    .join('\n');
}

/** Fill a copy/cut ClipboardEvent. Returns false if nothing is selected. */
export function writeClipboardEvent(ctx: Ctx, e: ClipboardEvent, cut: boolean): boolean {
  const payload = ctx.editor.copy();
  if (!payload || !e.clipboardData) return false;
  internalClipboard = payload;
  e.clipboardData.setData(
    'text/html',
    `<meta charset="utf-8"><span data-design-pad="${MARKER}${encodePayload(payload)}"></span>`,
  );
  e.clipboardData.setData('text/plain', plainText(payload) || ' ');
  e.preventDefault();
  if (cut) ctx.editor.deleteElements(payload.rootIds);
  return true;
}

/** Copy from a menu (no ClipboardEvent available). */
export function copySelection(ctx: Ctx, cut = false): void {
  const payload = ctx.editor.copy();
  if (!payload) return;
  internalClipboard = payload;
  const text = plainText(payload);
  if (text) void navigator.clipboard?.writeText(text).catch(() => undefined);
  if (cut) ctx.editor.deleteElements(payload.rootIds);
}

export function hasInternalClipboard(): boolean {
  return internalClipboard !== null;
}

export function pasteInternal(ctx: Ctx, at?: { pageId: Id; point: Point }): void {
  if (!internalClipboard) return;
  ctx.editor.paste(internalClipboard, at ? { pageId: at.pageId, at: at.point } : {});
}

/** Handle a paste event: design elements, image files, or plain text. */
export async function handlePasteEvent(ctx: Ctx, e: ClipboardEvent): Promise<void> {
  const data = e.clipboardData;
  if (!data) return;
  const html = data.getData('text/html');
  const m = html ? new RegExp(`${MARKER}([A-Za-z0-9+/=]+)`).exec(html) : null;
  if (m) {
    const payload = decodePayload(m[1]!);
    if (payload) {
      e.preventDefault();
      ctx.editor.paste(payload);
      return;
    }
  }
  const files = [...data.files].filter((f) => IMAGE_MIME.test(f.type));
  if (files.length) {
    e.preventDefault();
    await uploadAndInsert(ctx, files);
    return;
  }
  const text = data.getData('text/plain');
  if (text.trim()) {
    e.preventDefault();
    const { editor } = ctx;
    const doc = editor.getDocument();
    const fontSize = Math.round(Math.max(16, Math.min(doc.width, doc.height) * 0.03));
    const init = {
      type: 'text' as const,
      spans: [{ text }],
      style: { fontSize, align: 'left' as const },
    };
    const natural = editor.text.naturalWidth({
      spans: init.spans,
      style: { ...DEFAULT_TEXT_STYLE, fontSize, align: 'left' },
    });
    insertElement(ctx, { ...init, width: Math.min(doc.width * 0.8, natural) } as never);
  }
}

// -----------------------------------------------------------------------------
// Export / download
// -----------------------------------------------------------------------------

export function triggerDownload(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadDesign(
  ctx: Ctx,
  options: ExportOptions,
): Promise<ExportResult | null> {
  try {
    const result = await exportDesign(ctx.editor, options);
    const handled = await ctx.options.onExport?.(result, ctx.editor);
    if (handled !== false) triggerDownload(result);
    return result;
  } catch (err) {
    console.error(err);
    showToast(ctx.ui, err instanceof Error ? err.message : 'Export failed', 'error');
    return null;
  }
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

/**
 * Apply a template: its first page replaces the current page when that page
 * is empty, otherwise pages are added after it. Content is scaled to fit the
 * design size.
 */
export function applyTemplate(ctx: Ctx, input: DesignFile): void {
  const { editor } = ctx;
  const file = migrateDesignFile(input);
  const doc = editor.getDocument();
  const k = Math.min(doc.width / file.width, doc.height / file.height);
  const dx = (doc.width - file.width * k) / 2;
  const dy = (doc.height - file.height * k) / 2;
  for (const asset of file.assets) if (!editor.getAsset(asset.id)) editor.addAsset(asset);

  const subtree = (parentId: Id): DesignElement[] =>
    file.elements
      .filter((e) => e.parentId === parentId)
      .flatMap((e) => [e, ...(e.type === 'group' ? subtree(e.id) : [])]);

  editor.batch(() => {
    let pageId = editor.getCurrentPageId();
    const replaceCurrent = editor.getChildren(pageId).length === 0;
    file.pages.forEach((tplPage, i) => {
      if (i > 0 || !replaceCurrent) pageId = editor.addPage({ after: pageId }).id;
      editor.setPageBackground(pageId, tplPage.background);
      const els = subtree(tplPage.id);
      const idMap = new Map(els.map((el) => [el.id, createElementId()]));
      const clones = els.map((el) => {
        const isTop = el.parentId === tplPage.id;
        const scaled = k === 1 ? structuredClone(el) : scaleElementProps(structuredClone(el), k);
        return {
          ...scaled,
          id: idMap.get(el.id)!,
          parentId: isTop ? pageId : idMap.get(el.parentId)!,
          x: isTop ? el.x * k + dx : el.x * k,
          y: isTop ? el.y * k + dy : el.y * k,
        } as DesignElement;
      });
      editor.store.put(clones);
    });
  });
  editor.clearSelection();
}

/** Make an empty frame or grid quickly (used by the Elements panel). */
export function frameInit(shape: string, w: number, h: number) {
  return createFrame({ shape, width: w, height: h });
}

export function gridInit(
  layout: { x: number; y: number; width: number; height: number }[],
  w: number,
  h: number,
) {
  return createGrid({ layout, width: w, height: h });
}
