import type { Id } from '../model/types';

export interface CropTarget {
  id: Id;
  /** Grid cell index when cropping a grid cell. */
  cell?: number;
}

/** Ephemeral editor state: not persisted and not part of undo history. */
export interface SessionState {
  selectedIds: Id[];
  /** Text element whose text is being edited in place. */
  editingId: Id | null;
  cropping: CropTarget | null;
  hoveredId: Id | null;
  currentPageId: Id | null;
  /** Group whose children can be selected individually. */
  focusedGroupId: Id | null;
}

export const INITIAL_SESSION: SessionState = {
  selectedIds: [],
  editingId: null,
  cropping: null,
  hoveredId: null,
  currentPageId: null,
  focusedGroupId: null,
};

export class Session {
  private _state: SessionState = { ...INITIAL_SESSION };
  private listeners = new Set<(state: SessionState, prev: SessionState) => void>();
  private _version = 0;

  get state(): SessionState {
    return this._state;
  }

  get version(): number {
    return this._version;
  }

  update(patch: Partial<SessionState>): void {
    const prev = this._state;
    let changed = false;
    for (const key in patch) {
      const k = key as keyof SessionState;
      if (!Object.is(prev[k], patch[k])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this._state = { ...prev, ...patch };
    this._version++;
    for (const l of [...this.listeners]) l(this._state, prev);
  }

  listen(listener: (state: SessionState, prev: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
