// library.ts
// A small utility library where correctness depends on compile-time guarantees.

export type Brand<T, B extends string> = T & { readonly __brand: B };

export function brand<T, B extends string>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}

export type UserId = Brand<string, "UserId">;
export type OrderId = Brand<string, "OrderId">;

export type NonEmptyString<T extends string> = T extends "" ? never : T;

export function asNonEmptyString<T extends string>(value: T): NonEmptyString<T> {
  // runtime is intentionally permissive; correctness is mainly type-level
  return value as NonEmptyString<T>;
}

export type Primitive = string | number | boolean | bigint | symbol | null | undefined;
export type DeepReadonly<T> =
  T extends Primitive ? T :
  T extends (...args: any[]) => any ? T :
  T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepReadonly<U>> :
  T extends Array<infer U> ? ReadonlyArray<DeepReadonly<U>> :
  T extends Map<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>> :
  T extends Set<infer U> ? ReadonlySet<DeepReadonly<U>> :
  { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type Ok<T> = { ok: true; value: T };
export type Err<C extends string, D = undefined> = { ok: false; code: C; details?: D };
export type Result<T, C extends string = string, D = undefined> = Ok<T> | Err<C, D>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<C extends string, D = undefined>(code: C, details?: D): Err<C, D> {
  return { ok: false, code, details };
}

// Exhaustive check helper
export function assertNever(x: never): never {
  throw new Error("Unreachable: " + String(x));
}

// Domain events (discriminated union)
export type DomainEvent =
  | { type: "user.created"; userId: UserId; email: NonEmptyString<string> }
  | { type: "order.placed"; orderId: OrderId; userId: UserId; totalCents: number }
  | { type: "order.cancelled"; orderId: OrderId; reason: "fraud" | "customer_request" };

export type EventType = DomainEvent["type"];
export type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;

// Typed event bus
export function createEventBus() {
  const handlers: Partial<Record<EventType, Array<(e: any) => void>>> = {};

  return {
    on<T extends EventType>(type: T, handler: (event: EventOf<T>) => void): () => void {
      const list = (handlers[type] ||= []);
      list.push(handler as any);
      return () => {
        const idx = list.indexOf(handler as any);
        if (idx >= 0) list.splice(idx, 1);
      };
    },

    emit<T extends EventType>(event: EventOf<T>): void {
      const list = handlers[event.type];
      if (!list) return;
      for (const h of list) h(event);
    }
  };
}

// A function that must be exhaustively handled by event type.
// Runtime behavior is simple; correctness is mostly in the type-level contract.
export function eventLabel(e: DomainEvent): string {
  switch (e.type) {
    case "user.created": return "User Created";
    case "order.placed": return "Order Placed";
    case "order.cancelled": return "Order Cancelled";
    default: return assertNever(e); // must remain exhaustive
  }
}

// Result-based API with specific error codes
export type CreateOrderError = "INVALID_TOTAL" | "MISSING_USER";
export function createOrder(userId: UserId | null, totalCents: number): Result<OrderId, CreateOrderError> {
  if (!userId) return err("MISSING_USER");
  if (!Number.isInteger(totalCents) || totalCents <= 0) return err("INVALID_TOTAL");
  return ok(brand<string, "OrderId">("ord_" + totalCents));
}
