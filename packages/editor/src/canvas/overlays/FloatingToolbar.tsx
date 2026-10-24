import { boundsOfPoints } from '@design-pad/core';
import { Copy, Ellipsis, Lock, LockOpen, Trash2 } from 'lucide-react';
import { deleteSelection, duplicateSelection, toggleLock } from '../../actions';
import { useCamera, useDesignPad, useEditorValue, useUI } from '../../context';
import { elementScreenCorners } from '../interactions';

/** Mini toolbar above the selection (duplicate, delete, lock, more). */
export function FloatingToolbar() {
  const ctx = useDesignPad();
  const { ui } = ctx;
  const cam = useCamera((c) => c);
  const state = useEditorValue((e) => ({
    ids: e.getSelectedIds(),
    locked: e.getSelectedElements().every((el) => el.locked),
    editing: e.session.state.editingId,
    cropping: e.session.state.cropping,
    version: e.store.version,
  }));
  const hidden = useUI(
    (s) => s.pointerDown || s.interacting !== null || s.drawing !== null || s.contextMenu !== null,
  );
  if (!state.ids.length || state.editing || state.cropping || hidden) return null;

  const pts = state.ids.flatMap((id) => elementScreenCorners(ctx, id));
  if (!pts.length) return null;
  const b = boundsOfPoints(pts);
  if (b.y + b.height < 0 || b.y > cam.viewportH) return null;
  const width = 152;
  const x = Math.min(Math.max(8, b.x + b.width / 2 - width / 2), cam.viewportW - width - 8);
  const y = b.y - 56 < 8 ? b.y + b.height + 52 : b.y - 52;

  return (
    <div
      className="dp-floating-toolbar"
      data-chrome
      role="toolbar"
      aria-label="Selection actions"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      {!state.locked && (
        <button
          type="button"
          className="dp-icon-btn"
          title="Duplicate (Ctrl+D)"
          onClick={() => duplicateSelection(ctx)}
        >
          <Copy size={17} />
        </button>
      )}
      {!state.locked && (
        <button
          type="button"
          className="dp-icon-btn"
          title="Delete (Del)"
          onClick={() => deleteSelection(ctx)}
        >
          <Trash2 size={17} />
        </button>
      )}
      <button
        type="button"
        className={`dp-icon-btn${state.locked ? ' is-active' : ''}`}
        title={state.locked ? 'Unlock' : 'Lock'}
        onClick={() => toggleLock(ctx)}
      >
        {state.locked ? <Lock size={17} /> : <LockOpen size={17} />}
      </button>
      <button
        type="button"
        className="dp-icon-btn"
        title="More"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          ui.set({ contextMenu: { x: r.left, y: r.bottom + 6 } });
        }}
      >
        <Ellipsis size={17} />
      </button>
    </div>
  );
}
