import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AlertTriangle, ExternalLink, FileText, Link2, Plus, Unlink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { builderPath, ESTIMATES_API, sendEstimate, conflictOf, type EstimateDetailDto, type EstimateListItemDto } from "@/lib/estimateBuilder";
import { DocumentBadge, EstimateStatePill, IdentityHeaderCard, MetadataCell, MetadataStrip } from "./EstimateIdentityHeader";
import { PdfPreviewDialog } from "./PdfPreviewDialog";
import { TicketAdvanceNotice } from "./TicketAdvanceNotice";
import type { ProposalWithDetails } from "@shared/schema";

const money = (cents: number | null | undefined, lang: string) =>
  cents == null ? "—" : (cents / 100).toLocaleString(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD" });

async function getJson<T>(url: string, companyId: string, signal?: AbortSignal): Promise<T> {
  const res = await apiRequest("GET", url, undefined, { headers: companyHeaders(companyId), signal });
  return res.json() as Promise<T>;
}

/** Estimate section at the top of the proposal editor (Slice 4.1). Never computes totals locally. */
export function ProposalEstimateSection({ proposal, companyId, active, onLinked }: {
  proposal: ProposalWithDetails; companyId: string; active: () => boolean; onLinked: () => void;
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
  const canRead = !!companyId && ["admin", "office"].includes(user?.activeRole ?? "");
  const ticketId = p.ticketId ?? null;

  const full = useQuery<EstimateDetailDto>({
    queryKey: ["/api/estimates", "proposal-linked", ...scope, proposal.estimateId ?? linkedSummary?.id],
    queryFn: ({ signal }) => getJson(`${ESTIMATES_API}/${encodeURIComponent(proposal.estimateId ?? linkedSummary!.id)}`, companyId, signal),
    enabled: canRead && !!(proposal.estimateId || linkedSummary), staleTime: 0, retry: false, refetchOnWindowFocus: true, refetchInterval: 30_000,
  });
  const suggestion = useQuery<EstimateListItemDto | null>({
    queryKey: ["/api/estimates", "by-ticket", ...scope, ticketId],
    queryFn: ({ signal }) => getJson(`${ESTIMATES_API}/by-ticket/${encodeURIComponent(ticketId!)}`, companyId, signal),
    enabled: canRead && !proposal.estimateId && !linkedSummary && !!ticketId, staleTime: 0, retry: false,
  });
  const linked = full.data ? {
    id: full.data.id, number: full.data.estimateNumber, title: full.data.title,
    currentVersion: { id: full.data.version.id, versionNumber: full.data.version.versionNumber, status: full.data.version.status },
    subtotalCents: full.data.version.status === "draft" ? full.data.version.totals.subtotalCents : full.data.version.frozenSubtotalCents,
  } : linkedSummary;
  const needList = !proposal.estimateId && !linked && (!ticketId || (suggestion.isSuccess && !suggestion.data));
  const list = useQuery<EstimateListItemDto[]>({
    queryKey: ["/api/estimates", "proposal-candidates", ...scope, p.customerId, ticketId],
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams({ customerId: p.customerId });
      if (ticketId) q.set("ticketId", ticketId);
      const body = await getJson<EstimateListItemDto[] | { items: EstimateListItemDto[] }>(`${ESTIMATES_API}?${q}`, companyId, signal);
      const rows = Array.isArray(body) ? body : body?.items ?? [];
      return rows.filter((e) => !e.voidedAt && (!ticketId || e.ticketId === ticketId));
    },
    enabled: canRead && needList && !!p.customerId, staleTime: 0, retry: false,
  });

  async function run(kind: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await fn(); }
    catch (err) {
      const code = conflictOf(err)?.error;
      const known = ["ESTIMATE_NOT_FOUND", "ESTIMATE_LINK_VOID", "ESTIMATE_CUSTOMER_MISMATCH", "ESTIMATE_TICKET_MISMATCH"].includes(code ?? "");
      if (alive()) toast({ title: t("proposalEstimate.error"), description: known ? t(`proposalEstimate.linkErrors.${code}`) : t("proposalEstimate.error"), variant: "destructive" });
    }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function patchLink(estimateId: string | null) {
    if (!alive()) return;
    await apiRequest("PATCH", `/api/proposals/${encodeURIComponent(proposal.id)}`, { estimateId }, { headers: companyHeaders(companyId) });
  }
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/estimates"] });
    onLinked();
  };
  const link = (id: string, open = false) => run("link", async () => {
    await patchLink(id);
    if (!alive()) return;
    await refresh();
    if (open && alive()) navigate(builderPath(id));
  });
  const unlink = () => run("unlink", async () => { await patchLink(null); if (alive()) await refresh(); });
  const create = () => run("create", async () => {
    let created: { id: string };
    try {
      created = await sendEstimate("POST", ESTIMATES_API, companyId,
        { customerId: p.customerId, title: proposal.title, ...(ticketId ? { ticketId } : {}) });
    } catch (err) {
      // A concurrent creator, or a retry after link failed, may have already
      // created the ticket's one live estimate. Use only the documented ID.
      const raw = err instanceof Error ? err.message.match(/^409: ([\s\S]*)$/)?.[1] : null;
      let existing: string | null = null;
      if (raw) {
        try {
          const body = JSON.parse(raw);
          if (body.error === "ESTIMATE_EXISTS" && typeof body.existingEstimateId === "string") existing = body.existingEstimateId;
        } catch { /* Not the documented duplicate response. */ }
      }
      if (!ticketId || !existing) throw err;
      created = { id: existing };
    }
    if (!alive()) return;
    await patchLink(created.id);
    if (!alive()) return;
    await refresh();
    if (alive()) navigate(builderPath(created.id));
  });

  const header = (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <FileText className="h-4 w-4 text-muted-foreground" />{t("proposalEstimate.title")}
    </div>
  );

  if (proposal.estimateId && !linked) return <section data-testid="section-proposal-estimate" className="space-y-2">
    {header}
    <div role={full.isError ? "alert" : "status"} className="rounded-md border p-3 text-sm">
      {t(full.isError ? "proposalEstimate.error" : "proposalEstimate.loading")}
      {full.isError && <Button size="sm" variant="outline" onClick={() => void full.refetch()}>{t("proposalEstimate.retry")}</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlink()}>{t("proposalEstimate.unlink")}</Button>
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
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlink()} data-testid="button-proposal-estimate-unlink">
                <Unlink className="mr-1.5 h-3.5 w-3.5" />{t("proposalEstimate.unlink")}</Button>
            </div>
          </div>
          <MetadataStrip testId="meta-proposal-estimate">
            <MetadataCell label={t("proposalEstimate.total")} testId="cell-proposal-estimate-total">
              <span className="font-mono tabular-nums" data-testid="text-proposal-estimate-total">{money(linked.subtotalCents, i18n.language)}</span>
            </MetadataCell>
          </MetadataStrip>
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

  const loading = (!!ticketId && suggestion.isLoading) || (needList && list.isLoading);
  const failed = suggestion.isError || list.isError;
  return (
    <section className="space-y-2" data-testid="section-proposal-estimate">
      {header}
      <div className="rounded-xl border bg-card p-3">
        {loading ? (
          <div role="status" aria-label={t("proposalEstimate.loading")} className="space-y-2" data-testid="proposal-estimate-loading">
            <Skeleton className="h-5 w-48" /><Skeleton className="h-8 w-full" />
          </div>
        ) : failed ? (
          <div role="alert" className="flex items-center gap-2 text-sm" data-testid="proposal-estimate-error">
            <AlertTriangle className="h-4 w-4 text-destructive" />{t("proposalEstimate.error")}
            <Button size="sm" variant="outline" onClick={() => { if (ticketId) void suggestion.refetch(); if (needList) void list.refetch(); }} data-testid="button-proposal-estimate-retry">
              {t("proposalEstimate.retry")}</Button>
          </div>
        ) : suggestion.data ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="proposal-estimate-suggestion">
            <DocumentBadge label={suggestion.data.estimateNumber} testId="badge-proposal-estimate-suggestion" />
            <span className="min-w-0 truncate text-sm">{suggestion.data.title}</span>
            <Button size="sm" className="ml-auto" disabled={busy} onClick={() => void link(suggestion.data!.id)} data-testid="button-proposal-estimate-link">
              <Link2 className="mr-1.5 h-3.5 w-3.5" />{t("proposalEstimate.link", { number: suggestion.data.estimateNumber })}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {(list.data?.length ?? 0) > 0 && (<>
              <Select value={choice} onValueChange={setChoice}>
                <SelectTrigger className="h-8 w-64" data-testid="select-proposal-estimate"><SelectValue placeholder={t("proposalEstimate.choose")} /></SelectTrigger>
                <SelectContent>
                  {list.data!.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.estimateNumber} · {e.title} · {money(e.subtotalCents, i18n.language)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={busy || !choice} onClick={() => void link(choice)} data-testid="button-proposal-estimate-link">
                <Link2 className="mr-1.5 h-3.5 w-3.5" />{t("proposalEstimate.linkSelected")}</Button>
            </>)}
            <Button size="sm" className="ml-auto" disabled={busy || !p.customerId} onClick={() => void create()} data-testid="button-proposal-estimate-create">
              <Plus className="mr-1.5 h-3.5 w-3.5" />{t("proposalEstimate.create")}</Button>
          </div>
        )}
      </div>
    </section>
  );
}
