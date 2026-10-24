import type { RpcMessage } from './protocol';

export interface Transport {
  send(message: RpcMessage): void;
  /** Subscribe to incoming messages; returns an unsubscribe function. */
  listen(handler: (message: RpcMessage) => void): () => void;
  close?(): void;
}

type Handler = (params: unknown) => unknown | Promise<unknown>;

/** Symmetric request/response + events over a transport. */
export class RpcPeer {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  private handlers = new Map<string, Handler>();
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  private unlisten: () => void;

  constructor(
    private transport: Transport,
    private timeoutMs = 60_000,
  ) {
    this.unlisten = transport.listen((m) => void this.receive(m));
  }

  /** Expose a method to the other side. */
  handle(method: string, handler: Handler): void {
    this.handlers.set(method, handler);
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    let set = this.eventHandlers.get(event);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit(event: string, payload?: unknown): void {
    this.transport.send({ kind: 'event', name: event, payload });
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request "${method}" timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.transport.send({ kind: 'request', id, method, params });
    });
  }

  private async receive(m: RpcMessage): Promise<void> {
    if (m.kind === 'response') {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error.message));
      return;
    }
    if (m.kind === 'event') {
      for (const h of this.eventHandlers.get(m.name) ?? []) h(m.payload);
      return;
    }
    const handler = this.handlers.get(m.method);
    if (!handler) {
      this.transport.send({
        kind: 'response',
        id: m.id,
        ok: false,
        error: { message: `Unknown method "${m.method}"` },
      });
      return;
    }
    try {
      const result = await handler(m.params);
      this.transport.send({ kind: 'response', id: m.id, ok: true, result });
    } catch (err) {
      this.transport.send({
        kind: 'response',
        id: m.id,
        ok: false,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  close(): void {
    this.unlisten();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Connection closed'));
    }
    this.pending.clear();
    this.transport.close?.();
  }
}

export function portTransport(port: MessagePort): Transport {
  return {
    send: (message) => port.postMessage(message),
    listen(handler) {
      const onMessage = (e: MessageEvent) => {
        const data = e.data as RpcMessage;
        if (data && typeof data === 'object' && 'kind' in data) handler(data);
      };
      port.addEventListener('message', onMessage);
      port.start();
      return () => port.removeEventListener('message', onMessage);
    },
    close: () => port.close(),
  };
}
