export type Listener<T> = (payload: T) => void;

/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.map.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const l of [...set]) (l as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.map.clear();
  }
}
