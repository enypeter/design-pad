import {
  type AssetRecord,
  createFrame,
  createGrid,
  createLine,
  createShape,
  createSvg,
  createText,
  type DesignElement,
  type DesignFile,
  type Fill,
  indicesBetween,
  type PageBackground,
  type PageRecord,
  SCHEMA_VERSION,
  svgToDataUrl,
  type TextEffect,
  type TextStyle,
} from '@design-pad/core';
import type { TemplateProvider, TemplateSummary } from '../config';
import { GRID_PRESETS } from './elements';
import { GRAPHICS } from './graphics';

type El = DesignElement;

interface TplPage {
  background: Fill | PageBackground;
  elements: El[];
}

interface TplDef {
  id: string;
  title: string;
  category: string;
  width: number;
  height: number;
  pages: TplPage[];
}

const solid = (color: string): Fill => ({ type: 'solid', color });
const linear = (angle: number, a: string, b: string): Fill => ({
  type: 'linear',
  angle,
  stops: [
    { offset: 0, color: a },
    { offset: 1, color: b },
  ],
});

function text(
  value: string,
  x: number,
  y: number,
  width: number,
  style: Partial<TextStyle>,
  extra: { effect?: TextEffect; rotation?: number; opacity?: number; curve?: number } = {},
): El {
  return createText({
    spans: [{ text: value }],
    x,
    y,
    width,
    style: { align: 'left', ...style },
    effect: extra.effect ?? null,
    rotation: extra.rotation ?? 0,
    opacity: extra.opacity ?? 1,
    curve: extra.curve ?? 0,
  });
}

function shape(
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Fill,
  extra: Partial<El> = {},
): El {
  return createShape({ shape: kind, x, y, width, height, fill, ...(extra as object) });
}

function frame(
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color = '#e6e6e9',
  cornerRadius = 0,
): El {
  return createFrame({ shape: kind, x, y, width, height, color, cornerRadius });
}

function grid(
  presetId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  gap: number,
  color = '#e6e6e9',
): El {
  const preset = GRID_PRESETS.find((g) => g.id === presetId)!;
  return createGrid({
    layout: preset.layout,
    x,
    y,
    width,
    height,
    gap,
    cells: preset.layout.map(() => ({ image: null, color })),
  });
}

function line(x: number, y: number, width: number, color: string, weight: number): El {
  return createLine({
    x,
    y: y - weight / 2,
    width,
    height: weight,
    stroke: { color, width: weight, dash: 'solid' },
  });
}

const graphicAssetId = (id: string) => `as_graphic_${id}`;

function graphic(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: Record<string, string> = {},
  rotation = 0,
): El {
  return createSvg({ assetId: graphicAssetId(id), x, y, width, height, colors, rotation });
}

export function graphicAsset(id: string): AssetRecord {
  const g = GRAPHICS.find((gr) => gr.id === id)!;
  return {
    id: graphicAssetId(id),
    typeName: 'asset',
    kind: 'svg',
    src: svgToDataUrl(g.svg),
    mime: 'image/svg+xml',
    width: 100,
    height: 100,
    name: g.name,
  };
}

function build(def: TplDef): DesignFile {
  const pageIndices = indicesBetween(null, null, def.pages.length);
  const pages: PageRecord[] = [];
  const elements: DesignElement[] = [];
  const assetIds = new Set<string>();
  def.pages.forEach((p, i) => {
    const id = `pg_tpl_${def.id}_${i}`;
    const background: PageBackground =
      'fill' in p.background ? p.background : { fill: p.background, image: null };
    pages.push({ id, typeName: 'page', index: pageIndices[i]!, title: '', background, notes: '' });
    const keys = indicesBetween(null, null, p.elements.length);
    p.elements.forEach((el, k) => {
      elements.push({ ...el, parentId: id, index: keys[k]! } as DesignElement);
      if (el.type === 'svg') assetIds.add(el.assetId);
    });
  });
  const assets = [...assetIds].map((aid) => graphicAsset(aid.replace('as_graphic_', '')));
  return {
    format: 'design-pad',
    schemaVersion: SCHEMA_VERSION,
    id: `tpl_${def.id}`,
    title: def.title,
    width: def.width,
    height: def.height,
    unit: 'px',
    dpi: 96,
    pages,
    elements,
    assets,
  };
}

const TEMPLATES: TplDef[] = [
  {
    id: 'summer-sale',
    title: 'Summer sale',
    category: 'Instagram post',
    width: 1080,
    height: 1080,
    pages: [
      {
        background: linear(135, '#ffde59', '#ff914d'),
        elements: [
          shape('ellipse', 600, -140, 640, 640, solid('#ffffff'), { opacity: 0.25 }),
          graphic('sparkle', 880, 110, 110, 110, { '#ffde59': '#ffffff' }),
          text('SUMMER', 80, 290, 920, {
            fontFamily: 'Anton',
            fontSize: 180,
            color: '#ffffff',
            lineHeight: 1.1,
            letterSpacing: 20,
          }),
          text('SALE', 80, 470, 920, {
            fontFamily: 'Anton',
            fontSize: 290,
            color: '#1f1f1f',
            lineHeight: 1,
          }),
          shape('burst', 730, 690, 280, 280, solid('#ff3131'), { rotation: -12 }),
          text(
            '50%\nOFF',
            730,
            742,
            280,
            {
              fontFamily: 'Anton',
              fontSize: 70,
              color: '#ffffff',
              align: 'center',
              lineHeight: 1.05,
            },
            { rotation: -12 },
          ),
          text('Shop now at yourstore.com', 80, 900, 620, {
            fontFamily: 'Montserrat',
            fontWeight: 600,
            fontSize: 34,
            color: '#1f1f1f',
          }),
        ],
      },
    ],
  },
  {
    id: 'quote',
    title: 'Quote',
    category: 'Instagram post',
    width: 1080,
    height: 1080,
    pages: [
      {
        background: solid('#f6efe7'),
        elements: [
          graphic('quote-marks', 90, 130, 130, 110, { '#8c52ff': '#c97b63' }),
          text('Creativity is intelligence having fun.', 90, 300, 900, {
            fontFamily: 'Playfair Display',
            italic: true,
            fontSize: 84,
            color: '#2b2b2b',
            lineHeight: 1.25,
          }),
          line(90, 770, 120, '#c97b63', 5),
          text('Albert Einstein', 90, 800, 700, {
            fontFamily: 'Lato',
            fontSize: 36,
            color: '#6b6b6b',
            letterSpacing: 50,
          }),
        ],
      },
    ],
  },
  {
    id: 'new-collection',
    title: 'New collection',
    category: 'Instagram post',
    width: 1080,
    height: 1080,
    pages: [
      {
        background: solid('#111111'),
        elements: [
          grid('left-big', 60, 60, 960, 760, 12, '#2a2a2a'),
          text('NEW COLLECTION', 60, 846, 960, {
            fontFamily: 'Bebas Neue',
            fontSize: 110,
            color: '#ffffff',
            letterSpacing: 120,
            lineHeight: 1.1,
          }),
          text('Book your session · @yourstudio', 60, 975, 960, {
            fontFamily: 'Inter',
            fontSize: 32,
            color: '#bbbbbb',
          }),
        ],
      },
    ],
  },
  {
    id: 'event-story',
    title: 'Event invite',
    category: 'Instagram story',
    width: 1080,
    height: 1920,
    pages: [
      {
        background: linear(180, '#5e17eb', '#8c52ff'),
        elements: [
          frame('arch', 190, 260, 700, 920, '#c9b8ff'),
          graphic('sparkles', 800, 150, 180, 180, { '#8c52ff': '#ffffff' }),
          text("You're invited", 90, 1250, 900, {
            fontFamily: 'Great Vibes',
            fontSize: 140,
            color: '#ffffff',
            align: 'center',
            lineHeight: 1.2,
          }),
          text('SATURDAY, 12 JULY · 7PM', 90, 1460, 900, {
            fontFamily: 'Montserrat',
            fontWeight: 600,
            fontSize: 44,
            color: '#ffffff',
            align: 'center',
            letterSpacing: 150,
          }),
          text('The Garden Rooftop', 90, 1545, 900, {
            fontFamily: 'Inter',
            fontSize: 40,
            color: '#e9e1ff',
            align: 'center',
          }),
        ],
      },
    ],
  },
  {
    id: 'quarterly-review',
    title: 'Quarterly review',
    category: 'Presentation',
    width: 1920,
    height: 1080,
    pages: [
      {
        background: solid('#ffffff'),
        elements: [
          shape('rect', 0, 0, 760, 1080, solid('#5170ff')),
          shape('ellipse', 540, 690, 440, 440, solid('#ffde59')),
          text('Quarterly Review', 860, 360, 980, {
            fontFamily: 'Poppins',
            fontWeight: 800,
            fontSize: 110,
            color: '#1f1f1f',
            lineHeight: 1.15,
          }),
          text('Q3 2026 · Product & Growth', 860, 520, 980, {
            fontFamily: 'Poppins',
            fontSize: 44,
            color: '#737373',
          }),
          line(860, 640, 200, '#5170ff', 8),
        ],
      },
      {
        background: solid('#f5f7ff'),
        elements: [
          text('Agenda', 120, 110, 1000, {
            fontFamily: 'Poppins',
            fontWeight: 800,
            fontSize: 96,
            color: '#1f1f1f',
          }),
          ...[
            ['01', 'Highlights of the quarter'],
            ['02', 'Metrics that moved'],
            ['03', 'What we ship next'],
          ].flatMap(([n, label], i) => [
            shape('ellipse', 120, 320 + i * 200, 120, 120, solid('#5170ff')),
            text(n!, 120, 350 + i * 200, 120, {
              fontFamily: 'Poppins',
              fontWeight: 700,
              fontSize: 44,
              color: '#ffffff',
              align: 'center',
              lineHeight: 1.2,
            }),
            text(label!, 290, 345 + i * 200, 1300, {
              fontFamily: 'Poppins',
              fontWeight: 600,
              fontSize: 56,
              color: '#1f1f1f',
            }),
          ]),
        ],
      },
    ],
  },
  {
    id: 'grand-opening',
    title: 'Grand opening flyer',
    category: 'Flyer',
    width: 794,
    height: 1123,
    pages: [
      {
        background: solid('#fffaf0'),
        elements: [
          shape('rect', 0, 0, 794, 420, solid('#1f1f1f')),
          text('GRAND OPENING', 60, 120, 674, {
            fontFamily: 'Cinzel',
            fontWeight: 700,
            fontSize: 66,
            color: '#ffbd59',
            align: 'center',
            letterSpacing: 60,
            lineHeight: 1.2,
          }),
          text('Join us for the launch of our new studio', 60, 270, 674, {
            fontFamily: 'Lato',
            fontSize: 26,
            color: '#ffffff',
            align: 'center',
          }),
          frame('rounded-rect', 97, 470, 600, 380, '#ece6da', 24),
          shape('burst', 600, 370, 170, 170, solid('#ff3131'), { rotation: 12 }),
          text(
            'FREE\nGIFTS',
            600,
            413,
            170,
            {
              fontFamily: 'Anton',
              fontSize: 34,
              color: '#ffffff',
              align: 'center',
              lineHeight: 1.1,
            },
            { rotation: 12 },
          ),
          text('SATURDAY · 10 AM – 6 PM', 60, 895, 674, {
            fontFamily: 'Montserrat',
            fontWeight: 700,
            fontSize: 30,
            color: '#1f1f1f',
            align: 'center',
            letterSpacing: 120,
          }),
          text('12 Market Street, Lagos', 60, 955, 674, {
            fontFamily: 'Lato',
            fontSize: 24,
            color: '#545454',
            align: 'center',
          }),
        ],
      },
    ],
  },
  {
    id: 'yt-tips',
    title: 'Photo tips thumbnail',
    category: 'YouTube thumbnail',
    width: 1280,
    height: 720,
    pages: [
      {
        background: linear(90, '#ff3131', '#ff914d'),
        elements: [
          frame('ellipse', 720, 60, 520, 600, '#ffd1c4'),
          text(
            '10 TIPS',
            60,
            110,
            700,
            { fontFamily: 'Anton', fontSize: 190, color: '#ffffff', lineHeight: 1.05 },
            {
              effect: {
                type: 'shadow',
                offset: 40,
                direction: -45,
                blur: 20,
                transparency: 50,
                color: '#000000',
              },
            },
          ),
          text('FOR BETTER PHOTOS', 60, 340, 640, {
            fontFamily: 'Anton',
            fontSize: 84,
            color: '#1f1f1f',
            lineHeight: 1.05,
          }),
          graphic('arrow-curve', 540, 470, 170, 170, { '#1f1f1f': '#ffffff' }),
        ],
      },
    ],
  },
  {
    id: 'business-card',
    title: 'Photographer card',
    category: 'Business card',
    width: 1050,
    height: 600,
    pages: [
      {
        background: solid('#1f1f1f'),
        elements: [
          graphic('camera', 880, 60, 110, 110, {
            '#1f1f1f': '#ffbd59',
            '#ffffff': '#1f1f1f',
            '#5e17eb': '#ffbd59',
            '#ffde59': '#1f1f1f',
          }),
          text('AMARA OKAFOR', 80, 170, 900, {
            fontFamily: 'Montserrat',
            fontWeight: 700,
            fontSize: 64,
            color: '#ffffff',
            letterSpacing: 100,
          }),
          text('Photographer & Visual Storyteller', 80, 270, 900, {
            fontFamily: 'Lato',
            fontSize: 34,
            color: '#ffbd59',
          }),
          line(80, 360, 120, '#ffbd59', 4),
          text('amara@studio.com · +234 800 000 0000 · studio.com', 80, 395, 900, {
            fontFamily: 'Lato',
            fontSize: 28,
            color: '#d9d9d9',
          }),
        ],
      },
    ],
  },
  {
    id: 'wedding-invite',
    title: 'Wedding invitation',
    category: 'Invitation',
    width: 1000,
    height: 1400,
    pages: [
      {
        background: solid('#fbf7f2'),
        elements: [
          frame('arch', 300, 110, 400, 520, '#e9dfd3'),
          graphic('leaf', 40, 1150, 200, 200, { '#00bf63': '#9caf88', '#c1ff72': '#e4ead9' }, -20),
          graphic('leaf', 770, 1150, 200, 200, { '#00bf63': '#9caf88', '#c1ff72': '#e4ead9' }, 110),
          text('Amara & David', 60, 690, 880, {
            fontFamily: 'Alex Brush',
            fontSize: 120,
            color: '#3b3b3b',
            align: 'center',
            lineHeight: 1.2,
          }),
          text('ARE GETTING MARRIED', 60, 860, 880, {
            fontFamily: 'Cormorant Garamond',
            fontWeight: 600,
            fontSize: 36,
            color: '#3b3b3b',
            align: 'center',
            letterSpacing: 300,
          }),
          text('Saturday, the twelfth of December\ntwo thousand twenty six', 60, 950, 880, {
            fontFamily: 'Cormorant Garamond',
            fontSize: 34,
            color: '#6b6b6b',
            align: 'center',
            lineHeight: 1.5,
          }),
        ],
      },
    ],
  },
  {
    id: 'price-list',
    title: 'Photography packages',
    category: 'Flyer',
    width: 794,
    height: 1123,
    pages: [
      {
        background: solid('#ffffff'),
        elements: [
          text('PHOTOGRAPHY PACKAGES', 60, 70, 674, {
            fontFamily: 'Montserrat',
            fontWeight: 800,
            fontSize: 40,
            color: '#1f1f1f',
            align: 'center',
            letterSpacing: 50,
          }),
          line(322, 150, 150, '#8c52ff', 4),
          ...[
            ['Mini session', '₦85,000', '30 minutes · 10 edited photos · Online gallery'],
            [
              'Signature session',
              '₦180,000',
              '90 minutes · 30 edited photos · 2 outfits · Online gallery',
            ],
            ['Full day', '₦450,000', 'Up to 8 hours · 150+ edited photos · Prints & album'],
          ].flatMap(([title, price, desc], i) => {
            const y = 200 + i * 270;
            return [
              shape('rect', 60, y, 674, 240, solid('#f5f3ff'), { cornerRadius: 24 }),
              text(title!, 100, y + 40, 400, {
                fontFamily: 'Montserrat',
                fontWeight: 700,
                fontSize: 32,
                color: '#1f1f1f',
              }),
              text(price!, 434, y + 36, 260, {
                fontFamily: 'Playfair Display',
                fontWeight: 700,
                fontSize: 40,
                color: '#8c52ff',
                align: 'right',
              }),
              text(desc!, 100, y + 110, 600, {
                fontFamily: 'Lato',
                fontSize: 24,
                color: '#545454',
                lineHeight: 1.5,
              }),
            ];
          }),
          text('Book at yourstudio.com', 60, 1030, 674, {
            fontFamily: 'Lato',
            fontSize: 24,
            color: '#737373',
            align: 'center',
          }),
        ],
      },
    ],
  },
  {
    id: 'logo-studio',
    title: 'Studio logo',
    category: 'Logo',
    width: 500,
    height: 500,
    pages: [
      {
        background: solid('#ffffff'),
        elements: [
          shape('ellipse', 50, 50, 400, 400, solid('#1f1f1f')),
          text('DP', 50, 130, 400, {
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 170,
            color: '#ffde59',
            align: 'center',
            lineHeight: 1.1,
          }),
          text('STUDIO', 50, 335, 400, {
            fontFamily: 'Montserrat',
            fontWeight: 600,
            fontSize: 28,
            color: '#ffffff',
            align: 'center',
            letterSpacing: 400,
          }),
        ],
      },
    ],
  },
  {
    id: 'cover-moments',
    title: 'Photographer cover',
    category: 'Facebook cover',
    width: 1640,
    height: 624,
    pages: [
      {
        background: linear(135, '#00c4cc', '#7d2ae8'),
        elements: [
          frame('ellipse', 1180, 92, 440, 440, '#b8f0f2'),
          text('Capture moments that matter', 120, 190, 1000, {
            fontFamily: 'Poppins',
            fontWeight: 800,
            fontSize: 80,
            color: '#ffffff',
            lineHeight: 1.15,
          }),
          text(
            'Portraits · Weddings · Events',
            120,
            410,
            1000,
            { fontFamily: 'Poppins', fontSize: 40, color: '#ffffff' },
            { opacity: 0.9 },
          ),
        ],
      },
    ],
  },
];

const BUILT = new Map<string, DesignFile>();

export function builtinTemplate(id: string): DesignFile | undefined {
  let file = BUILT.get(id);
  if (!file) {
    const def = TEMPLATES.find((t) => t.id === id);
    if (!def) return undefined;
    file = build(def);
    BUILT.set(id, file);
  }
  return file;
}

export const BUILTIN_TEMPLATES: TemplateSummary[] = TEMPLATES.map((t) => ({
  id: t.id,
  title: t.title,
  width: t.width,
  height: t.height,
  category: t.category,
}));

/** Template provider backed by the built-in designs. */
export const builtinTemplateProvider: TemplateProvider = {
  async list() {
    return BUILTIN_TEMPLATES;
  },
  async load(id) {
    const file = builtinTemplate(id);
    if (!file) throw new Error(`Unknown template ${id}`);
    return structuredClone(file);
  },
};
