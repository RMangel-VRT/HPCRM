import type { QueryClient } from "@tanstack/react-query";
import type { EstimateDetailDto } from "@shared/schema";
import { advanceLinkedTicket, ticketRequest } from "./advanceLinkedTicket";
import { ESTIMATES_API, conflictOf, errorStatus, sendEstimate, type LifecycleConflict } from "./estimateBuilder";
import type { ActivationResponse } from "@/components/customerWizard/CustomerActivationDialog";

export type EstimateLifecycleKind = "send" | "accept" | "decline" | "revise" | "discard" | "void";
type Translate = (key: string, params?: Record<string, unknown>) => string;
export function estimateErrorText(err: unknown, t: Translate): string {
  const status = errorStatus(err);
  const code = conflictOf(err)?.error;
  if (code === "INVALID_PHOTO" || code === "PHOTO_UPLOAD_EXPIRED" || code === "PHOTO_UPLOAD_MISSING" ||
      String(err).includes("PHOTO_INVALID") || String(err).includes("PHOTO_PUT_FAILED"))
    return t("estimateBuilder.exhibits.uploadFailed");
  if (String(err).includes("PHOTO_TOO_LARGE")) return t("estimateBuilder.exhibits.fileHint");
  if (code === "INVALID_PHOTO_ORDER") return t("estimateBuilder.exhibits.orderChanged");
  if (status === 404) return t("estimateBuilder.notFound");
  if (status === 409) {
    if (conflictOf(err)?.error === "ESTIMATE_LINE_CHANGED") return t("estimateBuilder.lineEdit.resetStale");
    return /void/i.test(String(err)) ? t("estimateBuilder.voidedError") : t("estimateBuilder.conflict");
  }
  if (status === 422) return t("estimateBuilder.err.unprocessable");
  if (status === 400) return t(conflictOf(err)?.error === "INVALID_ESTIMATE_ORDER" ? "estimateBuilder.lineEdit.invalidOrder" : "estimateBuilder.err.invalid");
  return t("estimateBuilder.err.generic");
}

export type EstimateLifecycleResult =
  | { kind: "success"; data: EstimateDetailDto }
  | { kind: "stale" }
  | { kind: "needsPrice"; lineIds: string[] }
  | { kind: "error"; message: string; status: number | null; conflict: LifecycleConflict | null };

interface Options {
  kind: EstimateLifecycleKind; method: string; url: string; body?: unknown; companyId: string;
  queryClient: QueryClient; isActive: () => boolean; t: Translate;
  toast: (args: { title: string; description?: string; variant?: "destructive" }) => void;
  offerActivation: (data: EstimateDetailDto & ActivationResponse, name: string) => void; customerName: string;
  install?: (data: EstimateDetailDto) => Promise<boolean>;
  onCommitted?: () => void;
  email?: { to: string[]; resend: boolean };
}

/** One lifecycle request/effects contract for builder and action list.
 * Callers own their synchronous busy lock and viewed-version gate; this routine
 * checks the captured scope before every follow-on write or visible side effect.
 */
export async function runEstimateLifecycle(o: Options): Promise<EstimateLifecycleResult> {
  const { queryClient: qc, t } = o;
  if (!o.isActive()) return { kind: "stale" };
  try {
    const data = o.email?.resend
      ? await sendEstimate(o.method, o.url, o.companyId, o.body, undefined, true)
      : await sendEstimate(o.method, o.url, o.companyId, o.body);
    if (o.email && data.emailed !== true) throw new Error("Missing estimate email acknowledgement");
    if (o.email) {
      void qc.invalidateQueries({ queryKey: ["/api/customers", data.customerId, "communications"] });
      void qc.invalidateQueries({ queryKey: ["/api/communications"] });
      void qc.invalidateQueries({ queryKey: ["/api/conversations"] });
    }
    void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "list"] });
    // Mark inactive builder caches stale without refetching over a live editor.
    void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "detail"], refetchType: "none" });
    void qc.invalidateQueries({ queryKey: ["/api/estimates/board"] });
    if (!o.isActive()) return { kind: "stale" };
    if (o.install && !(await o.install(data))) return { kind: "stale" };
    if (!o.isActive()) return { kind: "stale" };
    o.onCommitted?.();
    o.toast({ title: o.email ? t("estimateBuilder.email.sentTo", { to: o.email.to.join(", ") }) : t(`estimateBuilder.life.done.${o.kind}`) });
    if (o.kind === "accept") o.offerActivation(data, data.display?.customerName ?? o.customerName);
    if (!o.email?.resend && ["send", "accept", "decline"].includes(o.kind) && data.ticketId) {
      const result = await advanceLinkedTicket(data, ticketRequest(o.companyId, o.isActive));
      // Invalidate even when navigation happened during advancement. Its PATCH
      // may have committed, and the destination ticket must not retain old data.
      void qc.invalidateQueries({ queryKey: ["estimate-ticket-recovery"] });
      void qc.invalidateQueries({ queryKey: ["/api/tickets"] });
      if (o.isActive() && result.moved && !result.reason)
        o.toast({ title: t("estimateTicket.moved", { number: result.ticketNumber, status: result.statusName }) });
      else if (o.isActive() && result.message)
        o.toast({ title: t("tickets.unexpectedError"), description: result.message, variant: "destructive" });
    }
    void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "by-ticket"] });
    // Advancement changes board placement/follow-up, so refresh again after it.
    void qc.invalidateQueries({ queryKey: ["/api/estimates/board"] });
    return o.isActive() ? { kind: "success", data } : { kind: "stale" };
  } catch (err) {
    if (!o.isActive()) return { kind: "stale" };
    const conflict = conflictOf(err);
    if (o.kind === "send" && conflict?.error === "LINES_NEED_PRICE" && conflict.lineIds?.length)
      return { kind: "needsPrice", lineIds: conflict.lineIds };
    const status = errorStatus(err);
    if (status === 409 || status === 404) {
      void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "detail"] });
      void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "by-ticket"] });
      void qc.invalidateQueries({ queryKey: ["/api/estimates/board"] });
      void qc.invalidateQueries({ queryKey: ["/api/tickets"] });
      void qc.invalidateQueries({ queryKey: ["estimate-ticket-recovery"] });
    }
    const known = conflict && ["DRAFT_EXISTS", "INVALID_TRANSITION", "NO_LINES", "HAS_ACCEPTED_VERSION", "ESTIMATE_VOIDED", "CONFLICT", "LINES_NEED_PRICE"].includes(conflict.error);
    if (o.email && !known) {
      const code = conflict?.error;
      const emailErrors = ["ESTIMATE_EMAIL_IN_PROGRESS", "ESTIMATE_EMAIL_MAILBOX_UNAVAILABLE", "ESTIMATE_EMAIL_QUOTA",
        "ESTIMATE_EMAIL_RECONNECT", "ESTIMATE_EMAIL_INVALID_RECIPIENT", "ESTIMATE_EMAIL_DELIVERY_UNCERTAIN", "ESTIMATE_EMAIL_ORIGINAL_UNAVAILABLE",
        "ESTIMATE_EMAIL_THREAD_CHANGED",
        "ESTIMATE_EMAIL_PDF_UNAVAILABLE", "DOCUMENT_RENDERER_UNAVAILABLE", "ESTIMATE_EMAIL_TOO_LARGE"];
      return { kind: "error", message: t(`estimateBuilder.email.errors.${code && emailErrors.includes(code) ? code : "unknown"}`), status, conflict };
    }
    return { kind: "error", message: known ? t(`estimateBuilder.life.err.${conflict.error}`) : estimateErrorText(err, t), status, conflict };
  }
}
