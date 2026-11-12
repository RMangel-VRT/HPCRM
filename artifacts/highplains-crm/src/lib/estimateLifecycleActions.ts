import type { QueryClient } from "@tanstack/react-query";
import type { EstimateDetailDto } from "@shared/schema";
import { advanceLinkedTicket, ticketRequest } from "./advanceLinkedTicket";
import { ESTIMATES_API, conflictOf, errorStatus, sendEstimate, type LifecycleConflict } from "./estimateBuilder";
import type { ActivationResponse } from "@/components/customerWizard/CustomerActivationDialog";

export type EstimateLifecycleKind = "send" | "accept" | "decline" | "revise" | "discard" | "void";
type Translate = (key: string, params?: Record<string, unknown>) => string;
export function estimateErrorText(err: unknown, t: Translate): string {
  const status = errorStatus(err);
  if (status === 404) return t("estimateBuilder.notFound");
  if (status === 409) return /void/i.test(String(err)) ? t("estimateBuilder.voidedError") : t("estimateBuilder.conflict");
  if (status === 422) return t("estimateBuilder.err.unprocessable");
  if (status === 400) return t("estimateBuilder.err.invalid");
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
}

/** One lifecycle request/effects contract for builder and action list.
 * Callers own their synchronous busy lock and viewed-version gate; this routine
 * checks the captured scope before every follow-on write or visible side effect.
 */
export async function runEstimateLifecycle(o: Options): Promise<EstimateLifecycleResult> {
  const { queryClient: qc, t } = o;
  if (!o.isActive()) return { kind: "stale" };
  try {
    const data = await sendEstimate(o.method, o.url, o.companyId, o.body);
    void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "list"] });
    // Mark inactive builder caches stale without refetching over a live editor.
    void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "detail"], refetchType: "none" });
    void qc.invalidateQueries({ queryKey: ["/api/estimates/board"] });
    if (!o.isActive()) return { kind: "stale" };
    if (o.install && !(await o.install(data))) return { kind: "stale" };
    if (!o.isActive()) return { kind: "stale" };
    o.onCommitted?.();
    o.toast({ title: t(`estimateBuilder.life.done.${o.kind}`) });
    if (o.kind === "accept") o.offerActivation(data, data.display?.customerName ?? o.customerName);
    if (["send", "accept", "decline"].includes(o.kind) && data.ticketId) {
      const result = await advanceLinkedTicket(data, ticketRequest(o.companyId, o.isActive));
      // Invalidate even when navigation happened during advancement. Its PATCH
      // may have committed, and the destination ticket must not retain old data.
      void qc.invalidateQueries({ queryKey: ["estimate-ticket-recovery"] });
      void qc.invalidateQueries({ queryKey: ["/api/tickets"] });
      if (o.isActive() && result.moved && !result.reason)
        o.toast({ title: t("estimateTicket.moved", { number: result.ticketNumber, status: result.statusName }) });
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
    return { kind: "error", message: known ? t(`estimateBuilder.life.err.${conflict.error}`) : estimateErrorText(err, t), status, conflict };
  }
}
