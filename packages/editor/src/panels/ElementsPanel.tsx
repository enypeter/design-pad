import {
  createFrame,
  createGrid,
  createLine,
  createShape,
  createSvg,
  type DesignElement,
  type ElementType,
  SHAPES,
  svgToDataUrl,
} from '@design-pad/core';
import { type ReactNode, useMemo, useState } from 'react';
import { insertElement, registerAsset } from '../actions';
import { setDragItem } from '../canvas/dnd';
import { EmptyState, SearchInput, Section } from '../components/ui';
import { useDesignPad } from '../context';
import { FRAME_SHAPES, GRID_PRESETS, LINE_PRESETS, type LinePreset } from '../library/elements';
import { GRAPHICS, type GraphicDef } from '../library/graphics';
import { shapeSvgPath } from '../library/shapePreview';
import { PanelHeader } from '../shell/SidePanel';

type Init = Partial<DesignElement> & { type: ElementType };

interface Item {
  key: string;
  name: string;
  tags: string;
  preview: ReactNode;
  make(): Init;
}

function LinePreview({ p }: { p: LinePreset }) {
  const dash = p.dash === 'dashed' ? '6 4' : p.dash === 'dotted' ? '0.1 5' : undefined;
  const capPath = (cap: string, x: number, dir: number) => {
    if (cap === 'arrow')
      return (
        <path
          d={`M${x - dir * 8} 12L${x} 20L${x - dir * 8} 28`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      );
    if (cap === 'triangle')
      return <path d={`M${x} 20L${x - dir * 10} 13V27Z`} fill="currentColor" />;
    if (cap === 'circle') return <circle cx={x - dir * 4} cy={20} r={4.5} fill="currentColor" />;
    if (cap === 'bar') return <path d={`M${x} 13V27`} stroke="currentColor" strokeWidth="2.5" />;
    return null;
  };
  return (
    <svg viewBox="0 0 80 40" className="dp-line-preview" aria-hidden="true">
      <line
        x1={8}
        y1={20}
        x2={72}
        y2={20}
        stroke="currentColor"
        strokeWidth={3}
        strokeDasharray={dash}
        strokeLinecap={p.dash === 'dotted' ? 'round' : 'butt'}
      />
      {capPath(p.startCap, 8, -1)}
      {capPath(p.endCap, 72, 1)}
    </svg>
  );
}

function ShapePreview({ id, aspect, frame }: { id: string; aspect: number; frame?: boolean }) {
  const w = aspect >= 1 ? 64 : 64 * aspect;
  const h = aspect >= 1 ? 64 / aspect : 64;
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} className="dp-shape-preview" aria-hidden="true">
      <path
        d={shapeSvgPath(id, w, h, id === 'rect' && !frame ? 0 : 6)}
        fill={frame ? '#d7d9e0' : 'currentColor'}
        fillRule={id === 'ring' ? 'evenodd' : undefined}
      />
      {frame && (
        <path
          d={`M${w / 2 - 10} ${h / 2 + 7}L${w / 2 - 3} ${h / 2 - 2}L${w / 2 + 2} ${h / 2 + 3}L${w / 2 + 6} ${h / 2}L${w / 2 + 11} ${h / 2 + 7}Z`}
          fill="#a9adbb"
        />
      )}
    </svg>
  );
}

function GridPreview({
  layout,
  aspect,
}: {
  layout: { x: number; y: number; width: number; height: number }[];
  aspect: number;
}) {
  const w = aspect >= 1 ? 64 : 64 * aspect;
  const h = aspect >= 1 ? 64 / aspect : 64;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dp-shape-preview" aria-hidden="true">
      {layout.map((c) => (
        <rect
          key={`${c.x}:${c.y}:${c.width}:${c.height}`}
          x={c.x * w + 1}
          y={c.y * h + 1}
          width={c.width * w - 2}
          height={c.height * h - 2}
          rx={1.5}
          fill="#d7d9e0"
        />
      ))}
    </svg>
  );
}

function GraphicPreview({ g }: { g: GraphicDef }) {
  const src = useMemo(() => svgToDataUrl(g.svg), [g]);
  return <img src={src} alt="" className="dp-graphic-preview" draggable={false} />;
}

export function ElementsPanel() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const doc = editor.getDocument();
  const base = Math.min(doc.width, doc.height);

  const sections = useMemo(() => {
    const lines: Item[] = LINE_PRESETS.map((p) => ({
      key: `line-${p.id}`,
      name: p.name,
      tags: 'line arrow connector',
      preview: <LinePreview p={p} />,
      make: () =>
        createLine({
          width: base * 0.4,
          height: Math.max(2, base * 0.005),
          stroke: { color: '#000000', width: Math.max(2, base * 0.005), dash: p.dash },
          startCap: p.startCap,
          endCap: p.endCap,
        }),
    }));
    const shapes: Item[] = SHAPES.map((s) => ({
      key: `shape-${s.id}`,
      name: s.name,
      tags: `${s.category} ${(s.tags ?? []).join(' ')}`,
      preview: <ShapePreview id={s.id} aspect={s.aspect} />,
      make: () => {
        const size = base * 0.3;
        return createShape({
          shape: s.id,
          width: s.aspect >= 1 ? size : size * s.aspect,
          height: s.aspect >= 1 ? size / s.aspect : size,
          fill: { type: 'solid', color: '#c1c4cf' },
        });
      },
    }));
    const graphics: Item[] = GRAPHICS.map((g) => ({
      key: `graphic-${g.id}`,
      name: g.name,
      tags: g.tags.join(' '),
      preview: <GraphicPreview g={g} />,
      make: () => {
        const asset = registerAsset(ctx, {
          src: svgToDataUrl(g.svg),
          mime: 'image/svg+xml',
          width: 100,
          height: 100,
          name: g.name,
        });
        const size = base * 0.25;
        const ratio = asset.width / asset.height || 1;
        return createSvg({
          assetId: asset.id,
          width: ratio >= 1 ? size : size * ratio,
          height: ratio >= 1 ? size / ratio : size,
          name: g.name,
        });
      },
    }));
    const frames: Item[] = FRAME_SHAPES.map((id) => {
      const def = SHAPES.find((s) => s.id === id)!;
      return {
        key: `frame-${id}`,
        name: `${def.name} frame`,
        tags: 'frame photo mask placeholder',
        preview: <ShapePreview id={id} aspect={def.aspect} frame />,
        make: () => {
          const size = base * 0.45;
          return createFrame({
            shape: id,
            width: def.aspect >= 1 ? size : size * def.aspect,
            height: def.aspect >= 1 ? size / def.aspect : size,
          });
        },
      };
    });
    const grids: Item[] = GRID_PRESETS.map((g) => ({
      key: `grid-${g.id}`,
      name: g.name,
      tags: 'grid collage photo layout',
      preview: <GridPreview layout={g.layout} aspect={g.aspect} />,
      make: () =>
        createGrid({
          layout: g.layout,
          width: doc.width,
          height: doc.height,
          gap: Math.round(base * 0.01),
        }),
    }));
    return [
      // Collapsed view shows a few lines then shapes, like Canva's mixed row.
      {
        id: 'lines',
        title: 'Lines & shapes',
        items: [...lines.slice(0, 4), ...shapes, ...lines.slice(4)],
      },
      { id: 'graphics', title: 'Graphics', items: graphics },
      { id: 'frames', title: 'Frames', items: frames },
      { id: 'grids', title: 'Grids', items: grids },
    ];
  }, [base, doc.width, doc.height, ctx]);

  const q = query.trim().toLowerCase();
  const filtered = sections
    .filter((s) => !expanded || s.id === expanded)
    .map((s) => ({
      ...s,
      items: q ? s.items.filter((i) => `${i.name} ${i.tags}`.toLowerCase().includes(q)) : s.items,
    }))
    .filter((s) => s.items.length);

  const insert = (item: Item) => {
    const init = item.make();
    if (init.type === 'grid') {
      editor.createElements([{ ...init, x: 0, y: 0 }], { pageId: editor.getCurrentPageId() });
      return;
    }
    insertElement(ctx, init);
  };

  return (
    <div className="dp-panel">
      <PanelHeader
        title={
          expanded ? (sections.find((s) => s.id === expanded)?.title ?? 'Elements') : 'Elements'
        }
        onBack={expanded ? () => setExpanded(null) : undefined}
      />
      <div className="dp-panel-pad">
        <SearchInput value={query} onChange={setQuery} placeholder="Search elements" />
      </div>
      <div className="dp-panel-scroll dp-scrollable">
        {!filtered.length && <EmptyState>No elements match “{query}”.</EmptyState>}
        {filtered.map((s) => {
          const limit = expanded || q ? s.items.length : s.id === 'lines' ? 12 : 9;
          return (
            <Section
              key={s.id}
              title={s.title}
              action={
                !expanded && !q && s.items.length > limit ? (
                  <button type="button" className="dp-link" onClick={() => setExpanded(s.id)}>
                    See all
                  </button>
                ) : null
              }
            >
              <div className={`dp-element-grid is-${s.id}`}>
                {s.items.slice(0, limit).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="dp-element-item"
                    title={item.name}
                    aria-label={item.name}
                    draggable
                    onDragStart={(e) => setDragItem(e, { kind: 'element', init: item.make() })}
                    onClick={() => insert(item)}
                  >
                    {item.preview}
                  </button>
                ))}
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
