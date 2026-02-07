# SSE Stream with History Replay (native Node.js http)

This benchmark unit implements a resilient Server-Sent Events (SSE) stream with **state recovery** via the `Last-Event-ID` header.

## Project layout

- `server/server.js`: native `http` server (no Express/Koa/Socket.io)
- `client/index.html`: logic-only browser client using `EventSource`

## Endpoints

- `POST /news` — body: `{ "text": "hello" }`
  - Appends `{id, text}` to in-memory history
  - Broadcasts to all connected `/events` clients
- `GET /events` — SSE stream
  - If request includes `Last-Event-ID`, server replays all events with `id > Last-Event-ID` immediately, then switches to live streaming.

## Run locally

From `repository_after/server`:

```bash
npm install
npm start
```

Then open:

- http://localhost:3000/index.html

To publish news:

```bash
curl -X POST http://localhost:3000/news \
  -H 'content-type: application/json' \
  -d '{"text":"breaking: hello"}'
```
