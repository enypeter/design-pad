import { createElementId, createPageId } from './ids';
import type {
  Crop,
  DesignElement,
  DocumentRecord,
  ElementBase,
  ElementType,
  FrameElement,
  GridElement,
  GroupElement,
  ImageAdjustments,
  ImageElement,
  ImageFill,
  LineElement,
  PageRecord,
  PathElement,
  ShapeElement,
  SvgElement,
  TextElement,
  TextSpan,
  TextStyle,
} from './types';
import { DOCUMENT_ID } from './types';

export const DEFAULT_FONT_FAMILY = 'Inter';

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 32,
  fontWeight: 400,
  italic: false,
  color: '#000000',
  underline: false,
  strikethrough: false,
  letterSpacing: 0,
  lineHeight: 1.4,
  align: 'center',
  uppercase: false,
  list: 'none',
};

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  fade: 0,
  vignette: 0,
  blur: 0,
  sharpness: 0,
};

export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Crop that makes an image of `imageW`×`imageH` cover a `boxW`×`boxH` box,
 * centred (CSS `object-fit: cover`).
 */
export function coverCrop(imageW: number, imageH: number, boxW: number, boxH: number): Crop {
  if (imageW <= 0 || imageH <= 0 || boxW <= 0 || boxH <= 0) return { ...FULL_CROP };
  const imageRatio = imageW / imageH;
  const boxRatio = boxW / boxH;
  if (imageRatio > boxRatio) {
    const width = boxRatio / imageRatio;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = imageRatio / boxRatio;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

export function createImageFill(
  assetId: string,
  imageW: number,
  imageH: number,
  boxW: number,
  boxH: number,
): ImageFill {
  return {
    assetId,
    crop: coverCrop(imageW, imageH, boxW, boxH),
    flipX: false,
    flipY: false,
  };
}

function base(type: ElementType): ElementBase {
  return {
    id: createElementId(),
    typeName: 'element',
    type,
    parentId: '',
    index: 'a0',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    locked: false,
  };
}

export function textToSpans(text: string): TextSpan[] {
  return [{ text }];
}

export function spansToText(spans: TextSpan[]): string {
  let out = '';
  for (const span of spans) out += span.text;
  return out;
}

export type TextInit = Partial<Omit<TextElement, 'style'>> & {
  text?: string;
  style?: Partial<TextStyle>;
};

export function createText(init: TextInit = {}): TextElement {
  const { text, style, ...rest } = init;
  return {
    ...base('text'),
    width: 300,
    height: 45,
    spans: init.spans ?? textToSpans(text ?? 'Add a little bit of body text'),
    effect: null,
    curve: 0,
    ...rest,
    type: 'text',
    style: { ...DEFAULT_TEXT_STYLE, ...style },
  };
}

export function createShape(init: Partial<ShapeElement> = {}): ShapeElement {
  return {
    ...base('shape'),
    shape: 'rect',
    fill: { type: 'solid', color: '#c4c4c4' },
    stroke: null,
    cornerRadius: 0,
    flipX: false,
    flipY: false,
    shadow: null,
    ...init,
    type: 'shape',
  };
}

export function createLine(init: Partial<LineElement> = {}): LineElement {
  const stroke = init.stroke ?? { color: '#000000', width: 4, dash: 'solid' as const };
  return {
    ...base('line'),
    width: 300,
    height: stroke.width,
    startCap: 'none',
    endCap: 'none',
    ...init,
    stroke,
    type: 'line',
  };
}

export function createImage(init: Partial<ImageElement> & { image: ImageFill }): ImageElement {
  return {
    ...base('image'),
    cornerRadius: 0,
    stroke: null,
    shadow: null,
    ...init,
    type: 'image',
  };
}

export function createFrame(init: Partial<FrameElement> = {}): FrameElement {
  return {
    ...base('frame'),
    shape: 'rect',
    image: null,
    color: '#e6e6e9',
    cornerRadius: 0,
    stroke: null,
    ...init,
    type: 'frame',
  };
}

export function createGrid(
  init: Partial<GridElement> & { layout: GridElement['layout'] },
): GridElement {
  const cells = init.cells ?? init.layout.map(() => ({ image: null, color: '#e6e6e9' }));
  return {
    ...base('grid'),
    width: 500,
    height: 500,
    gap: 8,
    cornerRadius: 0,
    ...init,
    cells,
    type: 'grid',
  };
}

export function createSvg(init: Partial<SvgElement> & { assetId: string }): SvgElement {
  return {
    ...base('svg'),
    colors: {},
    flipX: false,
    flipY: false,
    shadow: null,
    ...init,
    type: 'svg',
  };
}

export function createPath(init: Partial<PathElement> & { d: string }): PathElement {
  return {
    ...base('path'),
    pathWidth: init.width ?? 100,
    pathHeight: init.height ?? 100,
    fill: null,
    stroke: { color: '#000000', width: 4, dash: 'solid' },
    flipX: false,
    flipY: false,
    ...init,
    type: 'path',
  };
}

export function createGroup(init: Partial<GroupElement> = {}): GroupElement {
  return { ...base('group'), ...init, type: 'group' };
}

/** Fill in defaults for any element type from a partial description. */
export function createElement(init: Partial<DesignElement> & { type: ElementType }): DesignElement {
  switch (init.type) {
    case 'text':
      return createText(init as TextInit);
    case 'shape':
      return createShape(init as Partial<ShapeElement>);
    case 'line':
      return createLine(init as Partial<LineElement>);
    case 'image':
      return createImage(init as Partial<ImageElement> & { image: ImageFill });
    case 'frame':
      return createFrame(init as Partial<FrameElement>);
    case 'grid':
      return createGrid(init as Partial<GridElement> & { layout: GridElement['layout'] });
    case 'svg':
      return createSvg(init as Partial<SvgElement> & { assetId: string });
    case 'path':
      return createPath(init as Partial<PathElement> & { d: string });
    case 'group':
      return createGroup(init as Partial<GroupElement>);
  }
}

export function createPageRecord(init: Partial<PageRecord> = {}): PageRecord {
  return {
    id: createPageId(),
    typeName: 'page',
    index: 'a0',
    title: '',
    background: { fill: { type: 'solid', color: '#ffffff' }, image: null },
    notes: '',
    ...init,
  };
}

export function createDocumentRecord(init: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    title: 'Untitled design',
    width: 1080,
    height: 1080,
    unit: 'px',
    dpi: 96,
    ...init,
    id: DOCUMENT_ID,
    typeName: 'document',
  };
}
