import { boxBounds } from '../geometry/box';
import { coverCropForAsset, refitCrop } from '../geometry/crop';
import type { DesignElement, DocumentRecord, Unit } from '../model/types';
import { gridCellRect } from '../render/renderer';
import type { Editor } from './Editor';

export interface ResizeDesignOptions {
  width: number;
  height: number;
  unit?: Unit;
  /** Scale and reposition content to fit (default). 'none' only changes the page size. */
  content?: 'fit' | 'none';
}

/**
 * Change the page size. Content scales uniformly and keeps its relative
 * position; elements that covered the whole page (backgrounds) are stretched
 * to cover the new page, re-cropping any photos.
 */
export function resizeDesign(editor: Editor, opts: ResizeDesignOptions): void {
  const doc = editor.getDocument();
  const { width, height } = opts;
  if (width <= 0 || height <= 0) return;
  const sx = width / doc.width;
  const sy = height / doc.height;
  const k = Math.min(sx, sy);

  editor.batch(() => {
    editor.store.update<DocumentRecord>(doc.id, { width, height, unit: opts.unit ?? doc.unit });
    if (opts.content === 'none') return;
    const updates: DesignElement[] = [];
    for (const page of editor.getPages()) {
      for (const el of editor.getChildren(page.id)) {
        const b = boxBounds(el);
        const tol = 2;
        const fullBleed =
          !el.rotation &&
          b.x <= tol &&
          b.y <= tol &&
          b.x + b.width >= doc.width - tol &&
          b.y + b.height >= doc.height - tol;
        if (
          fullBleed &&
          (el.type === 'image' || el.type === 'frame' || el.type === 'shape' || el.type === 'grid')
        ) {
          const next = { ...el, x: 0, y: 0, width, height } as DesignElement;
          if (next.type === 'image') {
            const asset = editor.getAsset(next.image.assetId);
            if (asset)
              next.image = { ...next.image, crop: coverCropForAsset(asset, width, height) };
          } else if (next.type === 'frame' && next.image) {
            next.image = {
              ...next.image,
              crop: refitCrop(next.image.crop, el.width, el.height, width, height),
            };
          } else if (next.type === 'grid' && el.type === 'grid') {
            next.cells = el.cells.map((c, i) => {
              if (!c.image) return c;
              const a = gridCellRect(el, i);
              const n = gridCellRect(next, i);
              return {
                ...c,
                image: {
                  ...c.image,
                  crop: refitCrop(c.image.crop, a.width, a.height, n.width, n.height),
                },
              };
            });
          }
          updates.push(next);
          continue;
        }
        const cx = (el.x + el.width / 2) * sx;
        const cy = (el.y + el.height / 2) * sy;
        const [head, ...rest] = editor.scaleSubtree(el.id, k);
        updates.push(
          { ...head!, x: cx - (el.width * k) / 2, y: cy - (el.height * k) / 2 } as DesignElement,
          ...rest,
        );
      }
    }
    editor.store.put(updates);
  });
}
