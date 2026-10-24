import { Eraser, Highlighter, Pencil, PenTool } from 'lucide-react';
import type { ReactNode } from 'react';
import { Section, Slider, Swatch } from '../components/ui';
import { useDesignPad, useUI } from '../context';
import { DEFAULT_PALETTE } from '../library/colors';
import { PanelHeader } from '../shell/SidePanel';
import type { DrawSettings } from '../state/ui';

const TOOLS: {
  id: DrawSettings['tool'];
  label: string;
  icon: ReactNode;
  size: number;
  opacity: number;
}[] = [
  { id: 'pen', label: 'Pen', icon: <PenTool size={22} />, size: 6, opacity: 1 },
  { id: 'marker', label: 'Marker', icon: <Pencil size={22} />, size: 16, opacity: 1 },
  {
    id: 'highlighter',
    label: 'Highlighter',
    icon: <Highlighter size={22} />,
    size: 28,
    opacity: 0.4,
  },
  { id: 'eraser', label: 'Eraser', icon: <Eraser size={22} />, size: 24, opacity: 1 },
];

export function DrawPanel() {
  const { ui } = useDesignPad();
  const draw = useUI((s) => s.drawing) ?? { tool: 'pen', color: '#5e17eb', size: 6, opacity: 1 };
  const set = (patch: Partial<DrawSettings>) => ui.set({ drawing: { ...draw, ...patch } });

  return (
    <div className="dp-panel">
      <PanelHeader title="Draw" />
      <div className="dp-panel-scroll dp-scrollable">
        <div className="dp-draw-tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dp-draw-tool${draw.tool === t.id ? ' is-active' : ''}`}
              onClick={() => set({ tool: t.id, size: t.size, opacity: t.opacity })}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {draw.tool !== 'eraser' && (
          <Section title="Colour">
            <div className="dp-swatch-grid">
              {DEFAULT_PALETTE.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={c === draw.color}
                  onClick={() => set({ color: c })}
                />
              ))}
            </div>
          </Section>
        )}
        <Section title="Settings">
          <Slider
            label="Size"
            value={draw.size}
            min={1}
            max={100}
            onChange={(size) => set({ size })}
          />
          {draw.tool !== 'eraser' && (
            <Slider
              label="Transparency"
              value={Math.round((1 - draw.opacity) * 100)}
              min={0}
              max={100}
              onChange={(v) => set({ opacity: 1 - v / 100 })}
            />
          )}
        </Section>
        <p className="dp-hint dp-panel-pad">
          Draw on any page. Press Esc or close this panel to stop drawing.
        </p>
      </div>
    </div>
  );
}
