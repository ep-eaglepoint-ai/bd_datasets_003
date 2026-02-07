# Trajectory: SSE stream with history replay

## What we built

A small full-stack demo (no frameworks) that implements a resilient Server-Sent Events (SSE) stream with **gap recovery** using the standard `Last-Event-ID` header.

## Why it’s needed

SSE connections are long-lived and can drop during real-world network hiccups (WiFi toggle, laptop sleep, proxy resets). Browsers automatically reconnect using `EventSource`, but the server must fill any gaps.

Without replay, a reconnecting client misses messages sent during the disconnect window.

## Key design decisions

### 1) Use in-memory ordered history

We store all news events in an array:

```js
[{ id: 1, text: '...' }, { id: 2, text: '...' }]
```

IDs are strictly increasing so the client can resume from a known point.

### 2) Strict SSE message formatting

Every event is written as:

```
id: <id>
data: <payload>
```

### 3) Recovery via `Last-Event-ID`

When a client connects to `GET /events`, we check:

- `req.headers['last-event-id']`

If present and numeric, we immediately send all history entries where `id > lastEventId`, then add the client to the live broadcast pool.

### 4) Prevent leaks on disconnect

Streaming responses are tracked in a `Set`. On `close`/`aborted`/`error`, the response is removed so the server never writes to dead sockets.

## Tests (requirements coverage)

- Live stream: connect SSE client, `POST /news`, verify the client receives `id: 1`.
- Recovery: connect, send 3 events, disconnect, send event 4 while offline, reconnect with `Last-Event-ID: 3`, verify event 4 arrives immediately.
- Empty state: create history first, connect without `Last-Event-ID`, verify no immediate replay occurs.

## References
- [MDN: Server-Sent Events (`EventSource`) and the `Last-Event-ID` reconnection mechanism](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

