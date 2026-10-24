import { boxBounds, boxMatrix, normalizeAngle, unionRects } from '../geometry/box';
import { applyToPoint } from '../geometry/matrix';
import { createGroup } from '../model/defaults';
import { compareIndex, indexBetween, indicesBetween } from '../model/fractional';
import type { DesignElement, Id, LineElement, Point } from '../model/types';
import type { Alignment, Editor, ReorderOp } from './Editor';

/** Map ids to the elements that should be operated on as units (dedupe nested picks). */
function roots(editor: Editor, ids: Id[]): DesignElement[] {
  const set = new Set(ids);
  return editor
    .getElements(ids)
    .filter((el) => !editor.getAncestors(el.id).some((a) => set.has(a.id)));
}

export function group(editor: Editor, ids: Id[]): Id | null {
  let els = roots(editor, ids);
  if (els.length < 2) return null;
  // Group elements that share a parent; mixed selections group their top-level ancestors.
  const parentId = els[0]!.parentId;
  if (!els.every((e) => e.parentId === parentId)) {
    const tops = new Map<Id, DesignElement>();
    for (const e of els) {
      const top = editor.getTopLevel(e.id);
      if (top) tops.set(top.id, top);
    }
    els = [...tops.values()];
    if (els.length < 2) return null;
  }
  const parent = els[0]!.parentId;
  els.sort((a, b) => compareIndex(a.index, b.index));
  const bounds = unionRects(els.map((e) => boxBounds(e)));
  const topIndex = els[els.length - 1]!.index;
  const g = createGroup({
    parentId: parent,
    index: topIndex,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
  const childIndices = indicesBetween(null, null, els.length);
  editor.batch(() => {
    editor.store.put([
      g,
      ...els.map(
        (e, i) =>
          ({
            ...e,
            parentId: g.id,
            index: childIndices[i]!,
            x: e.x - bounds.x,
            y: e.y - bounds.y,
          }) as DesignElement,
      ),
    ]);
  });
  editor.select([g.id]);
  return g.id;
}

export function ungroup(editor: Editor, groupId: Id): Id[] {
  const g = editor.getElement(groupId);
  if (g?.type !== 'group') return [];
  const children = editor.getChildren(groupId);
  const m = boxMatrix(g);
  const siblings = editor.getChildren(g.parentId);
  const i = siblings.findIndex((s) => s.id === groupId);
  const indices = indicesBetween(siblings[i - 1]?.index, siblings[i + 1]?.index, children.length);
  const updated = children.map((c, k) => {
    const center = applyToPoint(m, { x: c.x + c.width / 2, y: c.y + c.height / 2 });
    return {
      ...c,
      parentId: g.parentId,
      index: indices[k]!,
      x: center.x - c.width / 2,
      y: center.y - c.height / 2,
      rotation: normalizeAngle(c.rotation + g.rotation),
      opacity: c.opacity * g.opacity,
    } as DesignElement;
  });
  editor.batch(() => {
    editor.store.remove([groupId]);
    editor.store.put(updated);
  });
  const ids = updated.map((u) => u.id);
  editor.select(ids);
  return ids;
}

export function reorder(editor: Editor, ids: Id[], op: ReorderOp): void {
  const els = roots(editor, ids);
  const byParent = new Map<Id, Set<Id>>();
  for (const e of els) {
    let set = byParent.get(e.parentId);
    if (!set) {
      set = new Set();
      byParent.set(e.parentId, set);
    }
    set.add(e.id);
  }
  const updates: DesignElement[] = [];
  for (const [parentId, selected] of byParent) {
    const list = editor.getChildren(parentId).map((e) => ({ el: e, index: e.index }));
    const moving = list.filter((x) => selected.has(x.el.id));
    if (op === 'front' || op === 'back') {
      const keys =
        op === 'front'
          ? indicesBetween(list[list.length - 1]?.index, null, moving.length)
          : indicesBetween(null, list[0]?.index, moving.length);
      for (const [i, m] of moving.entries()) updates.push({ ...m.el, index: keys[i]! });
      continue;
    }
    if (op === 'forward') {
      for (let i = list.length - 2; i >= 0; i--) {
        const cur = list[i]!;
        const next = list[i + 1]!;
        if (!selected.has(cur.el.id) || selected.has(next.el.id)) continue;
        cur.index = indexBetween(next.index, list[i + 2]?.index);
        list[i] = next;
        list[i + 1] = cur;
      }
    } else {
      for (let i = 1; i < list.length; i++) {
        const cur = list[i]!;
        const prev = list[i - 1]!;
        if (!selected.has(cur.el.id) || selected.has(prev.el.id)) continue;
        cur.index = indexBetween(list[i - 2]?.index, prev.index);
        list[i] = prev;
        list[i - 1] = cur;
      }
    }
    for (const item of list)
      if (item.index !== item.el.index) updates.push({ ...item.el, index: item.index });
  }
  if (updates.length) editor.store.put(updates);
}

export function moveToPosition(editor: Editor, id: Id, position: number): void {
  const el = editor.getElement(id);
  if (!el) return;
  const siblings = editor.getChildren(el.parentId).filter((s) => s.id !== id);
  const p = Math.max(0, Math.min(siblings.length, position));
  const index = indexBetween(siblings[p - 1]?.index, siblings[p]?.index);
  if (index !== el.index) editor.updateElement(id, { index });
}

export function align(
  editor: Editor,
  ids: Id[],
  alignment: Alignment,
  relativeTo: 'auto' | 'page' | 'selection',
): void {
  const els = roots(editor, ids).filter((e) => !e.locked);
  if (!els.length) return;
  const doc = editor.getDocument();
  const useSelection = relativeTo === 'selection' || (relativeTo === 'auto' && els.length > 1);
  const target = useSelection
    ? unionRects(els.map((e) => editor.getElementPageBounds(e.id)))
    : { x: 0, y: 0, width: doc.width, height: doc.height };
  editor.batch(() => {
    for (const el of els) {
      const b = editor.getElementPageBounds(el.id);
      let dx = 0;
      let dy = 0;
      switch (alignment) {
        case 'left':
          dx = target.x - b.x;
          break;
        case 'center':
          dx = target.x + target.width / 2 - (b.x + b.width / 2);
          break;
        case 'right':
          dx = target.x + target.width - (b.x + b.width);
          break;
        case 'top':
          dy = target.y - b.y;
          break;
        case 'middle':
          dy = target.y + target.height / 2 - (b.y + b.height / 2);
          break;
        case 'bottom':
          dy = target.y + target.height - (b.y + b.height);
          break;
      }
      if (dx || dy) editor.moveElements([el.id], { x: dx, y: dy });
    }
  });
}

export function distribute(editor: Editor, ids: Id[], axis: 'horizontal' | 'vertical'): void {
  const els = roots(editor, ids).filter((e) => !e.locked);
  if (els.length < 3) return;
  const items = els.map((e) => ({ el: e, b: editor.getElementPageBounds(e.id) }));
  const pos = (r: { x: number; y: number }) => (axis === 'horizontal' ? r.x : r.y);
  const size = (r: { width: number; height: number }) =>
    axis === 'horizontal' ? r.width : r.height;
  items.sort((a, b) => pos(a.b) + size(a.b) / 2 - (pos(b.b) + size(b.b) / 2));
  const first = items[0]!.b;
  const last = items[items.length - 1]!.b;
  const span = pos(last) + size(last) - pos(first);
  const total = items.reduce((s, it) => s + size(it.b), 0);
  const gap = (span - total) / (items.length - 1);
  let cursor = pos(first);
  editor.batch(() => {
    for (const it of items) {
      const d = cursor - pos(it.b);
      if (Math.abs(d) > 1e-6) {
        editor.moveElements([it.el.id], axis === 'horizontal' ? { x: d, y: 0 } : { x: 0, y: d });
      }
      cursor += size(it.b) + gap;
    }
  });
}

/** Mirror an element's own content (not its position). */
function flipContent(el: DesignElement, horizontal: boolean): DesignElement {
  const key = horizontal ? 'flipX' : 'flipY';
  switch (el.type) {
    case 'shape':
    case 'svg':
    case 'path':
      return { ...el, [key]: !el[key] };
    case 'image':
      return { ...el, image: { ...el.image, [key]: !el.image[key] } };
    case 'frame':
      return el.image ? { ...el, image: { ...el.image, [key]: !el.image[key] } } : el;
    case 'grid':
      return {
        ...el,
        cells: el.cells.map((c) =>
          c.image ? { ...c, image: { ...c.image, [key]: !c.image[key] } } : c,
        ),
      };
    case 'line': {
      const l = el as LineElement;
      return { ...l, rotation: normalizeAngle(horizontal ? 180 - l.rotation : -l.rotation) };
    }
    default:
      return el;
  }
}

/** Records mirroring an element (and its subtree) inside its own box. */
function flipSubtree(editor: Editor, el: DesignElement, horizontal: boolean): DesignElement[] {
  if (el.type !== 'group') return [flipContent(el, horizontal)];
  const out: DesignElement[] = [el];
  for (const child of editor.getChildren(el.id)) {
    const [head, ...rest] = flipSubtree(editor, child, horizontal);
    const mirrored = {
      ...head!,
      x: horizontal ? el.width - child.x - child.width : child.x,
      y: horizontal ? child.y : el.height - child.y - child.height,
      rotation: head!.type === 'line' ? head!.rotation : normalizeAngle(-child.rotation),
    } as DesignElement;
    out.push(mirrored, ...rest);
  }
  return out;
}

export function flip(editor: Editor, ids: Id[], axis: 'horizontal' | 'vertical'): void {
  const horizontal = axis === 'horizontal';
  const els = roots(editor, ids).filter((e) => !e.locked);
  if (!els.length) return;
  const updates: DesignElement[] = [];
  if (els.length === 1) {
    updates.push(...flipSubtree(editor, els[0]!, horizontal));
  } else {
    const bounds = unionRects(els.map((e) => editor.getElementPageBounds(e.id)));
    for (const el of els) {
      const [head, ...rest] = flipSubtree(editor, el, horizontal);
      const b = editor.getElementPageBounds(el.id);
      const target = horizontal
        ? { x: bounds.x + bounds.x + bounds.width - (b.x + b.width), y: b.y }
        : { x: b.x, y: bounds.y + bounds.y + bounds.height - (b.y + b.height) };
      const d = editor.pageDeltaToParent(el.id, { x: target.x - b.x, y: target.y - b.y });
      updates.push(
        {
          ...head!,
          x: el.x + d.x,
          y: el.y + d.y,
          rotation: head!.type === 'line' ? head!.rotation : normalizeAngle(-el.rotation),
        } as DesignElement,
        ...rest,
      );
    }
  }
  editor.store.put(updates);
}

export function moveToPage(editor: Editor, ids: Id[], pageId: Id, offset: Point): void {
  const els = roots(editor, ids).filter((e) => editor.getPage(e.parentId));
  if (!els.length || !editor.getPage(pageId)) return;
  els.sort((a, b) => compareIndex(a.index, b.index));
  const siblings = editor.getChildren(pageId);
  const keys = indicesBetween(siblings[siblings.length - 1]?.index, null, els.length);
  editor.store.put(
    els.map(
      (e, i) =>
        ({
          ...e,
          parentId: pageId,
          index: keys[i]!,
          x: e.x + offset.x,
          y: e.y + offset.y,
        }) as DesignElement,
    ),
  );
  editor.select(els.map((e) => e.id));
}
