import type { DesignElement, Editor, Fill, TextEffect, TextElement } from '@design-pad/core';
import type { DesignPadContextValue } from './context';
import type { ColorTarget } from './state/ui';

type Ctx = DesignPadContextValue;

const solidOf = (fill: Fill | null | undefined): string | null =>
  fill?.type === 'solid' ? fill.color : null;

/** The colour (or fill) a target currently shows, for highlighting swatches. */
export function readTarget(editor: Editor, target: ColorTarget): Fill | null {
  if (target.kind === 'background') return editor.getCurrentPage().background.fill;
  const el = editor.getSelectedElements()[0];
  if (!el) return null;
  switch (target.kind) {
    case 'text':
      return el.type === 'text' ? { type: 'solid', color: el.style.color } : null;
    case 'fill':
      return el.type === 'shape' ? el.fill : el.type === 'path' ? el.fill : null;
    case 'stroke':
      if (el.type === 'shape' || el.type === 'image' || el.type === 'frame' || el.type === 'path') {
        return el.stroke ? { type: 'solid', color: el.stroke.color } : null;
      }
      return null;
    case 'line':
      return el.type === 'line' ? { type: 'solid', color: el.stroke.color } : null;
    case 'svg':
      return el.type === 'svg'
        ? { type: 'solid', color: el.colors[target.original] ?? target.original }
        : null;
    case 'effect': {
      if (el.type !== 'text' || !el.effect) return null;
      const v = (el.effect as Record<string, unknown>)[target.key];
      return typeof v === 'string' ? { type: 'solid', color: v } : null;
    }
    case 'grid-cell':
      return el.type === 'grid'
        ? { type: 'solid', color: el.cells[target.cell]?.color ?? '#e6e6e9' }
        : null;
    case 'frame':
      return el.type === 'frame' ? { type: 'solid', color: el.color } : null;
    default:
      return null;
  }
}

/** Whether a target accepts gradients. */
export function targetSupportsGradient(target: ColorTarget): boolean {
  return target.kind === 'fill' || target.kind === 'background';
}

/** Apply a colour/fill to a target on the current selection (or page). */
export function writeTarget(ctx: Ctx, target: ColorTarget, value: Fill): void {
  const { editor } = ctx;
  const color = value.type === 'solid' ? value.color : (value.stops[0]?.color ?? '#000000');
  if (target.kind === 'background') {
    editor.setPageBackground(editor.getCurrentPageId(), { fill: value });
    return;
  }
  if (target.kind === 'draw') {
    const d = ctx.ui.get().drawing;
    if (d) ctx.ui.set({ drawing: { ...d, color } });
    return;
  }
  const sel = editor.getSelectedElements();
  if (target.kind === 'text') {
    if (ctx.textEditor.current?.applyStyle({ color })) return;
    editor.applyTextStyle(
      sel.filter((e) => e.type === 'text').map((e) => e.id),
      { color },
    );
    return;
  }
  const updates: DesignElement[] = [];
  for (const el of sel) {
    switch (target.kind) {
      case 'fill':
        if (el.type === 'shape') updates.push({ ...el, fill: value });
        else if (el.type === 'path') updates.push({ ...el, fill: value });
        break;
      case 'stroke':
        if (
          el.type === 'shape' ||
          el.type === 'image' ||
          el.type === 'frame' ||
          el.type === 'path'
        ) {
          updates.push({
            ...el,
            stroke: { width: el.stroke?.width || 4, dash: el.stroke?.dash ?? 'solid', color },
          } as DesignElement);
        }
        break;
      case 'line':
        if (el.type === 'line') updates.push({ ...el, stroke: { ...el.stroke, color } });
        break;
      case 'svg':
        if (el.type === 'svg')
          updates.push({ ...el, colors: { ...el.colors, [target.original]: color } });
        break;
      case 'effect':
        if (el.type === 'text' && el.effect)
          updates.push({ ...el, effect: { ...el.effect, [target.key]: color } as TextEffect });
        break;
      case 'grid-cell':
        if (el.type === 'grid')
          updates.push({
            ...el,
            cells: el.cells.map((c, i) => (i === target.cell ? { ...c, color } : c)),
          });
        break;
      case 'frame':
        if (el.type === 'frame') updates.push({ ...el, color });
        break;
    }
  }
  if (updates.length) editor.store.put(updates);
}

/** Pick the natural colour target for the current selection. */
export function defaultTarget(editor: Editor): ColorTarget {
  const sel = editor.getSelectedElements();
  const el = sel[0];
  if (!el) return { kind: 'background' };
  switch (el.type) {
    case 'text':
      return { kind: 'text' };
    case 'shape':
      return { kind: 'fill' };
    case 'line':
      return { kind: 'line' };
    case 'path':
      return el.fill ? { kind: 'fill' } : { kind: 'stroke' };
    case 'frame':
      return el.image ? { kind: 'stroke' } : { kind: 'frame' };
    case 'svg': {
      const colors = editor.resources.getSvgColors(el.assetId);
      return colors[0] ? { kind: 'svg', original: colors[0] } : { kind: 'background' };
    }
    default:
      return { kind: 'background' };
  }
}

export function applyColorToSelection(ctx: Ctx, color: string): void {
  writeTarget(ctx, defaultTarget(ctx.editor), { type: 'solid', color });
}

/** Distinct solid colours used in the design (for "Document colours"). */
export function documentColors(editor: Editor, limit = 24): string[] {
  const seen = new Set<string>();
  const add = (c: string | null | undefined) => {
    if (c && /^#[0-9a-f]{6}$/i.test(c)) seen.add(c.toLowerCase());
  };
  for (const page of editor.getPages()) {
    const bg = page.background.fill;
    if (bg.type === 'solid') add(bg.color);
    else for (const s of bg.stops) add(s.color);
  }
  for (const r of editor.store.values()) {
    if (r.typeName !== 'element') continue;
    switch (r.type) {
      case 'text':
        add((r as TextElement).style.color);
        for (const s of (r as TextElement).spans) add(s.style?.color);
        break;
      case 'shape':
        add(solidOf(r.fill));
        if (r.fill.type !== 'solid') for (const s of r.fill.stops) add(s.color);
        add(r.stroke?.color);
        break;
      case 'line':
        add(r.stroke.color);
        break;
      case 'svg':
        for (const c of Object.values(r.colors)) add(c);
        break;
      case 'path':
        add(r.stroke?.color);
        add(solidOf(r.fill));
        break;
    }
    if (seen.size >= limit) break;
  }
  return [...seen];
}
