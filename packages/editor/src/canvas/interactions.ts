import {
  applyToPoint,
  boxCorners,
  boxMatrix,
  createPath,
  cropFromImageRect,
  type DesignElement,
  type Editor,
  gridCellRect,
  HANDLE_SIGNS,
  type Id,
  type ImageFill,
  imageRectFromCrop,
  invert,
  isCornerHandle,
  type LineElement,
  multiply,
  normalizeAngle,
  type Point,
  type Rect,
  type ResizeHandle,
  recropForWindow,
  refitCrop,
  resizeBox,
  rotateBoxAbout,
  type SnapTarget,
  scaleBoxAbout,
  snapAngle,
  snapEdges,
  snapMove,
} from '@design-pad/core';
import type { DesignPadContextValue } from '../context';
import {
  type Camera,
  clampScroll,
  clampZoom,
  pageLayout,
  screenToPage,
  slotHeight,
  zoomAt,
} from './camera';
import { cropContext } from './draw';
import { captureSubtree, type Subtree, scaleSubtree } from './snapshot';

const DRAG_THRESHOLD = 3;
const SNAP_PX = 6;

export type HandleTarget =
  | { kind: 'resize'; handle: ResizeHandle }
  | { kind: 'rotate' }
  | { kind: 'line'; end: 'start' | 'end' }
  | { kind: 'crop-window'; handle: ResizeHandle }
  | { kind: 'crop-image'; handle: ResizeHandle };

interface PointerInfo {
  clientX: number;
  clientY: number;
  /** Viewport-relative screen point. */
  screen: Point;
  pageIndex: number;
  pageId: Id;
  /** Point in that page's coordinates. */
  page: Point;
  inside: boolean;
  shift: boolean;
  alt: boolean;
  mod: boolean;
}

type State =
  | { type: 'idle' }
  | {
      type: 'pointing';
      down: PointerInfo;
      hit: DesignElement | null;
      /** Leaf under the pointer when clicking an already-selected group. */
      groupChild: Id | null;
      wasSelected: boolean;
    }
  | {
      type: 'dragging';
      down: PointerInfo;
      pageId: Id;
      ids: Id[];
      initial: Map<Id, DesignElement>;
      bounds0: Rect;
      targets: SnapTarget[];
    }
  | { type: 'brushing'; down: PointerInfo; pageId: Id; base: Id[] }
  | {
      type: 'resizing';
      down: PointerInfo;
      handle: ResizeHandle;
      subtrees: Subtree[];
      bounds0: Rect;
      targets: SnapTarget[];
    }
  | {
      type: 'rotating';
      down: PointerInfo;
      center: Point;
      startAngle: number;
      subtrees: Subtree[];
      absStart: number;
    }
  | { type: 'line-end'; down: PointerInfo; id: Id; end: 'start' | 'end'; fixed: Point }
  | { type: 'panning'; lastX: number; lastY: number }
  | { type: 'crop-move'; down: PointerInfo; fill0: ImageFill; window: Rect }
  | {
      type: 'crop-window';
      down: PointerInfo;
      handle: ResizeHandle;
      el0: DesignElement;
      fill0: ImageFill;
    }
  | { type: 'crop-image'; down: PointerInfo; handle: ResizeHandle; fill0: ImageFill; window: Rect }
  | { type: 'drawing'; pageId: Id; points: Point[] };

function cursorForHandle(handle: ResizeHandle, rotation: number): string {
  const [sx, sy] = HANDLE_SIGNS[handle];
  const angle = normalizeAngle((Math.atan2(sy, sx) * 180) / Math.PI + rotation);
  const a = ((angle % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

export { cursorForHandle };

/** Which handles an element shows. */
export function handlesFor(el: DesignElement | null, multi: boolean): ResizeHandle[] {
  if (multi) return ['nw', 'ne', 'se', 'sw'];
  if (!el || el.locked) return [];
  switch (el.type) {
    case 'text':
      return el.curve ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'ne', 'se', 'sw', 'e', 'w'];
    case 'line':
      return [];
    case 'svg':
    case 'group':
      return ['nw', 'ne', 'se', 'sw'];
    default:
      return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  }
}

/**
 * Pointer state machine for the canvas: selection, move, resize, rotate,
 * marquee, line endpoints, panning, crop and freehand drawing.
 */
export class InteractionController {
  private state: State = { type: 'idle' };
  private spaceDown = false;
  private touches = new Map<number, Point>();
  private pinch: { dist: number; zoom: number; mid: Point } | null = null;

  constructor(
    private ctx: DesignPadContextValue,
    private getViewportRect: () => DOMRect,
  ) {}

  private get editor(): Editor {
    return this.ctx.editor;
  }

  private get cam(): Camera {
    return this.ctx.camera.get();
  }

  get busy(): boolean {
    return this.state.type !== 'idle';
  }

  setSpace(down: boolean): void {
    this.spaceDown = down;
  }

  private info(e: {
    clientX: number;
    clientY: number;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  }): PointerInfo {
    const rect = this.getViewportRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const pages = this.editor.getPages();
    const hit = screenToPage(this.cam, this.editor.getDocument(), pages.length, screen.x, screen.y);
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      screen,
      pageIndex: hit.index,
      pageId: pages[hit.index]!.id,
      page: hit.point,
      inside: hit.inside,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.metaKey || e.ctrlKey,
    };
  }

  /** Page point of a pointer, expressed on a specific page. */
  private pagePointOn(pageId: Id, p: PointerInfo): Point {
    const pages = this.editor.getPages();
    const doc = this.editor.getDocument();
    const target = pages.findIndex((pg) => pg.id === pageId);
    if (target === p.pageIndex || target < 0) return p.page;
    // Pages are the same size and stacked vertically: shift by whole page slots.
    const slot = slotHeight(doc, this.cam.zoom) / this.cam.zoom;
    return { x: p.page.x, y: p.page.y + (p.pageIndex - target) * slot };
  }

  private snapTargets(pageId: Id, exclude: Set<Id>): SnapTarget[] {
    const doc = this.editor.getDocument();
    const targets: SnapTarget[] = [
      { rect: { x: 0, y: 0, width: doc.width, height: doc.height }, kind: 'page' },
    ];
    const focused = this.editor.session.state.focusedGroupId;
    const pool = [
      ...this.editor.getChildren(pageId),
      ...(focused ? this.editor.getChildren(focused) : []),
    ];
    for (const el of pool.slice(0, 300)) {
      if (exclude.has(el.id)) continue;
      targets.push({ rect: this.editor.getElementPageBounds(el.id), kind: 'element' });
    }
    return targets;
  }

  private threshold(): number {
    return SNAP_PX / this.cam.zoom;
  }

  private snappingOn(p: PointerInfo): boolean {
    return !p.mod;
  }

  private setLabel(text: string | null, p?: PointerInfo): void {
    this.ctx.ui.set({
      transformLabel: text && p ? { text, at: { x: p.screen.x + 16, y: p.screen.y + 18 } } : null,
    });
  }

  // ---------------------------------------------------------------------------
  // Pointer events
  // ---------------------------------------------------------------------------

  pointerDown(e: PointerEvent, handle: HandleTarget | null): void {
    const editor = this.editor;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.cancel();
        const [a, b] = [...this.touches.values()];
        this.pinch = {
          dist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
          zoom: this.cam.zoom,
          mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
        };
        return;
      }
    }
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.state = { type: 'panning', lastX: e.clientX, lastY: e.clientY };
      this.ctx.ui.set({ interacting: 'pan' });
      return;
    }
    if (e.button !== 0) return;
    const p = this.info(e);
    this.ctx.ui.set({ contextMenu: null, pointerDown: true });

    // Freehand drawing.
    const drawing = this.ctx.ui.get().drawing;
    if (drawing) {
      editor.clearSelection();
      this.state = { type: 'drawing', pageId: p.pageId, points: [p.page] };
      this.ctx.ui.set({ interacting: 'draw' });
      this.updateLiveStroke();
      return;
    }

    // Crop mode.
    const crop = cropContext(editor);
    if (crop) {
      if (handle?.kind === 'crop-window') {
        const el0 = editor.getElement(crop.id)!;
        editor.history.startInteraction();
        this.state = { type: 'crop-window', down: p, handle: handle.handle, el0, fill0: crop.fill };
        return;
      }
      if (handle?.kind === 'crop-image') {
        editor.history.startInteraction();
        this.state = {
          type: 'crop-image',
          down: p,
          handle: handle.handle,
          fill0: crop.fill,
          window: crop.window,
        };
        return;
      }
      if (this.insideCropImage(p, crop)) {
        editor.history.startInteraction();
        this.state = { type: 'crop-move', down: p, fill0: crop.fill, window: crop.window };
        return;
      }
      editor.stopCropping();
    }

    if (handle) {
      this.startHandle(p, handle);
      return;
    }

    if (editor.session.state.editingId) editor.stopTextEditing();

    if (!p.inside) {
      // Outside every page: start a marquee from the nearest page.
      if (!p.shift) editor.clearSelection();
      this.state = { type: 'pointing', down: p, hit: null, groupChild: null, wasSelected: false };
      return;
    }

    if (editor.getCurrentPageId() !== p.pageId) editor.setCurrentPage(p.pageId);
    const tol = 4 / this.cam.zoom;
    const hit = editor.hitTest(p.pageId, p.page, { tolerance: tol });
    const selected = editor.getSelectedIds();
    if (!hit) {
      if (!p.shift) editor.clearSelection();
      this.state = { type: 'pointing', down: p, hit: null, groupChild: null, wasSelected: false };
      return;
    }
    const wasSelected = selected.includes(hit.id);
    let groupChild: Id | null = null;
    if (hit.type === 'group' && wasSelected && selected.length === 1) {
      editor.focusGroup(hit.id);
      const leaf = editor.hitTest(p.pageId, p.page, { tolerance: tol });
      editor.focusGroup(null);
      if (leaf && leaf.id !== hit.id) groupChild = leaf.id;
    }
    if (p.shift) {
      editor.select(wasSelected ? selected.filter((id) => id !== hit.id) : [...selected, hit.id]);
    } else if (!wasSelected) {
      editor.select([hit.id]);
    }
    this.state = { type: 'pointing', down: p, hit, groupChild, wasSelected };
  }

  pointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size >= 2) {
        const [a, b] = [...this.touches.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        const rect = this.getViewportRect();
        const doc = this.editor.getDocument();
        const n = this.editor.getPages().length;
        let cam = zoomAt(this.cam, doc, n, clampZoom((this.pinch.zoom * dist) / this.pinch.dist), {
          x: mid.x - rect.left,
          y: mid.y - rect.top,
        });
        cam = clampScroll(
          {
            ...cam,
            scrollX: cam.scrollX - (mid.x - this.pinch.mid.x),
            scrollY: cam.scrollY - (mid.y - this.pinch.mid.y),
          },
          doc,
          n,
        );
        this.pinch.mid = mid;
        this.ctx.camera.set(cam);
        return;
      }
    }
    const s = this.state;
    if (s.type === 'idle') {
      this.hover(e);
      return;
    }
    if (s.type === 'panning') {
      this.panBy(s.lastX - e.clientX, s.lastY - e.clientY);
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      return;
    }
    const p = this.info(e);
    switch (s.type) {
      case 'pointing': {
        const dist = Math.hypot(p.clientX - s.down.clientX, p.clientY - s.down.clientY);
        if (dist < DRAG_THRESHOLD) return;
        if (e.pointerType === 'touch' && !s.hit) {
          this.state = { type: 'panning', lastX: e.clientX, lastY: e.clientY };
          return;
        }
        if (s.hit && !s.hit.locked) this.startDrag(s.down, p);
        else if (!s.hit) this.startBrush(s.down);
        else return;
        this.pointerMove(e);
        return;
      }
      case 'dragging':
        this.moveDrag(s, p);
        return;
      case 'brushing':
        this.moveBrush(s, p);
        return;
      case 'resizing':
        this.moveResize(s, p);
        return;
      case 'rotating':
        this.moveRotate(s, p);
        return;
      case 'line-end':
        this.moveLineEnd(s, p);
        return;
      case 'crop-move':
        this.moveCrop(s, p);
        return;
      case 'crop-window':
        this.moveCropWindow(s, p);
        return;
      case 'crop-image':
        this.moveCropImage(s, p);
        return;
      case 'drawing': {
        const pt = this.pagePointOn(s.pageId, p);
        const last = s.points[s.points.length - 1]!;
        if (Math.hypot(pt.x - last.x, pt.y - last.y) * this.cam.zoom >= 1.5) {
          s.points.push(pt);
          this.updateLiveStroke();
        }
        return;
      }
    }
  }

  pointerUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        if (this.touches.size < 2) this.pinch = null;
        return;
      }
    }
    const s = this.state;
    const editor = this.editor;
    this.state = { type: 'idle' };
    this.ctx.ui.set({
      interacting: null,
      pointerDown: false,
      guides: [],
      guidesPageId: null,
      marquee: null,
      transformLabel: null,
    });
    switch (s.type) {
      case 'pointing': {
        if (s.hit && !s.down.shift) {
          if (s.groupChild) {
            editor.focusGroup(s.hit.id);
            editor.select([s.groupChild]);
            editor.focusGroup(s.hit.id);
          } else if (s.wasSelected && editor.getSelectedIds().length > 1) {
            editor.select([s.hit.id]);
          }
        }
        return;
      }
      case 'dragging': {
        const p = this.info(e);
        if (p.pageId !== s.pageId && p.inside) {
          const top = s.ids.filter((id) => editor.getPage(editor.getElement(id)?.parentId ?? ''));
          if (top.length === s.ids.length) {
            const from = this.pagePointOn(s.pageId, p);
            editor.moveElementsToPage(top, p.pageId, {
              x: p.page.x - from.x,
              y: p.page.y - from.y,
            });
          }
        }
        editor.history.endInteraction();
        return;
      }
      case 'resizing':
      case 'rotating':
      case 'line-end':
      case 'crop-move':
      case 'crop-window':
      case 'crop-image':
        editor.history.endInteraction();
        return;
      case 'drawing':
        this.finishStroke(s);
        return;
      default:
        return;
    }
  }

  cancel(): void {
    const s = this.state;
    if (
      s.type === 'dragging' ||
      s.type === 'resizing' ||
      s.type === 'rotating' ||
      s.type === 'line-end' ||
      s.type.startsWith('crop-')
    ) {
      this.editor.history.cancelInteraction();
    }
    this.state = { type: 'idle' };
    this.ctx.ui.set({
      interacting: null,
      pointerDown: false,
      guides: [],
      marquee: null,
      transformLabel: null,
      liveStroke: null,
    });
  }

  doubleClick(e: MouseEvent): void {
    const editor = this.editor;
    const p = this.info({ ...e, clientX: e.clientX, clientY: e.clientY });
    if (!p.inside) return;
    const tol = 4 / this.cam.zoom;
    const sel = editor.getSelectedElements();
    // Double-click inside a group: focus it and select the child.
    const top = editor.hitTest(p.pageId, p.page, { tolerance: tol });
    if (!top) return;
    if (top.type === 'group') {
      editor.focusGroup(top.id);
      const leaf = editor.hitTest(p.pageId, p.page, { tolerance: tol });
      if (leaf) {
        editor.select([leaf.id]);
        editor.focusGroup(top.id);
        this.activate(leaf, p, e);
      }
      return;
    }
    if (sel.length <= 1) this.activate(top, p, e);
  }

  /** Enter the element's edit mode (text editing or crop). */
  private activate(el: DesignElement, p: PointerInfo, e: MouseEvent): void {
    const editor = this.editor;
    if (el.locked) return;
    if (el.type === 'text') {
      this.ctx.ui.set({ pendingCaret: { x: e.clientX, y: e.clientY } });
      editor.startTextEditing(el.id);
    } else if (el.type === 'image' || (el.type === 'frame' && el.image)) {
      editor.startCropping({ id: el.id });
    } else if (el.type === 'grid') {
      const local = applyToPoint(invert(editor.getElementPageMatrix(el.id)), p.page);
      const cell = el.layout.findIndex((_, i) => {
        const r = gridCellRect(el, i);
        return (
          local.x >= r.x && local.y >= r.y && local.x <= r.x + r.width && local.y <= r.y + r.height
        );
      });
      if (cell >= 0 && el.cells[cell]?.image) editor.startCropping({ id: el.id, cell });
    }
  }

  wheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.getViewportRect();
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dx *= rect.width;
      dy *= rect.height;
    }
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.002));
      this.zoomTo(this.cam.zoom * factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      return;
    }
    if (e.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    this.panBy(dx, dy);
  }

  zoomTo(zoom: number, anchor?: Point): void {
    const cam = this.cam;
    const a = anchor ?? { x: cam.viewportW / 2, y: cam.viewportH / 2 };
    this.ctx.camera.set(
      zoomAt(cam, this.editor.getDocument(), this.editor.getPages().length, zoom, a),
    );
  }

  panBy(dx: number, dy: number): void {
    const cam = this.cam;
    this.ctx.camera.set(
      clampScroll(
        { ...cam, scrollX: cam.scrollX + dx, scrollY: cam.scrollY + dy },
        this.editor.getDocument(),
        this.editor.getPages().length,
      ),
    );
  }

  private hover(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const editor = this.editor;
    if (
      editor.session.state.editingId ||
      editor.session.state.cropping ||
      this.ctx.ui.get().drawing
    ) {
      if (editor.session.state.hoveredId) editor.setHovered(null);
      return;
    }
    const p = this.info(e);
    const hit = p.inside
      ? editor.hitTest(p.pageId, p.page, { tolerance: 4 / this.cam.zoom })
      : null;
    const id = hit?.id ?? null;
    if (editor.session.state.hoveredId !== id) editor.setHovered(id);
  }

  // ---------------------------------------------------------------------------
  // Drag (move)
  // ---------------------------------------------------------------------------

  private startDrag(down: PointerInfo, p: PointerInfo): void {
    const editor = this.editor;
    editor.history.startInteraction();
    let ids = editor.getSelectedIds().filter((id) => !editor.getElement(id)?.locked);
    if (!ids.length) {
      editor.history.endInteraction();
      this.state = { type: 'idle' };
      return;
    }
    if (down.alt) ids = editor.duplicateElements(ids, { x: 0, y: 0 });
    const initial = new Map(editor.getElements(ids).map((el) => [el.id, el]));
    const pageId = editor.getPageIdOf(ids[0]!) ?? down.pageId;
    const exclude = new Set<Id>(ids);
    for (const id of ids) for (const d of editor.getDescendantIds(id)) exclude.add(d);
    this.state = {
      type: 'dragging',
      down: { ...down, page: this.pagePointOn(pageId, down) },
      pageId,
      ids,
      initial,
      bounds0: editor.getBoundsOf(ids)!,
      targets: this.snapTargets(pageId, exclude),
    };
    this.ctx.ui.set({ interacting: 'drag' });
    void p;
  }

  private moveDrag(s: Extract<State, { type: 'dragging' }>, p: PointerInfo): void {
    const editor = this.editor;
    const cur = this.pagePointOn(s.pageId, p);
    let dx = cur.x - s.down.page.x;
    let dy = cur.y - s.down.page.y;
    if (p.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let guides: ReturnType<typeof snapMove>['guides'] = [];
    if (this.snappingOn(p)) {
      const res = snapMove({ ...s.bounds0, x: s.bounds0.x + dx, y: s.bounds0.y + dy }, s.targets, {
        threshold: this.threshold(),
        snapX: !(p.shift && dx === 0),
        snapY: !(p.shift && dy === 0),
      });
      dx += res.dx;
      dy += res.dy;
      guides = res.guides;
    }
    const updates: DesignElement[] = [];
    for (const [id, el0] of s.initial) {
      const d = editor.pageDeltaToParent(id, { x: dx, y: dy });
      const cur = editor.getElement(id);
      if (cur) updates.push({ ...cur, x: el0.x + d.x, y: el0.y + d.y } as DesignElement);
    }
    editor.store.put(updates);
    this.ctx.ui.set({ guides, guidesPageId: s.pageId });
  }

  // ---------------------------------------------------------------------------
  // Marquee
  // ---------------------------------------------------------------------------

  private startBrush(down: PointerInfo): void {
    const base = down.shift ? this.editor.getSelectedIds() : [];
    this.state = { type: 'brushing', down, pageId: down.pageId, base };
    this.ctx.ui.set({ interacting: 'marquee' });
  }

  private moveBrush(s: Extract<State, { type: 'brushing' }>, p: PointerInfo): void {
    const a = s.down.page;
    const b = this.pagePointOn(s.pageId, p);
    const rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
    const hits = this.editor.elementsInRect(s.pageId, rect).map((el) => el.id);
    this.editor.select([...new Set([...s.base, ...hits])]);
    this.ctx.ui.set({ marquee: { pageId: s.pageId, rect } });
  }

  // ---------------------------------------------------------------------------
  // Handles: resize / rotate / line endpoints
  // ---------------------------------------------------------------------------

  private startHandle(p: PointerInfo, handle: HandleTarget): void {
    const editor = this.editor;
    const sel = editor.getSelectedElements().filter((el) => !el.locked);
    if (!sel.length) return;
    if (handle.kind === 'line') {
      const el = sel[0] as LineElement;
      const m = editor.getElementPageMatrix(el.id);
      const fixed = applyToPoint(
        m,
        handle.end === 'start' ? { x: el.width, y: el.height / 2 } : { x: 0, y: el.height / 2 },
      );
      editor.history.startInteraction();
      this.state = { type: 'line-end', down: p, id: el.id, end: handle.end, fixed };
      this.ctx.ui.set({ interacting: 'resize' });
      return;
    }
    const pageId = editor.getPageIdOf(sel[0]!.id) ?? p.pageId;
    const ids = sel.map((e) => e.id);
    const exclude = new Set<Id>(ids);
    for (const id of ids) for (const d of editor.getDescendantIds(id)) exclude.add(d);
    const subtrees = ids.map((id) => captureSubtree(editor, id));
    editor.history.startInteraction();
    if (handle.kind === 'rotate') {
      const b = sel.length === 1 ? null : editor.getBoundsOf(ids)!;
      const center = b
        ? { x: b.x + b.width / 2, y: b.y + b.height / 2 }
        : applyToPoint(editor.getElementPageMatrix(sel[0]!.id), {
            x: sel[0]!.width / 2,
            y: sel[0]!.height / 2,
          });
      const startAngle = (Math.atan2(p.page.y - center.y, p.page.x - center.x) * 180) / Math.PI;
      this.state = {
        type: 'rotating',
        down: p,
        center,
        startAngle,
        subtrees,
        absStart: sel.length === 1 ? editor.getPageRotation(sel[0]!.id) : 0,
      };
      this.ctx.ui.set({ interacting: 'rotate' });
      return;
    }
    if (handle.kind === 'resize') {
      this.state = {
        type: 'resizing',
        down: { ...p, page: this.pagePointOn(pageId, p) },
        handle: handle.handle,
        subtrees,
        bounds0: editor.getBoundsOf(ids)!,
        targets: this.snapTargets(pageId, exclude),
      };
      this.ctx.ui.set({ interacting: 'resize' });
    }
  }

  private moveResize(s: Extract<State, { type: 'resizing' }>, p: PointerInfo): void {
    const editor = this.editor;
    const pageId = editor.getPageIdOf(s.subtrees[0]![0]!.id) ?? p.pageId;
    let pagePoint = this.pagePointOn(pageId, p);
    const corner = isCornerHandle(s.handle);
    const [hx, hy] = HANDLE_SIGNS[s.handle];

    if (s.subtrees.length > 1) {
      // Multi-selection: uniform scale about the opposite corner (or centre).
      const b = s.bounds0;
      const box0 = { ...b, rotation: 0 };
      let box = resizeBox(box0, s.handle, pagePoint, {
        keepAspect: true,
        fromCenter: p.alt,
        minWidth: 4,
        minHeight: 4,
      });
      if (this.snappingOn(p)) {
        const snap = snapEdges(
          box,
          s.targets,
          hx < 0 ? ['start'] : hx > 0 ? ['end'] : [],
          hy < 0 ? ['start'] : hy > 0 ? ['end'] : [],
          this.threshold(),
        );
        if (snap.dx || snap.dy) {
          pagePoint = { x: pagePoint.x + snap.dx, y: pagePoint.y + snap.dy };
          box = resizeBox(box0, s.handle, pagePoint, {
            keepAspect: true,
            fromCenter: p.alt,
            minWidth: 4,
            minHeight: 4,
          });
        }
        this.ctx.ui.set({ guides: snap.guides, guidesPageId: pageId });
      }
      const k = box.width / b.width;
      const anchor = p.alt
        ? { x: b.x + b.width / 2, y: b.y + b.height / 2 }
        : { x: b.x + (hx < 0 ? b.width : 0), y: b.y + (hy < 0 ? b.height : 0) };
      const records: DesignElement[] = [];
      for (const sub of s.subtrees) {
        const root = sub[0]!;
        const parentAnchor = editor.pageToParent(root.id, anchor);
        const nb = scaleBoxAbout(root, parentAnchor, k);
        records.push(...scaleSubtree(sub, k, nb));
      }
      editor.store.put(records);
      this.setLabel(`${Math.round(box.width)} × ${Math.round(box.height)}`, p);
      return;
    }

    const sub = s.subtrees[0]!;
    const el0 = sub[0]!;
    const local = editor.pageToParent(el0.id, pagePoint);
    const type = el0.type;
    // Corners keep proportions; plain shapes can be freed with Shift.
    const keepAspect = corner && (type === 'shape' ? !p.shift : true);
    const min =
      type === 'text'
        ? Math.max(8, (el0 as { style: { fontSize: number } }).style.fontSize * 0.6)
        : 4;
    let box = resizeBox(el0, s.handle, local, {
      keepAspect,
      fromCenter: p.alt,
      minWidth: min,
      minHeight: 4,
    });

    // Snap moving edges of unrotated top-level elements.
    if (this.snappingOn(p) && !el0.rotation && editor.getPage(el0.parentId)) {
      const snap = snapEdges(
        box,
        s.targets,
        hx < 0 ? ['start'] : hx > 0 ? ['end'] : [],
        hy < 0 ? ['start'] : hy > 0 ? ['end'] : [],
        this.threshold(),
      );
      const adjust =
        keepAspect && corner
          ? Math.abs(snap.dx) > 0
            ? { x: snap.dx, y: 0 }
            : { x: 0, y: snap.dy }
          : { x: snap.dx, y: snap.dy };
      if (adjust.x || adjust.y) {
        box = resizeBox(
          el0,
          s.handle,
          { x: local.x + adjust.x, y: local.y + adjust.y },
          { keepAspect, fromCenter: p.alt, minWidth: min, minHeight: 4 },
        );
      }
      this.ctx.ui.set({ guides: snap.guides, guidesPageId: pageId });
    }

    const k = box.width / el0.width;
    let records: DesignElement[];
    switch (type) {
      case 'text':
        if (corner) {
          records = scaleSubtree(sub, k, { ...box });
        } else {
          records = [
            {
              ...el0,
              x: box.x,
              y: box.y,
              width: box.width,
              rotation: box.rotation,
            } as DesignElement,
          ];
        }
        break;
      case 'group':
        records = scaleSubtree(sub, k, box);
        break;
      case 'path':
        records = corner ? scaleSubtree(sub, k, box) : [{ ...el0, ...box } as DesignElement];
        break;
      case 'image': {
        if (corner) {
          records = scaleSubtree(sub, k, box);
        } else {
          const win = this.sideWindow(el0, box, s.handle, p.alt);
          records = [
            {
              ...el0,
              ...box,
              image: {
                ...el0.image,
                crop: recropForWindow(el0.image.crop, el0.width, el0.height, win),
              },
            } as DesignElement,
          ];
        }
        break;
      }
      case 'frame': {
        if (!el0.image || corner) {
          records = [{ ...el0, ...box } as DesignElement];
        } else {
          const win = this.sideWindow(el0, box, s.handle, p.alt);
          records = [
            {
              ...el0,
              ...box,
              image: {
                ...el0.image,
                crop: recropForWindow(el0.image.crop, el0.width, el0.height, win),
              },
            } as DesignElement,
          ];
        }
        break;
      }
      case 'grid': {
        const next = { ...el0, ...box };
        const cells = el0.cells.map((cell, i) => {
          if (!cell.image) return cell;
          const a = gridCellRect(el0, i);
          const bb = gridCellRect(next, i);
          return {
            ...cell,
            image: {
              ...cell.image,
              crop: refitCrop(cell.image.crop, a.width, a.height, bb.width, bb.height),
            },
          };
        });
        records = [{ ...next, cells } as DesignElement];
        break;
      }
      default:
        records = [{ ...el0, ...box } as DesignElement];
    }
    editor.store.put(records);
    const shown = editor.getElement(el0.id)!;
    this.setLabel(
      type === 'text' && corner
        ? `${Math.round((shown as { style: { fontSize: number } }).style.fontSize)} px`
        : `${Math.round(shown.width)} × ${Math.round(shown.height)}`,
      p,
    );
  }

  /** The new visible window of an element after a side resize, in its old local coordinates. */
  private sideWindow(
    el0: DesignElement,
    box: { width: number; height: number },
    handle: ResizeHandle,
    alt: boolean,
  ): Rect {
    const [hx, hy] = HANDLE_SIGNS[handle];
    let x = 0;
    let y = 0;
    if (alt) {
      x = (el0.width - box.width) / 2;
      y = (el0.height - box.height) / 2;
    } else {
      if (hx < 0) x = el0.width - box.width;
      if (hy < 0) y = el0.height - box.height;
    }
    return { x, y, width: box.width, height: box.height };
  }

  private moveRotate(s: Extract<State, { type: 'rotating' }>, p: PointerInfo): void {
    const editor = this.editor;
    const angle = (Math.atan2(p.page.y - s.center.y, p.page.x - s.center.x) * 180) / Math.PI;
    let delta = angle - s.startAngle;
    if (s.subtrees.length === 1) {
      const el0 = s.subtrees[0]![0]!;
      const abs = snapAngle(s.absStart + delta, p.shift ? 15 : 45, p.shift ? 0 : 3, p.shift);
      delta = abs - s.absStart;
      const rotation = normalizeAngle(el0.rotation + delta);
      editor.store.put([{ ...editor.getElement(el0.id)!, rotation } as DesignElement]);
      this.setLabel(`${Math.round(normalizeAngle(abs))}°`, p);
      return;
    }
    if (p.shift) delta = Math.round(delta / 15) * 15;
    const records: DesignElement[] = [];
    for (const sub of s.subtrees) {
      const el0 = sub[0]!;
      const pivot = editor.pageToParent(el0.id, s.center);
      const box = rotateBoxAbout(el0, pivot, delta);
      records.push({ ...editor.getElement(el0.id)!, ...box } as DesignElement);
    }
    editor.store.put(records);
    this.setLabel(`${Math.round(normalizeAngle(delta))}°`, p);
  }

  private moveLineEnd(s: Extract<State, { type: 'line-end' }>, p: PointerInfo): void {
    const editor = this.editor;
    const el = editor.getElement<LineElement>(s.id);
    if (!el) return;
    const pageId = editor.getPageIdOf(s.id) ?? p.pageId;
    let moving = this.pagePointOn(pageId, p);
    const dx = moving.x - s.fixed.x;
    const dy = moving.y - s.fixed.y;
    if (p.shift) {
      const len = Math.hypot(dx, dy);
      const a = (Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 15) * 15 * Math.PI) / 180;
      moving = { x: s.fixed.x + Math.cos(a) * len, y: s.fixed.y + Math.sin(a) * len };
    }
    const a = editor.pageToParent(s.id, s.fixed);
    const b = editor.pageToParent(s.id, moving);
    const start = s.end === 'start' ? b : a;
    const end = s.end === 'start' ? a : b;
    const len = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
    const rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    editor.store.put([{ ...el, x: cx - len / 2, y: cy - el.height / 2, width: len, rotation }]);
    this.setLabel(`${Math.round(len)} px · ${Math.round(normalizeAngle(-rotation))}°`, p);
  }

  // ---------------------------------------------------------------------------
  // Crop mode
  // ---------------------------------------------------------------------------

  /** Local (window) coordinates of a page point for the element being cropped. */
  private cropLocal(id: Id, p: Point): Point {
    return applyToPoint(invert(this.editor.getElementPageMatrix(id)), p);
  }

  private insideCropImage(
    p: PointerInfo,
    crop: NonNullable<ReturnType<typeof cropContext>>,
  ): boolean {
    const local = this.cropLocal(crop.id, p.page);
    const r = imageRectFromCrop(crop.fill.crop, crop.window.width, crop.window.height);
    const x = local.x - crop.window.x;
    const y = local.y - crop.window.y;
    return x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
  }

  private writeFill(id: Id, fill: ImageFill): void {
    const editor = this.editor;
    const el = editor.getElement(id);
    if (!el) return;
    const cropping = editor.session.state.cropping;
    if (el.type === 'image') editor.store.put([{ ...el, image: fill }]);
    else if (el.type === 'frame') editor.store.put([{ ...el, image: fill }]);
    else if (el.type === 'grid' && cropping?.cell !== undefined) {
      const cells = el.cells.map((c, i) => (i === cropping.cell ? { ...c, image: fill } : c));
      editor.store.put([{ ...el, cells }]);
    }
  }

  private moveCrop(s: Extract<State, { type: 'crop-move' }>, p: PointerInfo): void {
    const id = this.editor.session.state.cropping?.id;
    if (!id) return;
    const a = this.cropLocal(id, s.down.page);
    const b = this.cropLocal(id, p.page);
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (s.fill0.flipX) dx = -dx;
    if (s.fill0.flipY) dy = -dy;
    const r = imageRectFromCrop(s.fill0.crop, s.window.width, s.window.height);
    const moved = {
      ...r,
      x: Math.min(0, Math.max(s.window.width - r.width, r.x + dx)),
      y: Math.min(0, Math.max(s.window.height - r.height, r.y + dy)),
    };
    this.writeFill(id, {
      ...s.fill0,
      crop: cropFromImageRect(moved, s.window.width, s.window.height),
    });
  }

  /** Resize the crop window (image elements only); the image stays put. */
  private moveCropWindow(s: Extract<State, { type: 'crop-window' }>, p: PointerInfo): void {
    const editor = this.editor;
    const el0 = s.el0;
    if (el0.type !== 'image') return;
    const local = editor.pageToParent(el0.id, p.page);
    const img = imageRectFromCrop(s.fill0.crop, el0.width, el0.height);
    const resized = resizeBox(el0, s.handle, local, { minWidth: 8, minHeight: 8 });
    // Express the new window in the old local frame and keep it inside the image.
    const win = this.sideWindow(el0, resized, s.handle, false);
    const clamped = {
      x: Math.max(img.x, win.x),
      y: Math.max(img.y, win.y),
      width: 0,
      height: 0,
    };
    const right = Math.min(img.x + img.width, win.x + win.width);
    const bottom = Math.min(img.y + img.height, win.y + win.height);
    clamped.width = Math.max(8, right - clamped.x);
    clamped.height = Math.max(8, bottom - clamped.y);
    // Recompute the box from the clamped window (in parent space).
    const c = applyToPoint(boxMatrix(el0), {
      x: clamped.x + clamped.width / 2,
      y: clamped.y + clamped.height / 2,
    });
    const shifted = { ...img, x: img.x - clamped.x, y: img.y - clamped.y };
    const crop = cropFromImageRect(shifted, clamped.width, clamped.height);
    editor.store.put([
      {
        ...el0,
        x: c.x - clamped.width / 2,
        y: c.y - clamped.height / 2,
        width: clamped.width,
        height: clamped.height,
        image: { ...s.fill0, crop },
      },
    ]);
  }

  /** Scale the image inside the window by dragging its corner; it must keep covering the window. */
  private moveCropImage(s: Extract<State, { type: 'crop-image' }>, p: PointerInfo): void {
    const id = this.editor.session.state.cropping?.id;
    if (!id) return;
    const local = this.cropLocal(id, p.page);
    const pt = { x: local.x - s.window.x, y: local.y - s.window.y };
    const r = imageRectFromCrop(s.fill0.crop, s.window.width, s.window.height);
    const [hx, hy] = HANDLE_SIGNS[s.handle];
    const anchor = { x: hx < 0 ? r.x + r.width : r.x, y: hy < 0 ? r.y + r.height : r.y };
    const along =
      ((pt.x - anchor.x) * hx * r.width + (pt.y - anchor.y) * hy * r.height) /
      (r.width * r.width + r.height * r.height);
    const minScale = Math.max(s.window.width / r.width, s.window.height / r.height);
    let k = Math.max(along, 0.01);
    const w = r.width * k;
    const h = r.height * k;
    let next = {
      x: hx < 0 ? anchor.x - w : anchor.x,
      y: hy < 0 ? anchor.y - h : anchor.y,
      width: w,
      height: h,
    };
    if (k < minScale) {
      k = minScale;
      next = {
        x: hx < 0 ? anchor.x - r.width * k : anchor.x,
        y: hy < 0 ? anchor.y - r.height * k : anchor.y,
        width: r.width * k,
        height: r.height * k,
      };
    }
    next.x = Math.min(0, Math.max(s.window.width - next.width, next.x));
    next.y = Math.min(0, Math.max(s.window.height - next.height, next.y));
    this.writeFill(id, {
      ...s.fill0,
      crop: cropFromImageRect(next, s.window.width, s.window.height),
    });
  }

  // ---------------------------------------------------------------------------
  // Freehand drawing
  // ---------------------------------------------------------------------------

  private updateLiveStroke(): void {
    const s = this.state;
    if (s.type !== 'drawing') return;
    this.ctx.ui.set({ liveStroke: { pageId: s.pageId, points: [...s.points] } });
  }

  private finishStroke(s: Extract<State, { type: 'drawing' }>): void {
    const editor = this.editor;
    const settings = this.ctx.ui.get().drawing;
    this.ctx.ui.set({ liveStroke: null });
    if (!settings || s.points.length < 1) return;
    if (settings.tool === 'eraser') {
      const hits = new Set<Id>();
      for (const pt of s.points) {
        const hit = editor.hitTest(s.pageId, pt, { tolerance: settings.size / 2 });
        if (hit?.type === 'path') hits.add(hit.id);
      }
      if (hits.size) editor.deleteElements([...hits]);
      return;
    }
    const pts =
      s.points.length === 1
        ? [s.points[0]!, { x: s.points[0]!.x + 0.1, y: s.points[0]!.y + 0.1 }]
        : s.points;
    const size = settings.size;
    const minX = Math.min(...pts.map((q) => q.x)) - size / 2;
    const minY = Math.min(...pts.map((q) => q.y)) - size / 2;
    const maxX = Math.max(...pts.map((q) => q.x)) + size / 2;
    const maxY = Math.max(...pts.map((q) => q.y)) + size / 2;
    const rel = pts.map((q) => ({ x: q.x - minX, y: q.y - minY }));
    const f = (n: number) => Math.round(n * 100) / 100;
    let d = `M${f(rel[0]!.x)} ${f(rel[0]!.y)}`;
    for (let i = 1; i < rel.length - 1; i++) {
      const c = rel[i]!;
      const n = rel[i + 1]!;
      d += ` Q${f(c.x)} ${f(c.y)} ${f((c.x + n.x) / 2)} ${f((c.y + n.y) / 2)}`;
    }
    const last = rel[rel.length - 1]!;
    d += ` L${f(last.x)} ${f(last.y)}`;
    const width = maxX - minX;
    const height = maxY - minY;
    const el = createPath({
      d,
      x: minX,
      y: minY,
      width,
      height,
      pathWidth: width,
      pathHeight: height,
      fill: null,
      stroke: { color: settings.color, width: size, dash: 'solid' },
      opacity: settings.opacity,
      name: settings.tool === 'highlighter' ? 'Highlight' : 'Drawing',
    });
    editor.createElements([el], { pageId: s.pageId, select: false });
  }
}

/** Screen-space corners of an element. */
export function elementScreenCorners(ctx: DesignPadContextValue, id: Id): Point[] {
  const { editor } = ctx;
  const cam = ctx.camera.get();
  const pages = editor.getPages();
  const pageId = editor.getPageIdOf(id);
  const index = pages.findIndex((p) => p.id === pageId);
  if (index < 0) return [];
  const el = editor.getElement(id);
  if (!el) return [];
  const doc = editor.getDocument();
  const pm = editor.getElementPageMatrix(id);
  const { rect } = pageLayout(cam, doc, pages.length, index);
  const screenM = multiply({ a: cam.zoom, b: 0, c: 0, d: cam.zoom, e: rect.x, f: rect.y }, pm);
  return boxCorners(el, screenM);
}
