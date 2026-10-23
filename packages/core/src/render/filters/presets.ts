import type { ImageAdjustments, ImageFilter } from '../../model/types';

export interface FilterPreset {
  id: string;
  name: string;
  adjustments: Partial<ImageAdjustments>;
  /** 0..1 */
  grayscale?: number;
  /** 0..1 */
  sepia?: number;
  /** Split toning: colour pushed into shadows / highlights, amount 0..1. */
  shadowTint?: { color: string; amount: number };
  highlightTint?: { color: string; amount: number };
}

/** Photo filters in the spirit of Canva's (names are our own presets). */
export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'epic',
    name: 'Epic',
    adjustments: {
      contrast: 25,
      saturation: 20,
      shadows: 15,
      highlights: -20,
      vignette: 25,
      temperature: -5,
    },
  },
  {
    id: 'festive',
    name: 'Festive',
    adjustments: { saturation: 30, vibrance: 20, temperature: 15, contrast: 10, brightness: 5 },
  },
  {
    id: 'summer',
    name: 'Summer',
    adjustments: { brightness: 10, temperature: 25, saturation: 15, fade: 10, highlights: 10 },
  },
  {
    id: 'selfie',
    name: 'Selfie',
    adjustments: { brightness: 12, contrast: -5, saturation: 5, temperature: 8, shadows: 15 },
  },
  {
    id: 'retro',
    name: 'Retro',
    adjustments: { fade: 30, temperature: 20, saturation: -20, contrast: -10, tint: 5 },
    sepia: 0.2,
  },
  {
    id: 'street',
    name: 'Street',
    adjustments: { contrast: 30, saturation: -35, blacks: -10, sharpness: 20, vignette: 20 },
  },
  {
    id: 'whimsical',
    name: 'Whimsical',
    adjustments: {
      brightness: 10,
      saturation: 10,
      tint: 15,
      fade: 20,
      highlights: 15,
      temperature: -5,
    },
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    adjustments: {
      contrast: 45,
      saturation: -15,
      shadows: -15,
      highlights: -25,
      vignette: 45,
      blacks: -15,
    },
  },
  {
    id: 'nordic',
    name: 'Nordic',
    adjustments: { temperature: -25, saturation: -20, brightness: 8, fade: 15, contrast: 5 },
    shadowTint: { color: '#1f3b5c', amount: 0.15 },
  },
  {
    id: 'classic',
    name: 'Classic',
    adjustments: { contrast: 10, fade: 10, saturation: -10 },
    sepia: 0.35,
  },
  {
    id: 'cali',
    name: 'Cali',
    adjustments: { temperature: 20, saturation: 25, contrast: 10, highlights: 10, vibrance: 15 },
  },
  {
    id: 'solar',
    name: 'Solar',
    adjustments: {
      brightness: 15,
      highlights: 25,
      temperature: 30,
      saturation: 10,
      contrast: -5,
      fade: 5,
    },
    highlightTint: { color: '#ffb35c', amount: 0.12 },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    adjustments: { fade: 25, contrast: -10, vignette: 30, temperature: 10 },
    sepia: 0.4,
    shadowTint: { color: '#2a3d66', amount: 0.12 },
  },
  {
    id: 'fresco',
    name: 'Fresco',
    adjustments: { tint: -10, temperature: -10, saturation: -10, fade: 20 },
    highlightTint: { color: '#e8f5d0', amount: 0.1 },
  },
  {
    id: 'gummy',
    name: 'Gummy',
    adjustments: { saturation: 45, vibrance: 25, contrast: 15, brightness: 5 },
  },
  {
    id: 'mono',
    name: 'Mono',
    adjustments: { contrast: 15 },
    grayscale: 1,
  },
  {
    id: 'noir',
    name: 'Noir',
    adjustments: { contrast: 50, blacks: -20, vignette: 40 },
    grayscale: 1,
  },
  {
    id: 'luna',
    name: 'Luna',
    adjustments: { brightness: 10, contrast: 20, fade: 15 },
    grayscale: 1,
  },
];

export function getFilterPreset(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((p) => p.id === id);
}

/** Normalized processing parameters shared by the GPU and CPU pipelines. */
export interface ProcessParams {
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  fade: number;
  vignette: number;
  blur: number;
  sharpness: number;
  grayscale: number;
  sepia: number;
  shadowTint: [number, number, number, number];
  highlightTint: [number, number, number, number];
}

const BIPOLAR: (keyof ImageAdjustments)[] = [
  'brightness',
  'contrast',
  'saturation',
  'vibrance',
  'temperature',
  'tint',
  'highlights',
  'shadows',
  'whites',
  'blacks',
];
const UNIPOLAR: (keyof ImageAdjustments)[] = ['fade', 'vignette', 'blur', 'sharpness'];

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.padEnd(6, '0');
  return [
    Number.parseInt(v.slice(0, 2), 16) / 255,
    Number.parseInt(v.slice(2, 4), 16) / 255,
    Number.parseInt(v.slice(4, 6), 16) / 255,
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Combine user adjustments and a filter preset into normalized parameters. */
export function resolveProcessParams(
  adjustments: Partial<ImageAdjustments> | undefined,
  filter: ImageFilter | null | undefined,
): ProcessParams {
  const preset = filter ? getFilterPreset(filter.name) : undefined;
  const k = preset ? clamp((filter?.intensity ?? 100) / 100, 0, 1) : 0;
  const get = (key: keyof ImageAdjustments) =>
    (adjustments?.[key] ?? 0) + (preset?.adjustments[key] ?? 0) * k;
  const out = {} as ProcessParams;
  for (const key of BIPOLAR)
    (out as unknown as Record<string, number>)[key] = clamp(get(key) / 100, -1, 1);
  for (const key of UNIPOLAR)
    (out as unknown as Record<string, number>)[key] = clamp(get(key) / 100, 0, 1);
  out.grayscale = (preset?.grayscale ?? 0) * k;
  out.sepia = (preset?.sepia ?? 0) * k;
  out.shadowTint = preset?.shadowTint
    ? [...parseHex(preset.shadowTint.color), preset.shadowTint.amount * k]
    : [0, 0, 0, 0];
  out.highlightTint = preset?.highlightTint
    ? [...parseHex(preset.highlightTint.color), preset.highlightTint.amount * k]
    : [0, 0, 0, 0];
  return out;
}

export function isIdentityParams(p: ProcessParams): boolean {
  for (const key of [...BIPOLAR, ...UNIPOLAR]) {
    if (Math.abs((p as unknown as Record<string, number>)[key]!) > 1e-4) return false;
  }
  return (
    p.grayscale < 1e-4 && p.sepia < 1e-4 && p.shadowTint[3] < 1e-4 && p.highlightTint[3] < 1e-4
  );
}
