import type { DesignRecord, Id } from '../model/types';

export interface RecordsDiff<R = DesignRecord> {
  added: Record<Id, R>;
  updated: Record<Id, [from: R, to: R]>;
  removed: Record<Id, R>;
}

export function emptyDiff<R = DesignRecord>(): RecordsDiff<R> {
  return { added: {}, updated: {}, removed: {} };
}

export function isEmptyDiff(diff: RecordsDiff<unknown>): boolean {
  for (const _ in diff.added) return false;
  for (const _ in diff.updated) return false;
  for (const _ in diff.removed) return false;
  return true;
}

/** Record that `next` replaced `prev` (or was added when `prev` is undefined). */
export function recordPut<R>(diff: RecordsDiff<R>, id: Id, prev: R | undefined, next: R): void {
  if (id in diff.removed) {
    const from = diff.removed[id]!;
    delete diff.removed[id];
    diff.updated[id] = [from, next];
  } else if (id in diff.added) {
    diff.added[id] = next;
  } else if (id in diff.updated) {
    diff.updated[id]![1] = next;
  } else if (prev !== undefined) {
    diff.updated[id] = [prev, next];
  } else {
    diff.added[id] = next;
  }
}

export function recordRemove<R>(diff: RecordsDiff<R>, id: Id, prev: R): void {
  if (id in diff.added) {
    delete diff.added[id];
  } else if (id in diff.updated) {
    diff.removed[id] = diff.updated[id]![0];
    delete diff.updated[id];
  } else {
    diff.removed[id] = prev;
  }
}

/** Combine `a` followed by `b` into a single diff. Inputs are not mutated. */
export function squashDiffs<R>(a: RecordsDiff<R>, b: RecordsDiff<R>): RecordsDiff<R> {
  const out: RecordsDiff<R> = {
    added: { ...a.added },
    updated: {},
    removed: { ...a.removed },
  };
  for (const id in a.updated) out.updated[id] = [a.updated[id]![0], a.updated[id]![1]];
  for (const id in b.removed) recordRemove(out, id, b.removed[id]!);
  for (const id in b.added) recordPut(out, id, undefined, b.added[id]!);
  for (const id in b.updated) {
    const [from, to] = b.updated[id]!;
    recordPut(out, id, from, to);
  }
  return out;
}

export function invertDiff<R>(diff: RecordsDiff<R>): RecordsDiff<R> {
  const out: RecordsDiff<R> = {
    added: { ...diff.removed },
    updated: {},
    removed: { ...diff.added },
  };
  for (const id in diff.updated) {
    const [from, to] = diff.updated[id]!;
    out.updated[id] = [to, from];
  }
  return out;
}

export function diffTouches<R>(diff: RecordsDiff<R>, predicate: (record: R) => boolean): boolean {
  for (const id in diff.added) if (predicate(diff.added[id]!)) return true;
  for (const id in diff.removed) if (predicate(diff.removed[id]!)) return true;
  for (const id in diff.updated) {
    const [from, to] = diff.updated[id]!;
    if (predicate(from) || predicate(to)) return true;
  }
  return false;
}
