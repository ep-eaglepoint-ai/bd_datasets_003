export interface Chunk {
  index: number;
  start: number;
  endExclusive: number;
  size: number;
}

export type UploadState = "idle" | "uploading" | "complete" | "error";

export interface UploadStatus {
  uploadId: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  received: boolean[];
  state: UploadState;
  uploadedChunks: number;
}

export interface WorkerQueue {
  readonly concurrency: number;
  add<T>(task: () => Promise<T>): Promise<T>;
  onIdle(): Promise<void>;
}
