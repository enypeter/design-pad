import type { AssetRecord, Crop, Rect } from '../model/types';

/**
 * Crop maths. A "window" is the visible box (element box, frame, grid cell)
 * in its local units; the image rect is where the full image sits in the
 * same coordinates.
 */

export function imageRectFromCrop(crop: Crop, windowW: number, windowH: number): Rect {
  const width = windowW / Math.max(crop.width, 1e-6);
  const height = windowH / Math.max(crop.height, 1e-6);
  return { x: -crop.x * width, y: -crop.y * height, width, height };
}

export function cropFromImageRect(img: Rect, windowW: number, windowH: number): Crop {
  return {
    x: -img.x / img.width,
    y: -img.y / img.height,
    width: windowW / img.width,
    height: windowH / img.height,
  };
}

/** Grow (about the window centre) and shift the image rect so it covers the window. */
export function coverWindow(img: Rect, windowW: number, windowH: number): Rect {
  let { x, y, width, height } = img;
  const scale = Math.max(1, windowW / width, windowH / height);
  if (scale > 1) {
    const cx = windowW / 2;
    const cy = windowH / 2;
    x = cx + (x - cx) * scale;
    y = cy + (y - cy) * scale;
    width *= scale;
    height *= scale;
  }
  x = Math.min(0, Math.max(windowW - width, x));
  y = Math.min(0, Math.max(windowH - height, y));
  return { x, y, width, height };
}

/**
 * New crop when the window changes from `oldW×oldH` to `next` (a rect in the
 * old window's coordinates). The image stays put; it only grows if the new
 * window would otherwise show past its edges.
 */
export function recropForWindow(crop: Crop, oldW: number, oldH: number, next: Rect): Crop {
  const img = imageRectFromCrop(crop, oldW, oldH);
  const shifted = { ...img, x: img.x - next.x, y: img.y - next.y };
  return cropFromImageRect(coverWindow(shifted, next.width, next.height), next.width, next.height);
}

/**
 * Keep the crop centre and image scale when a window is resized about its
 * centre (grid cells, frames resized proportionally), shrinking the scale
 * only if needed to stay covered.
 */
export function refitCrop(
  crop: Crop,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): Crop {
  const img = imageRectFromCrop(crop, oldW, oldH);
  const cx = img.x + img.width / 2 - oldW / 2;
  const cy = img.y + img.height / 2 - oldH / 2;
  const moved = {
    x: newW / 2 + cx - img.width / 2,
    y: newH / 2 + cy - img.height / 2,
    width: img.width,
    height: img.height,
  };
  return cropFromImageRect(coverWindow(moved, newW, newH), newW, newH);
}

/** Aspect-correct cover crop for an asset in a window. */
export function coverCropForAsset(
  asset: Pick<AssetRecord, 'width' | 'height'>,
  windowW: number,
  windowH: number,
): Crop {
  const iw = asset.width || windowW;
  const ih = asset.height || windowH;
  const scale = Math.max(windowW / iw, windowH / ih);
  const w = iw * scale;
  const h = ih * scale;
  return cropFromImageRect(
    { x: (windowW - w) / 2, y: (windowH - h) / 2, width: w, height: h },
    windowW,
    windowH,
  );
}
