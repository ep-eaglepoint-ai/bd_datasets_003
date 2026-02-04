export interface UploadInitRequest {
  fileName: string;
  totalSize: number;
}

export type UploadState = "in_progress" | "complete";

export interface UploadMeta {
  id: string;
  fileName: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  received: boolean[];
  state: UploadState;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UploadStatusResponse {
  id: string;
  state: UploadState;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  receivedCount: number;
  receivedBitmapBase64: string;
}
