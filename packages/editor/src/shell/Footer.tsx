import { ChevronDown, Keyboard, LayoutGrid, Maximize, Minimize, PanelBottom } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_ZOOM, MIN_ZOOM } from '../canvas/camera';
import { IconButton, Popover } from '../components/ui';
import { useCamera, useDesignPad, useEditorValue, useUI } from '../context';
import { PageStrip } from './PageStrip';

const PRESETS = [3, 2, 1.5, 1.25, 1, 0.75, 0.5, 0.25, 0.1];

/** Logarithmic mapping so the slider feels even across 10%–500%. */
const toSlider = (z: number) => Math.log(z / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM);
const fromSlider = (t: number) => MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** t;

export function Footer() {
  const ctx = useDesignPad();
  const { ui, features } = ctx;
  const zoom = useCamera((c) => c.zoom);
  const pages = useEditorValue((e) => ({
    count: e.getPages().length,
    index: e.getPages().findIndex((p) => p.id === e.getCurrentPageId()),
  }));
  const strip = useUI((s) => s.pagesStrip);
  const [open, setOpen] = useState(false);
  const zoomBtn = useRef<HTMLButtonElement>(null);
  const [full, setFull] = useState(false);

  return (
    <>
      {strip && features.multiPage && <PageStrip />}
      <footer className="dp-footer">
        <div className="dp-footer-left">
          {features.multiPage && (
            <button
              type="button"
              className={`dp-footer-btn${strip ? ' is-active' : ''}`}
              onClick={() => ui.set({ pagesStrip: !strip })}
            >
              <PanelBottom size={17} /> Pages
            </button>
          )}
          <span className="dp-footer-pages">
            Page {pages.index + 1} / {pages.count}
          </span>
        </div>
        <div className="dp-footer-right">
          <input
            type="range"
            className="dp-zoom-slider dp-range"
            aria-label="Zoom"
            min={0}
            max={1}
            step={0.001}
            value={toSlider(zoom)}
            style={{ '--dp-pct': `${toSlider(zoom) * 100}%` } as React.CSSProperties}
            onChange={(e) => ctx.viewport.current?.zoomTo(fromSlider(Number(e.target.value)))}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            ref={zoomBtn}
            type="button"
            className="dp-footer-btn dp-zoom-value"
            onClick={() => setOpen((o) => !o)}
          >
            {Math.round(zoom * 100)}% <ChevronDown size={14} />
          </button>
          <Popover
            anchor={zoomBtn}
            open={open}
            onClose={() => setOpen(false)}
            placement="top-start"
          >
            <div className="dp-menu-list">
              <button
                type="button"
                className="dp-menu-item"
                onClick={() => {
                  ctx.viewport.current?.zoomToFit();
                  setOpen(false);
                }}
              >
                <span className="dp-menu-label">Fit</span>
                <span className="dp-menu-shortcut">Ctrl+0</span>
              </button>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`dp-menu-item${Math.abs(p - zoom) < 0.005 ? ' is-active' : ''}`}
                  onClick={() => {
                    ctx.viewport.current?.zoomTo(p);
                    setOpen(false);
                  }}
                >
                  <span className="dp-menu-label">{Math.round(p * 100)}%</span>
                </button>
              ))}
            </div>
          </Popover>
          <IconButton label="Fit page" size="sm" onClick={() => ctx.viewport.current?.zoomToFit()}>
            <LayoutGrid size={16} />
          </IconButton>
          <IconButton
            label="Keyboard shortcuts"
            size="sm"
            onClick={() => ui.set({ dialog: 'shortcuts' })}
          >
            <Keyboard size={16} />
          </IconButton>
          <IconButton
            label={full ? 'Exit full screen' : 'Full screen'}
            size="sm"
            onClick={() => {
              const root = ctx.root.current;
              if (!document.fullscreenElement && root) {
                void root.requestFullscreen?.().then(() => setFull(true));
              } else {
                void document.exitFullscreen?.().then(() => setFull(false));
              }
            }}
          >
            {full ? <Minimize size={16} /> : <Maximize size={16} />}
          </IconButton>
        </div>
      </footer>
    </>
  );
}
