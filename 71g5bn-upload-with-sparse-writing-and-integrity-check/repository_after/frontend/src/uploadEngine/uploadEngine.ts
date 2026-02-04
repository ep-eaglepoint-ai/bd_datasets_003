import axios from "axios";
import { sha256 } from "@noble/hashes/sha256";
import type { Chunk, UploadStatus } from "./types";
import { PromiseWorkerQueue } from "./workerQueue";

const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CONCURRENCY = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  const base = 400;
  const cappedAttempt = Math.min(attempt, 6);
  const jitter = Math.floor(Math.random() * 200);
  return base * Math.pow(2, cappedAttempt) + jitter;
}

function fileKey(file: File): string {
  return `resumable:${file.name}:${file.size}:${file.lastModified}`;
}

function decodeBitmap(base64: string, bitLength: number): boolean[] {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const out = new Array<boolean>(bitLength).fill(false);
  for (let i = 0; i < bitLength; i++) {
    const byte = raw[i >> 3] ?? 0;
    out[i] = ((byte >> (i & 7)) & 1) === 1;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export class ResumableUploadEngine {
  async startOrResume(
    file: File,
    onProgress?: (st: UploadStatus) => void
  ): Promise<UploadStatus> {
    const key = fileKey(file);
    const existingUploadId = localStorage.getItem(key) ?? "";

    let uploadId = existingUploadId;
    let totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let received = new Array<boolean>(totalChunks).fill(false);

    if (uploadId) {
      const hs = await this.handshake(uploadId).catch(() => null);
      if (
        hs &&
        hs.totalSize === file.size &&
        hs.chunkSize === CHUNK_SIZE &&
        hs.totalChunks === totalChunks
      ) {
        received = hs.received;
      } else {
        uploadId = "";
      }
    }

    if (!uploadId) {
      const init = await axios.post("/api/uploads", {
        fileName: file.name,
        totalSize: file.size,
      });
      uploadId = init.data.uploadId as string;
      localStorage.setItem(key, uploadId);
      const hs = await this.handshake(uploadId);
      received = hs.received;
    }

    const status: UploadStatus = {
      uploadId,
      totalSize: file.size,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      received,
      state: "uploading",
      uploadedChunks: received.reduce((a, b) => a + (b ? 1 : 0), 0),
    };

    onProgress?.(status);

    const queue = new PromiseWorkerQueue(MAX_CONCURRENCY);

    // Rolling hash computed sequentially, independent from upload concurrency.
    const hasher = sha256.create();
    const hashingTask = (async () => {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const endExclusive = Math.min(file.size, start + CHUNK_SIZE);
        // eslint-disable-next-line no-await-in-loop
        const buf = new Uint8Array(
          await file.slice(start, endExclusive).arrayBuffer()
        );
        hasher.update(buf);
      }
    })();

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const endExclusive = Math.min(file.size, start + CHUNK_SIZE);
      const chunk: Chunk = {
        index: i,
        start,
        endExclusive,
        size: endExclusive - start,
      };

      if (received[i]) continue;

      queue.add(() => this.uploadChunkWithRetry(file, uploadId, chunk, 0));
    }

    await queue.onIdle();
    await hashingTask;

    // Re-handshake to confirm all received
    const finalHs = await this.handshake(uploadId);
    if (!finalHs.received.every(Boolean)) {
      status.state = "error";
      onProgress?.({ ...status, received: finalHs.received });
      throw new Error("server_missing_chunks");
    }

    const digestHex = toHex(hasher.digest());
    await axios.post(`/api/uploads/${uploadId}/complete`, {
      sha256: digestHex,
    });

    status.state = "complete";
    status.received = finalHs.received;
    status.uploadedChunks = finalHs.receivedCount;
    onProgress?.(status);
    return status;
  }

  private async handshake(uploadId: string): Promise<{
    totalSize: number;
    chunkSize: number;
    totalChunks: number;
    receivedCount: number;
    received: boolean[];
  }> {
    const res = await axios.head(`/api/uploads/${uploadId}`);
    const totalSize = Number(res.headers["x-total-size"]);
    const chunkSize = Number(res.headers["x-chunk-size"]);
    const totalChunks = Number(res.headers["x-total-chunks"]);
    const receivedCount = Number(res.headers["x-received-chunks"]);
    const bitmap = String(res.headers["x-received-bitmap"] ?? "");
    const received = decodeBitmap(bitmap, totalChunks);
    return { totalSize, chunkSize, totalChunks, receivedCount, received };
  }

  private async uploadChunkWithRetry(
    file: File,
    uploadId: string,
    chunk: Chunk,
    attempt: number
  ): Promise<void> {
    try {
      const blob = file.slice(chunk.start, chunk.endExclusive);
      const contentRange = `bytes ${chunk.start}-${chunk.endExclusive - 1}/${
        file.size
      }`;
      await axios.put(`/api/uploads/${uploadId}/chunk`, blob, {
        headers: {
          "content-type": "application/octet-stream",
          "content-range": contentRange,
        },
        timeout: 30_000,
      });
    } catch (e) {
      const nextAttempt = attempt + 1;
      if (nextAttempt > 6) throw e;
      await sleep(backoffMs(nextAttempt));
      return this.uploadChunkWithRetry(file, uploadId, chunk, nextAttempt);
    }
  }
}
