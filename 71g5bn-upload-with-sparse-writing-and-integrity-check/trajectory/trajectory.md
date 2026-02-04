# Trajectory: Upload with Sparse Writing and Integrity Check

**Objective:** Build a fault-tolerant resumable upload gateway that can ingest multi‑gigabyte files over unstable networks by splitting them into 5MB chunks, uploading chunks in parallel, writing them to disk **out of order** via random-access I/O, supporting **resume** via a server handshake, and verifying end‑to‑end integrity with SHA‑256.

---

### 1. I started by turning the requirements into invariants

Before writing code, I translated each requirement into something I could enforce:

- The server must be able to accept chunks arriving out of sequence and write them immediately to the correct byte offset (no append-only semantics).
- The server must never buffer whole files in memory.
- The client must upload chunks concurrently (with a strict concurrency cap) and must be able to resume by asking the server what’s already persisted.
- Final completion must be gated on **(a)** “all chunks received”, **(b)** “file size matches totalSize”, and **(c)** SHA‑256 checksum matches.

This framing made it clear that the core challenge is **random-access reassembly** plus a **reconciliation protocol** for resume.

---

### 2. I designed the backend protocol around a server-owned upload state

I implemented three main backend endpoints:

- `POST /api/uploads`: creates a new upload session and pre-allocates a target file on disk with the declared `totalSize`.
- `HEAD /api/uploads/:id`: the resume handshake. The server returns a bitmap of received chunks, so the client can compute which chunks are missing.
- `PUT /api/uploads/:id/chunk`: receives a chunk with a `Content-Range` header and writes it to disk using **positioned writes**.

The key decision here was storing a compact, persistent `meta.json` per upload that includes `totalSize`, `chunkSize`, `totalChunks`, and a `received[]` bitmap. This makes the server the source of truth even across restarts.

---

### 3. I solved out-of-order chunk writes with true random-access I/O

The main failure mode I avoided was treating chunk uploads as “append”. If chunks arrive out of order, appending corrupts the binary stream.

Instead, for each chunk request I:

1. Parse and validate `Content-Range` (`bytes start-end/total`).
2. Compute the chunk index from `start` and enforce alignment (`start % chunkSize == 0`).
3. Open the destination file with `fs.open(filePath, "r+")`.
4. Stream the request body and write each incoming buffer to `position = start + wroteSoFar` using `fs.write(fd, buffer, ..., position)`.
5. Close the FD in a `finally` block to prevent leaks.

This gives the crucial property: **Chunk 5 can arrive before Chunk 1 and still lands in the correct byte range on disk immediately.**

---

### 4. I made resume deterministic with a bitmap handshake

To implement resume, I made the server return a bitmap of received chunks in the `HEAD` response headers.

On the client, I decode that bitmap into a `boolean[]` and only enqueue uploads for the missing chunks. This keeps the resume logic simple:

- “Server says chunk i exists” → skip it.
- “Server says chunk i missing” → upload it.

I also made duplicate chunk uploads safe by design: since the server writes at a fixed offset, re-sending a chunk overwrites the same region and cannot corrupt file size or ordering.

---

### 5. I implemented the frontend upload engine as a worker queue

On the frontend, I avoided any high-level upload libraries and built a small upload engine around:

- Chunking via `File.slice(start, end)`.
- A `PromiseWorkerQueue` that enforces a max concurrency of 3 active requests.
- Retries with exponential backoff for failed chunks.
- Local persistence of `uploadId` keyed by a file fingerprint (name/size/lastModified) so closing the tab still allows resume.

This gives parallel uploads without the failure mode of firing hundreds/thousands of requests at once.

---

### 6. I enforced end-to-end integrity with SHA-256 verification

Integrity is only meaningful if the server computes it on the assembled file, not based on client claims.

So the client computes a SHA‑256 incrementally while reading slices (bounded memory), sends the final hex digest to `POST /complete`, and the server streams the assembled file from disk and compares digests.

Only on a match does the server mark the upload session `complete`.

---

### 7. I proved correctness with a Docker integration test

To validate the most important backend properties, I wrote an integration test that:

- Uploads chunks in parallel and deliberately out-of-order.
- Stops mid-way, performs a `HEAD` handshake, then uploads only missing chunks.
- Re-uploads a duplicate chunk to ensure overwrites are safe.
- Validates that completing early fails (missing chunks).
- Validates that `Content-Range` total mismatches are rejected.
- Validates that wrong SHA‑256 is rejected and correct SHA‑256 completes.
- Restarts the server and re-runs the test to ensure persistence works.

I also updated the integration test output to print structured `PASS:` lines so the evaluator can generate a JSON report that reflects the tests.

---

### 8. I added an evaluator that produces a machine-readable report

Finally, I added a small C evaluation program that:

- Runs `docker compose run --rm --build app` under a timeout.
- Parses `PASS:`/`FAILED:` lines to build per-test results.
- Adds static checks for browser-only requirements (like `File.slice` usage and TypeScript interface presence).
- Writes the consolidated results to `evaluation/report.json`.

This keeps evaluation deterministic and makes it easy for others to see exactly what passed and what failed.
