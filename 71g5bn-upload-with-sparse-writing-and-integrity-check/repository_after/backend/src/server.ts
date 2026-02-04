import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { UploadStore, DEFAULT_CHUNK_SIZE } from "./uploadStore.js";
import type { UploadInitRequest } from "./types.js";

const PORT = Number(process.env.PORT ?? 3000);
const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dist/server.js -> dist -> backend -> repository_after
const DEFAULT_FRONTEND_DIST = path.resolve(
  __dirname,
  "..",
  "..",
  "frontend",
  "dist"
);
const FRONTEND_DIST = process.env.FRONTEND_DIST ?? DEFAULT_FRONTEND_DIST;

function parseContentRange(range: string): {
  start: number;
  endInclusive: number;
  total: number;
} {
  // Format: bytes start-end/total
  const m = /^bytes\s+(\d+)-(\d+)\/(\d+)$/.exec(range.trim());
  if (!m) throw new Error("invalid_content_range");
  const start = Number(m[1]);
  const endInclusive = Number(m[2]);
  const total = Number(m[3]);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(endInclusive) ||
    !Number.isFinite(total)
  ) {
    throw new Error("invalid_content_range");
  }
  if (start < 0 || endInclusive < start || total <= 0)
    throw new Error("invalid_content_range");
  return { start, endInclusive, total };
}

function sendJson(res: express.Response, status: number, body: unknown): void {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

async function main() {
  const app = express();
  app.use(cors());

  const store = new UploadStore(UPLOAD_DIR);
  await store.ensureRoot();

  // Frontend static (optional for tests)
  app.use(express.static(FRONTEND_DIST));

  app.post(
    "/api/uploads",
    express.json({ limit: "64kb" }),
    async (req, res) => {
      const body = req.body as Partial<UploadInitRequest>;
      if (!body?.fileName || typeof body.fileName !== "string")
        return sendJson(res, 400, { error: "fileName_required" });
      if (!Number.isFinite(body.totalSize) || (body.totalSize as number) <= 0)
        return sendJson(res, 400, { error: "totalSize_required" });

      const meta = await store.createUpload(
        body.fileName,
        body.totalSize as number,
        DEFAULT_CHUNK_SIZE
      );
      return sendJson(res, 201, {
        uploadId: meta.id,
        chunkSize: meta.chunkSize,
        totalChunks: meta.totalChunks,
      });
    }
  );

  // Handshake (resume): returns bitmap in headers
  app.head("/api/uploads/:id", async (req, res) => {
    const uploadId = req.params.id;
    const status = await store.getStatus(uploadId);
    if (!status) return res.sendStatus(404);

    res.setHeader("x-upload-id", status.id);
    res.setHeader("x-upload-status", status.state);
    res.setHeader("x-total-size", String(status.totalSize));
    res.setHeader("x-chunk-size", String(status.chunkSize));
    res.setHeader("x-total-chunks", String(status.totalChunks));
    res.setHeader("x-received-chunks", String(status.receivedCount));
    res.setHeader("x-received-bitmap", status.receivedBitmapBase64);
    res.sendStatus(200);
  });

  app.get("/api/uploads/:id/status", async (req, res) => {
    const uploadId = req.params.id;
    const status = await store.getStatus(uploadId);
    if (!status) return sendJson(res, 404, { error: "not_found" });
    return sendJson(res, 200, status);
  });

  // Upload chunk (out-of-order safe)
  app.put("/api/uploads/:id/chunk", async (req, res) => {
    const uploadId = req.params.id;
    const meta = await store.getMeta(uploadId);
    if (!meta) return sendJson(res, 404, { error: "not_found" });
    if (meta.state === "complete")
      return sendJson(res, 409, { error: "already_complete" });

    const rangeHeader = req.header("content-range");
    if (!rangeHeader)
      return sendJson(res, 400, { error: "content_range_required" });

    let startByte = 0;
    let endInclusive = 0;
    let total = 0;
    try {
      ({
        start: startByte,
        endInclusive,
        total,
      } = parseContentRange(rangeHeader));
    } catch {
      return sendJson(res, 400, { error: "invalid_content_range" });
    }

    if (total !== meta.totalSize)
      return sendJson(res, 400, { error: "total_mismatch" });
    if (endInclusive >= meta.totalSize)
      return sendJson(res, 400, { error: "range_out_of_bounds" });

    const expectedLen = endInclusive - startByte + 1;
    const chunkIndex = Math.floor(startByte / meta.chunkSize);

    if (startByte % meta.chunkSize !== 0)
      return sendJson(res, 400, { error: "unaligned_chunk_start" });
    if (chunkIndex < 0 || chunkIndex >= meta.totalChunks)
      return sendJson(res, 400, { error: "chunk_out_of_range" });
    if (expectedLen <= 0 || expectedLen > meta.chunkSize)
      return sendJson(res, 400, { error: "invalid_chunk_length" });

    // Write request stream directly to disk using random-access writes.
    const filePath = store.dataFilePath(uploadId);

    const fd: number = await new Promise((resolve, reject) => {
      fs.open(filePath, "r+", (err, openedFd) => {
        if (err) return reject(err);
        resolve(openedFd);
      });
    });

    let wrote = 0;
    let aborted = false;

    const closeFd = async () => {
      await new Promise<void>((resolve) => fs.close(fd, () => resolve()));
    };

    req.on("aborted", () => {
      aborted = true;
    });

    try {
      await new Promise<void>((resolve, reject) => {
        let pendingWrites = 0;
        let ended = false;

        const maybeDone = () => {
          if (ended && pendingWrites === 0) resolve();
        };

        req.on("data", (buf: Buffer) => {
          req.pause();
          if (aborted) return;

          if (wrote >= expectedLen) {
            req.resume();
            return;
          }

          // Ensure we don't write past the declared range even if client misbehaves.
          const remaining = expectedLen - wrote;
          const toWrite =
            buf.length > remaining ? buf.subarray(0, remaining) : buf;

          pendingWrites++;
          fs.write(
            fd,
            toWrite,
            0,
            toWrite.length,
            startByte + wrote,
            (err, bytesWritten) => {
              if (err) return reject(err);
              wrote += bytesWritten;
              pendingWrites--;
              req.resume();
              maybeDone();
            }
          );
        });

        req.on("end", () => {
          ended = true;
          maybeDone();
        });
        req.on("error", (e) => reject(e));
      });

      if (wrote !== expectedLen) {
        return sendJson(res, 400, {
          error: "chunk_length_mismatch",
          expected: expectedLen,
          wrote,
        });
      }

      // Mark received (duplicate uploads are fine: overwrite is safe)
      await store.markChunkReceived(uploadId, chunkIndex);

      // Return a simple integrity token for the chunk (optional)
      const etag = crypto
        .createHash("sha256")
        .update(String(startByte))
        .update(String(endInclusive))
        .digest("hex");
      res.setHeader("etag", etag);
      return sendJson(res, 200, { ok: true, chunkIndex });
    } catch (e: any) {
      return sendJson(res, 500, {
        error: "write_failed",
        details: String(e?.message ?? e),
      });
    } finally {
      await closeFd();
    }
  });

  app.post(
    "/api/uploads/:id/complete",
    express.json({ limit: "64kb" }),
    async (req, res) => {
      const uploadId = req.params.id;
      const meta = await store.getMeta(uploadId);
      if (!meta) return sendJson(res, 404, { error: "not_found" });

      const clientSha256 = (
        req.body?.sha256 as string | undefined
      )?.toLowerCase();
      if (!clientSha256 || !/^[0-9a-f]{64}$/.test(clientSha256))
        return sendJson(res, 400, { error: "sha256_required" });

      const allReceived = await store.verifyAllReceived(uploadId);
      if (!allReceived) return sendJson(res, 409, { error: "missing_chunks" });

      const sizeOk = await store.verifyFileSize(uploadId);
      if (!sizeOk) return sendJson(res, 409, { error: "size_mismatch" });

      const serverSha256 = (
        await store.computeSha256Hex(uploadId)
      ).toLowerCase();
      if (serverSha256 !== clientSha256) {
        return sendJson(res, 409, { error: "sha256_mismatch", serverSha256 });
      }

      await store.markComplete(uploadId);
      return sendJson(res, 200, { ok: true, uploadId, sha256: serverSha256 });
    }
  );

  // SPA fallback
  app.get("*", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"), (err) => {
      if (err) res.status(404).send("Not Found");
    });
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`resumable-upload-backend listening on :${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
