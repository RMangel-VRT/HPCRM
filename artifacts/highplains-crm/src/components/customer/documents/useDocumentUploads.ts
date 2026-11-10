import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  baseName, documentErrorText, initialCategory, precheckFile, readCategoryPref,
  type CustomerDocumentDto,
} from "./documentModel";
import { invalidateCustomerDocuments, useDocumentScope } from "./useCustomerDocuments";

export type UploadStatus = "queued" | "uploading" | "saving" | "done" | "error";
export interface UploadItem {
  key: string;
  fileName: string;
  size: number;
  progress: number;
  status: UploadStatus;
  error?: string;
}

/** PUT bytes straight to the signed URL so the browser reports real progress. */
export function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`${xhr.status}: ${xhr.responseText || "{}"}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("network"));
    xhr.send(file);
  });
}

let seq = 0;

/**
 * Batch upload: upload-url -> XHR PUT -> finalize with filename + preferred category.
 * Files run independently so one failure never blocks the others. Finalized documents
 * are handed to `onUploaded` for the post-upload metadata sheet.
 */
export function useDocumentUploads(customerId: string, onUploaded: (docs: CustomerDocumentDto[], started: string) => void) {
  const { t } = useTranslation();
  const scope = useDocumentScope();
  const [items, setItems] = useState<UploadItem[]>([]);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const update = (key: string, p: Partial<UploadItem>) => setItems(prev => prev.map(i => (i.key === key ? { ...i, ...p } : i)));

  const start = useCallback(async (files: File[]) => {
    const s = scopeRef.current;
    const started = s.snapshot();
    const pref = readCategoryPref(s.companyId, s.userId);
    const base = `/api/customers/${encodeURIComponent(customerId)}/documents`;
    const batch = files.map(f => ({ file: f, key: `u${++seq}` }));
    setItems(prev => [...prev.filter(i => i.status !== "done"), ...batch.map(b => ({
      key: b.key, fileName: b.file.name, size: b.file.size, progress: 0, status: "queued" as UploadStatus,
    }))]);

    const results = await Promise.all(batch.map(async ({ file, key }): Promise<CustomerDocumentDto | null> => {
      const reject = precheckFile(file);
      if (reject) { update(key, { status: "error", error: t(`cp5.documents.errors.${reject}`) }); return null; }
      try {
        update(key, { status: "uploading" });
        const urlRes = await s.request("POST", `${base}/upload-url`, { fileName: file.name, contentType: file.type || undefined, fileSize: file.size });
        const { uploadURL, uploadToken } = await urlRes.json() as { uploadURL: string; objectPath: string; uploadToken: string };
        s.assertSame(started);
        await putWithProgress(uploadURL, file, pct => update(key, { progress: pct }));
        s.assertSame(started);
        update(key, { status: "saving", progress: 100 });
        const res = await s.request("POST", base, { uploadToken, name: baseName(file.name), category: initialCategory(file, pref), note: null });
        const doc = await res.json() as CustomerDocumentDto;
        s.assertSame(started);
        update(key, { status: "done" });
        return doc;
      } catch (err) {
        update(key, { status: "error", error: documentErrorText(err, t) });
        return null;
      }
    }));
    const created = results.filter((d): d is CustomerDocumentDto => !!d);
    if (created.length) {
      void invalidateCustomerDocuments(customerId);
      if (scopeRef.current.snapshot() === started) onUploadedRef.current(created, started);
    }
  }, [customerId, t]);

  const dismiss = useCallback((key: string) => setItems(prev => prev.filter(i => i.key !== key)), []);
  const clearFinished = useCallback(() => setItems(prev => prev.filter(i => i.status !== "done" && i.status !== "error")), []);
  const busy = items.some(i => i.status === "queued" || i.status === "uploading" || i.status === "saving");
  return { items, start, dismiss, clearFinished, busy };
}
