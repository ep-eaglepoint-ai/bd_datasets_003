'use strict';

const http = require('http');
const { URL } = require('url');

function formatSseMessage({ id, data }) {
  // Strict SSE format required by prompt
  return `id: ${id}\ndata: ${data}\n\n`;
}

function createApp({ initialHistory } = {}) {
  const history = Array.isArray(initialHistory) ? [...initialHistory] : [];
  let nextId = history.length ? Math.max(...history.map((e) => e.id)) + 1 : 1;

  /** @type {Set<import('http').ServerResponse>} */
  const clients = new Set();

  function broadcast(event) {
    const msg = formatSseMessage({ id: event.id, data: event.text });
    for (const res of clients) {
      try {
        res.write(msg);
      } catch {
        // If a socket is unexpectedly broken, drop it.
        clients.delete(res);
      }
    }
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.statusCode = 302;
      res.setHeader('Location', '/index.html');
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // helpful for proxies
        'X-Accel-Buffering': 'no'
      });

      // Ensure headers are flushed quickly
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      // Recommend a reconnect delay (ms). Not required, but helps demos.
      res.write('retry: 1000\n\n');

      // State recovery: replay missed events based on Last-Event-ID
      const lastEventIdHeader = req.headers['last-event-id'];
      const headerId = lastEventIdHeader == null ? null : Number(lastEventIdHeader);
      const queryIdRaw = url.searchParams.get('lastEventId');
      const queryId = queryIdRaw == null ? null : Number(queryIdRaw);

      const lastSeenId = Number.isFinite(headerId)
        ? headerId
        : Number.isFinite(queryId)
          ? queryId
          : null;

      if (lastSeenId != null) {
        const missed = history.filter((e) => e.id > lastSeenId);
        for (const e of missed) {
          res.write(formatSseMessage({ id: e.id, data: e.text }));
        }
      }

      // Enter streaming mode
      clients.add(res);

      // Keep-alive comment ping (optional but safe)
      const ping = setInterval(() => {
        if (res.writableEnded) return;
        try {
          res.write(': ping\n\n');
        } catch {
          // ignore
        }
      }, 25000);

      const cleanup = () => {
        clearInterval(ping);
        clients.delete(res);
        try {
          res.end();
        } catch {
          // ignore
        }
      };

      req.on('close', cleanup);
      req.on('aborted', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);

      return;
    }

    if (req.method === 'POST' && url.pathname === '/news') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
        // small guard
        if (body.length > 1_000_000) req.destroy();
      });
      req.on('end', () => {
        let text;
        try {
          const parsed = body ? JSON.parse(body) : {};
          text = typeof parsed.text === 'string' ? parsed.text : undefined;
        } catch {
          text = undefined;
        }

        if (!text) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Expected JSON body: {"text": "..."}' }));
          return;
        }

        const event = { id: nextId++, text };
        history.push(event);
        broadcast(event);

        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(event));
      });
      return;
    }

    // basic static file for the demo client
    if (req.method === 'GET' && url.pathname === '/index.html') {
      const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'client', 'index.html'));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
  });

  return {
    server,
    history,
    clients
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const { server } = createApp();
  server.listen(port, () => {
    console.log(`SSE news server listening on http://localhost:${port}`);
  });
}

module.exports = { createApp, formatSseMessage };
