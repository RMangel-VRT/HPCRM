import { useCallback, useRef, useState } from "react";

export type UploadStatus = "idle" | "uploading" | "done";

export interface UploadFailure {
  fileName: string;
  message: string;
}

export interface BatchUploadProgress {
  total: number;
  done: number;
  failed: UploadFailure[];
  status: UploadStatus;
}

export interface UseBatchPhotoUploadOptions {
  /** Per-file uploader. Should resolve on success and reject on failure. */
  uploadOne: (file: File) => Promise<void>;
  /** Maximum concurrent uploads. Defaults to 3. */
  concurrency?: number;
  /** Called once per file after success or failure (cumulative). */
  onProgress?: (progress: BatchUploadProgress) => void;
  /** Called once after every file finishes (success or failure). */
  onSettled?: (progress: BatchUploadProgress) => void;
}

export interface UseBatchPhotoUploadResult {
  upload: (files: File[]) => Promise<BatchUploadProgress>;
  progress: BatchUploadProgress;
}

const INITIAL: BatchUploadProgress = { total: 0, done: 0, failed: [], status: "idle" };

/**
 * Uploads a batch of files concurrently with a fixed limit.
 *
 * Failures are collected per-file and the batch never aborts early — every
 * file is attempted exactly once. The returned promise always resolves with
 * a final progress snapshot, never rejects.
 */
export function useBatchPhotoUpload({
  uploadOne,
  concurrency = 3,
  onProgress,
  onSettled,
}: UseBatchPhotoUploadOptions): UseBatchPhotoUploadResult {
  const [progress, setProgress] = useState<BatchUploadProgress>(INITIAL);
  const stateRef = useRef<BatchUploadProgress>(INITIAL);

  const update = useCallback(
    (next: BatchUploadProgress) => {
      stateRef.current = next;
      setProgress(next);
      onProgress?.(next);
    },
    [onProgress],
  );

  const upload = useCallback(
    async (files: File[]): Promise<BatchUploadProgress> => {
      if (files.length === 0) return stateRef.current;
      update({ total: files.length, done: 0, failed: [], status: "uploading" });

      let cursor = 0;
      const limit = Math.max(1, Math.min(concurrency, files.length));

      const worker = async (): Promise<void> => {
        while (true) {
          const idx = cursor++;
          if (idx >= files.length) return;
          const file = files[idx];
          try {
            await uploadOne(file);
            update({
              ...stateRef.current,
              done: stateRef.current.done + 1,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            update({
              ...stateRef.current,
              done: stateRef.current.done + 1,
              failed: [...stateRef.current.failed, { fileName: file.name, message }],
            });
          }
        }
      };

      await Promise.all(Array.from({ length: limit }, () => worker()));

      const finalState: BatchUploadProgress = {
        ...stateRef.current,
        status: "done",
      };
      stateRef.current = finalState;
      setProgress(finalState);
      onSettled?.(finalState);
      return finalState;
    },
    [uploadOne, concurrency, update, onSettled],
  );

  return { upload, progress };
}
