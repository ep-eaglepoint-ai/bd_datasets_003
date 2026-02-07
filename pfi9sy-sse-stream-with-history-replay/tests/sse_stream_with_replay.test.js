'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../repository_after/server/server');

function httpRequest({ port, method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function connectSse({ port, lastEventId } = {}) {
  const chunks = [];
  let closed = false;

  const req = http.request({
    host: '127.0.0.1',
    port,
    method: 'GET',
    path: '/events',
    headers: {
      Accept: 'text/event-stream',
      ...(lastEventId != null ? { 'Last-Event-ID': String(lastEventId) } : {})
    }
  });

  req.end();

  const ready = new Promise((resolve, reject) => {
    req.on('response', (res) => {
      res.setEncoding('utf8');
      res.on('data', (d) => chunks.push(d));
      res.on('error', reject);
      resolve({ res });
    });
    req.on('error', reject);
  });

  function close() {
    if (closed) return;
    closed = true;
    req.destroy();
  }

  function readBuffer() {
    return chunks.join('');
  }

  async function waitForRegex(regex, { timeoutMs = 1500 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (regex.test(readBuffer())) return readBuffer();
      await new Promise((r) => setTimeout(r, 10));
    }
    const buf = readBuffer();
    assert.fail(`Timed out waiting for ${regex}. Buffer was:\n${buf}`);
  }

  return { ready, close, readBuffer, waitForRegex };
}

function countSseEvents(buffer) {
  // Only count real events, not keep-alive comments
  // or control frames like `retry:`.
  // Each SSE event ends with a blank line.
  const parts = buffer.split('\n\n').map((p) => p.trim()).filter(Boolean);
  return parts.filter((p) => !p.startsWith(':') && !p.startsWith('retry:')).length;
}

test('Live Stream Test: client receives broadcasted POST /news event', async () => {
  const { server } = createApp();
  server.listen(0);
  const port = server.address().port;

  const clientA = connectSse({ port });
  await clientA.ready;

  const postRes = await httpRequest({
    port,
    method: 'POST',
    path: '/news',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'hello A' })
  });
  assert.equal(postRes.statusCode, 201);

  await clientA.waitForRegex(/id: 1\ndata: hello A\n\n/);

  clientA.close();
  server.close();
});

test('Recovery Test: client reconnects with Last-Event-ID and gets missed events immediately', async () => {
  const { server } = createApp();
  server.listen(0);
  const port = server.address().port;

  const clientB1 = connectSse({ port });
  await clientB1.ready;

  for (const text of ['e1', 'e2', 'e3']) {
    const r = await httpRequest({
      port,
      method: 'POST',
      path: '/news',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    assert.equal(r.statusCode, 201);
  }

  await clientB1.waitForRegex(/id: 3\ndata: e3\n\n/);

  // simulate network drop
  clientB1.close();

  // event 4 happens while client is disconnected
  const r4 = await httpRequest({
    port,
    method: 'POST',
    path: '/news',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'e4' })
  });
  assert.equal(r4.statusCode, 201);

  // reconnect with Last-Event-ID: 3, should replay event 4 immediately
  const clientB2 = connectSse({ port, lastEventId: 3 });
  await clientB2.ready;

  await clientB2.waitForRegex(/id: 4\ndata: e4\n\n/, { timeoutMs: 1500 });

  clientB2.close();
  server.close();
});

test('Empty State Test: client with no Last-Event-ID receives no immediate data', async () => {
  const { server } = createApp();
  server.listen(0);
  const port = server.address().port;

  // Create history before connecting
  for (const text of ['old1', 'old2']) {
    const r = await httpRequest({
      port,
      method: 'POST',
      path: '/news',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    assert.equal(r.statusCode, 201);
  }

  const clientC = connectSse({ port });
  await clientC.ready;

  // wait briefly and ensure no events were immediately replayed
  await new Promise((r) => setTimeout(r, 150));
  const buf = clientC.readBuffer();
  assert.equal(countSseEvents(buf), 0, `Expected no immediate events, got buffer:\n${buf}`);

  clientC.close();
  server.close();
});
