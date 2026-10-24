import type { Id, Point, Rect, SnapGuide } from '@design-pad/core';
import type { Camera } from '../canvas/camera';
import type { LeftPanelId } from '../config';
import { createStore, type WritableStore } from './store';

export type ContextPanelId = 'font' | 'color' | 'effects' | 'edit-image' | 'position';

/** What the colour panel is editing. */
export type ColorTarget =
  | { kind: 'text' }
  | { kind: 'fill' }
  | { kind: 'stroke' }
  | { kind: 'line' }
  | { kind: 'background' }
  | { kind: 'svg'; original: string }
  | { kind: 'effect'; key: 'color' | 'colorA' | 'colorB' }
  | { kind: 'grid-cell'; cell: number }
  | { kind: 'frame' }
  | { kind: 'draw' };

export type DialogId = 'download' | 'resize' | 'shortcuts';

export interface DrawSettings {
  tool: 'pen' | 'marker' | 'highlighter' | 'eraser';
  color: string;
  size: number;
  opacity: number;
}

export interface UIState {
  leftPanel: LeftPanelId | null;
  contextPanel: ContextPanelId | null;
  colorTarget: ColorTarget | null;
  dialog: DialogId | null;
  contextMenu: { x: number; y: number } | null;
  guides: SnapGuide[];
  guidesPageId: Id | null;
  marquee: { pageId: Id; rect: Rect } | null;
  /** Live size/angle readout next to the pointer during transforms (screen coords). */
  transformLabel: { text: string; at: Point } | null;
  interacting: 'drag' | 'resize' | 'rotate' | 'marquee' | 'pan' | 'draw' | null;
  pagesStrip: boolean;
  drawing: DrawSettings | null;
  dropTarget: { id: Id; cell?: number } | null;
  toast: { message: string; kind: 'info' | 'error'; id: number } | null;
  /** True while a pointer drag is in progress (hides floating toolbars). */
  pointerDown: boolean;
  /** Client point where a double-click started text editing (caret placement). */
  pendingCaret: Point | null;
  /** Freehand stroke being drawn (page coordinates). */
  liveStroke: { pageId: Id; points: Point[] } | null;
}

export const initialUI: UIState = {
  leftPanel: 'design',
  contextPanel: null,
  colorTarget: null,
  dialog: null,
  contextMenu: null,
  guides: [],
  guidesPageId: null,
  marquee: null,
  transformLabel: null,
  interacting: null,
  pagesStrip: false,
  drawing: null,
  dropTarget: null,
  toast: null,
  pointerDown: false,
  pendingCaret: null,
  liveStroke: null,
};

export type UIStore = WritableStore<UIState>;
export type CameraStore = WritableStore<Camera>;

export function createUIStore(patch: Partial<UIState> = {}): UIStore {
  return createStore<UIState>({ ...initialUI, ...patch });
}

export function createCameraStore(): CameraStore {
  return createStore<Camera>({
    zoom: 0.5,
    scrollX: 0,
    scrollY: 0,
    viewportW: 800,
    viewportH: 600,
    fit: true,
  });
}

let toastId = 0;
export function showToast(ui: UIStore, message: string, kind: 'info' | 'error' = 'info'): void {
  const id = ++toastId;
  ui.set({ toast: { message, kind, id } });
  setTimeout(() => {
    if (ui.get().toast?.id === id) ui.set({ toast: null });
  }, 3500);
}
