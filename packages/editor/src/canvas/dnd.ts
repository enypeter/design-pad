import type { DesignElement, ElementType } from '@design-pad/core';
import type { PhotoResult, UploadedAsset } from '../config';

/** What a panel item carries when dragged onto the canvas. */
export type DragItem =
  | { kind: 'element'; init: Partial<DesignElement> & { type: ElementType } }
  | { kind: 'asset'; asset: UploadedAsset }
  | { kind: 'photo'; photo: PhotoResult };

export const DND_TYPE = 'application/x-design-pad-item';
/** Extra marker type so drop targets (frames) can react during dragover, when data is unreadable. */
export const DND_IMAGE_TYPE = 'application/x-design-pad-image';

export function setDragItem(e: React.DragEvent, item: DragItem): void {
  e.dataTransfer.setData(DND_TYPE, JSON.stringify(item));
  if (item.kind !== 'element' || item.init.type === 'image')
    e.dataTransfer.setData(DND_IMAGE_TYPE, '1');
  e.dataTransfer.effectAllowed = 'copy';
}

export function getDragItem(e: DragEvent): DragItem | null {
  const raw = e.dataTransfer?.getData(DND_TYPE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragItem;
  } catch {
    return null;
  }
}

export function dragCarriesImage(e: DragEvent): boolean {
  const types = e.dataTransfer?.types ?? [];
  return types.includes(DND_IMAGE_TYPE) || types.includes('Files');
}

export function dragIsOurs(e: DragEvent): boolean {
  const types = e.dataTransfer?.types ?? [];
  return types.includes(DND_TYPE) || types.includes('Files');
}
