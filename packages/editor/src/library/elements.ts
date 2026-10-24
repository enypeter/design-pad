import type { GridCellLayout, LineCap, StrokeDash } from '@design-pad/core';

export interface LinePreset {
  id: string;
  name: string;
  dash: StrokeDash;
  startCap: LineCap;
  endCap: LineCap;
}

export const LINE_PRESETS: LinePreset[] = [
  { id: 'line', name: 'Line', dash: 'solid', startCap: 'none', endCap: 'none' },
  { id: 'dashed', name: 'Dashed line', dash: 'dashed', startCap: 'none', endCap: 'none' },
  { id: 'dotted', name: 'Dotted line', dash: 'dotted', startCap: 'none', endCap: 'none' },
  { id: 'arrow', name: 'Arrow', dash: 'solid', startCap: 'none', endCap: 'arrow' },
  { id: 'arrow-solid', name: 'Solid arrow', dash: 'solid', startCap: 'none', endCap: 'triangle' },
  { id: 'double-arrow', name: 'Double arrow', dash: 'solid', startCap: 'arrow', endCap: 'arrow' },
  { id: 'circle-ends', name: 'Circle ends', dash: 'solid', startCap: 'circle', endCap: 'circle' },
  { id: 'connector', name: 'Connector', dash: 'solid', startCap: 'circle', endCap: 'triangle' },
  {
    id: 'dashed-arrow',
    name: 'Dashed arrow',
    dash: 'dashed',
    startCap: 'none',
    endCap: 'triangle',
  },
  { id: 'bar-ends', name: 'Dimension', dash: 'solid', startCap: 'bar', endCap: 'bar' },
];

export const LINE_CAPS: { id: LineCap; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'arrow', name: 'Arrow' },
  { id: 'triangle', name: 'Triangle' },
  { id: 'triangle-outline', name: 'Outlined triangle' },
  { id: 'circle', name: 'Circle' },
  { id: 'circle-outline', name: 'Outlined circle' },
  { id: 'square', name: 'Square' },
  { id: 'diamond', name: 'Diamond' },
  { id: 'bar', name: 'Bar' },
];

/** Shapes offered as photo frames. */
export const FRAME_SHAPES = [
  'rect',
  'rounded-rect',
  'ellipse',
  'arch',
  'triangle',
  'diamond',
  'hexagon',
  'star',
  'heart',
  'blob-1',
  'blob-2',
  'speech',
  'burst',
  'pentagon',
];

export interface GridPreset {
  id: string;
  name: string;
  layout: GridCellLayout[];
  /** Width/height of the grid when inserted. */
  aspect: number;
}

const c = (x: number, y: number, width: number, height: number): GridCellLayout => ({
  x,
  y,
  width,
  height,
});
const third = 1 / 3;

export const GRID_PRESETS: GridPreset[] = [
  { id: 'cols-2', name: '2 columns', aspect: 1, layout: [c(0, 0, 0.5, 1), c(0.5, 0, 0.5, 1)] },
  { id: 'rows-2', name: '2 rows', aspect: 1, layout: [c(0, 0, 1, 0.5), c(0, 0.5, 1, 0.5)] },
  {
    id: 'cols-3',
    name: '3 columns',
    aspect: 1.5,
    layout: [c(0, 0, third, 1), c(third, 0, third, 1), c(2 * third, 0, third, 1)],
  },
  {
    id: 'rows-3',
    name: '3 rows',
    aspect: 0.75,
    layout: [c(0, 0, 1, third), c(0, third, 1, third), c(0, 2 * third, 1, third)],
  },
  {
    id: 'quad',
    name: '2 × 2',
    aspect: 1,
    layout: [c(0, 0, 0.5, 0.5), c(0.5, 0, 0.5, 0.5), c(0, 0.5, 0.5, 0.5), c(0.5, 0.5, 0.5, 0.5)],
  },
  {
    id: 'left-big',
    name: 'Feature left',
    aspect: 1.3,
    layout: [c(0, 0, 0.6, 1), c(0.6, 0, 0.4, 0.5), c(0.6, 0.5, 0.4, 0.5)],
  },
  {
    id: 'top-big',
    name: 'Feature top',
    aspect: 0.85,
    layout: [c(0, 0, 1, 0.6), c(0, 0.6, 0.5, 0.4), c(0.5, 0.6, 0.5, 0.4)],
  },
  {
    id: 'one-three',
    name: '1 + 3',
    aspect: 1.25,
    layout: [
      c(0, 0, 0.66, 1),
      c(0.66, 0, 0.34, third),
      c(0.66, third, 0.34, third),
      c(0.66, 2 * third, 0.34, third),
    ],
  },
  {
    id: 'two-three',
    name: '2 + 3',
    aspect: 1,
    layout: [
      c(0, 0, 0.5, 0.55),
      c(0.5, 0, 0.5, 0.55),
      c(0, 0.55, third, 0.45),
      c(third, 0.55, third, 0.45),
      c(2 * third, 0.55, third, 0.45),
    ],
  },
  {
    id: 'mosaic',
    name: 'Mosaic',
    aspect: 1,
    layout: [c(0, 0, 0.6, 0.5), c(0.6, 0, 0.4, 0.5), c(0, 0.5, 0.4, 0.5), c(0.4, 0.5, 0.6, 0.5)],
  },
  {
    id: 'nine',
    name: '3 × 3',
    aspect: 1,
    layout: [0, 1, 2].flatMap((r) =>
      [0, 1, 2].map((col) => c(col * third, r * third, third, third)),
    ),
  },
  {
    id: 'film',
    name: 'Filmstrip',
    aspect: 2.4,
    layout: [0, 1, 2, 3].map((i) => c(i * 0.25, 0, 0.25, 1)),
  },
];
