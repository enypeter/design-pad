import { zipSync } from 'fflate';
import { collectAssetIds, type Editor } from '../editor/Editor';
import type { DesignElement, Id } from '../model/types';
import { renderPage } from '../render/renderer';
import { resolveRunStyle } from '../text/layout';
import { buildImagePdf, type PdfPageImage, rgbaToRgb } from './pdf';

export type { PdfPageImage } from './pdf';
export { buildImagePdf, rgbaToRgb } from './pdf';

export type RasterFormat = 'png' | 'jpeg' | 'webp';
export type ExportFormat = RasterFormat | 'pdf' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  /** Pages to export, in document order. Default: all pages. */
  pageIds?: Id[];
  /** Raster scale: 1 = design pixels, 2 = double resolution. Default 1 (raster) / 2 (pdf). */
  scale?: number;
  /** JPEG/WebP quality 0..1. Default 0.92. */
  quality?: number;
  /** PNG only: leave the page background transparent. */
  transparent?: boolean;
  /** PDF only: raster resolution in dots per inch (overrides scale). */
  dpi?: number;
  /** PDF only: page image encoding. JPEG is far smaller; 'png' is lossless. */
  pdfImage?: 'jpeg' | 'png';
  /** Multi-page raster exports are zipped unless this is false (then only the first page is returned). */
  zip?: boolean;
  /** Max pixels per page canvas; larger exports are scaled down to fit. */
  maxPixels?: number;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mime: string;
  /** Effective raster scale (may be lower than requested if clamped). */
  scale: number;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  json: 'application/json',
};

const EXT: Record<ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  pdf: 'pdf',
  json: 'json',
};

/** Conservative default that stays under Safari's canvas limits. */
const DEFAULT_MAX_PIXELS = 16_777_216;

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export function safeFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|\p{Cc}]+/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return base || 'design';
}

function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document === 'undefined')
    throw new ExportError('Exporting needs a canvas implementation');
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function canvasToBlob(canvas: AnyCanvas, mime: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: mime, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new ExportError('Canvas encoding failed'))),
      mime,
      quality,
    ),
  );
}

function pageElements(editor: Editor, pageId: Id): DesignElement[] {
  const top = editor.getChildren(pageId);
  return [...top, ...top.flatMap((el) => editor.getDescendants(el.id))];
}

/** Load every font, image and SVG the pages use. Rejects images that cannot be exported. */
export async function preparePages(editor: Editor, pageIds: Id[]): Promise<void> {
  const elements = pageIds.flatMap((id) => pageElements(editor, id));
  const pages = pageIds.map((id) => editor.getPage(id)).filter((p) => !!p);

  const fontRequests = new Map<string, { family: string; weight: number; italic: boolean }>();
  let sample = '';
  for (const el of elements) {
    if (el.type !== 'text') continue;
    for (const span of [{ style: undefined }, ...el.spans]) {
      const s = resolveRunStyle(el.style, span.style);
      fontRequests.set(`${s.fontFamily}|${s.fontWeight}|${s.italic}`, {
        family: s.fontFamily,
        weight: s.fontWeight,
        italic: s.italic,
      });
    }
    for (const span of el.spans) sample += span.text;
  }
  await editor.fonts.loadAll([...fontRequests.values()], sample.slice(0, 500) || undefined);

  const assetIds = collectAssetIds([...pages, ...elements]);
  await editor.resources.whenReady(assetIds);
  await editor.resources.whenSvgImagesReady(
    elements.filter((e) => e.type === 'svg').map((e) => ({ assetId: e.assetId, colors: e.colors })),
  );
  for (const id of assetIds) {
    if (editor.resources.isTainted(id)) {
      const name = editor.getAsset(id)?.name ?? id;
      throw new ExportError(
        `"${name}" is hosted on a server that does not allow it to be exported (CORS).`,
      );
    }
  }
  // Let font-load listeners re-run text layout before drawing.
  await new Promise((r) => setTimeout(r, 0));
}

/** Render one page to a new canvas at `scale` device pixels per design unit. */
export function renderPageToCanvas(
  editor: Editor,
  pageId: Id,
  opts: { scale?: number; transparent?: boolean; maxPixels?: number } = {},
): { canvas: AnyCanvas; scale: number } {
  const page = editor.getPage(pageId);
  if (!page) throw new ExportError(`Page ${pageId} not found`);
  const doc = editor.getDocument();
  let scale = opts.scale ?? 1;
  const max = opts.maxPixels ?? DEFAULT_MAX_PIXELS;
  if (doc.width * doc.height * scale * scale > max)
    scale = Math.sqrt(max / (doc.width * doc.height));
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  ctx.setTransform(w / doc.width, 0, 0, h / doc.height, 0, 0);
  renderPage(ctx, editor, page, doc, {
    pixelRatio: scale,
    background: !opts.transparent,
    placeholders: false,
  });
  return { canvas, scale };
}

/** Export the design to a file. */
export async function exportDesign(editor: Editor, options: ExportOptions): Promise<ExportResult> {
  const doc = editor.getDocument();
  const name = safeFilename(doc.title);
  const format = options.format;
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(editor.toJSON(), null, 2)], { type: MIME.json });
    return { blob, filename: `${name}.json`, mime: MIME.json, scale: 1 };
  }

  const allPages = editor.getPages().map((p) => p.id);
  const pageIds = options.pageIds?.length
    ? allPages.filter((id) => options.pageIds!.includes(id))
    : allPages;
  if (!pageIds.length) throw new ExportError('No pages to export');
  await preparePages(editor, pageIds);

  if (format === 'pdf') {
    const scale = options.dpi ? options.dpi / doc.dpi : (options.scale ?? 2);
    const pdfPages: PdfPageImage[] = [];
    let effective = scale;
    for (const id of pageIds) {
      const { canvas, scale: s } = renderPageToCanvas(editor, id, {
        scale,
        maxPixels: options.maxPixels,
      });
      effective = s;
      const widthPt = (doc.width * 72) / doc.dpi;
      const heightPt = (doc.height * 72) / doc.dpi;
      if (options.pdfImage === 'png') {
        const ctx = canvas.getContext('2d') as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        pdfPages.push({
          widthPt,
          heightPt,
          image: {
            kind: 'rgb',
            data: rgbaToRgb(data.data),
            pixelWidth: canvas.width,
            pixelHeight: canvas.height,
          },
        });
      } else {
        const blob = await canvasToBlob(canvas, 'image/jpeg', options.quality ?? 0.92);
        pdfPages.push({
          widthPt,
          heightPt,
          image: {
            kind: 'jpeg',
            data: new Uint8Array(await blob.arrayBuffer()),
            pixelWidth: canvas.width,
            pixelHeight: canvas.height,
          },
        });
      }
    }
    const bytes = buildImagePdf(pdfPages, { title: doc.title, creator: 'Design Pad' });
    return {
      blob: new Blob([bytes as BlobPart], { type: MIME.pdf }),
      filename: `${name}.pdf`,
      mime: MIME.pdf,
      scale: effective,
    };
  }

  const mime = MIME[format];
  const quality = format === 'png' ? undefined : (options.quality ?? 0.92);
  const transparent = format === 'png' && !!options.transparent;
  const files: { name: string; blob: Blob }[] = [];
  let effective = options.scale ?? 1;
  const pages = options.zip === false ? pageIds.slice(0, 1) : pageIds;
  for (const [i, id] of pages.entries()) {
    const { canvas, scale } = renderPageToCanvas(editor, id, {
      scale: options.scale ?? 1,
      transparent,
      maxPixels: options.maxPixels,
    });
    effective = scale;
    const blob = await canvasToBlob(canvas, mime, quality);
    const suffix = pages.length > 1 ? `-${i + 1}` : '';
    files.push({ name: `${name}${suffix}.${EXT[format]}`, blob });
  }
  if (files.length === 1) {
    return { blob: files[0]!.blob, filename: files[0]!.name, mime, scale: effective };
  }
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files)
    entries[f.name] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  const zipped = zipSync(entries);
  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `${name}.zip`,
    mime: 'application/zip',
    scale: effective,
  };
}

/** Small PNG data URL of a page, for thumbnails. */
export async function pageThumbnail(editor: Editor, pageId: Id, maxSize = 320): Promise<Blob> {
  const doc = editor.getDocument();
  const scale = Math.min(1, maxSize / Math.max(doc.width, doc.height));
  await preparePages(editor, [pageId]).catch(() => undefined);
  const { canvas } = renderPageToCanvas(editor, pageId, { scale });
  return canvasToBlob(canvas, 'image/png');
}
