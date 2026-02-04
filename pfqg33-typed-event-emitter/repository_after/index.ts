export type EventMap = Record<string | symbol, any>;

type Handler<P> = (payload: P) => void;

export class TypedEventEmitter<T extends EventMap> {
  private listeners: Map<keyof T, Handler<any>[]> = new Map();

  on<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
    const handlers = this.getHandlers(event);
    handlers.push(handler);
  }

  once<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
    const wrapper: Handler<T[K]> = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };

    this.on(event, wrapper);
  }

  off<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.length === 0) return;

    // Reentrancy protection
    const handlersToInvoke = [...handlers];

    for (const handler of handlersToInvoke) {
      try {
        handler(payload);
      } catch (error) {
        console.error(
          `[TypedEventEmitter] Error in listener for "${String(event)}":`,
          error
        );
      }
    }
  }

  removeAllListeners(event?: keyof T): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  private getHandlers<K extends keyof T>(event: K): Handler<T[K]>[] {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    return this.listeners.get(event) as Handler<T[K]>[];
  }
}
