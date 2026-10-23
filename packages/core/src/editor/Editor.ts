import {
  type BoxGeom,
  boxBounds,
  boxCorners,
  boxMatrix,
  distanceToSegment,
  polygonsIntersect,
  rectToPolygon,
  unionRects,
} from '../geometry/box';
import { applyToPoint, IDENTITY, invert, type Mat, multiply } from '../geometry/matrix';
import {
  createDocumentRecord,
  createElement,
  createPageRecord,
  spansToText,
} from '../model/defaults';
import { compareIndex, indexBetween, indicesBetween } from '../model/fractional';
import { createAssetId, createDesignId, createElementId, createPageId } from '../model/ids';
import { migrateDesignFile, SCHEMA_VERSION } from '../model/schema';
import type {
  AssetRecord,
  DesignElement,
  DesignFile,
  DesignRecord,
  DocumentRecord,
  ElementType,
  Id,
  PageBackground,
  PageRecord,
  Point,
  Rect,
  TextEffect,
  TextElement,
  TextSpan,
  TextStyle,
  Unit,
} from '../model/types';
import { ResourceManager } from '../render/resources';
import type { RecordsDiff } from '../store/diff';
import { History } from '../store/History';
import { type ChangeMeta, Store } from '../store/Store';
import type { FontFamilyDef } from '../text/catalog';
import { syncTextBox, TextLayoutEngine } from '../text/engine';
import { FontManager } from '../text/fonts';
import { resolveRunStyle } from '../text/layout';
import { ApproximateTextMeasurer, CanvasTextMeasurer, type TextMeasurer } from '../text/measure';
import * as arrange from './arrange';
import { type ClipboardPayload, copyElements, pasteElements } from './clipboard';
import { Emitter } from './emitter';
import { scaleElementProps } from './scale';
import { type CropTarget, Session, type SessionState } from './session';

export interface EditorOptions {
  /** Design to open. When omitted a blank design is created. */
  design?: DesignFile;
  /** Page size for a new blank design (design units, px). */
  width?: number;
  height?: number;
  unit?: Unit;
  dpi?: number;
  title?: string;
  fonts?: FontManager;
  fontCatalog?: FontFamilyDef[];
  measurer?: TextMeasurer;
  /** Map asset `src` to a loadable URL (custom schemes, signed URLs...). */
  resolveAssetUrl?: (asset: AssetRecord) => string | Promise<string>;
}

export interface EditorEvents extends Record<string, unknown> {
  /** Document records changed. */
  change: { diff: RecordsDiff; meta: ChangeMeta };
  /** Selection, editing state or current page changed. */
  session: { state: SessionState; prev: SessionState };
  /** Undo/redo availability changed. */
  history: undefined;
  /** Something that affects rendering but not the document changed (fonts, images). */
  render: undefined;
  /** A design was loaded with `load()`. */
  load: undefined;
}

export type ElementPatch = Partial<DesignElement> & { id: Id };

export type ReorderOp = 'forward' | 'backward' | 'front' | 'back';
export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

function defaultMeasurer(): TextMeasurer {
  try {
    return new CanvasTextMeasurer();
  } catch {
    return new ApproximateTextMeasurer();
  }
}

/** Collect asset ids referenced by elements and page backgrounds. */
export function collectAssetIds(records: Iterable<DesignRecord>): Set<Id> {
  const ids = new Set<Id>();
  for (const r of records) {
    if (r.typeName === 'page' && r.background.image) ids.add(r.background.image.assetId);
    if (r.typeName !== 'element') continue;
    switch (r.type) {
      case 'image':
        ids.add(r.image.assetId);
        break;
      case 'frame':
        if (r.image) ids.add(r.image.assetId);
        break;
      case 'grid':
        for (const c of r.cells) if (c.image) ids.add(c.image.assetId);
        break;
      case 'svg':
        ids.add(r.assetId);
        break;
    }
  }
  return ids;
}

/**
 * The headless design engine. Holds the document, selection and history and
 * exposes every editing command. UI layers (the React editor, an embed
 * bridge, scripts) drive designs exclusively through this API.
 */
export class Editor {
  readonly store = new Store();
  readonly session = new Session();
  readonly history: History;
  readonly fonts: FontManager;
  readonly text: TextLayoutEngine;
  readonly resources: ResourceManager;
  readonly events = new Emitter<EditorEvents>();
  designId: string;
  private disposers: Array<() => void> = [];
  private disposed = false;

  constructor(opts: EditorOptions = {}) {
    this.fonts = opts.fonts ?? new FontManager(opts.fontCatalog);
    this.text = new TextLayoutEngine(opts.measurer ?? defaultMeasurer());
    this.resources = new ResourceManager({
      getAsset: (id) => this.getAsset(id),
      resolveUrl: opts.resolveAssetUrl,
    });
    this.history = new History(this.store, {
      get: () => this.session.state.selectedIds,
      set: (ids) => this.select(ids),
    });
    this.designId = opts.design?.id ?? createDesignId();

    this.disposers.push(
      this.store.registerBeforeChange((_prev, next) =>
        next.typeName === 'element' && next.type === 'text' ? syncTextBox(next, this.text) : next,
      ),
      this.store.listen((diff, meta) => this.onStoreChange(diff, meta)),
      this.session.listen((state, prev) => this.events.emit('session', { state, prev })),
      this.history.listen(() => this.events.emit('history', undefined)),
      this.fonts.onLoad(() => {
        this.text.invalidate();
        this.resyncText();
        this.events.emit('render', undefined);
      }),
      this.resources.onReady(() => this.events.emit('render', undefined)),
    );

    if (opts.design) {
      this.load(opts.design);
    } else {
      const doc = createDocumentRecord({
        width: opts.width ?? 1080,
        height: opts.height ?? 1080,
        unit: opts.unit ?? 'px',
        dpi: opts.dpi ?? 96,
        title: opts.title ?? 'Untitled design',
      });
      const page = createPageRecord({ index: indexBetween(null, null) });
      this.store.loadRecords([doc, page]);
      this.session.update({ currentPageId: page.id });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.disposers) d();
    this.events.clear();
  }

  // ===========================================================================
  // Store plumbing
  // ===========================================================================

  private onStoreChange(diff: RecordsDiff, meta: ChangeMeta): void {
    // Keep session state consistent with the document.
    const s = this.session.state;
    const removed = diff.removed;
    const patch: Partial<SessionState> = {};
    if (s.selectedIds.some((id) => id in removed)) {
      patch.selectedIds = s.selectedIds.filter((id) => !(id in removed));
    }
    if (s.editingId && s.editingId in removed) patch.editingId = null;
    if (s.cropping && s.cropping.id in removed) patch.cropping = null;
    if (s.hoveredId && s.hoveredId in removed) patch.hoveredId = null;
    if (s.focusedGroupId && s.focusedGroupId in removed) patch.focusedGroupId = null;
    if (!s.currentPageId || !this.store.has(s.currentPageId)) {
      patch.currentPageId = this.store.getPages()[0]?.id ?? null;
    }
    if (Object.keys(patch).length) this.session.update(patch);

    // Ask for the fonts any new/changed text uses.
    for (const rec of [
      ...Object.values(diff.added),
      ...Object.values(diff.updated).map((u) => u[1]),
    ]) {
      if (rec.typeName === 'element' && rec.type === 'text') this.requestFonts(rec);
    }
    this.events.emit('change', { diff, meta });
  }

  private requestFonts(el: TextElement): void {
    const seen = new Set<string>();
    const text = spansToText(el.spans);
    for (const span of [{ text, style: undefined }, ...el.spans]) {
      const st = resolveRunStyle(el.style, span.style);
      const key = `${st.fontFamily}|${st.fontWeight}|${st.italic}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const req = { family: st.fontFamily, weight: st.fontWeight, italic: st.italic };
      if (!this.fonts.isLoaded(req)) void this.fonts.load(req, text.slice(0, 200));
    }
  }

  /** Re-measure every text element (after fonts load). Not recorded in history. */
  private resyncText(): void {
    const updates: DesignElement[] = [];
    for (const r of this.store.values()) {
      if (r.typeName === 'element' && r.type === 'text') {
        const next = syncTextBox(r, this.text);
        if (next !== r) updates.push(next);
      }
    }
    if (updates.length) this.store.put(updates);
  }

  /** Run several commands as one undo step. */
  batch<T>(fn: () => T): T {
    return this.store.transact(fn);
  }

  /** Apply changes without recording them in history. */
  silently<T>(fn: () => T): T {
    return this.store.transact(fn, { source: 'system', history: 'ignore' });
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  // ===========================================================================
  // Document
  // ===========================================================================

  getDocument(): DocumentRecord {
    return this.store.getDocument();
  }

  setTitle(title: string): void {
    this.store.update<DocumentRecord>(this.getDocument().id, { title });
  }

  /** Serialize the design. Unreferenced assets are dropped. */
  toJSON(): DesignFile {
    const doc = this.getDocument();
    const pages = this.store.getPages();
    const elements: DesignElement[] = [];
    const assets: AssetRecord[] = [];
    for (const r of this.store.values()) if (r.typeName === 'element') elements.push(r);
    const used = collectAssetIds([...pages, ...elements]);
    for (const r of this.store.values())
      if (r.typeName === 'asset' && (used.has(r.id) || r.kind === 'font')) assets.push(r);
    elements.sort((a, b) =>
      a.parentId === b.parentId ? compareIndex(a.index, b.index) : a.parentId < b.parentId ? -1 : 1,
    );
    return {
      format: 'design-pad',
      schemaVersion: SCHEMA_VERSION,
      id: this.designId,
      title: doc.title,
      width: doc.width,
      height: doc.height,
      unit: doc.unit,
      dpi: doc.dpi,
      pages,
      elements,
      assets,
    };
  }

  /** Replace the current design. Clears history. */
  load(input: DesignFile): void {
    const file = migrateDesignFile(input);
    this.designId = file.id || createDesignId();
    const doc = createDocumentRecord({
      title: file.title,
      width: file.width,
      height: file.height,
      unit: file.unit,
      dpi: file.dpi,
    });
    const pages = file.pages.length
      ? file.pages
      : [createPageRecord({ index: indexBetween(null, null) })];
    this.session.update({
      selectedIds: [],
      editingId: null,
      cropping: null,
      hoveredId: null,
      focusedGroupId: null,
      currentPageId: null,
    });
    this.store.loadRecords([doc, ...pages, ...file.elements, ...file.assets]);
    this.history.clear();
    this.session.update({ currentPageId: this.store.getPages()[0]?.id ?? null });
    for (const font of file.assets) {
      if (font.kind === 'font' && font.fontFamily) {
        this.fonts.register({
          family: font.fontFamily,
          category: 'sans-serif',
          variants: [{ weight: 400, italic: false }],
          files: [{ weight: 400, italic: false, url: font.src }],
        });
      }
    }
    this.events.emit('load', undefined);
  }

  // ===========================================================================
  // Assets
  // ===========================================================================

  getAsset(id: Id): AssetRecord | undefined {
    const r = this.store.get(id);
    return r?.typeName === 'asset' ? r : undefined;
  }

  getAssets(): AssetRecord[] {
    const out: AssetRecord[] = [];
    for (const r of this.store.values()) if (r.typeName === 'asset') out.push(r);
    return out;
  }

  /** Add (or replace) an asset record. Assets are not part of undo history. */
  addAsset(asset: Omit<AssetRecord, 'id' | 'typeName'> & { id?: Id }): AssetRecord {
    const record: AssetRecord = { ...asset, id: asset.id ?? createAssetId(), typeName: 'asset' };
    const existing = this.getAsset(record.id);
    if (existing && existing.src !== record.src) this.resources.invalidate(record.id);
    this.silently(() => this.store.put([record]));
    return record;
  }

  // ===========================================================================
  // Pages
  // ===========================================================================

  getPages(): PageRecord[] {
    return this.store.getPages();
  }

  getPage(id: Id): PageRecord | undefined {
    const r = this.store.get(id);
    return r?.typeName === 'page' ? r : undefined;
  }

  getCurrentPageId(): Id {
    return this.session.state.currentPageId ?? this.getPages()[0]!.id;
  }

  getCurrentPage(): PageRecord {
    return this.getPage(this.getCurrentPageId()) ?? this.getPages()[0]!;
  }

  setCurrentPage(pageId: Id): void {
    if (!this.getPage(pageId) || this.session.state.currentPageId === pageId) return;
    const sel = this.session.state.selectedIds.filter((id) => this.getPageIdOf(id) === pageId);
    this.session.update({
      currentPageId: pageId,
      selectedIds: sel,
      editingId: null,
      cropping: null,
    });
  }

  /** Insert a blank page after `afterId` (default: the current page). */
  addPage(opts: { after?: Id; background?: PageBackground; title?: string } = {}): PageRecord {
    const pages = this.getPages();
    const afterId = opts.after ?? this.getCurrentPageId();
    const i = pages.findIndex((p) => p.id === afterId);
    const prev = i >= 0 ? pages[i]! : pages[pages.length - 1];
    const next = i >= 0 ? pages[i + 1] : undefined;
    const page = createPageRecord({
      index: indexBetween(prev?.index, next?.index),
      title: opts.title ?? '',
      background: opts.background ?? { fill: { type: 'solid', color: '#ffffff' }, image: null },
    });
    this.store.put([page]);
    this.session.update({ currentPageId: page.id, selectedIds: [] });
    return page;
  }

  duplicatePage(pageId: Id): PageRecord | null {
    const pages = this.getPages();
    const i = pages.findIndex((p) => p.id === pageId);
    if (i < 0) return null;
    const src = pages[i]!;
    const page: PageRecord = {
      ...structuredClone(src),
      id: createPageId(),
      index: indexBetween(src.index, pages[i + 1]?.index),
    };
    const clones = this.cloneSubtrees(
      this.store.getChildren(pageId).map((e) => e.id),
      page.id,
    );
    this.store.put([page, ...clones]);
    this.session.update({ currentPageId: page.id, selectedIds: [] });
    return page;
  }

  deletePage(pageId: Id): void {
    const pages = this.getPages();
    if (pages.length <= 1) {
      // The last page is cleared instead of removed.
      this.batch(() => {
        this.store.remove(this.getDescendantIds(pageId));
        this.store.update<PageRecord>(pageId, {
          background: { fill: { type: 'solid', color: '#ffffff' }, image: null },
        });
      });
      return;
    }
    const i = pages.findIndex((p) => p.id === pageId);
    if (i < 0) return;
    const fallback = pages[i + 1] ?? pages[i - 1];
    this.batch(() => this.store.remove([...this.getDescendantIds(pageId), pageId]));
    if (fallback) this.session.update({ currentPageId: fallback.id });
  }

  /** Move a page to position `toIndex` in the page order. */
  movePage(pageId: Id, toIndex: number): void {
    const pages = this.getPages().filter((p) => p.id !== pageId);
    const page = this.getPage(pageId);
    if (!page) return;
    const clamped = Math.max(0, Math.min(pages.length, toIndex));
    const index = indexBetween(pages[clamped - 1]?.index, pages[clamped]?.index);
    this.store.update<PageRecord>(pageId, { index });
  }

  updatePage(pageId: Id, patch: Partial<Omit<PageRecord, 'id' | 'typeName'>>): void {
    this.store.update<PageRecord>(pageId, patch);
  }

  setPageBackground(pageId: Id, background: Partial<PageBackground>): void {
    const page = this.getPage(pageId);
    if (!page) return;
    this.store.update<PageRecord>(pageId, { background: { ...page.background, ...background } });
  }

  // ===========================================================================
  // Element queries
  // ===========================================================================

  getElement<T extends DesignElement = DesignElement>(id: Id): T | undefined {
    const r = this.store.get(id);
    return r?.typeName === 'element' ? (r as T) : undefined;
  }

  getElements(ids: Iterable<Id>): DesignElement[] {
    const out: DesignElement[] = [];
    for (const id of ids) {
      const el = this.getElement(id);
      if (el) out.push(el);
    }
    return out;
  }

  /** Direct children of a page or group, back to front. */
  getChildren(parentId: Id): DesignElement[] {
    return this.store.getChildren(parentId);
  }

  getPageIdOf(id: Id): Id | null {
    let r = this.store.get(id);
    for (let guard = 0; r && guard < 64; guard++) {
      if (r.typeName === 'page') return r.id;
      if (r.typeName !== 'element') return null;
      r = this.store.get(r.parentId);
    }
    return null;
  }

  /** Groups containing `id`, innermost first. */
  getAncestors(id: Id): DesignElement[] {
    const out: DesignElement[] = [];
    let el = this.getElement(id);
    while (el) {
      const parent = this.getElement(el.parentId);
      if (!parent) break;
      out.push(parent);
      el = parent;
    }
    return out;
  }

  /** The ancestor (or self) whose parent is the page. */
  getTopLevel(id: Id): DesignElement | undefined {
    const ancestors = this.getAncestors(id);
    return ancestors.length ? ancestors[ancestors.length - 1] : this.getElement(id);
  }

  getDescendants(id: Id): DesignElement[] {
    const out: DesignElement[] = [];
    const walk = (pid: Id) => {
      for (const child of this.store.getChildren(pid)) {
        out.push(child);
        if (child.type === 'group') walk(child.id);
      }
    };
    walk(id);
    return out;
  }

  getDescendantIds(id: Id): Id[] {
    return this.getDescendants(id).map((e) => e.id);
  }

  /** Matrix mapping the parent space of `id` into page space. */
  getParentPageMatrix(id: Id): Mat {
    const el = this.getElement(id);
    if (!el) return IDENTITY;
    const parent = this.getElement(el.parentId);
    return parent ? this.getElementPageMatrix(parent.id) : IDENTITY;
  }

  /** Matrix mapping element-local space (0..w, 0..h) into page space. */
  getElementPageMatrix(id: Id): Mat {
    const el = this.getElement(id);
    if (!el) return IDENTITY;
    return multiply(this.getParentPageMatrix(id), boxMatrix(el));
  }

  getElementPageCorners(id: Id): Point[] {
    const el = this.getElement(id);
    if (!el) return [];
    return boxCorners(el, this.getElementPageMatrix(id));
  }

  /** Axis-aligned bounds in page space. */
  getElementPageBounds(id: Id): Rect {
    const el = this.getElement(id);
    if (!el) return { x: 0, y: 0, width: 0, height: 0 };
    const parentM = this.getParentPageMatrix(id);
    if (parentM === IDENTITY) return boxBounds(el);
    const corners = boxCorners(el, multiply(parentM, boxMatrix(el)));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  getBoundsOf(ids: Id[]): Rect | null {
    const rects = ids
      .filter((id) => this.getElement(id))
      .map((id) => this.getElementPageBounds(id));
    return rects.length ? unionRects(rects) : null;
  }

  /** Total rotation of an element in page space (degrees). */
  getPageRotation(id: Id): number {
    let r = 0;
    for (let el = this.getElement(id); el; el = this.getElement(el.parentId)) r += el.rotation;
    return r;
  }

  /** Convert a page-space point into the parent space of `id`. */
  pageToParent(id: Id, p: Point): Point {
    return applyToPoint(invert(this.getParentPageMatrix(id)), p);
  }

  /** Convert a page-space delta into the parent space of `id`. */
  pageDeltaToParent(id: Id, delta: Point): Point {
    const inv = invert(this.getParentPageMatrix(id));
    return { x: inv.a * delta.x + inv.c * delta.y, y: inv.b * delta.x + inv.d * delta.y };
  }

  /**
   * Topmost element under a page-space point. Grouped elements resolve to
   * their top-level group unless the group is focused.
   */
  hitTest(
    pageId: Id,
    point: Point,
    opts: { tolerance?: number; includeLocked?: boolean } = {},
  ): DesignElement | null {
    const tol = opts.tolerance ?? 0;
    const focused = this.session.state.focusedGroupId;
    const hitLeaf = (el: DesignElement): boolean => {
      const m = this.getElementPageMatrix(el.id);
      const local = applyToPoint(invert(m), point);
      if (el.type === 'line') {
        const y = el.height / 2;
        const d = distanceToSegment(local, { x: 0, y }, { x: el.width, y });
        return d <= Math.max(tol, el.stroke.width / 2 + 2);
      }
      return (
        local.x >= -tol &&
        local.y >= -tol &&
        local.x <= el.width + tol &&
        local.y <= el.height + tol
      );
    };
    const visit = (parentId: Id): DesignElement | null => {
      const children = this.store.getChildren(parentId);
      for (let i = children.length - 1; i >= 0; i--) {
        const el = children[i]!;
        if (el.type === 'group') {
          const inner = visit(el.id);
          if (inner) return inner;
          continue;
        }
        if (hitLeaf(el)) return el;
      }
      return null;
    };
    const leaf = visit(pageId);
    if (!leaf) return null;
    // Resolve to the outermost group that is not focused (or an ancestor of the focus).
    const chain = [leaf, ...this.getAncestors(leaf.id)];
    if (focused) {
      const fi = chain.findIndex((e) => e.id === focused);
      if (fi > 0) return chain[fi - 1]!;
    }
    return chain[chain.length - 1]!;
  }

  /** Top-level elements on a page intersecting a page-space rectangle. */
  elementsInRect(pageId: Id, rect: Rect): DesignElement[] {
    const poly = rectToPolygon(rect);
    return this.store
      .getChildren(pageId)
      .filter((el) => polygonsIntersect(poly, this.getElementPageCorners(el.id)));
  }

  // ===========================================================================
  // Selection & session
  // ===========================================================================

  getSelectedIds(): Id[] {
    return this.session.state.selectedIds;
  }

  getSelectedElements(): DesignElement[] {
    return this.getElements(this.session.state.selectedIds);
  }

  /** Select elements. All must live on one page; the page becomes current. */
  select(ids: Id[]): void {
    const unique = [...new Set(ids)].filter((id) => this.getElement(id));
    const pageId = unique.length ? this.getPageIdOf(unique[0]!) : null;
    const sel = pageId ? unique.filter((id) => this.getPageIdOf(id) === pageId) : [];
    const s = this.session.state;
    const patch: Partial<SessionState> = { selectedIds: sel };
    if (pageId) patch.currentPageId = pageId;
    if (s.editingId && !sel.includes(s.editingId)) patch.editingId = null;
    if (s.cropping && !sel.includes(s.cropping.id)) patch.cropping = null;
    if (
      s.focusedGroupId &&
      !sel.some((id) => this.getAncestors(id).some((a) => a.id === s.focusedGroupId))
    ) {
      patch.focusedGroupId = null;
    }
    if (sel.length === s.selectedIds.length && sel.every((id, i) => s.selectedIds[i] === id)) {
      delete patch.selectedIds;
    }
    this.session.update(patch);
  }

  selectAll(): void {
    this.select(this.store.getChildren(this.getCurrentPageId()).map((e) => e.id));
  }

  clearSelection(): void {
    this.session.update({ selectedIds: [], editingId: null, cropping: null, focusedGroupId: null });
  }

  setHovered(id: Id | null): void {
    this.session.update({ hoveredId: id });
  }

  focusGroup(groupId: Id | null): void {
    this.session.update({ focusedGroupId: groupId });
  }

  startTextEditing(id: Id): void {
    const el = this.getElement(id);
    if (!el || el.type !== 'text' || el.locked) return;
    this.session.update({
      selectedIds: [id],
      editingId: id,
      cropping: null,
      currentPageId: this.getPageIdOf(id),
    });
  }

  stopTextEditing(): void {
    this.session.update({ editingId: null });
  }

  startCropping(target: CropTarget): void {
    const el = this.getElement(target.id);
    if (!el || el.locked) return;
    const ok =
      el.type === 'image' ||
      (el.type === 'frame' && el.image) ||
      (el.type === 'grid' && target.cell !== undefined && el.cells[target.cell]?.image);
    if (!ok) return;
    this.session.update({ selectedIds: [target.id], cropping: target, editingId: null });
  }

  stopCropping(): void {
    this.session.update({ cropping: null });
  }

  // ===========================================================================
  // Element commands
  // ===========================================================================

  private nextIndices(parentId: Id, n: number, above?: Id): string[] {
    const siblings = this.store.getChildren(parentId);
    if (above) {
      const i = siblings.findIndex((s) => s.id === above);
      if (i >= 0) return indicesBetween(siblings[i]!.index, siblings[i + 1]?.index, n);
    }
    return indicesBetween(siblings[siblings.length - 1]?.index, null, n);
  }

  /**
   * Insert elements. Elements without a valid `parentId` go on `pageId`
   * (default: current page). Elements are stacked above existing ones.
   */
  createElements(
    inits: Array<Partial<DesignElement> & { type: ElementType }>,
    opts: { pageId?: Id; parentId?: Id; select?: boolean; above?: Id } = {},
  ): Id[] {
    const parentId = opts.parentId ?? opts.pageId ?? this.getCurrentPageId();
    const records = inits.map((init) => createElement(init));
    const indices = this.nextIndices(parentId, records.length, opts.above);
    const out = records.map((r, i) => ({
      ...r,
      parentId: r.parentId && this.store.has(r.parentId) ? r.parentId : parentId,
      index: indices[i]!,
    })) as DesignElement[];
    this.store.put(out);
    if (opts.select !== false) this.select(out.map((r) => r.id));
    return out.map((r) => r.id);
  }

  /**
   * Insert one element. It is centred on the page when `center` is set or
   * when the partial gives no x/y.
   */
  addElement(
    init: Partial<DesignElement> & { type: ElementType },
    opts: { pageId?: Id; select?: boolean; center?: boolean } = {},
  ): Id {
    const doc = this.getDocument();
    const el = createElement(init);
    const placed: Partial<DesignElement> & { type: ElementType } = { ...el };
    if (opts.center || init.x === undefined) placed.x = (doc.width - el.width) / 2;
    if (opts.center || init.y === undefined) placed.y = (doc.height - el.height) / 2;
    return this.createElements([placed], opts)[0]!;
  }

  updateElement<T extends DesignElement = DesignElement>(
    id: Id,
    patch: Partial<T> | ((el: T) => T),
  ): void {
    this.store.update<T>(id, patch as Partial<T>);
  }

  updateElements(patches: ElementPatch[]): void {
    const records: DesignElement[] = [];
    for (const patch of patches) {
      const el = this.getElement(patch.id);
      if (el) records.push({ ...el, ...patch } as DesignElement);
    }
    if (records.length) this.store.put(records);
  }

  deleteElements(ids: Id[]): void {
    const all = new Set<Id>();
    for (const id of ids) {
      const el = this.getElement(id);
      if (!el || el.locked) continue;
      all.add(id);
      for (const d of this.getDescendantIds(id)) all.add(d);
    }
    if (!all.size) return;
    this.batch(() => {
      const parents = new Set(this.getElements(all).map((e) => e.parentId));
      this.store.remove(all);
      // A group left with fewer than two children dissolves.
      for (const pid of parents) {
        const group = this.getElement(pid);
        if (group?.type !== 'group') continue;
        const left = this.store.getChildren(pid);
        if (left.length === 0) this.store.remove([pid]);
        else if (left.length === 1) arrange.ungroup(this, pid);
      }
    });
  }

  /** Clone elements (and their subtrees) into `parentId`, with fresh ids. */
  cloneSubtrees(ids: Id[], parentId: Id, offset: Point = { x: 0, y: 0 }): DesignElement[] {
    const out: DesignElement[] = [];
    const clone = (el: DesignElement, newParent: Id, index: string, top: boolean) => {
      const copy = {
        ...structuredClone(el),
        id: createElementId(),
        parentId: newParent,
        index,
        x: el.x + (top ? offset.x : 0),
        y: el.y + (top ? offset.y : 0),
      } as DesignElement;
      out.push(copy);
      if (el.type === 'group') {
        for (const child of this.store.getChildren(el.id))
          clone(child, copy.id, child.index, false);
      }
    };
    const els = this.getElements(ids).sort((a, b) => compareIndex(a.index, b.index));
    const siblings = this.store.getChildren(parentId);
    const indices = indicesBetween(siblings[siblings.length - 1]?.index, null, els.length);
    for (const [i, el] of els.entries()) clone(el, parentId, indices[i]!, true);
    return out;
  }

  /** Duplicate elements (Canva offsets copies down-right). Returns the new top-level ids. */
  duplicateElements(ids: Id[], offset: Point = { x: 20, y: 20 }): Id[] {
    const els = this.getElements(ids);
    if (!els.length) return [];
    const parentId = els[0]!.parentId;
    const sameParent = els.filter((e) => e.parentId === parentId).map((e) => e.id);
    const delta = this.pageDeltaToParent(sameParent[0]!, offset);
    const clones = this.cloneSubtrees(sameParent, parentId, delta);
    this.store.put(clones);
    const top = clones.filter((c) => c.parentId === parentId).map((c) => c.id);
    this.select(top);
    return top;
  }

  /** Translate elements by a page-space delta. */
  moveElements(ids: Id[], delta: Point): void {
    const updates: DesignElement[] = [];
    for (const el of this.getElements(ids)) {
      if (el.locked) continue;
      const d = this.pageDeltaToParent(el.id, delta);
      updates.push({ ...el, x: el.x + d.x, y: el.y + d.y });
    }
    if (updates.length) this.store.put(updates);
  }

  /** Records for an element scaled uniformly by `k` about its own top-left, including descendants. */
  scaleSubtree(id: Id, k: number): DesignElement[] {
    const el = this.getElement(id);
    if (!el) return [];
    const out: DesignElement[] = [scaleElementProps(el, k)];
    if (el.type === 'group') {
      for (const child of this.store.getChildren(id)) {
        const scaled = this.scaleSubtree(child.id, k);
        const head = scaled[0]!;
        scaled[0] = { ...head, x: child.x * k, y: child.y * k };
        out.push(...scaled);
      }
    }
    return out;
  }

  /** Set an element's box. For uniform scale changes, content (fonts, strokes, children) scales too. */
  setElementBox(id: Id, box: BoxGeom, mode: 'scale' | 'resize' = 'resize'): void {
    const el = this.getElement(id);
    if (!el) return;
    if (mode === 'scale' && el.width > 0) {
      const k = box.width / el.width;
      const recs = this.scaleSubtree(id, k);
      recs[0] = {
        ...recs[0]!,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rotation: box.rotation,
      };
      this.store.put(recs);
      return;
    }
    this.store.put([{ ...el, ...box } as DesignElement]);
  }

  setLocked(ids: Id[], locked: boolean): void {
    this.store.put(this.getElements(ids).map((e) => ({ ...e, locked })));
  }

  // -- Text -------------------------------------------------------------------

  setTextSpans(id: Id, spans: TextSpan[]): void {
    const el = this.getElement<TextElement>(id);
    if (el?.type !== 'text') return;
    this.store.update<TextElement>(id, { spans });
  }

  /**
   * Apply a style to whole text boxes. Inline overrides of the same
   * properties are removed so the change applies to every character.
   */
  applyTextStyle(ids: Id[], patch: Partial<TextStyle>): void {
    const keys = Object.keys(patch) as (keyof TextStyle)[];
    const updates: DesignElement[] = [];
    for (const el of this.getElements(ids)) {
      if (el.type !== 'text') continue;
      const spans = el.spans.map((span) => {
        if (!span.style) return span;
        const style = { ...span.style };
        for (const k of keys) delete (style as Record<string, unknown>)[k];
        return Object.keys(style).length ? { ...span, style } : { text: span.text };
      });
      updates.push({ ...el, style: { ...el.style, ...patch }, spans });
    }
    if (updates.length) this.store.put(updates);
  }

  setTextEffect(ids: Id[], effect: TextEffect | null): void {
    this.store.put(
      this.getElements(ids)
        .filter((e): e is TextElement => e.type === 'text')
        .map((e) => ({ ...e, effect })),
    );
  }

  setTextCurve(ids: Id[], curve: number): void {
    const updates: DesignElement[] = [];
    for (const el of this.getElements(ids)) {
      if (el.type !== 'text') continue;
      if (curve === 0 && el.curve !== 0) {
        const width = this.text.naturalWidth(el);
        const cx = el.x + el.width / 2;
        updates.push({ ...el, curve: 0, width, x: cx - width / 2 });
      } else {
        updates.push({ ...el, curve });
      }
    }
    if (updates.length) this.store.put(updates);
  }

  // -- Arrange (see arrange.ts) ---------------------------------------------

  groupElements(ids: Id[]): Id | null {
    return arrange.group(this, ids);
  }

  ungroupElements(groupId: Id): Id[] {
    return arrange.ungroup(this, groupId);
  }

  reorderElements(ids: Id[], op: ReorderOp): void {
    arrange.reorder(this, ids, op);
  }

  /** Move an element to a position in its parent's stacking order (0 = back). */
  moveElementToIndex(id: Id, position: number): void {
    arrange.moveToPosition(this, id, position);
  }

  alignElements(
    ids: Id[],
    alignment: Alignment,
    relativeTo: 'auto' | 'page' | 'selection' = 'auto',
  ): void {
    arrange.align(this, ids, alignment, relativeTo);
  }

  distributeElements(ids: Id[], axis: 'horizontal' | 'vertical'): void {
    arrange.distribute(this, ids, axis);
  }

  flipElements(ids: Id[], axis: 'horizontal' | 'vertical'): void {
    arrange.flip(this, ids, axis);
  }

  /** Move top-level elements to another page, keeping their page position. */
  moveElementsToPage(ids: Id[], pageId: Id, offset: Point = { x: 0, y: 0 }): void {
    arrange.moveToPage(this, ids, pageId, offset);
  }

  // -- Clipboard ----------------------------------------------------------------

  copy(ids: Id[] = this.getSelectedIds()): ClipboardPayload | null {
    return copyElements(this, ids);
  }

  paste(payload: ClipboardPayload, opts: { pageId?: Id; at?: Point } = {}): Id[] {
    return pasteElements(this, payload, opts);
  }
}
