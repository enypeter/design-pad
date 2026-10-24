import {
  type DesignElement,
  type DropShadow,
  FILTER_PRESETS,
  type ImageAdjustments,
  type ImageFill,
  type ImageFilter,
  processImage,
  resolveProcessParams,
} from '@design-pad/core';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, EmptyState, Section, Slider, Tabs, Toggle } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';

/** The image fill an element exposes for editing (image, frame, or selected grid cell). */
export function editableFill(el: DesignElement | undefined, cell?: number): ImageFill | null {
  if (!el) return null;
  if (el.type === 'image') return el.image;
  if (el.type === 'frame') return el.image;
  if (el.type === 'grid')
    return el.cells[cell ?? el.cells.findIndex((c) => c.image)]?.image ?? null;
  return null;
}

export function withFill(el: DesignElement, fill: ImageFill, cell?: number): DesignElement {
  if (el.type === 'image') return { ...el, image: fill };
  if (el.type === 'frame') return { ...el, image: fill };
  if (el.type === 'grid') {
    const i = cell ?? el.cells.findIndex((c) => c.image);
    return { ...el, cells: el.cells.map((c, k) => (k === i ? { ...c, image: fill } : c)) };
  }
  return el;
}

const GROUPS: {
  title: string;
  items: { key: keyof ImageAdjustments; label: string; min: number }[];
}[] = [
  {
    title: 'White balance',
    items: [
      { key: 'temperature', label: 'Warmth', min: -100 },
      { key: 'tint', label: 'Tint', min: -100 },
    ],
  },
  {
    title: 'Light',
    items: [
      { key: 'brightness', label: 'Brightness', min: -100 },
      { key: 'contrast', label: 'Contrast', min: -100 },
      { key: 'highlights', label: 'Highlights', min: -100 },
      { key: 'shadows', label: 'Shadows', min: -100 },
      { key: 'whites', label: 'Whites', min: -100 },
      { key: 'blacks', label: 'Blacks', min: -100 },
    ],
  },
  {
    title: 'Colour',
    items: [
      { key: 'vibrance', label: 'Vibrance', min: -100 },
      { key: 'saturation', label: 'Saturation', min: -100 },
    ],
  },
  {
    title: 'Texture',
    items: [
      { key: 'sharpness', label: 'Sharpness', min: 0 },
      { key: 'blur', label: 'Blur', min: 0 },
      { key: 'vignette', label: 'Vignette', min: 0 },
      { key: 'fade', label: 'Fade', min: 0 },
    ],
  },
];

/** Small preview of a filter applied to the selected photo. */
function FilterThumb({ fill, filter }: { fill: ImageFill; filter: ImageFilter | null }) {
  const { editor } = useDesignPad();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void editor.resources.loadImage(fill.assetId).then((img) => {
      if (!img || !alive) return;
      const size = 96;
      const k =
        size / Math.max(1, Math.min(img.width * fill.crop.width, img.height * fill.crop.height));
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const c = canvas.getContext('2d')!;
      const sw = size / k;
      const sx = (fill.crop.x + fill.crop.width / 2) * img.width - sw / 2;
      const sy = (fill.crop.y + fill.crop.height / 2) * img.height - sw / 2;
      c.drawImage(img, sx, sy, sw, sw, 0, 0, size, size);
      const out = filter
        ? processImage(canvas, size, size, resolveProcessParams({}, filter))
        : canvas;
      if (!out) return;
      if ('convertToBlob' in out) {
        void out.convertToBlob().then((b) => alive && setSrc(URL.createObjectURL(b)));
      } else {
        setSrc((out as HTMLCanvasElement).toDataURL());
      }
    });
    return () => {
      alive = false;
    };
  }, [editor, fill.assetId, fill.crop, filter]);
  return src ? <img src={src} alt="" /> : <span className="dp-skeleton" />;
}

export function EditImagePanel() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const [tab, setTab] = useState<'adjust' | 'filters' | 'effects'>('adjust');
  const el = useEditorValue((e) => e.getSelectedElements()[0]);
  const cell = useEditorValue((e) => e.session.state.cropping?.cell);
  const fill = editableFill(el, cell);
  if (!el || !fill) return <EmptyState>Select a photo to edit it.</EmptyState>;

  const put = (next: ImageFill) => editor.store.put([withFill(el, next, cell)]);
  const adj = fill.adjustments ?? {};
  const interaction = {
    onStart: () => editor.history.startInteraction(),
    onEnd: () => editor.history.endInteraction(),
  };
  const shadow = el.type === 'image' ? el.shadow : null;
  const setShadow = (patch: Partial<DropShadow> | null) => {
    if (el.type !== 'image') return;
    const base: DropShadow = shadow ?? {
      color: '#000000',
      opacity: 0.35,
      blur: 20,
      distance: 10,
      angle: 45,
    };
    editor.store.put([{ ...el, shadow: patch === null ? null : { ...base, ...patch } }]);
  };

  return (
    <>
      <div className="dp-panel-pad">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { id: 'adjust', label: 'Adjust' },
            { id: 'filters', label: 'Filters' },
            ...(el.type === 'image' ? [{ id: 'effects' as const, label: 'Effects' }] : []),
          ]}
        />
      </div>
      <div className="dp-panel-scroll dp-scrollable">
        {tab === 'adjust' && (
          <>
            {GROUPS.map((g) => (
              <Section key={g.title} title={g.title}>
                {g.items.map((it) => (
                  <Slider
                    key={it.key}
                    label={it.label}
                    min={it.min}
                    max={100}
                    value={adj[it.key] ?? 0}
                    {...interaction}
                    onChange={(v) => put({ ...fill, adjustments: { ...adj, [it.key]: v } })}
                  />
                ))}
              </Section>
            ))}
            <div className="dp-panel-pad">
              <Button block onClick={() => put({ ...fill, adjustments: {} })}>
                <RotateCcw size={16} /> Reset adjustments
              </Button>
            </div>
          </>
        )}
        {tab === 'filters' && (
          <>
            <div className="dp-filter-grid">
              <button
                type="button"
                className={`dp-filter-tile${!fill.filter ? ' is-active' : ''}`}
                onClick={() => put({ ...fill, filter: null })}
              >
                <FilterThumb fill={fill} filter={null} />
                <span>None</span>
              </button>
              {FILTER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`dp-filter-tile${fill.filter?.name === p.id ? ' is-active' : ''}`}
                  onClick={() =>
                    put({
                      ...fill,
                      filter: { name: p.id, intensity: fill.filter?.intensity ?? 100 },
                    })
                  }
                >
                  <FilterThumb fill={fill} filter={{ name: p.id, intensity: 100 }} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            {fill.filter && (
              <div className="dp-panel-pad">
                <Slider
                  label="Intensity"
                  min={0}
                  max={100}
                  value={fill.filter.intensity}
                  {...interaction}
                  onChange={(v) => put({ ...fill, filter: { ...fill.filter!, intensity: v } })}
                />
              </div>
            )}
          </>
        )}
        {tab === 'effects' && el.type === 'image' && (
          <Section title="Shadow">
            <Toggle
              label="Drop shadow"
              checked={!!shadow}
              onChange={(on) => setShadow(on ? {} : null)}
            />
            {shadow && (
              <>
                <Slider
                  label="Blur"
                  min={0}
                  max={100}
                  value={shadow.blur}
                  {...interaction}
                  onChange={(blur) => setShadow({ blur })}
                />
                <Slider
                  label="Distance"
                  min={0}
                  max={100}
                  value={shadow.distance}
                  {...interaction}
                  onChange={(distance) => setShadow({ distance })}
                />
                <Slider
                  label="Angle"
                  min={-180}
                  max={180}
                  value={shadow.angle}
                  {...interaction}
                  onChange={(angle) => setShadow({ angle })}
                />
                <Slider
                  label="Transparency"
                  min={0}
                  max={100}
                  value={Math.round((1 - shadow.opacity) * 100)}
                  {...interaction}
                  onChange={(v) => setShadow({ opacity: 1 - v / 100 })}
                />
              </>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
