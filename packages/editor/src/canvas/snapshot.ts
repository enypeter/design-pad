import { type DesignElement, type Editor, type Id, scaleElementProps } from '@design-pad/core';

/** Root element followed by all its descendants, captured at the start of a transform. */
export type Subtree = DesignElement[];

export function captureSubtree(editor: Editor, id: Id): Subtree {
  const el = editor.getElement(id);
  if (!el) return [];
  return [el, ...editor.getDescendants(id)];
}

/**
 * Uniformly scale a captured subtree by `k` (relative to its captured state)
 * and give the root a new box. Descendant positions are relative to their
 * parent group, so scaling them by `k` keeps the layout.
 */
export function scaleSubtree(
  subtree: Subtree,
  k: number,
  rootBox: { x: number; y: number; width: number; height: number; rotation: number },
): DesignElement[] {
  return subtree.map((el, i) => {
    const scaled = scaleElementProps(el, k);
    if (i === 0) return { ...scaled, ...rootBox } as DesignElement;
    return { ...scaled, x: el.x * k, y: el.y * k } as DesignElement;
  });
}
