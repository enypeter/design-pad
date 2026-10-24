import type { Unit } from '@design-pad/core';
import { useState } from 'react';
import { Button, Modal, SearchInput } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';
import { formatSize, fromPx, SIZE_PRESETS, type SizePreset, toPx } from '../library/sizes';

export function ResizeDialog({ onClose }: { onClose(): void }) {
  const ctx = useDesignPad();
  const doc = useEditorValue((e) => e.getDocument());
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState<Unit>(doc.unit);
  const [w, setW] = useState(String(fromPx(doc.width, doc.unit)));
  const [h, setH] = useState(String(fromPx(doc.height, doc.unit)));
  const [picked, setPicked] = useState<SizePreset | null>(null);

  const q = query.trim().toLowerCase();
  const presets = SIZE_PRESETS.filter(
    (p) => !q || `${p.name} ${p.category}`.toLowerCase().includes(q),
  );
  const width = toPx(Number.parseFloat(w) || 0, unit);
  const height = toPx(Number.parseFloat(h) || 0, unit);
  const valid = width >= 16 && height >= 16 && width <= 20000 && height <= 20000;

  return (
    <Modal title="Resize design" onClose={onClose} width={520}>
      <div className="dp-form">
        <div className="dp-size-custom">
          <label className="dp-num-field">
            <span>Width</span>
            <input
              className="dp-input"
              inputMode="decimal"
              value={w}
              onChange={(e) => {
                setW(e.target.value);
                setPicked(null);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <label className="dp-num-field">
            <span>Height</span>
            <input
              className="dp-input"
              inputMode="decimal"
              value={h}
              onChange={(e) => {
                setH(e.target.value);
                setPicked(null);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <label className="dp-num-field">
            <span>Units</span>
            <select
              className="dp-input"
              value={unit}
              onChange={(e) => {
                const next = e.target.value as Unit;
                setW(String(fromPx(toPx(Number.parseFloat(w) || 0, unit), next)));
                setH(String(fromPx(toPx(Number.parseFloat(h) || 0, unit), next)));
                setUnit(next);
              }}
            >
              <option value="px">px</option>
              <option value="in">in</option>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
            </select>
          </label>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search sizes" />
        <div className="dp-size-list dp-scrollable">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`dp-size-item${picked?.id === p.id ? ' is-active' : ''}`}
              onClick={() => {
                setPicked(p);
                setUnit(p.unit);
                setW(String(p.width));
                setH(String(p.height));
              }}
            >
              <span>{p.name}</span>
              <span className="dp-size-dim">{formatSize(p.width, p.height, p.unit)}</span>
            </button>
          ))}
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!valid}
          onClick={() => {
            ctx.editor.resizeDesign({ width, height, unit });
            ctx.viewport.current?.zoomToFit();
            onClose();
          }}
        >
          Resize to {Math.round(width)} × {Math.round(height)} px
        </Button>
        <p className="dp-hint">
          Content is scaled and repositioned to fit the new size. You can undo this.
        </p>
      </div>
    </Modal>
  );
}
