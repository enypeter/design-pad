import { unionRects } from '../geometry/box';
import { applyToPoint } from '../geometry/matrix';
import { compareIndex, indicesBetween } from '../model/fractional';
import { createElementId } from '../model/ids';
import type { AssetRecord, DesignElement, Id, Point, Rect } from '../model/types';
import { collectAssetIds, type Editor } from './Editor';

export const CLIPBOARD_KIND = 'design-pad/elements';

export interface ClipboardPayload {
  kind: typeof CLIPBOARD_KIND;
  version: 1;
  designId: string;
  pageId: Id;
  /** Ids of the top-level copied elements (in stacking order). */
  rootIds: Id[];
  /** Roots (with page-space boxes) followed by their descendants. */
  elements: DesignElement[];
  assets: AssetRecord[];
  /** Page-space bounds of the roots when copied. */
  bounds: Rect;
}

export function isClipboardPayload(value: unknown): value is ClipboardPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ClipboardPayload).kind === CLIPBOARD_KIND &&
    Array.isArray((value as ClipboardPayload).elements)
  );
}

export function copyElements(editor: Editor, ids: Id[]): ClipboardPayload | null {
  const set = new Set(ids);
  const roots = editor
    .getElements(ids)
    .filter((el) => !editor.getAncestors(el.id).some((a) => set.has(a.id)))
    .sort((a, b) => compareIndex(a.index, b.index));
  if (!roots.length) return null;
  const pageId = editor.getPageIdOf(roots[0]!.id);
  if (!pageId) return null;

  const elements: DesignElement[] = [];
  for (const root of roots) {
    // Bake the parent transform so a grouped child pastes where it appeared.
    const parentM = editor.getParentPageMatrix(root.id);
    const center = applyToPoint(parentM, {
      x: root.x + root.width / 2,
      y: root.y + root.height / 2,
    });
    const rotation = editor.getPageRotation(root.id);
    elements.push({
      ...structuredClone(root),
      parentId: '',
      x: center.x - root.width / 2,
      y: center.y - root.height / 2,
      rotation,
    });
    for (const d of editor.getDescendants(root.id)) elements.push(structuredClone(d));
  }
  const assetIds = collectAssetIds(elements);
  const assets = [...assetIds]
    .map((id) => editor.getAsset(id))
    .filter((a): a is AssetRecord => !!a);
  return {
    kind: CLIPBOARD_KIND,
    version: 1,
    designId: editor.designId,
    pageId,
    rootIds: roots.map((r) => r.id),
    elements,
    assets,
    bounds: unionRects(roots.map((r) => editor.getElementPageBounds(r.id))),
  };
}

export function pasteElements(
  editor: Editor,
  payload: ClipboardPayload,
  opts: { pageId?: Id; at?: Point },
): Id[] {
  const pageId = opts.pageId ?? editor.getCurrentPageId();
  for (const asset of payload.assets) if (!editor.getAsset(asset.id)) editor.addAsset(asset);

  const idMap = new Map<Id, Id>();
  for (const el of payload.elements) idMap.set(el.id, createElementId());
  const rootSet = new Set(payload.rootIds);

  let offset: Point = { x: 0, y: 0 };
  if (opts.at) {
    offset = {
      x: opts.at.x - (payload.bounds.x + payload.bounds.width / 2),
      y: opts.at.y - (payload.bounds.y + payload.bounds.height / 2),
    };
  } else if (payload.designId === editor.designId && payload.pageId === pageId) {
    // Pasting onto the source page: offset if the originals are still in place.
    const stillThere = payload.rootIds.some((id) => editor.getElement(id));
    if (stillThere) offset = { x: 20, y: 20 };
  }

  const siblings = editor.getChildren(pageId);
  const keys = indicesBetween(siblings[siblings.length - 1]?.index, null, payload.rootIds.length);
  let k = 0;
  const records = payload.elements.map((el) => {
    const isRoot = rootSet.has(el.id);
    return {
      ...structuredClone(el),
      id: idMap.get(el.id)!,
      parentId: isRoot ? pageId : (idMap.get(el.parentId) ?? pageId),
      index: isRoot ? keys[k++]! : el.index,
      x: isRoot ? el.x + offset.x : el.x,
      y: isRoot ? el.y + offset.y : el.y,
    } as DesignElement;
  });
  editor.store.put(records);
  const newRoots = payload.rootIds.map((id) => idMap.get(id)!);
  editor.select(newRoots);
  return newRoots;
}
