import type { AssetRecord, Id, ImageFill } from '../model/types';
import { isIdentityParams, processImage, resolveProcessParams } from './filters';
import { ensureSvgSize, extractSvgColors, recolorSvg, sanitizeSvg, svgToDataUrl } from './svg';

export type DrawableImage = CanvasImageSource & { width: number; height: number };

export interface ResourceManagerOptions {
  getAsset(id: Id): AssetRecord | undefined;
  /** Map an asset's `src` to a loadable URL (hosts with custom schemes or signed URLs). */
  resolveUrl?: (asset: AssetRecord) => string | Promise<string>;
}

interface ImageEntry {
  status: 'loading' | 'ready' | 'error';
  image: DrawableImage | null;
  /** True when the image could only be loaded without CORS (cannot be exported). */
  tainted: boolean;
  promise: Promise<void>;
}

interface SvgEntry {
  status: 'loading' | 'ready' | 'error';
  markup: string;
  colors: string[];
  width: number;
  height: number;
  promise: Promise<void>;
}

interface ProcessedEntry {
  image: DrawableImage;
  lastUsed: number;
}

const MAX_PROCESSED = 48;

function loadHtmlImage(url: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors && !url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      img
        .decode()
        .catch(() => undefined)
        .then(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`Failed to load image ${url.slice(0, 120)}`));
    img.src = url;
  });
}

/** Loads and caches bitmaps, SVGs and processed (filtered) images for rendering. */
export class ResourceManager {
  private images = new Map<string, ImageEntry>();
  private svgs = new Map<string, SvgEntry>();
  private svgImages = new Map<string, ImageEntry>();
  private processed = new Map<string, ProcessedEntry>();
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  private clock = 0;

  constructor(private opts: ResourceManagerOptions) {}

  /** Fired when something finished loading and a re-render may change the output. */
  onReady(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const l of [...this.listeners]) l();
    });
  }

  private async resolveUrl(asset: AssetRecord): Promise<string> {
    return this.opts.resolveUrl ? await this.opts.resolveUrl(asset) : asset.src;
  }

  // -- Bitmaps --------------------------------------------------------------

  private ensureImage(assetId: Id): ImageEntry | null {
    let entry = this.images.get(assetId);
    if (entry) return entry;
    const asset = this.opts.getAsset(assetId);
    if (!asset) return null;
    if (asset.kind === 'svg') {
      // SVG used as a bitmap source (e.g. image element with an SVG asset).
      return this.ensureSvgImage(assetId, {});
    }
    const e: ImageEntry = {
      status: 'loading',
      image: null,
      tainted: false,
      promise: Promise.resolve(),
    };
    e.promise = (async () => {
      const url = await this.resolveUrl(asset);
      try {
        e.image = await loadHtmlImage(url, true);
      } catch {
        // Retry without CORS so it at least displays; exports will refuse it.
        e.image = await loadHtmlImage(url, false);
        e.tainted = true;
      }
      e.status = 'ready';
    })()
      .catch((err) => {
        e.status = 'error';
        console.warn('[design-pad]', err);
      })
      .finally(() => this.notify());
    this.images.set(assetId, e);
    entry = e;
    return entry;
  }

  /** The decoded image, or null while it loads (a re-render is triggered when ready). */
  getImage(assetId: Id): DrawableImage | null {
    const entry = this.ensureImage(assetId);
    return entry?.status === 'ready' ? entry.image : null;
  }

  isTainted(assetId: Id): boolean {
    return this.images.get(assetId)?.tainted ?? false;
  }

  imageStatus(assetId: Id): 'loading' | 'ready' | 'error' | 'missing' {
    return this.ensureImage(assetId)?.status ?? 'missing';
  }

  async loadImage(assetId: Id): Promise<DrawableImage | null> {
    const entry = this.ensureImage(assetId);
    if (!entry) return null;
    await entry.promise;
    return entry.image;
  }

  // -- SVG ------------------------------------------------------------------

  private ensureSvg(assetId: Id): SvgEntry | null {
    let entry = this.svgs.get(assetId);
    if (entry) return entry;
    const asset = this.opts.getAsset(assetId);
    if (!asset) return null;
    const e: SvgEntry = {
      status: 'loading',
      markup: '',
      colors: [],
      width: 0,
      height: 0,
      promise: Promise.resolve(),
    };
    e.promise = (async () => {
      const url = await this.resolveUrl(asset);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load SVG (${res.status})`);
      const sized = ensureSvgSize(sanitizeSvg(await res.text()));
      e.markup = sized.markup;
      e.width = sized.width;
      e.height = sized.height;
      e.colors = extractSvgColors(sized.markup);
      e.status = 'ready';
    })()
      .catch((err) => {
        e.status = 'error';
        console.warn('[design-pad]', err);
      })
      .finally(() => this.notify());
    this.svgs.set(assetId, e);
    entry = e;
    return entry;
  }

  private ensureSvgImage(assetId: Id, colors: Record<string, string>): ImageEntry | null {
    const key = `${assetId}|${JSON.stringify(colors)}`;
    let entry = this.svgImages.get(key);
    if (entry) return entry;
    const svg = this.ensureSvg(assetId);
    if (!svg) return null;
    const e: ImageEntry = {
      status: 'loading',
      image: null,
      tainted: false,
      promise: Promise.resolve(),
    };
    e.promise = (async () => {
      await svg.promise;
      if (svg.status !== 'ready') throw new Error('SVG unavailable');
      e.image = await loadHtmlImage(svgToDataUrl(recolorSvg(svg.markup, colors)), false);
      e.status = 'ready';
    })()
      .catch(() => {
        e.status = 'error';
      })
      .finally(() => this.notify());
    if (this.svgImages.size > 200) this.svgImages.clear();
    this.svgImages.set(key, e);
    entry = e;
    return entry;
  }

  /** Recoloured SVG as an image, or null while loading. */
  getSvgImage(assetId: Id, colors: Record<string, string>): DrawableImage | null {
    const entry = this.ensureSvgImage(assetId, colors);
    return entry?.status === 'ready' ? entry.image : null;
  }

  /** Distinct colours in an SVG asset (empty while loading). */
  getSvgColors(assetId: Id): string[] {
    const entry = this.ensureSvg(assetId);
    return entry?.status === 'ready' ? entry.colors : [];
  }

  async loadSvg(
    assetId: Id,
  ): Promise<{ markup: string; colors: string[]; width: number; height: number } | null> {
    const entry = this.ensureSvg(assetId);
    if (!entry) return null;
    await entry.promise;
    return entry.status === 'ready' ? entry : null;
  }

  // -- Processed images -----------------------------------------------------

  /**
   * The image for an ImageFill with adjustments/filter applied, sized so a
   * crop region drawn at `displayWidth`×`displayHeight` device pixels stays
   * sharp. Falls back to the raw image while processing is impossible.
   */
  getFillImage(fill: ImageFill, displayWidth: number, displayHeight: number): DrawableImage | null {
    const base = this.getImage(fill.assetId);
    if (!base) return null;
    const params = resolveProcessParams(fill.adjustments, fill.filter);
    if (isIdentityParams(params)) return base;
    if (this.isTainted(fill.assetId)) return base;

    // Pixel size of the full image needed for this display size.
    const needW = displayWidth / Math.max(fill.crop.width, 1e-3);
    const needH = displayHeight / Math.max(fill.crop.height, 1e-3);
    const natW = base.width;
    const natH = base.height;
    const scale = Math.min(1, Math.max(needW / natW, needH / natH, 0.05));
    // Bucket the scale so small zoom changes reuse the same result.
    const bucket = Math.min(1, 2 ** Math.ceil(Math.log2(scale * 4)) / 4);
    const outW = Math.max(1, Math.round(natW * bucket));
    const outH = Math.max(1, Math.round(natH * bucket));
    const key = `${fill.assetId}|${outW}x${outH}|${JSON.stringify(params)}`;
    const hit = this.processed.get(key);
    if (hit) {
      hit.lastUsed = ++this.clock;
      return hit.image;
    }
    const result = processImage(base, outW, outH, params);
    if (!result) return base;
    this.processed.set(key, { image: result as DrawableImage, lastUsed: ++this.clock });
    this.evict();
    return result as DrawableImage;
  }

  private evict(): void {
    if (this.processed.size <= MAX_PROCESSED) return;
    const entries = [...this.processed.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key] of entries.slice(0, this.processed.size - MAX_PROCESSED))
      this.processed.delete(key);
  }

  /** Wait until the given assets are loaded (used before exporting). */
  async whenReady(assetIds: Iterable<Id>): Promise<void> {
    const waits: Promise<unknown>[] = [];
    for (const id of assetIds) {
      const asset = this.opts.getAsset(id);
      if (!asset) continue;
      if (asset.kind === 'svg') waits.push(this.ensureSvg(id)?.promise ?? Promise.resolve());
      else if (asset.kind === 'image')
        waits.push(this.ensureImage(id)?.promise ?? Promise.resolve());
    }
    await Promise.all(waits);
  }

  async whenSvgImagesReady(
    requests: Array<{ assetId: Id; colors: Record<string, string> }>,
  ): Promise<void> {
    await Promise.all(requests.map((r) => this.ensureSvgImage(r.assetId, r.colors)?.promise));
  }

  /** Forget cached data for an asset (e.g. after its src changed). */
  invalidate(assetId: Id): void {
    this.images.delete(assetId);
    this.svgs.delete(assetId);
    for (const key of [...this.svgImages.keys()])
      if (key.startsWith(`${assetId}|`)) this.svgImages.delete(key);
    for (const key of [...this.processed.keys()])
      if (key.startsWith(`${assetId}|`)) this.processed.delete(key);
  }
}
