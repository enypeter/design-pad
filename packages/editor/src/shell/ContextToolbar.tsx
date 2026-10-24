import {
  coverCropForAsset,
  type DesignElement,
  type Fill,
  fillToCss,
  type ImageFill,
  type LineCap,
  type Stroke,
  type StrokeDash,
  type TextElement,
  type TextStyle,
} from '@design-pad/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  Check,
  ChevronDown,
  Crop,
  Droplet,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  ImageMinus,
  Italic,
  Layers,
  List,
  ListOrdered,
  Lock,
  LockOpen,
  Minus,
  MoveHorizontal,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Strikethrough,
  Underline,
  Ungroup,
  Wand2,
} from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { toggleLock } from '../actions';
import { Button, Divider, IconButton, Popover, Slider } from '../components/ui';
import { type SelectionKind, selectionKind, useDesignPad, useEditorValue, useUI } from '../context';
import { LINE_CAPS } from '../library/elements';
import { editableFill, withFill } from '../panels/EditImagePanel';
import type { ColorTarget, ContextPanelId } from '../state/ui';

const FONT_SIZES = [
  6, 8, 10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 48, 56, 64, 72, 80, 88, 96, 104, 120, 144, 180,
  240,
];

function usePanelToggle() {
  const { ui } = useDesignPad();
  const open = useUI((s) => s.contextPanel);
  const target = useUI((s) => s.colorTarget);
  return {
    open,
    toggle: (id: ContextPanelId, colorTarget: ColorTarget | null = null) => {
      const same =
        open === id && (id !== 'color' || JSON.stringify(target) === JSON.stringify(colorTarget));
      ui.set({ contextPanel: same ? null : id, colorTarget });
    },
  };
}

function PopoverButton({
  label,
  icon,
  children,
  text,
  wide,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  text?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`dp-tool-btn${open ? ' is-active' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {text && <span>{text}</span>}
      </button>
      <Popover
        anchor={ref}
        open={open}
        onClose={() => setOpen(false)}
        className={wide ? 'is-wide' : undefined}
      >
        {children}
      </Popover>
    </>
  );
}

function ColorButton({
  target,
  fill,
  label,
  kind = 'swatch',
}: {
  target: ColorTarget;
  fill: Fill | string | null;
  label: string;
  kind?: 'swatch' | 'text';
}) {
  const { toggle, open } = usePanelToggle();
  const current = useUI((s) => s.colorTarget);
  const active = open === 'color' && JSON.stringify(current) === JSON.stringify(target);
  const css = typeof fill === 'string' ? fill : fill ? fillToCss(fill) : 'transparent';
  return (
    <button
      type="button"
      className={`dp-tool-btn dp-color-btn${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      onClick={() => toggle('color', target)}
    >
      {kind === 'text' ? (
        <span className="dp-text-color-icon">
          <span>A</span>
          <span className="dp-text-color-bar" style={{ background: css }} />
        </span>
      ) : (
        <span
          className={`dp-color-chip${fill ? '' : ' is-empty'}`}
          style={fill ? { background: css } : undefined}
        />
      )}
    </button>
  );
}

function TransparencyButton({ els }: { els: DesignElement[] }) {
  const { editor } = useDesignPad();
  const value = Math.round((els[0]?.opacity ?? 1) * 100);
  return (
    <PopoverButton label="Transparency" icon={<Droplet size={18} />}>
      <div className="dp-pop-pad">
        <Slider
          label="Transparency"
          min={0}
          max={100}
          value={value}
          onStart={() => editor.history.startInteraction()}
          onEnd={() => editor.history.endInteraction()}
          onChange={(v) => editor.updateElements(els.map((e) => ({ id: e.id, opacity: v / 100 })))}
        />
      </div>
    </PopoverButton>
  );
}

function CommonTail({ els }: { els: DesignElement[] }) {
  const ctx = useDesignPad();
  const { toggle, open } = usePanelToggle();
  const locked = els.every((e) => e.locked);
  return (
    <>
      <Divider vertical />
      <Button
        variant="ghost"
        size="sm"
        active={open === 'position'}
        onClick={() => toggle('position')}
      >
        <Layers size={16} /> Position
      </Button>
      <TransparencyButton els={els} />
      <IconButton
        label={locked ? 'Unlock' : 'Lock'}
        active={locked}
        onClick={() => toggleLock(ctx)}
      >
        {locked ? <Lock size={18} /> : <LockOpen size={18} />}
      </IconButton>
    </>
  );
}

function FlipButton({ ids }: { ids: string[] }) {
  const { editor } = useDesignPad();
  return (
    <PopoverButton label="Flip" icon={<FlipHorizontal2 size={18} />} text="Flip">
      <div className="dp-menu-list">
        <button
          type="button"
          className="dp-menu-item"
          onClick={() => editor.flipElements(ids, 'horizontal')}
        >
          <span className="dp-menu-icon">
            <FlipHorizontal2 size={16} />
          </span>
          <span className="dp-menu-label">Flip horizontal</span>
        </button>
        <button
          type="button"
          className="dp-menu-item"
          onClick={() => editor.flipElements(ids, 'vertical')}
        >
          <span className="dp-menu-icon">
            <FlipVertical2 size={16} />
          </span>
          <span className="dp-menu-label">Flip vertical</span>
        </button>
      </div>
    </PopoverButton>
  );
}

// -----------------------------------------------------------------------------
// Text
// -----------------------------------------------------------------------------

function useApplyText() {
  const ctx = useDesignPad();
  return (ids: string[], patch: Partial<TextStyle>) => {
    const inline = [
      'fontWeight',
      'italic',
      'underline',
      'strikethrough',
      'color',
      'fontSize',
      'fontFamily',
    ];
    const onlyInline = Object.keys(patch).every((k) => inline.includes(k));
    if (onlyInline && ctx.textEditor.current?.applyStyle(patch)) return;
    ctx.editor.applyTextStyle(ids, patch);
  };
}

function FontSizeControl({ texts }: { texts: TextElement[] }) {
  const apply = useApplyText();
  const ids = texts.map((t) => t.id);
  const size = texts[0]!.style.fontSize;
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const set = (v: number) =>
    apply(ids, { fontSize: Math.max(1, Math.min(1600, Math.round(v * 10) / 10)) });
  return (
    <div className="dp-font-size" ref={ref}>
      <IconButton
        label="Decrease font size"
        size="sm"
        onClick={() => set(size > 1 ? Math.max(1, size - 1) : size)}
      >
        <Minus size={15} />
      </IconButton>
      <input
        className="dp-font-size-input"
        aria-label="Font size"
        value={draft ?? String(Math.round(size * 10) / 10)}
        onFocus={(e) => {
          setDraft(String(Math.round(size * 10) / 10));
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = Number.parseFloat(draft ?? '');
          if (!Number.isNaN(v) && v > 0) set(v);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <IconButton label="Increase font size" size="sm" onClick={() => set(size + 1)}>
        <Plus size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)}>
        <div className="dp-menu-list dp-size-list dp-scrollable">
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`dp-menu-item${s === size ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                set(s);
                setOpen(false);
              }}
            >
              <span className="dp-menu-label">{s}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function TextToolbar({ texts }: { texts: TextElement[] }) {
  const { editor } = useDesignPad();
  const { toggle, open } = usePanelToggle();
  const apply = useApplyText();
  const ids = texts.map((t) => t.id);
  const s = texts[0]!.style;
  const alignOrder: TextStyle['align'][] = ['left', 'center', 'right', 'justify'];
  const AlignIcon = {
    left: AlignLeft,
    center: AlignCenter,
    right: AlignRight,
    justify: AlignJustify,
  }[s.align];
  const listOrder: TextStyle['list'][] = ['none', 'bullet', 'number'];
  return (
    <>
      <button
        type="button"
        className={`dp-tool-btn dp-font-btn${open === 'font' ? ' is-active' : ''}`}
        onClick={() => toggle('font')}
        title="Font"
      >
        <span style={{ fontFamily: `"${s.fontFamily}", sans-serif` }}>{s.fontFamily}</span>
        <ChevronDown size={15} />
      </button>
      <FontSizeControl texts={texts} />
      <ColorButton target={{ kind: 'text' }} fill={s.color} label="Text colour" kind="text" />
      <IconButton
        label="Bold (Ctrl+B)"
        active={s.fontWeight >= 600}
        onClick={() => apply(ids, { fontWeight: s.fontWeight >= 600 ? 400 : 700 })}
      >
        <Bold size={18} />
      </IconButton>
      <IconButton
        label="Italic (Ctrl+I)"
        active={s.italic}
        onClick={() => apply(ids, { italic: !s.italic })}
      >
        <Italic size={18} />
      </IconButton>
      <IconButton
        label="Underline (Ctrl+U)"
        active={s.underline}
        onClick={() => apply(ids, { underline: !s.underline })}
      >
        <Underline size={18} />
      </IconButton>
      <IconButton
        label="Strikethrough"
        active={s.strikethrough}
        onClick={() => apply(ids, { strikethrough: !s.strikethrough })}
      >
        <Strikethrough size={18} />
      </IconButton>
      <IconButton
        label="Uppercase"
        active={s.uppercase}
        onClick={() => editor.applyTextStyle(ids, { uppercase: !s.uppercase })}
      >
        <CaseSensitive size={19} />
      </IconButton>
      <IconButton
        label={`Alignment: ${s.align}`}
        onClick={() =>
          editor.applyTextStyle(ids, { align: alignOrder[(alignOrder.indexOf(s.align) + 1) % 4]! })
        }
      >
        <AlignIcon size={18} />
      </IconButton>
      <IconButton
        label="List"
        active={s.list !== 'none'}
        onClick={() =>
          editor.applyTextStyle(ids, { list: listOrder[(listOrder.indexOf(s.list) + 1) % 3]! })
        }
      >
        {s.list === 'number' ? <ListOrdered size={18} /> : <List size={18} />}
      </IconButton>
      <PopoverButton label="Spacing" icon={<MoveHorizontal size={18} />}>
        <div className="dp-pop-pad">
          <Slider
            label="Letter spacing"
            min={-200}
            max={800}
            value={s.letterSpacing}
            onStart={() => editor.history.startInteraction()}
            onEnd={() => editor.history.endInteraction()}
            onChange={(v) => editor.applyTextStyle(ids, { letterSpacing: v })}
          />
          <Slider
            label="Line spacing"
            min={0.5}
            max={2.5}
            step={0.01}
            value={s.lineHeight}
            onStart={() => editor.history.startInteraction()}
            onEnd={() => editor.history.endInteraction()}
            onChange={(v) => editor.applyTextStyle(ids, { lineHeight: v })}
          />
        </div>
      </PopoverButton>
      <Divider vertical />
      <Button
        variant="ghost"
        size="sm"
        active={open === 'effects'}
        onClick={() => toggle('effects')}
      >
        <Sparkles size={16} /> Effects
      </Button>
    </>
  );
}

// -----------------------------------------------------------------------------
// Shapes, lines, images
// -----------------------------------------------------------------------------

function BorderControls({
  el,
  rounding,
}: {
  el: DesignElement & { stroke: Stroke | null; cornerRadius?: number };
  rounding: boolean;
}) {
  const { editor } = useDesignPad();
  const stroke = el.stroke;
  const dash: StrokeDash | 'none' = stroke && stroke.width > 0 ? stroke.dash : 'none';
  const set = (patch: Partial<Stroke> | null) =>
    editor.updateElement<DesignElement>(el.id, {
      stroke:
        patch === null
          ? null
          : {
              color: stroke?.color ?? '#000000',
              width: stroke?.width || Math.max(2, Math.round(Math.min(el.width, el.height) * 0.02)),
              dash: 'solid',
              ...patch,
            },
    } as Partial<DesignElement>);
  const interaction = {
    onStart: () => editor.history.startInteraction(),
    onEnd: () => editor.history.endInteraction(),
  };
  return (
    <PopoverButton label="Border style" icon={<SlidersHorizontal size={18} />}>
      <div className="dp-pop-pad">
        <div className="dp-dash-row">
          {(['none', 'solid', 'dashed', 'dotted'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`dp-dash-opt${dash === d ? ' is-active' : ''}`}
              aria-label={`Border ${d}`}
              onClick={() => set(d === 'none' ? null : { dash: d })}
            >
              <svg viewBox="0 0 40 20" aria-hidden="true">
                {d === 'none' ? (
                  <path d="M6 16L34 4" stroke="currentColor" strokeWidth="2" />
                ) : (
                  <line
                    x1="4"
                    y1="10"
                    x2="36"
                    y2="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={d === 'dashed' ? '6 4' : d === 'dotted' ? '0.1 5' : undefined}
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          ))}
        </div>
        {stroke && (
          <Slider
            label="Border weight"
            min={0}
            max={100}
            value={stroke.width}
            {...interaction}
            onChange={(width) => set({ width })}
          />
        )}
        {rounding && (
          <Slider
            label="Corner rounding"
            min={0}
            max={Math.round(Math.min(el.width, el.height) / 2)}
            value={Math.round(el.cornerRadius ?? 0)}
            {...interaction}
            onChange={(cornerRadius) =>
              editor.updateElement<DesignElement>(el.id, { cornerRadius } as Partial<DesignElement>)
            }
          />
        )}
      </div>
    </PopoverButton>
  );
}

function CapSelect({
  value,
  onChange,
  label,
}: {
  value: LineCap;
  onChange(c: LineCap): void;
  label: string;
}) {
  return (
    <PopoverButton
      label={label}
      text={`${label}: ${LINE_CAPS.find((c) => c.id === value)?.name ?? value}`}
    >
      <div className="dp-menu-list">
        {LINE_CAPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`dp-menu-item${c.id === value ? ' is-active' : ''}`}
            onClick={() => onChange(c.id)}
          >
            <span className="dp-menu-label">{c.name}</span>
            {c.id === value && <Check size={15} />}
          </button>
        ))}
      </div>
    </PopoverButton>
  );
}

function LineToolbar({ el }: { el: Extract<DesignElement, { type: 'line' }> }) {
  const { editor } = useDesignPad();
  const interaction = {
    onStart: () => editor.history.startInteraction(),
    onEnd: () => editor.history.endInteraction(),
  };
  const setStroke = (patch: Partial<Stroke>) => {
    const stroke = { ...el.stroke, ...patch };
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    editor.updateElement(el.id, {
      stroke,
      height: stroke.width,
      y: cy - stroke.width / 2,
      x: cx - el.width / 2,
    });
  };
  return (
    <>
      <ColorButton target={{ kind: 'line' }} fill={el.stroke.color} label="Line colour" />
      <PopoverButton label="Line style" icon={<SlidersHorizontal size={18} />}>
        <div className="dp-pop-pad">
          <div className="dp-dash-row">
            {(['solid', 'dashed', 'dotted'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`dp-dash-opt${el.stroke.dash === d ? ' is-active' : ''}`}
                aria-label={`Line ${d}`}
                onClick={() => setStroke({ dash: d })}
              >
                <svg viewBox="0 0 40 20" aria-hidden="true">
                  <line
                    x1="4"
                    y1="10"
                    x2="36"
                    y2="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={d === 'dashed' ? '6 4' : d === 'dotted' ? '0.1 5' : undefined}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ))}
          </div>
          <Slider
            label="Line weight"
            min={1}
            max={100}
            value={el.stroke.width}
            {...interaction}
            onChange={(width) => setStroke({ width })}
          />
        </div>
      </PopoverButton>
      <CapSelect
        label="Start"
        value={el.startCap}
        onChange={(startCap) => editor.updateElement(el.id, { startCap })}
      />
      <CapSelect
        label="End"
        value={el.endCap}
        onChange={(endCap) => editor.updateElement(el.id, { endCap })}
      />
    </>
  );
}

function PhotoButtons({ el, fill }: { el: DesignElement; fill: ImageFill | null }) {
  const { editor } = useDesignPad();
  const { toggle, open } = usePanelToggle();
  if (!fill) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        active={open === 'edit-image'}
        onClick={() => toggle('edit-image')}
      >
        <Wand2 size={16} /> Edit photo
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          editor.startCropping({
            id: el.id,
            cell: el.type === 'grid' ? el.cells.findIndex((c) => c.image) : undefined,
          })
        }
      >
        <Crop size={16} /> Crop
      </Button>
    </>
  );
}

function SvgColors({ el }: { el: Extract<DesignElement, { type: 'svg' }> }) {
  const originals = useEditorValue((e) => e.resources.getSvgColors(el.assetId));
  return (
    <>
      {originals.slice(0, 8).map((orig) => (
        <ColorButton
          key={orig}
          target={{ kind: 'svg', original: orig }}
          fill={el.colors[orig] ?? orig}
          label="Graphic colour"
        />
      ))}
    </>
  );
}

function CropToolbar() {
  const { editor } = useDesignPad();
  const crop = useEditorValue((e) => e.session.state.cropping);
  const el = useEditorValue((e) => (crop ? e.getElement(crop.id) : undefined));
  if (!crop || !el) return null;
  const fill = editableFill(el, crop.cell);
  return (
    <>
      <span className="dp-toolbar-title">Crop</span>
      <Divider vertical />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!fill) return;
          const asset = editor.getAsset(fill.assetId);
          if (!asset) return;
          const box =
            el.type === 'grid' && crop.cell !== undefined ? null : { w: el.width, h: el.height };
          const w = box?.w ?? el.width;
          const h = box?.h ?? el.height;
          editor.store.put([
            withFill(el, { ...fill, crop: coverCropForAsset(asset, w, h) }, crop.cell),
          ]);
        }}
      >
        <RotateCcw size={16} /> Reset
      </Button>
      <Button variant="primary" size="sm" onClick={() => editor.stopCropping()}>
        Done
      </Button>
    </>
  );
}

function PageToolbar() {
  const { editor } = useDesignPad();
  const page = useEditorValue((e) => e.getCurrentPage());
  return (
    <>
      <ColorButton
        target={{ kind: 'background' }}
        fill={page.background.fill}
        label="Background colour"
      />
      <span className="dp-toolbar-hint">Background colour</span>
      {page.background.image && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.setPageBackground(page.id, { image: null })}
        >
          <ImageMinus size={16} /> Remove background image
        </Button>
      )}
    </>
  );
}

/** The bar above the canvas whose controls follow the selection (like Canva's). */
export function ContextToolbar() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const sel = useEditorValue((e) => e.getSelectedElements());
  const cropping = useEditorValue((e) => e.session.state.cropping);
  const kind: SelectionKind = selectionKind(sel);
  const ids = sel.map((s) => s.id);
  const one = sel[0];

  let body: ReactNode;
  if (cropping) {
    body = <CropToolbar />;
  } else {
    switch (kind) {
      case 'none':
        body = <PageToolbar />;
        break;
      case 'text':
        body = (
          <>
            <TextToolbar texts={sel as TextElement[]} />
            <CommonTail els={sel} />
          </>
        );
        break;
      case 'shape': {
        const el = one as Extract<DesignElement, { type: 'shape' }>;
        body = (
          <>
            <ColorButton target={{ kind: 'fill' }} fill={el.fill} label="Fill colour" />
            <BorderControls el={el} rounding />
            {el.stroke && (
              <ColorButton
                target={{ kind: 'stroke' }}
                fill={el.stroke.color}
                label="Border colour"
              />
            )}
            <FlipButton ids={ids} />
            <CommonTail els={sel} />
          </>
        );
        break;
      }
      case 'line':
        body = (
          <>
            <LineToolbar el={one as Extract<DesignElement, { type: 'line' }>} />
            <CommonTail els={sel} />
          </>
        );
        break;
      case 'image': {
        const el = one as Extract<DesignElement, { type: 'image' }>;
        body = (
          <>
            <PhotoButtons el={el} fill={el.image} />
            <FlipButton ids={ids} />
            <BorderControls el={el} rounding />
            {el.stroke && (
              <ColorButton
                target={{ kind: 'stroke' }}
                fill={el.stroke.color}
                label="Border colour"
              />
            )}
            <CommonTail els={sel} />
          </>
        );
        break;
      }
      case 'frame': {
        const el = one as Extract<DesignElement, { type: 'frame' }>;
        body = (
          <>
            {el.image ? (
              <>
                <PhotoButtons el={el} fill={el.image} />
                <FlipButton ids={ids} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.updateElement(el.id, { image: null })}
                >
                  <ImageMinus size={16} /> Remove photo
                </Button>
              </>
            ) : (
              <>
                <ColorButton target={{ kind: 'frame' }} fill={el.color} label="Frame colour" />
                <span className="dp-toolbar-hint">Drag a photo into the frame</span>
              </>
            )}
            <CommonTail els={sel} />
          </>
        );
        break;
      }
      case 'grid': {
        const el = one as Extract<DesignElement, { type: 'grid' }>;
        const interaction = {
          onStart: () => editor.history.startInteraction(),
          onEnd: () => editor.history.endInteraction(),
        };
        body = (
          <>
            <PopoverButton label="Spacing" icon={<SlidersHorizontal size={18} />} text="Spacing">
              <div className="dp-pop-pad">
                <Slider
                  label="Grid spacing"
                  min={0}
                  max={Math.round(Math.min(el.width, el.height) / 8)}
                  value={Math.round(el.gap)}
                  {...interaction}
                  onChange={(gap) => editor.updateElement(el.id, { gap })}
                />
                <Slider
                  label="Corner rounding"
                  min={0}
                  max={Math.round(Math.min(el.width, el.height) / 6)}
                  value={Math.round(el.cornerRadius)}
                  {...interaction}
                  onChange={(cornerRadius) => editor.updateElement(el.id, { cornerRadius })}
                />
              </div>
            </PopoverButton>
            <PhotoButtons el={el} fill={editableFill(el)} />
            <span className="dp-toolbar-hint">Drag photos into the cells</span>
            <CommonTail els={sel} />
          </>
        );
        break;
      }
      case 'svg':
        body = (
          <>
            <SvgColors el={one as Extract<DesignElement, { type: 'svg' }>} />
            <FlipButton ids={ids} />
            <CommonTail els={sel} />
          </>
        );
        break;
      case 'path': {
        const el = one as Extract<DesignElement, { type: 'path' }>;
        body = (
          <>
            {el.stroke && (
              <ColorButton target={{ kind: 'stroke' }} fill={el.stroke.color} label="Colour" />
            )}
            {el.fill && <ColorButton target={{ kind: 'fill' }} fill={el.fill} label="Fill" />}
            <FlipButton ids={ids} />
            <CommonTail els={sel} />
          </>
        );
        break;
      }
      case 'group':
        body = (
          <>
            <Button variant="ghost" size="sm" onClick={() => editor.ungroupElements(one!.id)}>
              <Ungroup size={16} /> Ungroup
            </Button>
            <FlipButton ids={ids} />
            <CommonTail els={sel} />
          </>
        );
        break;
      case 'multi':
        body = (
          <>
            <Button variant="ghost" size="sm" onClick={() => editor.groupElements(ids)}>
              <Group size={16} /> Group
            </Button>
            {sel.every((s) => s.type === 'text') && <TextToolbar texts={sel as TextElement[]} />}
            <FlipButton ids={ids} />
            <CommonTail els={sel} />
          </>
        );
        break;
    }
  }

  return (
    <div className="dp-context-toolbar dp-scrollable" role="toolbar" aria-label="Element options">
      {body}
    </div>
  );
}
