import type { Fill } from '@design-pad/core';

/** Default swatches (6 × 4 grid, like Canva's default colours). */
export const DEFAULT_PALETTE = [
  '#000000',
  '#545454',
  '#737373',
  '#a6a6a6',
  '#d9d9d9',
  '#ffffff',
  '#ff3131',
  '#ff5757',
  '#ff66c4',
  '#cb6ce6',
  '#8c52ff',
  '#5e17eb',
  '#0097b2',
  '#0cc0df',
  '#5ce1e6',
  '#38b6ff',
  '#5170ff',
  '#004aad',
  '#00bf63',
  '#7ed957',
  '#c1ff72',
  '#ffde59',
  '#ffbd59',
  '#ff914d',
];

export const GRADIENT_PRESETS: Fill[] = [
  {
    type: 'linear',
    angle: 90,
    stops: [
      { offset: 0, color: '#5170ff' },
      { offset: 1, color: '#ff66c4' },
    ],
  },
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#0cc0df' },
      { offset: 1, color: '#ffde59' },
    ],
  },
  {
    type: 'linear',
    angle: 180,
    stops: [
      { offset: 0, color: '#8c52ff' },
      { offset: 1, color: '#00bf63' },
    ],
  },
  {
    type: 'linear',
    angle: 90,
    stops: [
      { offset: 0, color: '#ff914d' },
      { offset: 1, color: '#ff3131' },
    ],
  },
  {
    type: 'linear',
    angle: 45,
    stops: [
      { offset: 0, color: '#000000' },
      { offset: 1, color: '#737373' },
    ],
  },
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#ffde59' },
      { offset: 1, color: '#ff914d' },
    ],
  },
  {
    type: 'linear',
    angle: 90,
    stops: [
      { offset: 0, color: '#5ce1e6' },
      { offset: 1, color: '#004aad' },
    ],
  },
  {
    type: 'linear',
    angle: 180,
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 1, color: '#d9d9d9' },
    ],
  },
  {
    type: 'radial',
    stops: [
      { offset: 0, color: '#ffde59' },
      { offset: 1, color: '#ff66c4' },
    ],
  },
  {
    type: 'radial',
    stops: [
      { offset: 0, color: '#5ce1e6' },
      { offset: 1, color: '#5e17eb' },
    ],
  },
  {
    type: 'radial',
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 1, color: '#a6a6a6' },
    ],
  },
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#00c4cc' },
      { offset: 1, color: '#7d2ae8' },
    ],
  },
];

export function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());
}

export function normalizeHex(value: string): string | null {
  let v = value.trim().toLowerCase();
  if (!v.startsWith('#')) v = `#${v}`;
  if (!isHexColor(v)) return null;
  if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
}
