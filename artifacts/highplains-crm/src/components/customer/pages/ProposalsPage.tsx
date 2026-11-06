import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { FileText, Loader2, Map as MapIcon, Plus } from "lucide-react";
import type { CrewWorksheetWithDetails, ProposalWithDetails, VisualScopeSheet } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useCustomerScope } from "@/lib/customerScope";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type ProposalsView = "proposals" | "worksheets" | "scopes";

const ymd = (d?: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${m}/${day}/${y}` : d;
};
const fmtDate = (d?: string | Date | null) => {
  if (!d) return "";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

function useCreate(fn: () => Promise<string>) {
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return { busy, run };
}

function Rows({ loading, empty, emptyIcon, children }: { loading: boolean; empty: string | null; emptyIcon: React.ReactNode; children: React.ReactNode }) {
  if (loading) return <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  if (empty) return <div className="text-center py-10 text-muted-foreground text-sm">{emptyIcon}{empty}</div>;
  return <div className="rounded-md border bg-card divide-y">{children}</div>;
}

function ProposalsList({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const scope = useCustomerScope();
  const { data: proposals = [], isLoading } = useQuery<ProposalWithDetails[]>({
    queryKey: ["/api/customers", customerId, "proposals", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<ProposalWithDetails[]>(`/api/customers/${customerId}/proposals`, signal),
  });
  const create = useCreate(async () => {
    try {
      const started = scope.companyId;
      const res = await scope.request("POST", "/api/proposals", { customerId, title: t("customerPages.pages.proposals"), proposalDate: new Date().toISOString().split("T")[0] });
      const p = await res.json();
      scope.assertSameCompany(started);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "proposals"] });
      navigate(`/dashboard/tools/proposals/${p.id}`);
      return p.id;
    } catch { toast({ title: t("common.error"), description: t("customerPages.proposals.createFailed"), variant: "destructive" }); return ""; }
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={create.run} disabled={create.busy} data-testid="button-new-proposal-customer">
          {create.busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}{t("customerPages.proposals.newProposal")}
        </Button>
      </div>
      <Rows loading={isLoading} empty={proposals.length ? null : t("customerDetail.noProposals")} emptyIcon={<FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />}>
        {proposals.map(p => {
          const version = p.versions?.length ? p.versions[p.versions.length - 1].versionNumber : null;
          return (
            <div key={p.id} role="link" tabIndex={0} onClick={() => navigate(`/dashboard/tools/proposals/${p.id}`)}
              onKeyDown={e => { if (e.key === "Enter") navigate(`/dashboard/tools/proposals/${p.id}`); }}
              className="flex items-center gap-3 px-3 py-2.5 hover-elevate cursor-pointer" data-testid={`row-proposal-${p.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" data-testid={`text-proposal-title-${p.id}`}>{p.title}</span>
                  <Badge variant="secondary" className="text-xs" data-testid={`badge-proposal-status-${p.id}`}>{t(`statuses.${p.status}`, { defaultValue: p.status })}</Badge>
                  <Badge variant="outline" className="text-xs" data-testid={`badge-version-${p.id}`}>
                    {version != null ? `v${version}` : t("customerPages.proposals.noVersion")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                  <span className="font-mono" data-testid={`text-proposal-number-${p.id}`}>{p.proposalNumber}</span>
                  {p.ticketId && (
                    <Link href={`/dashboard/tickets/${p.ticketId}`} onClick={e => e.stopPropagation()} className="text-primary underline" data-testid={`link-proposal-ticket-${p.id}`}>
                      {t("customerPages.proposals.fromTicket")}{p.estimateNumber ? ` #${p.estimateNumber}` : ""}
                    </Link>
                  )}
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-proposal-updated-${p.id}`}>
                {t("customerPages.proposals.updated")} {fmtDate((p as { updatedAt?: string | Date | null }).updatedAt ?? p.createdAt)}
              </span>
            </div>
          );
        })}
      </Rows>
    </div>
  );
}

function WorksheetsList({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const scope = useCustomerScope();
  const { user } = useAuth();
  const canWrite = ["admin", "office", "field_manager", "crew_supervisor", "landscape_supervisor"].includes(user?.accessRole ?? "");
  const { data: worksheets = [], isLoading } = useQuery<CrewWorksheetWithDetails[]>({
    queryKey: ["/api/customers", customerId, "crew-worksheets", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<CrewWorksheetWithDetails[]>(`/api/customers/${customerId}/crew-worksheets`, signal),
  });
  const create = useCreate(async () => {
    try {
      const started = scope.companyId;
      const res = await scope.request("POST", "/api/crew-worksheets", { customerId, title: t("crewWorksheets.title"), worksheetDate: new Date().toISOString().split("T")[0] });
      const w = await res.json();
      scope.assertSameCompany(started);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "crew-worksheets"] });
      navigate(`/dashboard/tools/crew-worksheets/${w.id}`);
      return w.id;
    } catch { toast({ title: t("common.error"), description: t("crewWorksheets.createFailed"), variant: "destructive" }); return ""; }
  });
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={create.run} disabled={create.busy} data-testid="button-new-crew-worksheet-customer">
            {create.busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}{t("customerPages.proposals.newWorksheet")}
          </Button>
        </div>
      )}
      <Rows loading={isLoading} empty={worksheets.length ? null : t("crewWorksheets.noWorksheetsForCustomer")} emptyIcon={<FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />}>
        {worksheets.map(w => (
          <div key={w.id} role="link" tabIndex={0} onClick={() => navigate(`/dashboard/tools/crew-worksheets/${w.id}`)}
            onKeyDown={e => { if (e.key === "Enter") navigate(`/dashboard/tools/crew-worksheets/${w.id}`); }}
            className="flex items-center gap-2 px-3 py-2.5 hover-elevate cursor-pointer" data-testid={`row-crew-worksheet-${w.id}`}>
            <span className="text-xs font-mono text-muted-foreground">{w.worksheetNumber}</span>
            <span className="font-medium text-sm flex-1 min-w-0 truncate">{w.title}</span>
            <Badge variant={w.status === "finalized" ? "outline" : "secondary"} className="text-xs">{t(`statuses.${w.status === "finalized" ? "finalized" : "draft"}`)}</Badge>
            <span className="text-xs text-muted-foreground">{ymd(w.worksheetDate)}</span>
          </div>
        ))}
      </Rows>
    </div>
  );
}

function ScopesList({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const scope = useCustomerScope();
  const { data: sheets = [], isLoading } = useQuery<VisualScopeSheet[]>({
    queryKey: ["/api/customers", customerId, "visual-scope-sheets", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<VisualScopeSheet[]>(`/api/customers/${customerId}/visual-scope-sheets`, signal),
  });
  const create = useCreate(async () => {
    try {
      const started = scope.companyId;
      const res = await scope.request("POST", "/api/visual-scope-sheets", { customerId, title: t("customerPages.proposals.scopeTitle"), scopeDate: new Date().toISOString().split("T")[0] });
      const s = await res.json();
      scope.assertSameCompany(started);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "visual-scope-sheets"] });
      navigate(`/dashboard/tools/visual-scope/${s.id}`);
      return s.id;
    } catch { toast({ title: t("common.error"), description: t("customerPages.proposals.createFailed"), variant: "destructive" }); return ""; }
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={create.run} disabled={create.busy} data-testid="button-new-visual-scope-customer">
          {create.busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}{t("customerPages.proposals.newScope")}
        </Button>
      </div>
      <Rows loading={isLoading} empty={sheets.length ? null : t("customerDetail.noVisualScopes")} emptyIcon={<MapIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />}>
        {sheets.map(s => (
          <div key={s.id} role="link" tabIndex={0} onClick={() => navigate(`/dashboard/tools/visual-scope/${s.id}`)}
            onKeyDown={e => { if (e.key === "Enter") navigate(`/dashboard/tools/visual-scope/${s.id}`); }}
            className="flex items-center gap-2 px-3 py-2.5 hover-elevate cursor-pointer" data-testid={`row-visual-scope-${s.id}`}>
            <span className="font-medium text-sm flex-1 min-w-0 truncate">{s.title}</span>
            <Badge variant="secondary" className="text-xs">{t(`statuses.${s.status}`, { defaultValue: s.status })}</Badge>
            {s.baseImagePath && <Badge variant="outline" className="text-xs">{t("customerDetail.baseImageCaptured")}</Badge>}
            <span className="text-xs text-muted-foreground">{ymd(s.scopeDate)}</span>
          </div>
        ))}
      </Rows>
    </div>
  );
}

export default function ProposalsPage({ customerId, view, onViewChange }: { customerId: string; view: ProposalsView; onViewChange: (v: ProposalsView) => void }) {
  const { t } = useTranslation();
  const views: ProposalsView[] = ["proposals", "worksheets", "scopes"];
  return (
    <div className="space-y-4" data-testid="proposals-page">
      <div role="tablist" aria-label={t("customerPages.pages.proposals")} className="inline-flex rounded-md border bg-muted/40 p-0.5">
        {views.map(v => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => onViewChange(v)}
            className={`px-3 h-8 text-sm rounded ${view === v ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            data-testid={`view-proposals-${v}`}>
            {t(`customerPages.proposals.views.${v}`)}
          </button>
        ))}
      </div>
      {view === "proposals" && <ProposalsList customerId={customerId} />}
      {view === "worksheets" && <WorksheetsList customerId={customerId} />}
      {view === "scopes" && <ScopesList customerId={customerId} />}
    </div>
  );
}
