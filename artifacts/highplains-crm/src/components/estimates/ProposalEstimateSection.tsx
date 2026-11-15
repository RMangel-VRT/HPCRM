import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AlertTriangle, ExternalLink, FileText, Pencil, Repeat } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { builderPath, ESTIMATES_API, conflictOf, type EstimateDetailDto, type EstimateListItemDto } from "@/lib/estimateBuilder";
import { DocumentBadge, EstimateStatePill, IdentityHeaderCard, MetadataCell, MetadataStrip } from "./EstimateIdentityHeader";
import { PdfPreviewDialog } from "./PdfPreviewDialog";
import { TicketAdvanceNotice } from "./TicketAdvanceNotice";
import { useProposalLinkedEstimate, linkedEstimateTotalCents } from "./useProposalLinkedEstimate";
import type { ProposalWithDetails } from "@shared/schema";

const money = (cents: number | null | undefined, lang: string) =>
  cents == null ? "—" : (cents / 100).toLocaleString(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD" });

async function getJson<T>(url: string, companyId: string, signal?: AbortSignal): Promise<T> {
  const res = await apiRequest("GET", url, undefined, { headers: companyHeaders(companyId), signal });
  return res.json() as Promise<T>;
}

/** Estimate section at the top of the proposal editor (Slice 4.1). Never computes totals locally. */
export function ProposalEstimateSection({ proposal, companyId, active, onLinked, hideHeading = false }: {
  proposal: ProposalWithDetails; companyId: string; active: () => boolean; onLinked: () => void;
  /** P3: the numbered section strip names it, so the page hides the duplicate heading. */
  hideHeading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [choice, setChoice] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const alive = () => mounted.current && active();
  const scope = [companyId, user?.id, user?.activeRole] as const;
  const p = proposal as ProposalWithDetails & { ticketId?: string | null; customerId: string };
  const linkedSummary = proposal.estimate ?? null;
  const canRead = !!companyId && ["admin", "office"].includes(user?.accessRole ?? "");
  const ticketId = p.ticketId ?? null;

  const full = useProposalLinkedEstimate(proposal, companyId);

  const linked = full.data ? {
    id: full.data.id, number: full.data.estimateNumber, title: full.data.title,
    currentVersion: { id: full.data.version.id, versionNumber: full.data.version.versionNumber, status: full.data.version.status },
    subtotalCents: linkedEstimateTotalCents(full.data),
  } : linkedSummary;
  // P1: estimates are required; a linked draft proposal may switch to another eligible estimate of the same customer.
  const canSwitch = !!proposal.estimateId && (proposal.status ?? "draft") === "draft" && (proposal.versions?.length ?? 0) === 0;
  const list = useQuery<EstimateListItemDto[]>({
    queryKey: ["/api/estimates", "proposal-candidates", ...scope, p.customerId, ticketId],
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams({ customerId: p.customerId });
      if (ticketId) q.set("ticketId", ticketId);
      const body = await getJson<EstimateListItemDto[] | { items: EstimateListItemDto[] }>(`${ESTIMATES_API}?${q}`, companyId, signal);
      const rows = Array.isArray(body) ? body : body?.items ?? [];
      return rows.filter((e) => !e.voidedAt && e.id !== proposal.estimateId && (!ticketId || e.ticketId === ticketId));
    },
    enabled: canRead && canSwitch && !!p.customerId, staleTime: 0, retry: false,
  });

  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await fn(); }
    catch (err) {
      const code = conflictOf(err)?.error;
      const known = ["ESTIMATE_NOT_FOUND", "ESTIMATE_LINK_VOID", "ESTIMATE_CUSTOMER_MISMATCH", "ESTIMATE_TICKET_MISMATCH", "ESTIMATE_REQUIRED"].includes(code ?? "");
      if (alive()) toast({ title: t("proposalEstimate.error"), description: known ? t(`proposalEstimate.linkErrors.${code}`) : t("proposalEstimate.error"), variant: "destructive" });
    }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const switchTo = (estimateId: string) => run(async () => {
    if (!alive()) return;
    await apiRequest("PATCH", `/api/proposals/${encodeURIComponent(proposal.id)}`, { estimateId }, { headers: companyHeaders(companyId) });
    if (!alive()) return;
    setChoice("");
    await qc.invalidateQueries({ queryKey: ["/api/estimates"] });
    onLinked();
  });

  const header = hideHeading ? null : (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <FileText className="h-4 w-4 text-muted-foreground" />{t("proposalEstimate.title")}
    </div>
  );

  if (proposal.estimateId && !linked) return <section data-testid="section-proposal-estimate" className="space-y-2">
    {header}
    <div role={full.isError ? "alert" : "status"} className="rounded-md border p-3 text-sm">
      {t(full.isError ? "proposalEstimate.error" : "proposalEstimate.loading")}
      {full.isError && <Button size="sm" variant="outline" onClick={() => void full.refetch()}>{t("proposalEstimate.retry")}</Button>}
    </div>
  </section>;

  if (linked) {
    const v = linked.currentVersion;
    const voided = !!full.data?.voidedAt;
    return (
      <section className="space-y-2" data-testid="section-proposal-estimate">
        {header}
        <IdentityHeaderCard testId="card-proposal-estimate">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentBadge label={linked.number} testId="badge-proposal-estimate-number" />
            <span className="min-w-0 truncate text-sm font-medium">{linked.title}</span>
            {v ? (
              <EstimateStatePill status={v.status} voided={voided} testId="pill-proposal-estimate-status"
                label={`${t("proposalEstimate.version", { n: v.versionNumber })} · ${t(`estimateBuilder.status.${voided ? "void" : v.status}`)}`} />
            ) : <span className="text-xs text-muted-foreground" data-testid="text-proposal-estimate-unavailable">{t("proposalEstimate.unavailable")}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate(builderPath(linked.id))} data-testid="button-proposal-estimate-open">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("proposalEstimate.open")}</Button>
              <Button size="sm" variant="outline" disabled={!v} onClick={() => setPreview(true)} data-testid="button-proposal-estimate-preview">
                <FileText className="mr-1.5 h-3.5 w-3.5" />{t("proposalEstimate.preview")}</Button>
            </div>
          </div>
          <MetadataStrip testId="meta-proposal-estimate">
            <MetadataCell label={t("proposalEstimate.total")} testId="cell-proposal-estimate-total">
              <span className="font-mono tabular-nums" data-testid="text-proposal-estimate-total">{money(linked.subtotalCents, i18n.language)}</span>
            </MetadataCell>
          </MetadataStrip>
          <div className="mt-3 border-t pt-3" data-testid="section-proposal-estimate-scope">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("proposalP2.scopeTitle")}</span>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => navigate(builderPath(linked.id))} data-testid="link-edit-scope">
                <Pencil className="h-3 w-3" />{t("proposalP2.editInEstimate")}</button>
            </div>
            {full.isLoading ? <Skeleton className="h-12 w-full" data-testid="scope-loading" />
              : full.data?.version.scopeOfWork?.trim()
                ? <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90" data-testid="text-proposal-estimate-scope">{full.data.version.scopeOfWork}</p>
                : full.data ? <p className="text-sm text-muted-foreground" data-testid="text-proposal-estimate-scope-empty">{t("proposalP2.scopeEmpty")}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground" data-testid="text-scope-source">{t("proposalP2.scopeSource")}</p>
          </div>
          {canSwitch && (list.data?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t mt-3 pt-2.5" data-testid="row-proposal-estimate-switch">
              <span className="text-xs text-muted-foreground">{t("proposalP1.changeEstimate")}</span>
              <Select value={choice} onValueChange={setChoice}>
                <SelectTrigger className="h-8 w-64" data-testid="select-proposal-estimate"><SelectValue placeholder={t("proposalEstimate.choose")} /></SelectTrigger>
                <SelectContent>
                  {list.data!.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.estimateNumber} · {e.title} · {money(e.subtotalCents, i18n.language)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={busy || !choice} onClick={() => void switchTo(choice)} data-testid="button-proposal-estimate-switch">
                <Repeat className="mr-1.5 h-3.5 w-3.5" />{t("proposalP1.switchEstimate")}</Button>
            </div>
          )}
        </IdentityHeaderCard>
        {full.isError && (
          <div role="alert" className="flex items-center gap-2 text-xs text-destructive" data-testid="proposal-estimate-detail-error">
            <AlertTriangle className="h-3.5 w-3.5" />{t("proposalEstimate.error")}
            <Button size="sm" variant="ghost" className="h-auto p-0" onClick={() => void full.refetch()}>{t("proposalEstimate.retry")}</Button>
          </div>
        )}
        {full.data && <TicketAdvanceNotice key={`${companyId}:${user?.id}:${user?.activeRole}:${full.data.id}`} estimate={full.data} />}
        {v && preview && (
          <PdfPreviewDialog open={preview} onClose={() => setPreview(false)} companyId={companyId} estimateId={linked.id}
            versionId={v.id} estimateNumber={linked.number} versionNumber={v.versionNumber} draft={v.status === "draft"} />
        )}
      </section>
    );
  }

  // Legacy proposals created before estimates are read-only; the page shows the banner.
  return null;
}
