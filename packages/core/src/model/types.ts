/**
 * Design Pad document model.
 *
 * The document is a flat set of records (document, pages, elements, assets).
 * Elements point at their parent (a page or a group) through `parentId` and
 * are ordered among siblings by a fractional `index` string. A flat,
 * normalized model keeps diffs small, makes undo/redo a matter of inverting
 * record diffs, and maps cleanly onto a CRDT later (real-time collaboration).
 */

export type Id = string;

export type Unit = 'px' | 'mm' | 'cm' | 'in';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

export interface GradientStop {
  /** 0..1 */
  offset: number;
  color: string;
}

export interface SolidFill {
  type: 'solid';
  color: string;
}

export interface LinearGradientFill {
  type: 'linear';
  /** CSS convention: 0 = bottom→top, 90 = left→right, 180 = top→bottom. */
  angle: number;
  stops: GradientStop[];
}

export interface RadialGradientFill {
  type: 'radial';
  stops: GradientStop[];
}

export type GradientFill = LinearGradientFill | RadialGradientFill;
export type Fill = SolidFill | LinearGradientFill | RadialGradientFill;

export type StrokeDash = 'solid' | 'dashed' | 'dotted';

export interface Stroke {
  color: string;
  width: number;
  dash: StrokeDash;
}

export interface DropShadow {
  color: string;
  /** 0..1 */
  opacity: number;
  /** Blur radius in design units. */
  blur: number;
  /** Offset distance in design units. */
  distance: number;
  /** Direction of the offset in degrees, 0 = right, 90 = down. */
  angle: number;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Region of the source image that is visible, normalized to 0..1. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAdjustments {
  /** All values are -100..100 unless noted. */
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  /** Warm (+) / cool (-). */
  temperature: number;
  /** Magenta (+) / green (-). */
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  /** 0..100 */
  fade: number;
  /** 0..100 */
  vignette: number;
  /** 0..100 */
  blur: number;
  /** 0..100 */
  sharpness: number;
}

export interface ImageFilter {
  /** Preset id, see `FILTER_PRESETS`. */
  name: string;
  /** 0..100 */
  intensity: number;
}

/** A positioned bitmap. Used by image elements, frames, grid cells and page backgrounds. */
export interface ImageFill {
  assetId: Id;
  crop: Crop;
  flipX: boolean;
  flipY: boolean;
  /** Sparse: missing keys are 0. */
  adjustments?: Partial<ImageAdjustments>;
  filter?: ImageFilter | null;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type ListStyle = 'none' | 'bullet' | 'number';

export interface TextStyle {
  fontFamily: string;
  /** Design units. */
  fontSize: number;
  /** 100..900 */
  fontWeight: number;
  italic: boolean;
  color: string;
  underline: boolean;
  strikethrough: boolean;
  /** Thousandths of an em, like Canva's spacing slider (-200..800). */
  letterSpacing: number;
  /** Line height multiplier (Canva default 1.4). */
  lineHeight: number;
  align: TextAlign;
  uppercase: boolean;
  list: ListStyle;
}

/** Inline style overrides that a run of characters may carry. */
export type SpanStyle = Partial<
  Pick<
    TextStyle,
    'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'color' | 'underline' | 'strikethrough'
  >
>;

export interface TextSpan {
  /** May contain '\n' which separates paragraphs. */
  text: string;
  style?: SpanStyle;
}

export type TextEffect =
  | {
      type: 'shadow';
      /** 0..100, relative to font size */
      offset: number;
      /** degrees, -180..180, 0 = right */
      direction: number;
      /** 0..100 */
      blur: number;
      /** 0..100 */
      transparency: number;
      color: string;
    }
  | { type: 'lift'; intensity: number }
  | { type: 'hollow'; thickness: number }
  | {
      type: 'splice';
      thickness: number;
      offset: number;
      direction: number;
      color: string;
    }
  | { type: 'outline'; thickness: number; color: string }
  | { type: 'echo'; offset: number; direction: number; color: string }
  | {
      type: 'glitch';
      offset: number;
      direction: number;
      colorA: string;
      colorB: string;
    }
  | { type: 'neon'; intensity: number }
  | {
      type: 'background';
      /** 0..100 */
      roundness: number;
      /** 0..100 */
      spread: number;
      /** 0..100 */
      transparency: number;
      color: string;
    };

export type TextEffectType = TextEffect['type'];

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export type ElementType =
  | 'text'
  | 'shape'
  | 'line'
  | 'image'
  | 'frame'
  | 'grid'
  | 'svg'
  | 'path'
  | 'group';

export interface ElementBase {
  id: Id;
  typeName: 'element';
  type: ElementType;
  /** Page id, or group id for grouped elements. */
  parentId: Id;
  /** Fractional index; siblings render in ascending order. */
  index: string;
  name?: string;
  /** Top-left in parent space (page space, or the group's unrotated local space). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise, about the element centre. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  locked: boolean;
  link?: string;
}

export interface TextElement extends ElementBase {
  type: 'text';
  spans: TextSpan[];
  style: TextStyle;
  effect: TextEffect | null;
  /** -100..100; 0 renders straight text. */
  curve: number;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  /** Shape kind id, see `SHAPES`. */
  shape: string;
  fill: Fill;
  stroke: Stroke | null;
  /** Corner rounding in design units for shapes that support it. */
  cornerRadius: number;
  flipX: boolean;
  flipY: boolean;
  shadow: DropShadow | null;
}

export type LineCap =
  | 'none'
  | 'arrow'
  | 'triangle'
  | 'circle'
  | 'square'
  | 'diamond'
  | 'bar'
  | 'circle-outline'
  | 'triangle-outline';

/**
 * A straight line. The line runs along the horizontal centre of the element
 * box, from the left edge to the right edge, and is oriented by `rotation`.
 * `height` tracks the stroke width.
 */
export interface LineElement extends ElementBase {
  type: 'line';
  stroke: Stroke;
  startCap: LineCap;
  endCap: LineCap;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  image: ImageFill;
  cornerRadius: number;
  stroke: Stroke | null;
  shadow: DropShadow | null;
}

/** A shape-shaped mask holding an image (or a placeholder until one is dropped in). */
export interface FrameElement extends ElementBase {
  type: 'frame';
  shape: string;
  image: ImageFill | null;
  /** Placeholder / backdrop colour. */
  color: string;
  cornerRadius: number;
  stroke: Stroke | null;
}

export interface GridCellLayout {
  /** Normalized 0..1 within the grid box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridCellContent {
  image: ImageFill | null;
  color: string;
}

export interface GridElement extends ElementBase {
  type: 'grid';
  layout: GridCellLayout[];
  cells: GridCellContent[];
  /** Spacing between cells in design units. */
  gap: number;
  cornerRadius: number;
}

export interface SvgElement extends ElementBase {
  type: 'svg';
  assetId: Id;
  /** Original colour (normalized lowercase hex) → replacement. */
  colors: Record<string, string>;
  flipX: boolean;
  flipY: boolean;
  shadow: DropShadow | null;
}

/** Vector path, used by the draw tool and custom vector shapes. */
export interface PathElement extends ElementBase {
  type: 'path';
  /** SVG path data in the path's own coordinate space. */
  d: string;
  /** Size of the path's coordinate space; the path is scaled to the element box. */
  pathWidth: number;
  pathHeight: number;
  fill: Fill | null;
  stroke: Stroke | null;
  flipX: boolean;
  flipY: boolean;
}

export interface GroupElement extends ElementBase {
  type: 'group';
}

export type DesignElement =
  | TextElement
  | ShapeElement
  | LineElement
  | ImageElement
  | FrameElement
  | GridElement
  | SvgElement
  | PathElement
  | GroupElement;

export type ElementOfType<T extends ElementType> = Extract<DesignElement, { type: T }>;

// ---------------------------------------------------------------------------
// Pages, document, assets
// ---------------------------------------------------------------------------

export interface PageBackground {
  fill: Fill;
  image: ImageFill | null;
}

export interface PageRecord {
  id: Id;
  typeName: 'page';
  index: string;
  title: string;
  background: PageBackground;
  notes: string;
}

export const DOCUMENT_ID = 'document';

export interface DocumentRecord {
  id: typeof DOCUMENT_ID;
  typeName: 'document';
  title: string;
  /** Page width in design units (px). */
  width: number;
  /** Page height in design units (px). */
  height: number;
  /** Unit the user picked; sizes are stored in px at `dpi`. */
  unit: Unit;
  /** Pixels per inch used to convert print units. 96 for screen designs. */
  dpi: number;
}

export type AssetKind = 'image' | 'svg' | 'font';

export interface AssetRecord {
  id: Id;
  typeName: 'asset';
  kind: AssetKind;
  /** URL the host can load. May use a host-defined scheme resolved by the asset adapter. */
  src: string;
  mime: string;
  /** Natural size in pixels (images and svgs). */
  width: number;
  height: number;
  name?: string;
  /** Font assets: family name to register. */
  fontFamily?: string;
  /** Attribution for stock content. */
  attribution?: { author: string; url?: string; source?: string };
}

export type DesignRecord = DocumentRecord | PageRecord | DesignElement | AssetRecord;
export type RecordTypeName = DesignRecord['typeName'];

/** Serialized design (what hosts persist). */
export interface DesignFile {
  format: 'design-pad';
  schemaVersion: number;
  id: string;
  title: string;
  width: number;
  height: number;
  unit: Unit;
  dpi: number;
  pages: PageRecord[];
  elements: DesignElement[];
  assets: AssetRecord[];
}
