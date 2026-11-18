import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { companyRequest, previewable, type CompanyDocumentDto } from "./companyDocumentsApi";
import { FileTile } from "./bits";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Render only pixels: Chromium's built-in PDF plugin cannot run under CSP sandbox.
 * Bytes still come from the access-checking no-store route, never a signed GET URL.
 */
export function DocumentPreview({ doc, companyId }: { doc: CompanyDocumentDto; companyId: string }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const kind = previewable(doc.currentFile?.fileType, doc.currentFile?.fileName);
  useEffect(() => {
    let disposed = false, objectUrl: string | undefined;
    let task: { destroy: () => Promise<void> } | undefined;
    const controller = new AbortController();
    setPdf(null); setImage(null); setPage(1); setFailed(false); setLoading(true);
    void (async () => {
      if (!kind) { setLoading(false); return; }
      const response = await companyRequest(companyId, "GET", doc.openUrl, undefined, controller.signal);
      if (kind === "image") {
        const blob = await response.blob();
        if (!disposed) { objectUrl = URL.createObjectURL(blob); setImage(objectUrl); setLoading(false); }
      } else {
        const bytes = await response.arrayBuffer();
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
        if (disposed) return;
        const loadingTask = getDocument({ data: new Uint8Array(bytes), enableXfa: false, useSystemFonts: true });
        task = loadingTask;
        const document = await loadingTask.promise;
        if (!disposed) { setPdf(document); setLoading(false); }
      }
    })().catch(() => { if (!disposed) { setFailed(true); setLoading(false); } });
    return () => { disposed = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); void task?.destroy(); };
  }, [companyId, doc.id, doc.openUrl, doc.currentFile?.uploadedAt, kind]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let disposed = false;
    let render: { cancel: () => void; promise: Promise<void> } | undefined;
    void (async () => {
      const pdfPage = await pdf.getPage(page);
      if (disposed || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: 1 });
      const scaled = pdfPage.getViewport({ scale: Math.min(1.5, 800 / viewport.width) });
      canvas.current.width = scaled.width; canvas.current.height = scaled.height;
      render = pdfPage.render({ canvas: canvas.current, viewport: scaled });
      await render.promise;
    })().catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; render?.cancel(); };
  }, [pdf, page]);
  return <div className="mb-3.5 flex h-[280px] flex-col overflow-hidden rounded-[10px] border bg-card" data-testid="preview-company-document">
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto">
      {loading ? <Skeleton className="h-full w-full" /> : failed
        ? <p role="status" className="p-4 text-sm text-muted-foreground">{t("companyDocuments.preview.unavailable")}</p>
        : kind === "image" && image ? <img src={image} alt={doc.name} className="max-h-full max-w-full object-contain" />
          : kind === "pdf" ? <canvas ref={canvas} aria-label={doc.name} className="max-h-full max-w-full object-contain" />
            : <FileTile fileName={doc.currentFile?.fileName} fileType={doc.currentFile?.fileType} size="lg" />}
    </div>
    {pdf && pdf.numPages > 1 && <div className="flex items-center justify-center gap-2 border-t p-1 text-xs">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("companyDocuments.preview.previous")}</Button>
      <span>{t("companyDocuments.preview.page", { page, total: pdf.numPages })}</span>
      <Button size="sm" variant="ghost" disabled={page >= pdf.numPages} onClick={() => setPage(page + 1)}>{t("companyDocuments.preview.next")}</Button>
    </div>}
  </div>;
}
