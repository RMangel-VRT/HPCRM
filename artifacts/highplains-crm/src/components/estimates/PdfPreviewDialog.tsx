import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Download, ExternalLink, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { ESTIMATES_API } from "@/lib/estimateBuilder";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function estimatePdfUrl(estimateId: string, versionId: string): string {
  return `${ESTIMATES_API}/${encodeURIComponent(estimateId)}/versions/${encodeURIComponent(versionId)}/pdf`;
}

type State = { kind: "loading" } | { kind: "error"; unavailable?: boolean } | { kind: "ready"; url: string };

/**
 * Previews the viewed version's PDF. The blob is fetched with the captured X-Company-Id; every
 * object URL is revoked on close / version change / unmount, and stale responses are dropped.
 */
export function PdfPreviewDialog(props: {
  open: boolean; onClose: () => void; companyId: string; estimateId: string; versionId: string;
  estimateNumber: string; versionNumber: number; draft: boolean;
}) {
  const { t } = useTranslation();
  const { open, companyId, estimateId, versionId } = props;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const urlRef = useRef<string | null>(null);
  const filename = `${props.estimateNumber}-v${props.versionNumber}.pdf`;

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    let alive = true;
    let created: string | null = null;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await apiRequest("GET", estimatePdfUrl(estimateId, versionId), undefined, { headers: companyHeaders(companyId), signal: ctrl.signal });
        const blob = await res.blob();
        if (!alive) return;
        created = URL.createObjectURL(blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }));
        urlRef.current = created;
        setState({ kind: "ready", url: created });
      } catch (error) {
        // apiRequest preserves status and JSON in its Error message.
        let unavailable = false;
        if (error instanceof Error && error.message.startsWith("503: ")) {
          try { unavailable = JSON.parse(error.message.slice(5)).error === "DOCUMENT_RENDERER_UNAVAILABLE"; } catch { /* Other 503s retain the generic error. */ }
        }
        if (alive) setState({ kind: "error", unavailable });
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
      if (created) { URL.revokeObjectURL(created); if (urlRef.current === created) urlRef.current = null; }
    };
  }, [open, companyId, estimateId, versionId, attempt]);

  function download() {
    if (state.kind !== "ready") return;
    const a = document.createElement("a");
    a.href = state.url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }
  function openTab() {
    if (state.kind !== "ready") return;
    window.open(state.url, "_blank", "noopener");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) props.onClose(); }}>
      <DialogContent className="flex h-[min(88dvh,960px)] max-w-4xl flex-col gap-3" data-testid="dialog-pdf-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-[hsl(var(--rail-active-icon))]" />
            {t("estimateBuilder.pdf.title", { number: props.estimateNumber, n: props.versionNumber })}</DialogTitle>
          <DialogDescription data-testid="text-pdf-hint">{props.draft ? t("estimateBuilder.pdf.draftHint") : t("estimateBuilder.pdf.desc")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/40">
          {state.kind === "loading" && (
            <div role="status" aria-label={t("estimateBuilder.pdf.loading")} className="flex h-full flex-col items-center gap-3 p-8" data-testid="pdf-loading">
              <Skeleton className="h-full w-full max-w-[560px]" />
            </div>
          )}
          {state.kind === "error" && (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm" data-testid="pdf-error">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p>{t(state.unavailable ? "documents.engine.previewUnavailable" : "estimateBuilder.pdf.error")}</p>
              <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)} data-testid="button-pdf-retry">{t("estimateBuilder.retry")}</Button>
            </div>
          )}
          {state.kind === "ready" && (
            <iframe src={state.url} title={t("estimateBuilder.pdf.frame", { number: props.estimateNumber })} className="h-full w-full bg-background" data-testid="frame-pdf" />
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={props.onClose} data-testid="button-pdf-close">{t("estimateBuilder.pdf.close")}</Button>
          <Button variant="outline" disabled={state.kind !== "ready"} onClick={openTab} data-testid="button-pdf-open"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.pdf.open")}</Button>
          <Button disabled={state.kind !== "ready"} onClick={download} data-testid="button-pdf-download"><Download className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.pdf.download")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
