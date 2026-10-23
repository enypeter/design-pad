import type { ProcessParams } from './presets';

/**
 * CPU implementation of the image pipeline. Mirrors the GLSL in webgl.ts;
 * used where WebGL is unavailable and in tests.
 */

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Colour operations for one pixel (values 0..1). u, v are normalized coordinates. */
export function colorOp(
  rgb: [number, number, number],
  u: number,
  v: number,
  p: ProcessParams,
): [number, number, number] {
  let [r, g, b] = rgb;

  // White balance.
  r += p.temperature * 0.12 + p.tint * 0.04;
  g -= p.tint * 0.1;
  b += -p.temperature * 0.12 + p.tint * 0.04;

  // Brightness as a gamma curve keeps blacks and whites anchored.
  if (p.brightness !== 0) {
    const gamma = 2 ** (-p.brightness * 0.9);
    r = Math.max(r, 0) ** gamma;
    g = Math.max(g, 0) ** gamma;
    b = Math.max(b, 0) ** gamma;
  }

  // Contrast around mid grey.
  const cf = p.contrast > 0 ? 1 + p.contrast * 1.2 : 1 + p.contrast * 0.85;
  r = (r - 0.5) * cf + 0.5;
  g = (g - 0.5) * cf + 0.5;
  b = (b - 0.5) * cf + 0.5;

  // Tonal ranges.
  let l = luma(r, g, b);
  const d =
    p.shadows * 0.28 * (1 - smoothstep(0, 0.55, l)) +
    p.highlights * 0.28 * smoothstep(0.45, 1, l) +
    p.whites * 0.18 * smoothstep(0.7, 1, l) +
    p.blacks * 0.18 * (1 - smoothstep(0, 0.3, l));
  r += d;
  g += d;
  b += d;

  // Saturation and vibrance.
  l = luma(r, g, b);
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const s = (1 + p.saturation) * (1 + p.vibrance * (1 - Math.min(1, sat)));
  r = l + (r - l) * s;
  g = l + (g - l) * s;
  b = l + (b - l) * s;

  if (p.sepia > 0) {
    const sr = 0.393 * r + 0.769 * g + 0.189 * b;
    const sg = 0.349 * r + 0.686 * g + 0.168 * b;
    const sb = 0.272 * r + 0.534 * g + 0.131 * b;
    r += (sr - r) * p.sepia;
    g += (sg - g) * p.sepia;
    b += (sb - b) * p.sepia;
  }

  if (p.grayscale > 0) {
    l = luma(r, g, b);
    r += (l - r) * p.grayscale;
    g += (l - g) * p.grayscale;
    b += (l - b) * p.grayscale;
  }

  // Split toning.
  if (p.shadowTint[3] > 0 || p.highlightTint[3] > 0) {
    l = Math.min(1, Math.max(0, luma(r, g, b)));
    const ws = (1 - l) * p.shadowTint[3] * 2;
    const wh = l * p.highlightTint[3] * 2;
    r += (p.shadowTint[0] - 0.5) * ws + (p.highlightTint[0] - 0.5) * wh;
    g += (p.shadowTint[1] - 0.5) * ws + (p.highlightTint[1] - 0.5) * wh;
    b += (p.shadowTint[2] - 0.5) * ws + (p.highlightTint[2] - 0.5) * wh;
  }

  if (p.fade > 0) {
    const k = 1 - p.fade * 0.3;
    const lift = p.fade * 0.15;
    r = r * k + lift;
    g = g * k + lift;
    b = b * k + lift;
  }

  if (p.vignette > 0) {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy) * Math.SQRT2;
    const vig = 1 - p.vignette * 0.85 * smoothstep(0.3, 1, dist);
    r *= vig;
    g *= vig;
    b *= vig;
  }

  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
}

/** In-place box blur (one pass per axis); three calls approximate a Gaussian. */
function boxBlur(src: Float32Array, tmp: Float32Array, w: number, h: number, radius: number): void {
  const r = Math.max(1, Math.round(radius));
  const norm = 1 / (2 * r + 1);
  // Horizontal: src -> tmp
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c]!;
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = acc * norm;
        const add = Math.min(w - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        acc += src[(y * w + add) * 4 + c]! - src[(y * w + sub) * 4 + c]!;
      }
    }
  }
  // Vertical: tmp -> src
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + c]!;
      for (let y = 0; y < h; y++) {
        src[(y * w + x) * 4 + c] = acc * norm;
        const add = Math.min(h - 1, y + r + 1);
        const sub = Math.max(0, y - r);
        acc += tmp[(add * w + x) * 4 + c]! - tmp[(sub * w + x) * 4 + c]!;
      }
    }
  }
}

/** Blur radius in pixels for a processed image of the given size. */
export function blurRadiusPx(blur: number, width: number, height: number): number {
  return blur * 0.025 * Math.max(width, height);
}

/** Process RGBA pixels in place. */
export function processPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  p: ProcessParams,
): void {
  const n = width * height;
  const buf = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) buf[i] = data[i]! / 255;

  if (p.blur > 0) {
    const tmp = new Float32Array(n * 4);
    const radius = blurRadiusPx(p.blur, width, height) / 1.7;
    for (let i = 0; i < 3; i++) boxBlur(buf, tmp, width, height, radius);
  } else if (p.sharpness > 0) {
    const src = buf.slice();
    const amount = p.sharpness * 0.6;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = src[i + c]!;
          const lap =
            4 * center -
            src[i - 4 + c]! -
            src[i + 4 + c]! -
            src[i - width * 4 + c]! -
            src[i + width * 4 + c]!;
          buf[i + c] = center + amount * lap;
        }
      }
    }
  }

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const i = (y * width + x) * 4;
      const [r, g, b] = colorOp([buf[i]!, buf[i + 1]!, buf[i + 2]!], u, v, p);
      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = b * 255;
      data[i + 3] = Math.min(255, Math.max(0, buf[i + 3]! * 255));
    }
  }
}
