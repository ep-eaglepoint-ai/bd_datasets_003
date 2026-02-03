import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { encodeBitmapBase64 } from "./bitmap.js";
import type { UploadMeta, UploadStatusResponse } from "./types.js";

export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

function safeId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function metaPath(rootDir: string, uploadId: string): string {
  return path.join(rootDir, uploadId, "meta.json");
}

function dataPath(rootDir: string, uploadId: string): string {
  return path.join(rootDir, uploadId, "data.bin");
}

function dirPath(rootDir: string, uploadId: string): string {
  return path.join(rootDir, uploadId);
}

async function atomicWriteJson(
  filePath: string,
  value: unknown
): Promise<void> {
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tmp, filePath);
}

export class UploadStore {
  private rootDir: string;
  private metaWriteChains = new Map<string, Promise<void>>();

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async ensureRoot(): Promise<void> {
    await fsp.mkdir(this.rootDir, { recursive: true });
  }

  async createUpload(
    fileName: string,
    totalSize: number,
    chunkSize = DEFAULT_CHUNK_SIZE
  ): Promise<UploadMeta> {
    const id = safeId();
    const totalChunks = Math.ceil(totalSize / chunkSize);
    const now = Date.now();

    await fsp.mkdir(dirPath(this.rootDir, id), { recursive: true });

    const meta: UploadMeta = {
      id,
      fileName,
      totalSize,
      chunkSize,
      totalChunks,
      received: new Array<boolean>(totalChunks).fill(false),
      state: "in_progress",
      createdAtMs: now,
      updatedAtMs: now,
    };

    const dataFile = dataPath(this.rootDir, id);
    const fd = await fsp.open(dataFile, "w+");
    try {
      await fd.truncate(totalSize);
    } finally {
      await fd.close();
    }

    await atomicWriteJson(metaPath(this.rootDir, id), meta);
    return meta;
  }

  async getMeta(uploadId: string): Promise<UploadMeta | null> {
    try {
      const raw = await fsp.readFile(metaPath(this.rootDir, uploadId), "utf8");
      return JSON.parse(raw) as UploadMeta;
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      throw e;
    }
  }

  async getStatus(uploadId: string): Promise<UploadStatusResponse | null> {
    const meta = await this.getMeta(uploadId);
    if (!meta) return null;
    const receivedCount = meta.received.reduce((a, b) => a + (b ? 1 : 0), 0);
    return {
      id: meta.id,
      state: meta.state,
      totalSize: meta.totalSize,
      chunkSize: meta.chunkSize,
      totalChunks: meta.totalChunks,
      receivedCount,
      receivedBitmapBase64: encodeBitmapBase64(meta.received),
    };
  }

  async markChunkReceived(uploadId: string, chunkIndex: number): Promise<void> {
    await this.enqueueMetaWrite(uploadId, async () => {
      const meta = await this.getMeta(uploadId);
      if (!meta) throw new Error("upload_not_found");
      if (meta.state === "complete") return;
      if (chunkIndex < 0 || chunkIndex >= meta.totalChunks)
        throw new Error("chunk_out_of_range");
      if (!meta.received[chunkIndex]) {
        meta.received[chunkIndex] = true;
        meta.updatedAtMs = Date.now();
        await atomicWriteJson(metaPath(this.rootDir, uploadId), meta);
      }
    });
  }

  async markComplete(uploadId: string): Promise<void> {
    await this.enqueueMetaWrite(uploadId, async () => {
      const meta = await this.getMeta(uploadId);
      if (!meta) throw new Error("upload_not_found");
      meta.state = "complete";
      meta.updatedAtMs = Date.now();
      await atomicWriteJson(metaPath(this.rootDir, uploadId), meta);
    });
  }

  dataFilePath(uploadId: string): string {
    return dataPath(this.rootDir, uploadId);
  }

  private enqueueMetaWrite(
    uploadId: string,
    fn: () => Promise<void>
  ): Promise<void> {
    const prev = this.metaWriteChains.get(uploadId) ?? Promise.resolve();
    const next = prev
      .catch(() => {
        // keep chain alive
      })
      .then(fn);
    this.metaWriteChains.set(uploadId, next);
    return next;
  }

  async computeSha256Hex(uploadId: string): Promise<string> {
    const file = this.dataFilePath(uploadId);
    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(file);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    return hash.digest("hex");
  }

  async verifyAllReceived(uploadId: string): Promise<boolean> {
    const meta = await this.getMeta(uploadId);
    if (!meta) return false;
    return meta.received.every(Boolean);
  }

  async verifyFileSize(uploadId: string): Promise<boolean> {
    const meta = await this.getMeta(uploadId);
    if (!meta) return false;
    const st = await fsp.stat(this.dataFilePath(uploadId));
    return st.size === meta.totalSize;
  }
}
