import type { Id, Point, ResizeHandle } from '@design-pad/core';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  findImageDropTarget,
  insertAsset,
  insertElement,
  photoToUpload,
  uploadAndInsert,
} from '../actions';
import { useDesignPad, type ViewportController } from '../context';
import { clampScroll, fitZoom, pageLayout, revealPage, screenToPage, scrollToPage } from './camera';
import { dragCarriesImage, dragIsOurs, getDragItem } from './dnd';
import { drawViewport } from './draw';
import { type HandleTarget, InteractionController } from './interactions';
import { FloatingToolbar } from './overlays/FloatingToolbar';
import { PageChrome } from './overlays/PageChrome';
import { Scrollbars } from './overlays/Scrollbars';
import { SelectionOverlay } from './overlays/SelectionOverlay';
import { TextEditor } from './overlays/TextEditor';

function parseHandle(target: EventTarget | null): HandleTarget | null {
  const el = (target as Element | null)?.closest?.('[data-handle]');
  const raw = el?.getAttribute('data-handle');
  if (!raw) return null;
  if (raw === 'rotate') return { kind: 'rotate' };
  const [kind, arg] = raw.split(':') as [string, string];
  if (kind === 'line') return { kind: 'line', end: arg as 'start' | 'end' };
  if (kind === 'resize' || kind === 'crop-window' || kind === 'crop-image') {
    return { kind, handle: arg as ResizeHandle };
  }
  return null;
}

function isChrome(target: EventTarget | null): boolean {
  return (
    !!(target as Element | null)?.closest?.('[data-chrome]') &&
    !(target as Element).closest('[data-handle]')
  );
}

/** The canvas area: renders pages and owns pointer, wheel and drop handling. */
export function Viewport() {
  const ctx = useDesignPad();
  const { editor, camera, ui } = ctx;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);

  const controller = useMemo(
    () => new InteractionController(ctx, () => containerRef.current!.getBoundingClientRect()),
    [ctx],
  );

  // ---- Rendering -------------------------------------------------------------
  useEffect(() => {
    const draw = () => {
      frame.current = 0;
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawViewport(canvas, editor, camera.get(), window.devicePixelRatio || 1);
    };
    const schedule = () => {
      if (!frame.current) frame.current = requestAnimationFrame(draw);
    };
    const offs = [
      editor.events.on('change', schedule),
      editor.events.on('session', schedule),
      editor.events.on('render', schedule),
      editor.events.on('load', schedule),
      camera.subscribe(schedule),
    ];
    const media = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    media?.addEventListener?.('change', schedule);
    schedule();
    return () => {
      for (const off of offs) off();
      media?.removeEventListener?.('change', schedule);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [editor, camera]);

  // ---- Size & fit ---------------------------------------------------------------
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const c = camera.get();
      const doc = editor.getDocument();
      const n = editor.getPages().length;
      let next = { ...c, viewportW: w, viewportH: h };
      if (c.fit) next.zoom = fitZoom(doc, w, h);
      next = clampScroll(next, doc, n);
      camera.set(next);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    // Re-fit when the design size changes.
    const off = editor.events.on('change', ({ diff }) => {
      if ('document' in diff.updated) {
        const c = camera.get();
        if (c.fit)
          camera.set({ ...c, zoom: fitZoom(editor.getDocument(), c.viewportW, c.viewportH) });
      }
    });
    const offLoad = editor.events.on('load', () => {
      const c = camera.get();
      camera.set({
        ...c,
        fit: true,
        scrollX: 0,
        scrollY: 0,
        zoom: fitZoom(editor.getDocument(), c.viewportW, c.viewportH),
      });
    });
    return () => {
      ro.disconnect();
      off();
      offLoad();
    };
  }, [camera, editor]);

  // ---- Controller API --------------------------------------------------------------
  useEffect(() => {
    const api: ViewportController = {
      zoomTo: (zoom, anchor) => controller.zoomTo(zoom, anchor),
      zoomToFit: () => {
        const c = camera.get();
        const doc = editor.getDocument();
        const pages = editor.getPages();
        const index = Math.max(
          0,
          pages.findIndex((p) => p.id === editor.getCurrentPageId()),
        );
        const fitted = { ...c, zoom: fitZoom(doc, c.viewportW, c.viewportH), fit: true };
        camera.set(scrollToPage(fitted, doc, pages.length, index));
      },
      scrollToPage: (pageId) => {
        const pages = editor.getPages();
        const i = pages.findIndex((p) => p.id === pageId);
        if (i >= 0) camera.set(scrollToPage(camera.get(), editor.getDocument(), pages.length, i));
      },
      revealPage: (pageId) => {
        const pages = editor.getPages();
        const i = pages.findIndex((p) => p.id === pageId);
        if (i >= 0) camera.set(revealPage(camera.get(), editor.getDocument(), pages.length, i));
      },
      clientToPage: (clientX, clientY) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const pages = editor.getPages();
        const hit = screenToPage(
          camera.get(),
          editor.getDocument(),
          pages.length,
          clientX - rect.left,
          clientY - rect.top,
        );
        return { pageId: pages[hit.index]!.id, point: hit.point, inside: hit.inside };
      },
      pageToClient: (pageId: Id, p: Point) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const pages = editor.getPages();
        const i = Math.max(
          0,
          pages.findIndex((pg) => pg.id === pageId),
        );
        const c = camera.get();
        const { rect: pr } = pageLayout(c, editor.getDocument(), pages.length, i);
        return {
          x: (rect?.left ?? 0) + pr.x + p.x * c.zoom,
          y: (rect?.top ?? 0) + pr.y + p.y * c.zoom,
        };
      },
      getRect: () => containerRef.current?.getBoundingClientRect() ?? null,
      focus: () => containerRef.current?.focus({ preventScroll: true }),
    };
    ctx.viewport.current = api;
    return () => {
      if (ctx.viewport.current === api) ctx.viewport.current = null;
    };
  }, [ctx, controller, camera, editor]);

  // ---- Native listeners (wheel must be non-passive) ------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (isChrome(e.target) && !(e.ctrlKey || e.metaKey)) {
        const scrollable = (e.target as Element).closest('.dp-scrollable');
        if (scrollable) return;
      }
      controller.wheel(e);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (e.type === 'keyup') {
        controller.setSpace(false);
        el.classList.remove('is-panning');
        return;
      }
      // composedPath()[0] is the real target even inside a Shadow DOM mount.
      const path = e.composedPath();
      const t = (path[0] ?? e.target) as HTMLElement;
      if (
        t.isContentEditable ||
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT'
      )
        return;
      // Leave Space alone for host page controls outside the editor.
      const root = ctx.root.current;
      if (t !== document.body && !(root && path.includes(root))) return;
      controller.setSpace(true);
      el.classList.add('is-panning');
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [controller, ctx.root]);

  // ---- Pointer events ------------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isChrome(e.target)) return;
    if (e.button === 2) return;
    const handle = parseHandle(e.target);
    containerRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    controller.pointerDown(e.nativeEvent, handle);
    if (!editor.session.state.editingId) e.preventDefault();
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!dragIsOurs(e.nativeEvent)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dragCarriesImage(e.nativeEvent)) {
      const hit = ctx.viewport.current?.clientToPage(e.clientX, e.clientY);
      const target = hit?.inside ? findImageDropTarget(ctx, hit.pageId, hit.point) : null;
      const cur = ui.get().dropTarget;
      if (target?.id !== cur?.id || target?.cell !== cur?.cell) ui.set({ dropTarget: target });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    if (!dragIsOurs(e.nativeEvent)) return;
    e.preventDefault();
    ui.set({ dropTarget: null });
    const hit = ctx.viewport.current?.clientToPage(e.clientX, e.clientY);
    if (!hit) return;
    const at = { pageId: hit.pageId, point: hit.point };
    const target = hit.inside ? findImageDropTarget(ctx, hit.pageId, hit.point) : null;
    if (e.dataTransfer.files.length) {
      void uploadAndInsert(ctx, [...e.dataTransfer.files], { at, target });
      return;
    }
    const item = getDragItem(e.nativeEvent);
    if (!item) return;
    if (item.kind === 'element') insertElement(ctx, item.init, at);
    else if (item.kind === 'asset') insertAsset(ctx, item.asset, { at, target });
    else if (item.kind === 'photo') {
      ctx.options.photos?.onUse?.(item.photo);
      insertAsset(ctx, photoToUpload(item.photo), { at, target });
    }
  };

  return (
    <div
      ref={containerRef}
      className="dp-viewport"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => controller.pointerMove(e.nativeEvent)}
      onPointerUp={(e) => controller.pointerUp(e.nativeEvent)}
      onPointerCancel={() => controller.cancel()}
      onPointerLeave={() => {
        if (!controller.busy) editor.setHovered(null);
      }}
      onDoubleClick={(e) => {
        if (isChrome(e.target)) return;
        controller.doubleClick(e.nativeEvent);
      }}
      onContextMenu={(e) => {
        if (isChrome(e.target)) return;
        e.preventDefault();
        const hit = ctx.viewport.current?.clientToPage(e.clientX, e.clientY);
        if (hit?.inside) {
          const el = editor.hitTest(hit.pageId, hit.point, { tolerance: 4 / camera.get().zoom });
          if (el && !editor.getSelectedIds().includes(el.id)) editor.select([el.id]);
          if (!el) editor.clearSelection();
          editor.setCurrentPage(hit.pageId);
        }
        ui.set({ contextMenu: { x: e.clientX, y: e.clientY } });
      }}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) ui.set({ dropTarget: null });
      }}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} className="dp-canvas" />
      <PageChrome />
      <SelectionOverlay />
      <TextEditor />
      <FloatingToolbar />
      <Scrollbars />
    </div>
  );
}
