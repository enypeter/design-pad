import type { DesignElement, Editor, Id, Point } from '@design-pad/core';
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { Camera } from './canvas/camera';
import type { TextEditorHandle } from './canvas/overlays/TextEditor';
import type { AssetAdapter, DesignPadOptions, FeatureFlags } from './config';
import { shallowEqual, useStore } from './state/store';
import type { CameraStore, UIState, UIStore } from './state/ui';

export interface ViewportController {
  zoomTo(zoom: number, anchor?: Point): void;
  zoomToFit(): void;
  scrollToPage(pageId: Id): void;
  revealPage(pageId: Id): void;
  /** Map a client (window) point to a page. */
  clientToPage(
    clientX: number,
    clientY: number,
  ): { pageId: Id; point: Point; inside: boolean } | null;
  /** Map a page point to client (window) coordinates. */
  pageToClient(pageId: Id, p: Point): Point;
  /** Bounding client rect of the viewport element. */
  getRect(): DOMRect | null;
  focus(): void;
}

export interface DesignPadContextValue {
  editor: Editor;
  ui: UIStore;
  camera: CameraStore;
  options: DesignPadOptions;
  features: FeatureFlags;
  assets: AssetAdapter;
  viewport: { current: ViewportController | null };
  /** Root element of the editor (portal target for menus/popovers). */
  root: { current: HTMLElement | null };
  /** The in-place text editor while one is open. */
  textEditor: { current: TextEditorHandle | null };
}

export const DesignPadContext = createContext<DesignPadContextValue | null>(null);

export function useDesignPad(): DesignPadContextValue {
  const ctx = useContext(DesignPadContext);
  if (!ctx) throw new Error('Design Pad components must be rendered inside <DesignPad>');
  return ctx;
}

export function useEditor(): Editor {
  return useDesignPad().editor;
}

/**
 * Derive a value from the editor and re-render when it changes. The
 * selector runs on every document/session change; keep it cheap.
 */
export function useEditorValue<T>(
  selector: (editor: Editor) => T,
  isEqual: (a: T, b: T) => boolean = shallowEqual,
): T {
  const editor = useEditor();
  const cache = useRef<{ value: T } | null>(null);
  const subscribe = useCallback(
    (cb: () => void) => {
      const offs = [
        editor.events.on('change', cb),
        editor.events.on('session', cb),
        editor.events.on('history', cb),
        editor.events.on('render', cb),
        editor.events.on('load', cb),
      ];
      return () => {
        for (const off of offs) off();
      };
    },
    [editor],
  );
  const getSnapshot = () => {
    const next = selector(editor);
    if (cache.current && isEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next };
    return next;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useUI<S>(selector: (s: UIState) => S): S {
  return useStore(useDesignPad().ui, selector);
}

export function useCamera<S>(selector: (c: Camera) => S): S {
  return useStore(useDesignPad().camera, selector);
}

/** Selected elements (stable while unchanged). */
export function useSelection(): DesignElement[] {
  return useEditorValue((e) => e.getSelectedElements());
}

export type SelectionKind =
  | 'none'
  | 'multi'
  | 'group'
  | 'text'
  | 'shape'
  | 'line'
  | 'image'
  | 'frame'
  | 'grid'
  | 'svg'
  | 'path';

export function selectionKind(selection: DesignElement[]): SelectionKind {
  if (selection.length === 0) return 'none';
  if (selection.length > 1) return 'multi';
  return selection[0]!.type;
}
