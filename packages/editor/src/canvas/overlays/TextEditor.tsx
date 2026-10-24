import {
  effectGeometry,
  LIST_INDENT_EM,
  LIST_MARKER_EM,
  letterSpacingPx,
  multiply,
  type SpanStyle,
  strokeWidthFor,
  type TextElement,
  type TextSpan,
  toDOMMatrixString,
  withAlpha,
} from '@design-pad/core';
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from 'react';
import { useCamera, useDesignPad, useEditorValue, useUI } from '../../context';
import {
  applyStyleToSelection,
  domToSpans,
  placeCaretAt,
  restoreSelection,
  saveSelection,
  selectAll,
  selectionStyle,
  selectWordAtCaret,
  spansToHtml,
} from '../../text/richtext';
import { pageLayout } from '../camera';

export interface TextEditorHandle {
  root: HTMLElement;
  /** Style the selected characters. False when nothing is selected. */
  applyStyle(style: SpanStyle): boolean;
  selectionStyle(): ReturnType<typeof selectionStyle>;
}

function effectCss(el: TextElement): CSSProperties {
  const e = el.effect;
  if (!e) return {};
  const size = el.style.fontSize;
  switch (e.type) {
    case 'shadow':
    case 'lift': {
      const g = effectGeometry(e, size);
      const color = e.type === 'shadow' ? withAlpha(e.color, g.alpha) : `rgba(0,0,0,${g.alpha})`;
      return { textShadow: `${g.dx}px ${g.dy}px ${g.blur}px ${color}` };
    }
    case 'hollow':
      return {
        WebkitTextFillColor: 'transparent',
        WebkitTextStroke: `${strokeWidthFor(e.thickness, size)}px currentColor`,
      };
    case 'splice': {
      const g = effectGeometry(e, size);
      return {
        WebkitTextFillColor: 'transparent',
        WebkitTextStroke: `${strokeWidthFor(e.thickness, size)}px currentColor`,
        textShadow: `${g.dx}px ${g.dy}px 0 ${e.color}`,
      };
    }
    case 'outline':
      return {
        WebkitTextStroke: `${strokeWidthFor(e.thickness, size) * 2}px ${e.color}`,
        paintOrder: 'stroke fill',
      };
    case 'echo': {
      const g = effectGeometry(e, size);
      return {
        textShadow: `${g.dx}px ${g.dy}px 0 ${withAlpha(e.color, 0.5)}, ${g.dx * 2}px ${g.dy * 2}px 0 ${withAlpha(e.color, 0.25)}`,
      };
    }
    case 'glitch': {
      const g = effectGeometry(e, size);
      return {
        textShadow: `${-g.dx}px ${-g.dy}px 0 ${e.colorA}, ${g.dx}px ${g.dy}px 0 ${e.colorB}`,
      };
    }
    case 'neon': {
      const k = e.intensity / 100;
      return {
        textShadow: `0 0 ${size * 0.12 * (0.4 + k)}px currentColor, 0 0 ${size * 0.3 * (0.4 + k)}px currentColor`,
      };
    }
    default:
      return {};
  }
}

/** In-place text editor: a contenteditable laid out exactly like the canvas text. */
export function TextEditor() {
  const ctx = useDesignPad();
  const { editor, ui } = ctx;
  const editingId = useEditorValue((e) => e.session.state.editingId);
  const el = useEditorValue((e) =>
    editingId ? (e.getElement<TextElement>(editingId) ?? null) : null,
  );
  const cam = useCamera((c) => c);
  const pendingCaret = useUI((s) => s.pendingCaret);
  const ref = useRef<HTMLDivElement>(null);
  const lastSpans = useRef<TextSpan[] | null>(null);

  /** Read the DOM back into the element's spans. */
  const commit = () => {
    const root = ref.current;
    const id = editor.session.state.editingId;
    const current = id ? editor.getElement<TextElement>(id) : undefined;
    if (!root || !id || !current) return;
    const spans = domToSpans(root, current.style);
    editor.setTextSpans(id, spans);
    lastSpans.current = editor.getElement<TextElement>(id)?.spans ?? spans;
  };

  // Start/stop an editing session: one undo step for the whole edit.
  useEffect(() => {
    if (!editingId) return;
    const id = editingId;
    editor.history.startInteraction();
    return () => {
      const current = editor.getElement<TextElement>(id);
      const text = current?.spans.map((s) => s.text).join('') ?? '';
      if (current && !text.trim()) editor.deleteElements([id]);
      editor.history.endInteraction();
      ctx.textEditor.current = null;
    };
  }, [editingId, editor, ctx]);

  // Fill the DOM when editing starts or the spans change from outside (toolbar).
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !el) return;
    if (lastSpans.current === el.spans) return;
    const isFirst = lastSpans.current === null;
    const saved = isFirst ? null : saveSelection(root);
    root.innerHTML = spansToHtml(el.spans, el.style);
    lastSpans.current = el.spans;
    if (isFirst) {
      root.focus({ preventScroll: true });
      if (pendingCaret) {
        placeCaretAt(root, pendingCaret.x, pendingCaret.y);
        selectWordAtCaret(root);
        ui.set({ pendingCaret: null });
      } else {
        selectAll(root);
      }
    } else if (saved) {
      restoreSelection(root, saved);
    }
  }, [el, pendingCaret, ui]);

  useEffect(() => {
    if (!editingId) lastSpans.current = null;
  }, [editingId]);

  // Expose selection styling to the toolbar.
  useEffect(() => {
    const root = ref.current;
    if (!root || !el) return;
    const base = el.style;
    ctx.textEditor.current = {
      root,
      applyStyle: (style) => {
        const ok = applyStyleToSelection(root, style, base);
        if (ok) commit();
        return ok;
      },
      selectionStyle: () => selectionStyle(root, base),
    };
  });

  if (!el || !editingId) return null;

  const doc = editor.getDocument();
  const pages = editor.getPages();
  const pageId = editor.getPageIdOf(el.id);
  const index = pages.findIndex((p) => p.id === pageId);
  if (index < 0) return null;
  const { rect } = pageLayout(cam, doc, pages.length, index);
  let m = multiply(
    { a: cam.zoom, b: 0, c: 0, d: cam.zoom, e: rect.x, f: rect.y },
    editor.getElementPageMatrix(el.id),
  );
  let width = el.width;
  if (el.curve) {
    // Curved text is edited on a straight line centred on the arc.
    width = editor.text.naturalWidth(el);
    const lh = el.style.fontSize * el.style.lineHeight;
    m = multiply(m, { a: 1, b: 0, c: 0, d: 1, e: (el.width - width) / 2, f: (el.height - lh) / 2 });
  }
  const s = el.style;
  const indent = s.list !== 'none' ? s.fontSize * LIST_INDENT_EM : 0;

  const style = {
    transform: toDOMMatrixString(m),
    width,
    minHeight: el.curve ? undefined : el.height,
    fontFamily: `"${s.fontFamily}", sans-serif`,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    fontStyle: s.italic ? 'italic' : 'normal',
    color: s.color,
    lineHeight: s.lineHeight,
    letterSpacing: `${letterSpacingPx(s)}px`,
    textAlign: s.align,
    textTransform: s.uppercase ? 'uppercase' : 'none',
    opacity: el.opacity,
    '--dp-list-indent': `${indent}px`,
    '--dp-list-marker': `${s.fontSize * LIST_MARKER_EM}px`,
    ...effectCss(el),
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`dp-text-editor${s.list !== 'none' ? ` dp-list-${s.list}` : ''}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      tabIndex={0}
      aria-multiline="true"
      aria-label="Edit text"
      data-chrome
      style={style}
      onInput={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          commit();
          editor.stopTextEditing();
          ctx.viewport.current?.focus();
        }
        const mod = e.metaKey || e.ctrlKey;
        if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
          e.preventDefault();
          const k = e.key.toLowerCase();
          const current = editor.getElement<TextElement>(editingId);
          if (!current) return;
          const sel = selectionStyle(ref.current!, current.style);
          const patch: SpanStyle =
            k === 'b'
              ? {
                  fontWeight:
                    sel?.fontWeight === 700 || (sel?.fontWeight as number) >= 600 ? 400 : 700,
                }
              : k === 'i'
                ? { italic: sel?.italic !== true }
                : { underline: sel?.underline !== true };
          if (!applyStyleToSelection(ref.current!, patch, current.style)) {
            editor.applyTextStyle([editingId], patch as never);
          } else {
            commit();
          }
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
      onBlur={(e) => {
        // Keep editing when focus moves into editor chrome (toolbar, font panel...).
        const next = e.relatedTarget as HTMLElement | null;
        if (next && ctx.root.current?.contains(next)) return;
        commit();
      }}
    />
  );
}
