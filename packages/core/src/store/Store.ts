import { compareIndex } from '../model/fractional';
import type { DesignElement, DesignRecord, DocumentRecord, Id, PageRecord } from '../model/types';
import { DOCUMENT_ID } from '../model/types';
import {
  emptyDiff,
  invertDiff,
  isEmptyDiff,
  type RecordsDiff,
  recordPut,
  recordRemove,
} from './diff';

export type ChangeSource = 'user' | 'history' | 'remote' | 'system';

export interface ChangeMeta {
  source: ChangeSource;
  /** 'record' changes become undo steps; 'ignore' changes do not. */
  history: 'record' | 'ignore';
}

export type StoreListener = (diff: RecordsDiff, meta: ChangeMeta) => void;

/**
 * Runs before a record is written. Return the record to store (possibly
 * adjusted, e.g. a text element whose height was re-measured).
 */
export type BeforeChangeHandler = (
  prev: DesignRecord | undefined,
  next: DesignRecord,
) => DesignRecord;

const DEFAULT_META: ChangeMeta = { source: 'user', history: 'record' };

function isStructural(prev: DesignRecord | undefined, next: DesignRecord | undefined): boolean {
  if (!prev || !next) return true;
  if (prev.typeName !== 'element' && prev.typeName !== 'page') return false;
  if ((prev as PageRecord).index !== (next as PageRecord).index) return true;
  if (prev.typeName === 'element') {
    return prev.parentId !== (next as DesignElement).parentId;
  }
  return false;
}

/**
 * In-memory record store. All writes happen inside transactions; listeners
 * receive one squashed diff per outermost transaction.
 */
export class Store {
  private records = new Map<Id, DesignRecord>();
  private listeners = new Set<StoreListener>();
  private txStartListeners = new Set<() => void>();
  private beforeChangeHandlers: BeforeChangeHandler[] = [];
  private txDepth = 0;
  private txDiff: RecordsDiff | null = null;
  private txMeta: ChangeMeta = DEFAULT_META;
  private _version = 0;

  private childIndex: Map<Id, Id[]> | null = null;
  private pageIndex: Id[] | null = null;

  get version(): number {
    return this._version;
  }

  get inTransaction(): boolean {
    return this.txDepth > 0;
  }

  get<T extends DesignRecord = DesignRecord>(id: Id): T | undefined {
    return this.records.get(id) as T | undefined;
  }

  has(id: Id): boolean {
    return this.records.has(id);
  }

  values(): IterableIterator<DesignRecord> {
    return this.records.values();
  }

  getDocument(): DocumentRecord {
    const doc = this.records.get(DOCUMENT_ID);
    if (!doc) throw new Error('Store has no document record');
    return doc as DocumentRecord;
  }

  /** Pages sorted by index. */
  getPages(): PageRecord[] {
    if (!this.pageIndex) {
      const pages: PageRecord[] = [];
      for (const r of this.records.values()) if (r.typeName === 'page') pages.push(r);
      pages.sort((a, b) => compareIndex(a.index, b.index));
      this.pageIndex = pages.map((p) => p.id);
    }
    return this.pageIndex.map((id) => this.records.get(id) as PageRecord);
  }

  /** Direct children of a page or group, sorted back-to-front. */
  getChildren(parentId: Id): DesignElement[] {
    if (!this.childIndex) this.buildChildIndex();
    const ids = this.childIndex!.get(parentId);
    if (!ids) return [];
    return ids.map((id) => this.records.get(id) as DesignElement);
  }

  getChildIds(parentId: Id): readonly Id[] {
    if (!this.childIndex) this.buildChildIndex();
    return this.childIndex!.get(parentId) ?? [];
  }

  private buildChildIndex(): void {
    const groups = new Map<Id, DesignElement[]>();
    for (const r of this.records.values()) {
      if (r.typeName !== 'element') continue;
      let list = groups.get(r.parentId);
      if (!list) {
        list = [];
        groups.set(r.parentId, list);
      }
      list.push(r);
    }
    const index = new Map<Id, Id[]>();
    for (const [parentId, list] of groups) {
      list.sort((a, b) => compareIndex(a.index, b.index));
      index.set(
        parentId,
        list.map((e) => e.id),
      );
    }
    this.childIndex = index;
  }

  registerBeforeChange(handler: BeforeChangeHandler): () => void {
    this.beforeChangeHandlers.push(handler);
    return () => {
      this.beforeChangeHandlers = this.beforeChangeHandlers.filter((h) => h !== handler);
    };
  }

  listen(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called when an outermost transaction starts (before any write). */
  onTransactionStart(listener: () => void): () => void {
    this.txStartListeners.add(listener);
    return () => this.txStartListeners.delete(listener);
  }

  /**
   * Run `fn` atomically. Nested transactions join the outer one. If `fn`
   * throws, every write made by the transaction is rolled back.
   */
  transact<T>(fn: () => T, meta?: Partial<ChangeMeta>): T {
    if (this.txDepth === 0) {
      for (const l of this.txStartListeners) l();
      this.txDiff = emptyDiff();
      this.txMeta = { ...DEFAULT_META, ...meta };
    }
    this.txDepth++;
    let ok = false;
    try {
      const result = fn();
      ok = true;
      return result;
    } finally {
      this.txDepth--;
      if (this.txDepth === 0) {
        const diff = this.txDiff!;
        const txMeta = this.txMeta;
        this.txDiff = null;
        if (!ok) {
          this.rollback(diff);
        } else if (!isEmptyDiff(diff)) {
          this._version++;
          for (const l of [...this.listeners]) l(diff, txMeta);
        }
      }
    }
  }

  private rollback(diff: RecordsDiff): void {
    const inverse = invertDiff(diff);
    for (const id in inverse.removed) this.records.delete(id);
    for (const id in inverse.added) this.records.set(id, inverse.added[id]!);
    for (const id in inverse.updated) this.records.set(id, inverse.updated[id]![1]);
    this.childIndex = null;
    this.pageIndex = null;
  }

  put(records: DesignRecord[]): void {
    this.transact(() => {
      for (const record of records) this.write(record);
    });
  }

  update<T extends DesignRecord>(id: Id, updater: Partial<T> | ((record: T) => T)): void {
    const prev = this.records.get(id) as T | undefined;
    if (!prev) return;
    const next = typeof updater === 'function' ? updater(prev) : ({ ...prev, ...updater } as T);
    if (next === prev) return;
    this.put([next]);
  }

  remove(ids: Iterable<Id>): void {
    this.transact(() => {
      for (const id of ids) {
        const prev = this.records.get(id);
        if (!prev) continue;
        this.records.delete(id);
        recordRemove(this.txDiff!, id, prev);
        this.invalidate(prev, undefined);
      }
    });
  }

  applyDiff(diff: RecordsDiff): void {
    this.transact(() => {
      this.remove(Object.keys(diff.removed));
      const writes: DesignRecord[] = [];
      for (const id in diff.added) writes.push(diff.added[id]!);
      for (const id in diff.updated) writes.push(diff.updated[id]![1]);
      this.put(writes);
    });
  }

  /** Replace every record. */
  loadRecords(
    records: DesignRecord[],
    meta: Partial<ChangeMeta> = { source: 'system', history: 'ignore' },
  ): void {
    this.transact(() => {
      const keep = new Set(records.map((r) => r.id));
      this.remove([...this.records.keys()].filter((id) => !keep.has(id)));
      this.put(records);
    }, meta);
  }

  private write(record: DesignRecord): void {
    const prev = this.records.get(record.id);
    let next = record;
    for (const handler of this.beforeChangeHandlers) next = handler(prev, next);
    if (prev === next) return;
    this.records.set(next.id, next);
    recordPut(this.txDiff!, next.id, prev, next);
    this.invalidate(prev, next);
  }

  private invalidate(prev: DesignRecord | undefined, next: DesignRecord | undefined): void {
    const typeName = (prev ?? next)!.typeName;
    if (typeName === 'page' && isStructural(prev, next)) this.pageIndex = null;
    if (typeName === 'element' && isStructural(prev, next)) this.childIndex = null;
  }

  /** All records, for serialization. */
  snapshot(): DesignRecord[] {
    return [...this.records.values()];
  }
}
