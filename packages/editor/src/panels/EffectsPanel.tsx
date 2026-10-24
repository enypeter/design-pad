import type { TextEffect, TextEffectType, TextElement } from '@design-pad/core';
import type { CSSProperties, ReactNode } from 'react';
import { EmptyState, Section, Slider, Swatch } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';

type EffectId = TextEffectType | 'none';

/** Defaults roughly matching Canva's starting values. */
export const EFFECT_DEFAULTS: Record<TextEffectType, TextEffect> = {
  shadow: {
    type: 'shadow',
    offset: 50,
    direction: -45,
    blur: 0,
    transparency: 60,
    color: '#000000',
  },
  lift: { type: 'lift', intensity: 50 },
  hollow: { type: 'hollow', thickness: 50 },
  splice: { type: 'splice', thickness: 50, offset: 50, direction: -45, color: '#ffde59' },
  outline: { type: 'outline', thickness: 50, color: '#000000' },
  echo: { type: 'echo', offset: 50, direction: -45, color: '#ff5757' },
  glitch: { type: 'glitch', offset: 30, direction: 0, colorA: '#00e5ff', colorB: '#ff2a6d' },
  neon: { type: 'neon', intensity: 50 },
  background: { type: 'background', roundness: 50, spread: 50, transparency: 0, color: '#ffde59' },
};

const PREVIEW: Record<EffectId, CSSProperties> = {
  none: {},
  shadow: { textShadow: '3px 3px 0 rgba(0,0,0,0.4)' },
  lift: { textShadow: '0 4px 8px rgba(0,0,0,0.35)' },
  hollow: { WebkitTextStroke: '1.5px #1f1f1f', color: 'transparent' },
  splice: {
    WebkitTextStroke: '1.5px #1f1f1f',
    color: 'transparent',
    textShadow: '3px 3px 0 #ffde59',
  },
  outline: { WebkitTextStroke: '3px #1f1f1f', color: '#ffffff', paintOrder: 'stroke fill' },
  echo: { textShadow: '3px 3px 0 rgba(255,87,87,0.5), 6px 6px 0 rgba(255,87,87,0.25)' },
  glitch: { textShadow: '-2px 0 #00e5ff, 2px 0 #ff2a6d' },
  neon: { color: '#ffd6f5', textShadow: '0 0 4px #ff3cac, 0 0 10px #ff3cac' },
  background: { background: '#ffde59', borderRadius: 6, padding: '0 4px' },
};

const LABELS: Record<EffectId, string> = {
  none: 'None',
  shadow: 'Shadow',
  lift: 'Lift',
  hollow: 'Hollow',
  splice: 'Splice',
  outline: 'Outline',
  echo: 'Echo',
  glitch: 'Glitch',
  neon: 'Neon',
  background: 'Background',
};

const ORDER: EffectId[] = [
  'none',
  'shadow',
  'lift',
  'hollow',
  'splice',
  'outline',
  'echo',
  'glitch',
  'neon',
  'background',
];

const PALETTE = [
  '#000000',
  '#ffffff',
  '#ff5757',
  '#ffde59',
  '#00e5ff',
  '#ff2a6d',
  '#8c52ff',
  '#00bf63',
];

export function EffectsPanel() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const texts = useEditorValue((e) =>
    e.getSelectedElements().filter((x): x is TextElement => x.type === 'text'),
  );
  if (!texts.length) return <EmptyState>Select text to add effects.</EmptyState>;
  const first = texts[0]!;
  const ids = texts.map((t) => t.id);
  const effect = first.effect;
  const active: EffectId = effect?.type ?? 'none';

  const update = (patch: Partial<TextEffect>) => {
    if (!effect) return;
    editor.setTextEffect(ids, { ...effect, ...patch } as TextEffect);
  };
  const slider = (key: string, label: string, min = 0, max = 100) => (
    <Slider
      key={key}
      label={label}
      min={min}
      max={max}
      value={(effect as unknown as Record<string, number>)[key] ?? 0}
      onStart={() => editor.history.startInteraction()}
      onEnd={() => editor.history.endInteraction()}
      onChange={(v) => update({ [key]: v } as Partial<TextEffect>)}
    />
  );
  const colorRow = (key: string, label: string) => (
    <div key={key} className="dp-effect-color">
      <span>{label}</span>
      <div className="dp-swatch-row">
        {PALETTE.map((c) => (
          <Swatch
            key={c}
            color={c}
            size={24}
            selected={(effect as unknown as Record<string, string>)[key] === c}
            onClick={() => update({ [key]: c } as Partial<TextEffect>)}
          />
        ))}
        <input
          type="color"
          aria-label={`${label} custom`}
          value={((effect as unknown as Record<string, string>)[key] ?? '#000000').slice(0, 7)}
          onChange={(e) => update({ [key]: e.target.value } as Partial<TextEffect>)}
        />
      </div>
    </div>
  );

  // Built on demand: the sliders read the active effect's fields.
  const controls: Record<TextEffectType, () => ReactNode[]> = {
    shadow: () => [
      slider('offset', 'Offset'),
      slider('direction', 'Direction', -180, 180),
      slider('blur', 'Blur'),
      slider('transparency', 'Transparency'),
      colorRow('color', 'Colour'),
    ],
    lift: () => [slider('intensity', 'Intensity')],
    hollow: () => [slider('thickness', 'Thickness')],
    splice: () => [
      slider('thickness', 'Thickness'),
      slider('offset', 'Offset'),
      slider('direction', 'Direction', -180, 180),
      colorRow('color', 'Colour'),
    ],
    outline: () => [slider('thickness', 'Thickness'), colorRow('color', 'Colour')],
    echo: () => [
      slider('offset', 'Offset'),
      slider('direction', 'Direction', -180, 180),
      colorRow('color', 'Colour'),
    ],
    glitch: () => [
      slider('offset', 'Offset'),
      slider('direction', 'Direction', -180, 180),
      colorRow('colorA', 'Colour 1'),
      colorRow('colorB', 'Colour 2'),
    ],
    neon: () => [slider('intensity', 'Intensity')],
    background: () => [
      slider('roundness', 'Roundness'),
      slider('spread', 'Spread'),
      slider('transparency', 'Transparency'),
      colorRow('color', 'Colour'),
    ],
  };

  return (
    <div className="dp-panel-scroll dp-scrollable">
      <Section title="Style">
        <div className="dp-effect-grid">
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`dp-effect-tile${active === id ? ' is-active' : ''}`}
              onClick={() =>
                editor.setTextEffect(
                  ids,
                  id === 'none' ? null : structuredClone(EFFECT_DEFAULTS[id]),
                )
              }
            >
              <span className="dp-effect-sample" style={PREVIEW[id]}>
                Ag
              </span>
              <span className="dp-effect-label">{LABELS[id]}</span>
            </button>
          ))}
        </div>
        {effect && <div className="dp-effect-controls">{controls[effect.type]()}</div>}
      </Section>
      <Section title="Shape">
        <div className="dp-effect-grid is-two">
          <button
            type="button"
            className={`dp-effect-tile${!first.curve ? ' is-active' : ''}`}
            onClick={() => editor.setTextCurve(ids, 0)}
          >
            <span className="dp-effect-sample">abcd</span>
            <span className="dp-effect-label">None</span>
          </button>
          <button
            type="button"
            className={`dp-effect-tile${first.curve ? ' is-active' : ''}`}
            onClick={() => !first.curve && editor.setTextCurve(ids, 50)}
          >
            <svg viewBox="0 0 60 30" className="dp-effect-sample" aria-hidden="true">
              <path id="dp-curve-demo" d="M6 26 Q30 2 54 26" fill="none" />
              <text fontSize="11" fontWeight="600">
                <textPath href="#dp-curve-demo" startOffset="50%" textAnchor="middle">
                  abcd
                </textPath>
              </text>
            </svg>
            <span className="dp-effect-label">Curve</span>
          </button>
        </div>
        {first.curve !== 0 && (
          <div className="dp-effect-controls">
            <Slider
              label="Curve"
              min={-100}
              max={100}
              value={first.curve}
              onStart={() => editor.history.startInteraction()}
              onEnd={() => editor.history.endInteraction()}
              onChange={(v) => editor.setTextCurve(ids, v === 0 ? 1 : v)}
            />
          </div>
        )}
      </Section>
    </div>
  );
}
