import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Lock, RotateCcw, Sprout } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { campaignServices } from "@shared/contractCatalog";
import type {
  CampaignGenerationReport, CampaignMembershipStatus, DemandGap, DemandGapKind, ItemRef, PreviewRound, RoundRef,
} from "../../../../lib/db/src/campaignGenerationContracts";

/** Calendar year in Colorado (America/Denver) and month (1-12). */
export function coloradoToday(now: Date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "numeric" }).formatToParts(now);
  return { year: Number(parts.find(p => p.type === "year")?.value), month: Number(parts.find(p => p.type === "month")?.value) };
}
/** Current or next year; next is the default from October onward. */
export function yearChoices(now: Date = new Date()) {
  const { year, month } = coloradoToday(now);
  return { years: [year, year + 1], defaultYear: month >= 10 ? year + 1 : year };
}

export const generationKey = (companyId: string, year: number) => ["/api/campaign-generation", companyId, year, "preview"] as const;

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d{3}:\s*/, "");
  try { const j = JSON.parse(body) as { message?: string; error?: string }; return j.message ?? j.error ?? body; } catch { return body; }
}

const GAP_TEXT: Record<DemandGapKind, { title: string; fix: string }> = {
  no_count: { title: "No round count", fix: "Contract states no count and this service has no standard count. Set a count on the contract or a standard in Service timing." },
  no_timing: { title: "No months", fix: "Count is known but no months are stated and no program timing exists for that count." },
  invalid_count: { title: "Invalid count or months", fix: "The contract count or month spread is invalid. Use whole nonnegative months and a count from 0 to 24." },
  duplicate_lines: { title: "Duplicate lines", fix: "The same service appears more than once on this season. Merge the lines on the contract." },
  count_mismatch: { title: "Months don't match count", fix: "Stated months do not add up to the stated count. Correct one on the contract." },
};

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
const fmtDate = (d: string) => { const x = new Date(d.length <= 10 ? d + "T00:00:00" : d); return isNaN(+x) ? d : x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const roundKey = (r: RoundRef) => `${r.serviceKey}|${r.roundMonth}|${r.roundSeq}`;
const termHref = (agreementId: string, termId: string) => `/dashboard/contracts/${agreementId}#term-${termId}`;

/* ------------------------------------------------------------------ */

export default function CampaignGeneratePage() {
  const { user } = useAuth();
  useSetBreadcrumbs([{ label: "Campaigns", href: "/dashboard/campaigns" }, { label: "Generate from contracts" }], []);
  const companyId = user?.activeCompanyId ?? "";
  const { years, defaultYear } = useMemo(() => yearChoices(), []);
  const [year, setYear] = useState(defaultYear);
  if (!user || !companyId) return null;
  const canGenerate = user.accessRole === "admin" || !!user.isSuperAdminBool;
  return (
    <div className="space-y-5 max-w-5xl" data-testid="page-campaign-generate">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Sprout className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Generate from contracts</h1>
          {!canGenerate && (
            <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid="badge-read-only">
              <Lock className="h-3 w-3" />Preview only
            </span>
          )}
          <div className="ml-auto inline-flex rounded-md border p-0.5" role="group" aria-label="Year">
            {years.map(y => (
              <button key={y} type="button" onClick={() => setYear(y)} aria-pressed={y === year}
                className={`px-3 py-1 text-sm rounded tabular-nums ${y === year ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                data-testid={`button-year-${y}`}>{y}</button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground border-l-2 border-primary/60 pl-3" data-testid="text-explanation">
          Rounds come from signed, active, renewed, up-for-renewal and sent contract seasons; sent seasons are included and marked Waiting on signature. A count of zero means nothing is owed. Generate enables automatic membership checks for that year; years not yet enabled stay unchanged.
        </p>
      </header>
      <GenerateBody key={`${companyId}|${year}`} companyId={companyId} year={year} canGenerate={canGenerate} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function GenerateBody({ companyId, year, canGenerate }: { companyId: string; year: number; canGenerate: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = useMemo(() => generationKey(companyId, year), [companyId, year]);
  const headers = useMemo(() => ({ "X-Company-Id": companyId, "Cache-Control": "no-store" }), [companyId]);
  const query = useQuery<CampaignGenerationReport>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", `/api/campaign-generation/${year}/preview`, undefined, { headers })).json(),
    staleTime: 0, gcTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const status = useQuery<CampaignMembershipStatus>({
    queryKey: ["/api/campaign-generation", companyId, year, "status"],
    queryFn: async () => (await apiRequest("GET", `/api/campaign-generation/${year}/status`, undefined, { headers })).json(),
    refetchInterval: 30_000, staleTime: 0,
  });
  useEffect(() => {
    if (status.data?.checkedAt) void qc.invalidateQueries({ queryKey });
  }, [status.data?.checkedAt, qc, queryKey]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CampaignGenerationReport | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const generate = async () => {
    setConfirmOpen(false); setBusy(true); setWriteError(null);
    try {
      const res = await apiRequest("POST", `/api/campaign-generation/${year}`, { confirm: true }, { headers });
      const report = (await res.json()) as CampaignGenerationReport;
      void qc.invalidateQueries({ queryKey: ["/api/campaigns"] });
      void status.refetch();
      qc.setQueryData(queryKey, report);
      if (!alive.current) return;
      setResult(report);
      // The mutation report is the saved result, not the next pending preview.
      void query.refetch();
      toast({ title: `${year} rounds generated` });
    } catch (err) {
      if (!alive.current) return;
      const msg = errorText(err);
      setWriteError(msg);
      toast({ title: "Generate failed", description: msg, variant: "destructive" });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (query.isLoading) return (
    <div className="space-y-3" data-testid="state-loading">
      <Skeleton className="h-16 w-full" />{[0, 1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}
    </div>
  );
  if (query.isError || !query.data) return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3" data-testid="state-error">
      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Couldn't load the {year} preview</p>
        <p className="text-muted-foreground">{errorText(query.error)}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void query.refetch()} data-testid="button-retry">
        <RotateCcw className="h-3.5 w-3.5 mr-1" />Retry
      </Button>
    </div>
  );

  const r = query.data;
  const changes = r.created.length + r.deleted.length + r.added.length + r.removed.length;
  const memberTotal = r.rounds.reduce((a, x) => a + x.members.length, 0);

  return (
    <div className="space-y-5">
      {/* Status + action */}
      <section className="rounded-lg border bg-card px-4 py-3 flex flex-wrap items-center gap-3" data-testid="panel-status">
        <CalendarRange className="h-4 w-4 text-primary" />
        <div className="text-sm">
          {r.enabledAt
            ? <span data-testid="text-status">Enabled {fmtDate(r.enabledAt)}. Membership follows contracts and service timing automatically until the year ends.</span>
            : <span data-testid="text-status">{year} has not been generated yet.</span>}
          <span className="block text-xs text-muted-foreground tabular-nums" data-testid="text-totals">
            {r.rounds.length} rounds · {memberTotal} property memberships · {changes} pending changes · as of {fmtDate(r.today)}
            {r.waitingOnSignature > 0 && <> · {r.waitingOnSignature} included memberships waiting on signature</>}
          </span>
          {status.isError && <p className="text-destructive">Couldn't load the last membership check. Refresh to retry.</p>}
          {r.enabledAt && <div className="text-xs mt-1" data-testid="membership-last-check">
            {status.data?.checkedAt
              ? <>Last checked {new Date(status.data.checkedAt).toLocaleString("en-US", { timeZone: "America/Denver" })} Colorado time.
                {status.data.error ? <span className="text-destructive"> {status.data.error}
                  {status.data.succeededAt && <> Last successful check: {new Date(status.data.succeededAt).toLocaleString("en-US", { timeZone: "America/Denver" })} Colorado time.</>}</span>
                  : <> {status.data.changes} changes · {status.data.keptNotOwed} kept not owed · {status.data.missed} missed.</>}</>
              : <>Enabled {fmtDate(r.enabledAt)}; no automatic check recorded since server restart.</>}
          </div>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy || query.isFetching} onClick={() => { void query.refetch(); void status.refetch(); }} data-testid="button-refresh">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Refresh preview
          </Button>
          {canGenerate ? (
            <Button size="sm" disabled={busy || query.isFetching} onClick={() => setConfirmOpen(true)} data-testid="button-generate">
              {busy ? "Generating..." : `Generate ${year}`}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground" data-testid="text-admin-only">Only an administrator can generate.</span>
          )}
        </div>
      </section>

      {writeError && <p className="text-sm text-destructive" data-testid="error-generate">{writeError}</p>}
      {result && <ResultSummary report={result} />}

      <GapPanel gaps={r.gaps} />

      {r.manualCampaigns.length > 0 && (
        <section className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--est-warn-bg))]/40 px-4 py-3 space-y-1.5" data-testid="panel-manual">
          <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            {r.manualCampaigns.length} manual campaigns may overlap generated rounds</p>
          <p className="text-xs text-muted-foreground">Generated rounds don't replace these. Archive any that duplicate a generated round.</p>
          <ul className="text-xs space-y-0.5">
            {r.manualCampaigns.map(m => (
              <li key={m.id} className="flex gap-2">
                <Link href={`/dashboard/campaigns/${m.id}`} className="text-primary hover:underline" data-testid={`link-manual-${m.id}`}>{m.title}</Link>
                <span className="text-muted-foreground">{m.category} · {fmtDate(m.windowStart)} – {fmtDate(m.windowEnd)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ItemList title="Missed: round passed; schedule by hand if still owed" testId="missed" items={r.missed} />
      <ItemList title="Added to completed or archived rounds" testId="closed" items={r.addedToClosedRound} />
      <ItemList title="Kept though no longer owed (work already recorded)" testId="kept" items={r.keptNotOwed} />

      <Rounds rounds={r.rounds} deleted={r.deleted} />

      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!o) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate {year} rounds?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm" data-testid="text-confirm-totals">
                <p>Review the proposed changes. Current contracts and work will be rechecked when you confirm:</p>
                <ul className="tabular-nums">
                  <li>{r.created.length} rounds created · {r.deleted.length} rounds deleted</li>
                  <li>{r.added.length} properties added · {r.removed.length} removed</li>
                  <li>{r.keptNotOwed.length} kept not owed · {r.missed.length} missed · {r.addedToClosedRound.length} added to closed rounds</li>
                  {r.gaps.length > 0 && <li>{r.gaps.length} contract issues to review; count mismatches keep stated months</li>}
                </ul>
                <p>After generation, membership follows successful contract and service-timing changes. Startup and hourly checks retry failures. Recorded work is retained.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-generate">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void generate()} disabled={busy} data-testid="button-confirm-generate">Generate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ResultSummary({ report }: { report: CampaignGenerationReport }) {
  const rows: [string, number][] = [
    ["Rounds created", report.created.length], ["Rounds deleted", report.deleted.length],
    ["Properties added", report.added.length], ["Properties removed", report.removed.length],
    ["Kept not owed", report.keptNotOwed.length], ["Missed", report.missed.length],
    ["Added to closed rounds", report.addedToClosedRound.length],
  ];
  return (
    <section className="rounded-lg border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5 px-4 py-3" data-testid="panel-result">
      <p className="text-sm font-medium flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />Generated {report.year}</p>
      <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums" data-testid={`result-${k.toLowerCase().replace(/\s+/g, "-")}`}>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function GapPanel({ gaps }: { gaps: DemandGap[] }) {
  if (gaps.length === 0) return (
    <p className="text-xs text-muted-foreground" data-testid="text-no-gaps">No contract gaps. Every eligible season has a usable count and months.</p>
  );
  const kinds = Object.keys(GAP_TEXT) as DemandGapKind[];
  return (
    <section className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--est-warn-bg))]/40 px-4 py-3 space-y-2" data-testid="panel-gaps">
      <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
        Contract issues to review ({gaps.length}). Missing or invalid scope prevents scheduling; count mismatches keep the stated months.</p>
      {gaps.some(g => g.kind === "no_count" || g.kind === "no_timing") &&
        <Link href="/dashboard/settings/service-timing" className="inline-block text-xs text-primary hover:underline">Open Settings → Service timing</Link>}
      {kinds.map(k => {
        const list = gaps.filter(g => g.kind === k);
        if (!list.length) return null;
        return (
          <details key={k} open={list.length <= 5} data-testid={`gaps-${k}`}>
            <summary className="cursor-pointer text-xs font-medium">{GAP_TEXT[k].title} ({list.length})</summary>
            <p className="text-xs text-muted-foreground mt-0.5">{GAP_TEXT[k].fix}</p>
            {k === "no_timing" && [...new Set(list.map(g => `${g.serviceKey}:${g.count}`))].map(key => {
              const group = list.filter(g => `${g.serviceKey}:${g.count}` === key);
              return <p key={key} className="text-xs font-medium">{serviceLabel(group[0].serviceKey)} × {group[0].count}: no timing set · {group.length} seasons</p>;
            })}
            <ul className="mt-1 space-y-0.5 text-xs">
              {list.map(g => (
                <li key={`${g.termId}-${g.serviceKey}-${k}`} className="flex flex-wrap gap-2">
                  <Link href={termHref(g.agreementId, g.termId)} className="text-primary hover:underline" data-testid={`link-gap-${g.termId}-${g.serviceKey}-${k}`}>{g.propertyName}</Link>
                  <span className="text-muted-foreground">{serviceLabel(g.serviceKey)} · {g.seasonLabel}
                    {g.count !== undefined && <> · count {g.count}</>}{g.monthTotal !== undefined && <> · months total {g.monthTotal}</>}</span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

function ItemList({ title, testId, items }: { title: string; testId: string; items: ItemRef[] }) {
  if (!items.length) return null;
  return (
    <details className="rounded-lg border bg-card px-4 py-2.5" data-testid={`panel-${testId}`}>
      <summary className="cursor-pointer text-sm font-medium">{title} <span className="tabular-nums text-muted-foreground">({items.length})</span></summary>
      <ul className="mt-1.5 space-y-0.5 text-xs">
        {items.map((i, n) => (
          <li key={`${roundKey(i)}-${i.propertyId}-${n}`} className="flex flex-wrap gap-2">
            <span className="font-medium">{i.propertyName}</span>
            <span className="text-muted-foreground">{i.title} · {fmtDate(i.windowStart)} – {fmtDate(i.windowEnd)}</span>
            {i.campaignId && <Link href={`/dashboard/campaigns/${i.campaignId}`} className="text-primary hover:underline">Open round</Link>}
            {i.campaignId && i.itemId && <Link href={`/dashboard/campaigns/${i.campaignId}/items/${i.itemId}`} className="text-primary hover:underline">Review item / skip</Link>}
          </li>
        ))}
      </ul>
    </details>
  );
}

const serviceLabel = (key: string) => campaignServices().find(s => s.key === key)?.label ?? key;

function Rounds({ rounds, deleted }: { rounds: PreviewRound[]; deleted: RoundRef[] }) {
  const order = campaignServices().map(s => s.key);
  const keys = Array.from(new Set([...rounds.map(r => r.serviceKey), ...deleted.map(d => d.serviceKey)]))
    .sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  if (!keys.length) return (
    <div className="rounded-lg border border-dashed px-4 py-10 text-center" data-testid="state-empty">
      <p className="text-sm font-medium">No contract-driven rounds for this year</p>
      <p className="text-xs text-muted-foreground mt-1">No rounds could be resolved. Review any contract issues above; otherwise, no eligible season owes a campaign service or its count is zero.</p>
    </div>
  );
  return (
    <div className="space-y-4">
      {keys.map(svc => {
        const list = rounds.filter(r => r.serviceKey === svc).sort((a, b) => a.roundMonth.localeCompare(b.roundMonth) || a.roundSeq - b.roundSeq);
        const del = deleted.filter(d => d.serviceKey === svc);
        return (
          <section key={svc} className="rounded-lg border bg-card" data-testid={`card-service-${svc}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
              <h2 className="text-sm font-semibold">{serviceLabel(svc)}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{list.length} rounds{del.length > 0 && ` · ${del.length} to delete`}</span>
            </div>
            <div className="divide-y">
              {list.map(r => <RoundRow key={roundKey(r)} round={r} />)}
              {del.map(d => (
                <div key={roundKey(d)} className="px-4 py-2 text-sm flex flex-wrap gap-2 bg-destructive/5" data-testid={`row-deleted-${roundKey(d)}`}>
                  <span className="rounded border border-destructive/40 px-1.5 text-[11px] font-medium text-destructive">Delete</span>
                  <span className="line-through text-muted-foreground">{d.title}</span>
                  <span className="text-xs text-muted-foreground">{fmtMonth(d.roundMonth)}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RoundRow({ round: r }: { round: PreviewRound }) {
  const [open, setOpen] = useState(false);
  const id = roundKey(r);
  return (
    <div data-testid={`row-round-${id}`}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full px-4 py-2 flex flex-wrap items-center gap-2 text-left text-sm hover:bg-muted/40" data-testid={`button-toggle-${id}`}>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">{r.title}</span>
        <span className="text-xs text-muted-foreground">{fmtDate(r.windowStart)} – {fmtDate(r.windowEnd)}</span>
        {r.newRound && <span className="rounded bg-primary/15 px-1.5 text-[11px] font-medium" data-testid={`badge-new-${id}`}>New round</span>}
        {!r.newRound && !r.added && !r.removed && <span className="text-xs text-muted-foreground">No change</span>}
        {r.members.some(m => m.termStatus === "sent") && <span className="text-xs text-muted-foreground">{r.members.filter(m => m.termStatus === "sent").length} waiting on signature</span>}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground" data-testid={`text-counts-${id}`}>
          {r.members.length} properties
          {r.added > 0 && <span className="text-[hsl(var(--success))]"> · +{r.added}</span>}
          {r.removed > 0 && <span className="text-destructive"> · -{r.removed}</span>}
        </span>
      </button>
      {open && (
        <ul className="px-10 pb-2 space-y-0.5 text-xs" data-testid={`list-members-${id}`}>
          {r.campaignId && <li><Link href={`/dashboard/campaigns/${r.campaignId}`} className="text-primary hover:underline">Open existing round</Link></li>}
          {r.members.map(m => (
            <li key={`${m.propertyId}-${m.termId}`} className="flex flex-wrap gap-2">
              <Link href={termHref(m.agreementId, m.termId)} className="text-primary hover:underline" data-testid={`link-member-${id}-${m.termId}`}>{m.propertyName}</Link>
              {m.termStatus === "sent" && <span className="rounded border border-[hsl(var(--warning))]/50 px-1.5 text-[11px] font-medium text-[hsl(var(--warning))]" data-testid={`chip-waiting-${id}-${m.termId}`}>Waiting on signature</span>}
              {m.timing === "program" && <span className="rounded border px-1.5 text-[11px]">Program timing</span>}
              {m.count === "standard" && <span className="rounded border px-1.5 text-[11px]">Standard count</span>}
              <span className="text-muted-foreground">{m.seasonLabel} · {m.termStatus.replace(/_/g, " ")} · count from {m.count === "contract" ? "contract" : "standard"} · months from {m.timing === "contract" ? "contract" : "program"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
