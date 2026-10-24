import {
  BadgeCheck,
  CloudUpload,
  Image,
  LayoutTemplate,
  PenTool,
  Shapes,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { LeftPanelId } from '../config';
import { useDesignPad, useUI } from '../context';

const RAIL: Record<LeftPanelId, { label: string; icon: ReactNode }> = {
  design: { label: 'Design', icon: <LayoutTemplate size={22} /> },
  elements: { label: 'Elements', icon: <Shapes size={22} /> },
  text: { label: 'Text', icon: <Type size={22} /> },
  brand: { label: 'Brand', icon: <BadgeCheck size={22} /> },
  uploads: { label: 'Uploads', icon: <CloudUpload size={22} /> },
  photos: { label: 'Photos', icon: <Image size={22} /> },
  draw: { label: 'Draw', icon: <PenTool size={22} /> },
};

export function SideRail() {
  const { ui, features } = useDesignPad();
  const { leftPanel, contextPanel } = useUI((s) => ({
    leftPanel: s.leftPanel,
    contextPanel: s.contextPanel,
  }));
  return (
    <nav className="dp-rail" aria-label="Editor panels">
      {features.panels.map((id) => {
        const item = RAIL[id];
        const active = leftPanel === id && !contextPanel;
        return (
          <button
            key={id}
            type="button"
            className={`dp-rail-item${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => {
              const open = active ? null : id;
              ui.set({
                leftPanel: open,
                contextPanel: null,
                drawing:
                  open === 'draw'
                    ? (ui.get().drawing ?? { tool: 'pen', color: '#5e17eb', size: 8, opacity: 1 })
                    : null,
              });
            }}
          >
            <span className="dp-rail-icon">{item.icon}</span>
            <span className="dp-rail-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
