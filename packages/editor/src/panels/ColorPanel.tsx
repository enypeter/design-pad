import { type Fill, fillToCss } from '@design-pad/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { documentColors, readTarget, targetSupportsGradient, writeTarget } from '../colorTargets';
import { ColorPicker } from '../components/ColorPicker';
import { Section, Swatch, Tabs } from '../components/ui';
import { useDesignPad, useEditorValue, useUI } from '../context';
import { DEFAULT_PALETTE, GRADIENT_PRESETS } from '../library/colors';

const sameFill = (a: Fill | null, b: Fill) => !!a && JSON.stringify(a) === JSON.stringify(b);

export function ColorPanel() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const target = useUI((s) => s.colorTarget) ?? { kind: 'background' as const };
  const current = useEditorValue((e) => readTarget(e, target));
  const docColors = useEditorValue((e) => documentColors(e));
  const [picker, setPicker] = useState(false);
  const [mode, setMode] = useState<'solid' | 'gradient'>(
    current && current.type !== 'solid' ? 'gradient' : 'solid',
  );
  const gradients = targetSupportsGradient(target);
  const brand = ctx.options.brand?.colors ?? [];
  const solid = !current
    ? '#000000'
    : current.type === 'solid'
      ? current.color
      : (current.stops[0]?.color ?? '#000000');

  const apply = (fill: Fill) => writeTarget(ctx, target, fill);
  const applyColor = (color: string) => apply({ type: 'solid', color });

  return (
    <div className="dp-panel-scroll dp-scrollable">
      {gradients && (
        <div className="dp-panel-pad">
          <Tabs
            value={mode}
            onChange={setMode}
            options={[
              { id: 'solid', label: 'Solid colour' },
              { id: 'gradient', label: 'Gradient' },
            ]}
          />
        </div>
      )}
      {mode === 'gradient' && gradients ? (
        <Section title="Gradients">
          <div className="dp-swatch-grid">
            {GRADIENT_PRESETS.map((g) => (
              <Swatch
                key={fillToCss(g)}
                color={fillToCss(g)}
                label="Gradient"
                selected={sameFill(current, g)}
                onClick={() => apply(g)}
              />
            ))}
          </div>
          {current && current.type !== 'solid' && (
            <div className="dp-gradient-editor">
              {current.stops.map((stop, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional and have no ids
                <div key={`${i}-${stop.offset}`} className="dp-gradient-stop">
                  <span>Stop {i + 1}</span>
                  <input
                    type="color"
                    aria-label={`Gradient stop ${i + 1}`}
                    value={stop.color.slice(0, 7)}
                    onChange={(e) => {
                      const stops = current.stops.map((s, k) =>
                        k === i ? { ...s, color: e.target.value } : s,
                      );
                      apply({ ...current, stops } as Fill);
                    }}
                  />
                </div>
              ))}
              {current.type === 'linear' && (
                <label className="dp-gradient-angle">
                  Angle
                  <input
                    type="range"
                    className="dp-range"
                    min={0}
                    max={360}
                    value={current.angle}
                    style={{ '--dp-pct': `${(current.angle / 360) * 100}%` } as React.CSSProperties}
                    onPointerDown={() => editor.history.startInteraction()}
                    onPointerUp={() => editor.history.endInteraction()}
                    onChange={(e) => apply({ ...current, angle: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          )}
        </Section>
      ) : (
        <>
          <Section title="Document colours">
            <div className="dp-swatch-grid">
              <button
                type="button"
                className={`dp-swatch dp-swatch-add${picker ? ' is-selected' : ''}`}
                aria-label="Custom colour"
                onClick={() => setPicker((p) => !p)}
              >
                <Plus size={16} />
              </button>
              {docColors.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={solid.toLowerCase() === c}
                  onClick={() => applyColor(c)}
                />
              ))}
            </div>
            {picker && (
              <ColorPicker
                value={solid}
                onChange={applyColor}
                onStart={() => editor.history.startInteraction()}
                onEnd={() => editor.history.endInteraction()}
              />
            )}
          </Section>
          {brand.length > 0 && (
            <Section title="Brand colours">
              <div className="dp-swatch-grid">
                {brand.map((c) => (
                  <Swatch
                    key={c}
                    color={c}
                    selected={solid.toLowerCase() === c.toLowerCase()}
                    onClick={() => applyColor(c)}
                  />
                ))}
              </div>
            </Section>
          )}
          <Section title="Default colours">
            <div className="dp-swatch-grid">
              {DEFAULT_PALETTE.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={solid.toLowerCase() === c}
                  onClick={() => applyColor(c)}
                />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
