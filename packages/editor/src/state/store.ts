import { useCallback, useRef, useSyncExternalStore } from 'react';

export interface ReadableStore<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

export interface WritableStore<T> extends ReadableStore<T> {
  set(patch: Partial<T> | ((state: T) => Partial<T>)): void;
}

/** Minimal external store for UI state (no dependency on a state library). */
export function createStore<T extends object>(initial: T): WritableStore<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in p) {
        if (!Object.is(state[k as keyof T], p[k as keyof T])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...p };
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false;
  }
  return true;
}

/** Subscribe to a slice of a store; re-renders only when the slice changes (shallowly). */
export function useStore<T, S>(
  store: ReadableStore<T>,
  selector: (state: T) => S,
  isEqual: (a: S, b: S) => boolean = shallowEqual,
): S {
  const cache = useRef<{ value: S } | null>(null);
  const getSnapshot = () => {
    const next = selector(store.get());
    if (cache.current && isEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next };
    return next;
  };
  const subscribe = useCallback((l: () => void) => store.subscribe(l), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
