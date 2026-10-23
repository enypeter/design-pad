import { processPixels } from './cpu';
import type { ProcessParams } from './presets';
import { GLImageProcessor } from './webgl';

export { colorOp, processPixels } from './cpu';
export * from './presets';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

let gl: GLImageProcessor | null | undefined;

function getGL(): GLImageProcessor | null {
  if (gl === undefined || (gl && !gl.usable)) gl = GLImageProcessor.create();
  return gl;
}

function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Apply adjustments/filters to an image at the given output size.
 * Uses WebGL when available, otherwise the CPU path. Returns null when the
 * pixels cannot be read (cross-origin image without CORS).
 */
export function processImage(
  source: CanvasImageSource,
  outW: number,
  outH: number,
  params: ProcessParams,
): AnyCanvas | null {
  const glp = getGL();
  if (glp) {
    try {
      return glp.process(source, outW, outH, params);
    } catch (err) {
      console.warn('[design-pad] WebGL image processing failed, using CPU fallback', err);
      gl = null;
    }
  }
  const w = Math.max(1, Math.round(outW));
  const h = Math.max(1, Math.round(outH));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(source, 0, 0, w, h);
  try {
    const data = ctx.getImageData(0, 0, w, h);
    processPixels(data.data, w, h, params);
    ctx.putImageData(data, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}
