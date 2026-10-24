import { DEFAULT_FONT_CATALOG, type FontFamilyDef, type FontVariant } from './catalog';
import { quoteFamily } from './measure';

export interface FontRequest {
  family: string;
  weight: number;
  italic: boolean;
}

const keyOf = (r: FontRequest) => `${r.family}|${r.weight}|${r.italic ? 1 : 0}`;

/**
 * Loads web fonts into `document.fonts` so both the canvas renderer and the
 * DOM text editor can use them. Without a DOM (Node, tests) it is inert.
 */
export class FontManager {
  private families = new Map<string, FontFamilyDef>();
  private loaded = new Set<string>();
  private loading = new Map<string, Promise<void>>();
  private stylesheets = new Map<string, Promise<void>>();
  private faces = new Set<string>();
  private listeners = new Set<() => void>();
  private notifyScheduled = false;
  private readonly doc: Document | null;

  constructor(catalog: FontFamilyDef[] = DEFAULT_FONT_CATALOG, doc?: Document | null) {
    this.doc = doc !== undefined ? doc : typeof document !== 'undefined' ? document : null;
    for (const def of catalog) this.families.set(def.family, def);
    // Fonts the browser loads lazily (e.g. extra unicode ranges) also need a re-layout.
    this.doc?.fonts?.addEventListener?.('loadingdone', () => this.scheduleNotify());
  }

  get available(): boolean {
    return !!this.doc?.fonts;
  }

  getFamilies(): FontFamilyDef[] {
    return [...this.families.values()];
  }

  getFamily(family: string): FontFamilyDef | undefined {
    return this.families.get(family);
  }

  register(def: FontFamilyDef): void {
    this.families.set(def.family, def);
    // Forget earlier attempts made before the family was known.
    for (const key of [...this.loaded])
      if (key.startsWith(`${def.family}|`)) this.loaded.delete(key);
    this.scheduleNotify();
  }

  /** Called whenever a font face becomes usable. */
  onLoad(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private scheduleNotify(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      for (const l of [...this.listeners]) l();
    });
  }

  /** The face the browser will use for a request: nearest weight, italic if available. */
  resolveVariant(family: string, weight: number, italic: boolean): FontVariant {
    const def = this.families.get(family);
    if (!def || def.variants.length === 0) return { weight, italic };
    const pool = def.variants.filter((v) => v.italic === italic);
    const candidates = pool.length ? pool : def.variants;
    let best = candidates[0]!;
    for (const v of candidates) {
      if (Math.abs(v.weight - weight) < Math.abs(best.weight - weight)) best = v;
    }
    return best;
  }

  isLoaded(req: FontRequest): boolean {
    if (!this.available) return true;
    return this.loaded.has(keyOf(req));
  }

  /** Load one face. Resolves when it is usable (or failed, in which case a fallback renders). */
  load(req: FontRequest, sampleText?: string): Promise<void> {
    if (!this.available) return Promise.resolve();
    const key = keyOf(req);
    if (this.loaded.has(key) && !sampleText) return Promise.resolve();
    const pending = this.loading.get(key);
    if (pending && !sampleText) return pending;
    const promise = this.doLoad(req, sampleText)
      .catch(() => {
        // Missing faces fall back to a system font; nothing else to do.
      })
      .finally(() => {
        this.loaded.add(key);
        this.loading.delete(key);
        this.scheduleNotify();
      });
    this.loading.set(key, promise);
    return promise;
  }

  loadAll(requests: FontRequest[], sampleText?: string): Promise<void> {
    return Promise.all(requests.map((r) => this.load(r, sampleText))).then(() => undefined);
  }

  private async doLoad(req: FontRequest, sampleText?: string): Promise<void> {
    const def = this.families.get(req.family);
    if (def?.files?.length) await this.addFaces(def);
    else if (def?.css) await this.addStylesheet(def.css);
    const fonts = this.doc!.fonts;
    const shorthand = `${req.italic ? 'italic ' : ''}${req.weight} 32px ${quoteFamily(req.family)}`;
    await fonts.load(shorthand, sampleText || undefined);
  }

  private addStylesheet(href: string): Promise<void> {
    let p = this.stylesheets.get(href);
    if (p) return p;
    const doc = this.doc!;
    p = new Promise<void>((resolve) => {
      const existing = doc.querySelector<HTMLLinkElement>(
        `link[data-design-pad-font="${CSS.escape(href)}"]`,
      );
      if (existing) {
        resolve();
        return;
      }
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.crossOrigin = 'anonymous';
      link.dataset.designPadFont = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      doc.head.appendChild(link);
    });
    this.stylesheets.set(href, p);
    return p;
  }

  private async addFaces(def: FontFamilyDef): Promise<void> {
    const doc = this.doc!;
    for (const file of def.files ?? []) {
      const key = `${def.family}|${file.url}`;
      if (this.faces.has(key)) continue;
      this.faces.add(key);
      const face = new FontFace(def.family, `url(${JSON.stringify(file.url)})`, {
        weight: String(file.weight),
        style: file.italic ? 'italic' : 'normal',
      });
      doc.fonts.add(face);
    }
  }

  /** Register a font from bytes (e.g. an uploaded TTF/OTF/WOFF/WOFF2). */
  async registerFontData(
    family: string,
    data: ArrayBuffer,
    variant: FontVariant = { weight: 400, italic: false },
  ): Promise<void> {
    const existing = this.families.get(family);
    const variants = existing ? [...existing.variants] : [];
    if (!variants.some((v) => v.weight === variant.weight && v.italic === variant.italic))
      variants.push(variant);
    this.families.set(family, {
      ...(existing ?? { family, category: 'sans-serif' }),
      family,
      variants,
    });
    if (this.doc?.fonts) {
      const face = new FontFace(family, data, {
        weight: String(variant.weight),
        style: variant.italic ? 'italic' : 'normal',
      });
      await face.load();
      this.doc.fonts.add(face);
      this.loaded.add(keyOf({ family, ...variant }));
    }
    this.scheduleNotify();
  }
}
