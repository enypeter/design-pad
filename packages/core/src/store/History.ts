import type { Id } from '../model/types';
import { emptyDiff, invertDiff, isEmptyDiff, type RecordsDiff, squashDiffs } from './diff';
import type { ChangeMeta, Store } from './Store';

interface HistoryEntry {
  diff: RecordsDiff;
  selectionBefore: Id[];
  selectionAfter: Id[];
}

export interface SelectionAccess {
  get(): Id[];
  set(ids: Id[]): void;
}

/**
 * Undo/redo over store diffs. Each outermost transaction becomes one entry;
 * during an interaction (drag, slider scrub) all changes squash into one.
 */
export class History {
  private undos: HistoryEntry[] = [];
  private redos: HistoryEntry[] = [];
  private pending: HistoryEntry | null = null;
  private interactionDepth = 0;
  private selectionAtTxStart: Id[] = [];
  private selectionAtInteractionStart: Id[] = [];
  private listeners = new Set<() => void>();
  private _version = 0;

  constructor(
    private store: Store,
    private selection: SelectionAccess,
    private limit = 300,
  ) {
    store.onTransactionStart(() => {
      this.selectionAtTxStart = this.selection.get();
    });
    store.listen((diff, meta) => this.onChange(diff, meta));
  }

  get version(): number {
    return this._version;
  }

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this._version++;
    for (const l of [...this.listeners]) l();
  }

  canUndo(): boolean {
    return this.undos.length > 0 || (this.pending !== null && !isEmptyDiff(this.pending.diff));
  }

  canRedo(): boolean {
    return this.redos.length > 0;
  }

  private onChange(diff: RecordsDiff, meta: ChangeMeta): void {
    if (meta.history !== 'record') return;
    if (this.interactionDepth > 0) {
      if (!this.pending) {
        this.pending = {
          diff: emptyDiff(),
          selectionBefore: this.selectionAtInteractionStart,
          selectionAfter: [],
        };
      }
      this.pending.diff = squashDiffs(this.pending.diff, diff);
      return;
    }
    this.push({ diff, selectionBefore: this.selectionAtTxStart, selectionAfter: [] });
  }

  private push(entry: HistoryEntry): void {
    this.undos.push(entry);
    if (this.undos.length > this.limit) this.undos.shift();
    this.redos = [];
    this.emit();
  }

  /** Start squashing changes into a single undo step. Calls nest. */
  startInteraction(): void {
    if (this.interactionDepth === 0) {
      this.pending = null;
      this.selectionAtInteractionStart = this.selection.get();
    }
    this.interactionDepth++;
  }

  endInteraction(): void {
    if (this.interactionDepth === 0) return;
    this.interactionDepth--;
    if (this.interactionDepth === 0) this.flushPending();
  }

  get interacting(): boolean {
    return this.interactionDepth > 0;
  }

  private flushPending(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending && !isEmptyDiff(pending.diff)) this.push(pending);
  }

  /** Abort the current interaction and revert its changes. */
  cancelInteraction(): void {
    if (this.interactionDepth === 0) return;
    this.interactionDepth = 0;
    const pending = this.pending;
    this.pending = null;
    if (pending && !isEmptyDiff(pending.diff)) {
      this.store.transact(() => this.store.applyDiff(invertDiff(pending.diff)), {
        source: 'history',
        history: 'ignore',
      });
    }
  }

  undo(): boolean {
    if (this.interactionDepth > 0) {
      this.interactionDepth = 0;
      this.flushPending();
    }
    const entry = this.undos.pop();
    if (!entry) return false;
    entry.selectionAfter = this.selection.get();
    this.store.transact(() => this.store.applyDiff(invertDiff(entry.diff)), {
      source: 'history',
      history: 'ignore',
    });
    this.redos.push(entry);
    this.selection.set(entry.selectionBefore.filter((id) => this.store.has(id)));
    this.emit();
    return true;
  }

  redo(): boolean {
    const entry = this.redos.pop();
    if (!entry) return false;
    this.store.transact(() => this.store.applyDiff(entry.diff), {
      source: 'history',
      history: 'ignore',
    });
    this.undos.push(entry);
    this.selection.set(entry.selectionAfter.filter((id) => this.store.has(id)));
    this.emit();
    return true;
  }

  clear(): void {
    this.undos = [];
    this.redos = [];
    this.pending = null;
    this.interactionDepth = 0;
    this.emit();
  }
}
