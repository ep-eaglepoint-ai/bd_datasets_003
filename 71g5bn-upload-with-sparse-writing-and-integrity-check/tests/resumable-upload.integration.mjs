import crypto from "node:crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CHUNK_SIZE = 5 * 1024 * 1024;

function pass(name) {
  console.log(`PASS: ${name}`);
}

function fail(name, err) {
  const msg = err?.message ? String(err.message) : String(err);
  console.log(`FAILED: ${name}${msg ? ` (${msg})` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Probe the root. We just need *any* HTTP response.
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${BASE_URL}/`, { method: "GET" });
      if (res.status >= 200 || res.status === 404) return;
    } catch {}

    if (Date.now() > deadline) throw new Error("server_not_ready");
    // eslint-disable-next-line no-await-in-loop
    await sleep(300);
  }
}

function decodeBitmap(base64, totalChunks) {
  const raw = Buffer.from(base64, "base64");
  const out = new Array(totalChunks).fill(false);
  for (let i = 0; i < totalChunks; i++) {
    const byte = raw[i >> 3] ?? 0;
    out[i] = ((byte >> (i & 7)) & 1) === 1;
  }
  return out;
}

async function headStatus(uploadId) {
  const res = await fetch(`${BASE_URL}/api/uploads/${uploadId}`, {
    method: "HEAD",
  });
  if (!res.ok) throw new Error(`handshake_failed_${res.status}`);
  const totalSize = Number(res.headers.get("x-total-size"));
  const chunkSize = Number(res.headers.get("x-chunk-size"));
  const totalChunks = Number(res.headers.get("x-total-chunks"));
  const receivedCount = Number(res.headers.get("x-received-chunks"));
  const bitmap = String(res.headers.get("x-received-bitmap") ?? "");
  const received = decodeBitmap(bitmap, totalChunks);
  return { totalSize, chunkSize, totalChunks, receivedCount, received };
}

async function putChunk(uploadId, start, endExclusive, buf, totalSize) {
  const contentRange = `bytes ${start}-${endExclusive - 1}/${totalSize}`;
  const res = await fetch(`${BASE_URL}/api/uploads/${uploadId}/chunk`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "content-range": contentRange,
    },
    body: buf.slice(start, endExclusive),
  });
  if (!res.ok) {
    let details = "";
    try {
      details = await res.text();
    } catch {}
    throw new Error(`chunk_upload_failed_${res.status}: ${details}`);
  }
}

async function promisePool(items, concurrency, fn) {
  const queue = items.slice();
  let active = 0;
  return await new Promise((resolve, reject) => {
    const pump = () => {
      while (active < concurrency && queue.length) {
        const item = queue.shift();
        active++;
        Promise.resolve()
          .then(() => fn(item))
          .then(() => {
            active--;
            if (queue.length === 0 && active === 0) resolve();
            else pump();
          })
          .catch(reject);
      }
    };
    pump();
  });
}

async function main() {
  console.log(`BASE_URL=${BASE_URL}`);
  await waitForServer();
  pass("server_reachable");

  // 22MB buffer => 5MB chunks => 5 chunks (last partial)
  const totalSize = 22 * 1024 * 1024;
  const data = crypto.randomBytes(totalSize);
  const clientSha = crypto.createHash("sha256").update(data).digest("hex");

  const initRes = await fetch(`${BASE_URL}/api/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: "integration.bin", totalSize }),
  });
  if (initRes.status !== 201) throw new Error(`init_failed_${initRes.status}`);
  const init = await initRes.json();
  const uploadId = init.uploadId;

  if (!uploadId) throw new Error("missing_upload_id");
  pass("init_upload");

  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  // Negative case: trying to complete immediately should fail (missing chunks)
  {
    const earlyComplete = await fetch(
      `${BASE_URL}/api/uploads/${uploadId}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sha256: clientSha }),
      }
    );
    if (earlyComplete.status !== 409)
      throw new Error(
        `expected_409_missing_chunks_got_${earlyComplete.status}`
      );
    pass("reject_complete_when_missing_chunks");
  }

  // Build chunk descriptors and intentionally shuffle to force out-of-order writes.
  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const endExclusive = Math.min(totalSize, start + CHUNK_SIZE);
    chunks.push({ i, start, endExclusive });
  }

  // Send chunk 4 before chunk 0 (if present)
  const reordered = chunks.slice();
  reordered.sort((a, b) => (a.i === 4 ? -1 : b.i === 4 ? 1 : a.i - b.i));

  // Upload first half only, to exercise Resume.
  const half = Math.floor(reordered.length / 2);
  await promisePool(reordered.slice(0, half), 3, async (c) => {
    await putChunk(uploadId, c.start, c.endExclusive, data, totalSize);
  });
  pass("upload_partial_parallel_out_of_order");

  // Handshake should show partial receipt.
  const hs1 = await headStatus(uploadId);
  if (hs1.chunkSize !== CHUNK_SIZE) throw new Error("chunk_size_mismatch");
  if (hs1.totalSize !== totalSize) throw new Error("total_size_mismatch");
  if (hs1.receivedCount <= 0) throw new Error("expected_some_received");
  pass("handshake_reports_partial_bitmap");

  // Negative case: total mismatch in Content-Range must be rejected
  {
    const c = reordered[0];
    const wrongTotal = totalSize + 1;
    const res = await fetch(`${BASE_URL}/api/uploads/${uploadId}/chunk`, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "content-range": `bytes ${c.start}-${c.endExclusive - 1}/${wrongTotal}`,
      },
      body: data.slice(c.start, c.endExclusive),
    });
    if (res.status !== 400)
      throw new Error(`expected_400_total_mismatch_got_${res.status}`);
    pass("reject_content_range_total_mismatch");
  }

  // Re-upload one already uploaded chunk (duplicate) - must not corrupt.
  const dup = reordered[0];
  await putChunk(uploadId, dup.start, dup.endExclusive, data, totalSize);
  pass("duplicate_chunk_overwrite_ok");

  // Resume upload remaining chunks only.
  const missing = reordered.filter((c) => !hs1.received[c.i]);
  await promisePool(missing, 3, async (c) => {
    await putChunk(uploadId, c.start, c.endExclusive, data, totalSize);
  });
  pass("resume_upload_missing_only");

  const hs2 = await headStatus(uploadId);
  if (!hs2.received.every(Boolean))
    throw new Error("still_missing_chunks_after_resume");
  pass("handshake_reports_all_received");

  // Negative case: wrong sha256 must be rejected
  {
    const wrong = "0".repeat(64);
    const bad = await fetch(`${BASE_URL}/api/uploads/${uploadId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha256: wrong }),
    });
    if (bad.status !== 409)
      throw new Error(`expected_409_sha_mismatch_got_${bad.status}`);
    pass("reject_wrong_sha256");
  }

  // Finalize with checksum; server computes sha256 of assembled file on disk.
  const completeRes = await fetch(
    `${BASE_URL}/api/uploads/${uploadId}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha256: clientSha }),
    }
  );
  if (!completeRes.ok) throw new Error(`complete_failed_${completeRes.status}`);
  pass("complete_with_correct_sha256");

  const statusRes = await fetch(`${BASE_URL}/api/uploads/${uploadId}/status`, {
    method: "GET",
  });
  if (!statusRes.ok) throw new Error(`status_failed_${statusRes.status}`);
  const status = await statusRes.json();
  if (status.state !== "complete") throw new Error("expected_complete_state");
  pass("status_is_complete");

  console.log("ALL TESTS PASSED");
}

main().catch((e) => {
  try {
    fail("integration", e);
  } catch {}
  console.error("TEST FAILED:", e?.stack || e);
  process.exit(1);
});
