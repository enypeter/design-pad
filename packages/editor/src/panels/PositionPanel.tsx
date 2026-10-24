import { type DesignElement, normalizeAngle } from '@design-pad/core';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Circle,
  Eye,
  Frame,
  Grid2x2,
  Group,
  Image,
  Lock,
  LockOpen,
  Minus,
  PenTool,
  Shapes,
  Sparkles,
  Type,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button, EmptyState, Section, Tabs } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';

function NumberField({
  label,
  value,
  onCommit,
  suffix,
}: {
  label: string;
  value: number;
  onCommit(v: number): void;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="dp-num-field">
      <span>{label}</span>
      <input
        className="dp-input"
        inputMode="decimal"
        value={draft ?? `${Math.round(value * 10) / 10}${suffix ?? ''}`}
        onFocus={() => setDraft(String(Math.round(value * 10) / 10))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = Number.parseFloat(draft ?? '');
          if (!Number.isNaN(v)) onCommit(v);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

const TYPE_ICON: Record<DesignElement['type'], ReactNode> = {
  text: <Type size={16} />,
  shape: <Shapes size={16} />,
  line: <Minus size={16} />,
  image: <Image size={16} />,
  frame: <Frame size={16} />,
  grid: <Grid2x2 size={16} />,
  svg: <Sparkles size={16} />,
  path: <PenTool size={16} />,
  group: <Group size={16} />,
};

function layerLabel(el: DesignElement): string {
  if (el.name) return el.name;
  if (el.type === 'text')
    return (
      el.spans
        .map((s) => s.text)
        .join('')
        .slice(0, 40) || 'Text'
    );
  if (el.type === 'shape') return 'Shape';
  return el.type[0]!.toUpperCase() + el.type.slice(1);
}

function Layers() {
  const { editor } = useDesignPad();
  const pageId = useEditorValue((e) => e.getCurrentPageId());
  const layers = useEditorValue((e) => [...e.getChildren(pageId)].reverse());
  const selected = useEditorValue((e) => e.getSelectedIds());
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  if (!layers.length) return <EmptyState>This page has no elements yet.</EmptyState>;
  return (
    <ul className="dp-layers" aria-label="Layers">
      {layers.map((el, i) => (
        <li
          key={el.id}
          className={`dp-layer${selected.includes(el.id) ? ' is-selected' : ''}${over === i ? ' is-over' : ''}`}
          draggable
          onDragStart={(e) => {
            setDrag(el.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', el.id);
          }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            setOver(i);
          }}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag) editor.moveElementToIndex(drag, layers.length - 1 - i);
            setDrag(null);
            setOver(null);
          }}
        >
          <button
            type="button"
            className="dp-layer-main"
            onClick={(e) => editor.select(e.shiftKey ? [...selected, el.id] : [el.id])}
          >
            <span className="dp-layer-icon">{TYPE_ICON[el.type]}</span>
            <span className="dp-layer-name">{layerLabel(el)}</span>
          </button>
          <button
            type="button"
            className="dp-icon-btn sm"
            aria-label={el.locked ? 'Unlock' : 'Lock'}
            title={el.locked ? 'Unlock' : 'Lock'}
            onClick={() => editor.setLocked([el.id], !el.locked)}
          >
            {el.locked ? <Lock size={14} /> : <LockOpen size={14} />}
          </button>
          <span className="dp-layer-vis" aria-hidden="true">
            {el.opacity < 1 ? <Circle size={12} /> : <Eye size={12} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PositionPanel() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const [tab, setTab] = useState<'arrange' | 'layers'>('arrange');
  const sel = useEditorValue((e) => e.getSelectedElements());
  const ids = sel.map((s) => s.id);
  const one = sel.length === 1 ? sel[0]! : null;
  const locked = sel.some((s) => s.locked);
  const multi = sel.length > 1;

  const align = (a: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') =>
    editor.alignElements(ids, a);

  return (
    <>
      <div className="dp-panel-pad">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { id: 'arrange', label: 'Arrange' },
            { id: 'layers', label: 'Layers' },
          ]}
        />
      </div>
      <div className="dp-panel-scroll dp-scrollable">
        {tab === 'layers' ? (
          <Layers />
        ) : !sel.length ? (
          <EmptyState>Select an element to arrange it.</EmptyState>
        ) : (
          <>
            <div className="dp-arrange-grid dp-panel-pad">
              <Button onClick={() => editor.reorderElements(ids, 'forward')}>
                <ArrowUp size={16} /> Forward
              </Button>
              <Button onClick={() => editor.reorderElements(ids, 'backward')}>
                <ArrowDown size={16} /> Backward
              </Button>
              <Button onClick={() => editor.reorderElements(ids, 'front')}>
                <ArrowUpToLine size={16} /> To front
              </Button>
              <Button onClick={() => editor.reorderElements(ids, 'back')}>
                <ArrowDownToLine size={16} /> To back
              </Button>
            </div>
            <Section title={multi ? 'Align elements' : 'Align to page'}>
              <div className="dp-arrange-grid">
                <Button disabled={locked} onClick={() => align('top')}>
                  <AlignStartHorizontal size={16} /> Top
                </Button>
                <Button disabled={locked} onClick={() => align('left')}>
                  <AlignStartVertical size={16} /> Left
                </Button>
                <Button disabled={locked} onClick={() => align('middle')}>
                  <AlignCenterHorizontal size={16} /> Middle
                </Button>
                <Button disabled={locked} onClick={() => align('center')}>
                  <AlignCenterVertical size={16} /> Centre
                </Button>
                <Button disabled={locked} onClick={() => align('bottom')}>
                  <AlignEndHorizontal size={16} /> Bottom
                </Button>
                <Button disabled={locked} onClick={() => align('right')}>
                  <AlignEndVertical size={16} /> Right
                </Button>
              </div>
            </Section>
            {sel.length > 2 && (
              <Section title="Space evenly">
                <div className="dp-arrange-grid">
                  <Button
                    disabled={locked}
                    onClick={() => editor.distributeElements(ids, 'vertical')}
                  >
                    <AlignVerticalSpaceAround size={16} /> Vertically
                  </Button>
                  <Button
                    disabled={locked}
                    onClick={() => editor.distributeElements(ids, 'horizontal')}
                  >
                    <AlignHorizontalSpaceAround size={16} /> Horizontally
                  </Button>
                </div>
              </Section>
            )}
            {one && (
              <Section title="Advanced">
                <div className="dp-advanced-grid">
                  <NumberField
                    label="Width"
                    value={one.width}
                    onCommit={(w) => {
                      if (w <= 0) return;
                      const mode = one.type === 'text' || one.type === 'group' ? 'scale' : 'resize';
                      editor.setElementBox(
                        one.id,
                        {
                          ...one,
                          width: w,
                          height: mode === 'scale' ? one.height * (w / one.width) : one.height,
                        },
                        mode,
                      );
                    }}
                  />
                  <NumberField
                    label="Height"
                    value={one.height}
                    onCommit={(h) => {
                      if (h <= 0 || one.type === 'text') return;
                      const mode = one.type === 'group' ? 'scale' : 'resize';
                      editor.setElementBox(
                        one.id,
                        {
                          ...one,
                          height: h,
                          width: mode === 'scale' ? one.width * (h / one.height) : one.width,
                        },
                        mode,
                      );
                    }}
                  />
                  <NumberField
                    label="X"
                    value={one.x}
                    onCommit={(x) => editor.updateElement(one.id, { x })}
                  />
                  <NumberField
                    label="Y"
                    value={one.y}
                    onCommit={(y) => editor.updateElement(one.id, { y })}
                  />
                  <NumberField
                    label="Rotate"
                    suffix="°"
                    value={one.rotation}
                    onCommit={(r) => editor.updateElement(one.id, { rotation: normalizeAngle(r) })}
                  />
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </>
  );
}
