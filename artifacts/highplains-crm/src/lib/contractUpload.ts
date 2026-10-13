import { apiRequest } from "@/lib/queryClient";

export const CONTRACT_MAX_BYTES = 20 * 1024 * 1024;

export interface ContractUploadOptions {
  /** MIME types accepted; default is PDF only (legacy customer behavior). */
  allowedTypes?: string[];
  maxBytes?: number;
  /** Content-Type sent to storage. Legacy uploads always send application/pdf. */
  putContentType?: string;
}

export function validateContractFile(file: { type: string; size: number }, opts: ContractUploadOptions = {}): "type" | "size" | null {
  const allowed = opts.allowedTypes ?? ["application/pdf"];
  if (!allowed.includes(file.type)) return "type";
  if (file.size > (opts.maxBytes ?? CONTRACT_MAX_BYTES)) return "size";
  return null;
}

/** Signed-URL upload shared by the customer page and the Contract Center. */
export async function uploadContractFile(args: {
  file: File;
  uploadUrlPath: string;
  registerPath: string;
  extraBody?: Record<string, unknown>;
  options?: ContractUploadOptions;
}): Promise<unknown> {
  const { file, uploadUrlPath, registerPath, extraBody, options } = args;
  const urlResponse = await apiRequest("POST", uploadUrlPath);
  const { uploadURL } = await urlResponse.json();
  const put = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": options?.putContentType ?? "application/pdf" },
  });
  if (!put.ok) throw new Error("Upload failed");
  const registered = await apiRequest("POST", registerPath, {
    uploadURL,
    filename: file.name,
    fileSize: file.size,
    mimeType: file.type,
    ...extraBody,
  });
  return registered.json().catch(() => null);
}
