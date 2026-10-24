import {
  createLine,
  createShape,
  createText,
  type DesignElement,
  type TextElement,
} from '@design-pad/core';
import { useEffect } from 'react';
import {
  deleteSelection,
  duplicateSelection,
  handlePasteEvent,
  insertElement,
  toggleLock,
  writeClipboardEvent,
} from './actions';
import type { DesignPadContextValue } from './context';
import { defaultTextPresets } from './library/text';

export interface ShortcutDef {
  keys: string;
  label: string;
  group: 'Editing' | 'Text' | 'Arrange' | 'View' | 'Insert';
}

/** Shown in the keyboard shortcuts dialog. "Mod" is Cmd on Mac, Ctrl elsewhere. */
export const SHORTCUTS: ShortcutDef[] = [
  { keys: 'Mod+Z', label: 'Undo', group: 'Editing' },
  { keys: 'Mod+Shift+Z', label: 'Redo', group: 'Editing' },
  { keys: 'Mod+C / Mod+X / Mod+V', label: 'Copy / cut / paste', group: 'Editing' },
  { keys: 'Mod+D', label: 'Duplicate', group: 'Editing' },
  { keys: 'Delete', label: 'Delete', group: 'Editing' },
  { keys: 'Mod+A', label: 'Select all', group: 'Editing' },
  { keys: 'Esc', label: 'Deselect / stop editing', group: 'Editing' },
  { keys: 'Arrows', label: 'Nudge 1px (Shift: 10px)', group: 'Editing' },
  { keys: 'Alt+drag', label: 'Duplicate while dragging', group: 'Editing' },
  { keys: 'Mod+drag', label: 'Move without snapping', group: 'Editing' },
  { keys: 'Shift+Alt+L', label: 'Lock / unlock', group: 'Editing' },
  { keys: 'Mod+S', label: 'Save', group: 'Editing' },
  { keys: 'Enter', label: 'Edit selected text', group: 'Text' },
  { keys: 'Mod+B / I / U', label: 'Bold / italic / underline', group: 'Text' },
  { keys: 'Mod+Shift+K', label: 'Uppercase', group: 'Text' },
  {
    keys: 'Mod+Shift+L / C / R / J',
    label: 'Align left / centre / right / justify',
    group: 'Text',
  },
  { keys: 'Mod+Shift+> / <', label: 'Increase / decrease font size', group: 'Text' },
  { keys: 'Mod+G', label: 'Group', group: 'Arrange' },
  { keys: 'Mod+Shift+G', label: 'Ungroup', group: 'Arrange' },
  { keys: 'Mod+]', label: 'Bring forward', group: 'Arrange' },
  { keys: 'Mod+[', label: 'Send backward', group: 'Arrange' },
  { keys: 'Mod+Alt+]', label: 'Bring to front', group: 'Arrange' },
  { keys: 'Mod+Alt+[', label: 'Send to back', group: 'Arrange' },
  { keys: 'Mod+= / Mod+-', label: 'Zoom in / out', group: 'View' },
  { keys: 'Mod+0', label: 'Zoom to fit', group: 'View' },
  { keys: 'Space+drag', label: 'Pan', group: 'View' },
  { keys: 'Mod+Enter', label: 'Add page', group: 'View' },
  { keys: 'T', label: 'Add text box', group: 'Insert' },
  { keys: 'R', label: 'Add rectangle', group: 'Insert' },
  { keys: 'C', label: 'Add circle', group: 'Insert' },
  { keys: 'L', label: 'Add line', group: 'Insert' },
  { keys: '?', label: 'Show shortcuts', group: 'View' },
];

function isTyping(e: Event): boolean {
  const el = (e.composedPath()[0] ?? e.target) as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];

export function nextZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-3) ?? 5;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-3) ?? 0.1;
}

/** Keyboard and clipboard handling for the editor root. */
export function useShortcuts(ctx: DesignPadContextValue): void {
  useEffect(() => {
    const root = ctx.root.current;
    if (!root) return;
    const { editor, ui } = ctx;

    // composedPath() sees through Shadow DOM, where targets are retargeted to the host.
    const inEditor = (e: Event) => {
      const t = e.target as Node | null;
      return e.composedPath().includes(root) || t === document.body;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!inEditor(e) || isTyping(e)) return;
      if (ui.get().dialog) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;
      const lower = key.toLowerCase();
      const sel = editor.getSelectedElements();
      const ids = sel.map((s) => s.id);
      const texts = sel.filter((s): s is TextElement => s.type === 'text');
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (mod && lower === 'z') {
        handled();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && lower === 'y') {
        handled();
        editor.redo();
        return;
      }
      if (mod && lower === 's') {
        handled();
        void ctx.options.onSave?.(editor.toJSON(), editor);
        return;
      }
      if (mod && lower === 'a') {
        handled();
        editor.selectAll();
        return;
      }
      if (mod && lower === 'd') {
        handled();
        duplicateSelection(ctx);
        return;
      }
      if (mod && lower === 'g') {
        handled();
        if (e.shiftKey) {
          if (sel.length === 1 && sel[0]!.type === 'group') editor.ungroupElements(sel[0]!.id);
        } else if (sel.length > 1) {
          editor.groupElements(ids);
        }
        return;
      }
      if (mod && (key === ']' || key === '[')) {
        handled();
        const up = key === ']';
        editor.reorderElements(
          ids,
          e.altKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward',
        );
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        handled();
        ctx.viewport.current?.zoomTo(nextZoom(ctx.camera.get().zoom, 1));
        return;
      }
      if (mod && key === '-') {
        handled();
        ctx.viewport.current?.zoomTo(nextZoom(ctx.camera.get().zoom, -1));
        return;
      }
      if (mod && key === '0') {
        handled();
        ctx.viewport.current?.zoomToFit();
        return;
      }
      if (mod && key === 'Enter') {
        handled();
        if (ctx.features.multiPage) {
          const page = editor.addPage();
          requestAnimationFrame(() => ctx.viewport.current?.revealPage(page.id));
        }
        return;
      }
      if (e.shiftKey && e.altKey && lower === 'l') {
        handled();
        toggleLock(ctx);
        return;
      }
      if (texts.length && mod) {
        const style = texts[0]!.style;
        const tids = texts.map((t) => t.id);
        if (lower === 'b') {
          handled();
          editor.applyTextStyle(tids, { fontWeight: style.fontWeight >= 600 ? 400 : 700 });
          return;
        }
        if (lower === 'i') {
          handled();
          editor.applyTextStyle(tids, { italic: !style.italic });
          return;
        }
        if (lower === 'u') {
          handled();
          editor.applyTextStyle(tids, { underline: !style.underline });
          return;
        }
        if (e.shiftKey && lower === 'k') {
          handled();
          editor.applyTextStyle(tids, { uppercase: !style.uppercase });
          return;
        }
        if (e.shiftKey && ['l', 'c', 'r', 'j'].includes(lower)) {
          handled();
          const align = ({ l: 'left', c: 'center', r: 'right', j: 'justify' } as const)[
            lower as 'l'
          ];
          editor.applyTextStyle(tids, { align });
          return;
        }
        if (e.shiftKey && (key === '>' || key === '<' || key === '.' || key === ',')) {
          handled();
          const up = key === '>' || key === '.';
          editor.applyTextStyle(tids, {
            fontSize: Math.max(1, Math.round(style.fontSize * (up ? 1.1 : 1 / 1.1))),
          });
          return;
        }
      }
      if (mod) return;

      switch (key) {
        case 'Escape':
          if (editor.session.state.cropping) editor.stopCropping();
          else if (ui.get().drawing) ui.set({ drawing: null, leftPanel: null });
          else if (editor.session.state.focusedGroupId && sel.length) {
            const group = editor.session.state.focusedGroupId;
            editor.focusGroup(null);
            editor.select([group]);
          } else editor.clearSelection();
          ui.set({ contextMenu: null, contextPanel: null });
          handled();
          return;
        case 'Delete':
        case 'Backspace':
          if (!ids.length) return;
          handled();
          deleteSelection(ctx);
          return;
        case 'Enter':
          if (texts.length === 1 && sel.length === 1) {
            handled();
            editor.startTextEditing(texts[0]!.id);
          } else if (sel.length === 1 && (sel[0]!.type === 'image' || sel[0]!.type === 'frame')) {
            handled();
            editor.startCropping({ id: sel[0]!.id });
          } else if (editor.session.state.cropping) {
            handled();
            editor.stopCropping();
          }
          return;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!ids.length) return;
          handled();
          const step = e.shiftKey ? 10 : 1;
          const d = {
            x: key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0,
            y: key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0,
          };
          editor.moveElements(ids, d);
          return;
        }
        case '?':
          handled();
          ui.set({ dialog: 'shortcuts' });
          return;
      }
      if (e.altKey || e.shiftKey) return;
      const doc = editor.getDocument();
      const base = Math.min(doc.width, doc.height);
      let init: (Partial<DesignElement> & { type: DesignElement['type'] }) | null = null;
      if (lower === 't') {
        const preset = defaultTextPresets(doc)[3]!;
        const el = createText({ spans: [{ text: preset.text }], style: preset.style });
        init = { ...el, width: editor.text.naturalWidth(el) };
      } else if (lower === 'r')
        init = createShape({ shape: 'rect', width: base * 0.3, height: base * 0.3 });
      else if (lower === 'c')
        init = createShape({ shape: 'ellipse', width: base * 0.3, height: base * 0.3 });
      else if (lower === 'l')
        init = createLine({
          width: base * 0.4,
          stroke: { color: '#000000', width: Math.max(2, base * 0.005), dash: 'solid' },
        });
      if (init) {
        handled();
        const id = insertElement(ctx, init);
        if (init.type === 'text') editor.startTextEditing(id);
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (!inEditor(e) || isTyping(e)) return;
      writeClipboardEvent(ctx, e, false);
    };
    const onCut = (e: ClipboardEvent) => {
      if (!inEditor(e) || isTyping(e)) return;
      writeClipboardEvent(ctx, e, true);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!inEditor(e) || isTyping(e)) return;
      void handlePasteEvent(ctx, e);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [ctx]);
}
