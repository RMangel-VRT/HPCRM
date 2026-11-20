import { ESTIMATE_PHOTO_MAX_BYTES } from "../../../../lib/db/src/estimateContracts";
import { apiRequest } from "./queryClient";
import { companyHeaders } from "./hardscapeCatalog";
import { errorStatus, sendEstimate } from "./estimateBuilder";
import type { EstimateEdit } from "./estimateRevision";

export const isHeicPhoto = (file: File) => /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
export const isEstimatePhoto = (file: File) => file.type.startsWith("image/") || isHeicPhoto(file);
async function preparePhoto(file: File, signal?: AbortSignal) {
  if (isHeicPhoto(file)) {
    const converted = await fetch("/api/convert-heic", {
      method: "POST", credentials: "same-origin", signal, body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!converted.ok) throw new Error("PHOTO_INVALID");
    file = new File([await converted.blob()], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
  }
  // Match the proposal uploader's compression and preserve server validation
  // when the browser cannot decode a format.
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    try {
      if (!ctx) return file;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } finally { bitmap.close(); }
    const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return jpeg ? new File([jpeg], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

export async function executeEstimateEdit(edit: EstimateEdit, companyId: string, signal?: AbortSignal, active = () => true) {
  if (!edit.photoFiles) return { detail: await sendEstimate(edit.method, edit.url, companyId, edit.body, signal), failedPhotos: 0 };
  let detail: Awaited<ReturnType<typeof sendEstimate>> | undefined;
  let lastError: unknown;
  let saved = 0;
  for (const raw of edit.photoFiles) {
    if (signal?.aborted || !active()) break;
    try {
      const file = await preparePhoto(raw, signal);
      if (signal?.aborted || !active()) break;
      if (!file.size || file.size > ESTIMATE_PHOTO_MAX_BYTES) throw new Error("PHOTO_TOO_LARGE");
      const signing = await apiRequest("POST", `${edit.url}/upload-url`, { filename: file.name, mimeType: file.type, fileSize: file.size },
        { headers: companyHeaders(companyId), signal });
      const { uploadUrl, uploadToken } = await signing.json() as { uploadUrl: string; uploadToken: string };
      if (signal?.aborted || !active()) break;
      const uploaded = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type }, signal });
      if (!uploaded.ok) throw new Error("PHOTO_PUT_FAILED");
      if (signal?.aborted || !active()) break;
      detail = await sendEstimate("POST", edit.url, companyId, { uploadToken }, signal);
      saved++;
    } catch (error) {
      lastError = error;
      if (errorStatus(error) === 409 || errorStatus(error) === 403 || signal?.aborted) break;
    }
  }
  if (!detail) throw lastError ?? new Error("PHOTO_UPLOAD_CANCELLED");
  return { detail, failedPhotos: edit.photoFiles.length - saved };
}
