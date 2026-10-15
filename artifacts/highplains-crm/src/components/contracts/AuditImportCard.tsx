import { Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileArchive, Upload, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { extractApiErrorMessage } from "@/lib/apiError";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

export interface Batch { batch: number; firstName: string; lastName: string; customers: number; documents: number; bytes: number }
interface Term { contractRef: string; season: string; description?: string; action?: string; startDate: string; endDate: string; status: string;
  annualPrice: number | null; paymentLines: number; rates: number; scope: number;
  documents: number | { signed?: number; their_form?: number; other?: number; total?: number }; needsReview: boolean }
interface ImportError { file: string; row: number; column?: string; message: string }
interface ImportWarning { file: string; row?: number; contractRef?: string; message: string }
export interface ImportReport {
  mode?: "audit" | "renewal"; dryRun: boolean; errors: ImportError[]; warnings: ImportWarning[];
  customers: { customerId: string; customerName: string; agreements: { agreementRef: string; line: string; form: string;
    action: "create" | "replace" | "add renewal"; terms: Term[] }[] }[];
  removals?: { ref: string; id: string; customerName: string; seasons: number }[];
  removed?: { ref: string; id: string; customerName: string; seasons: number }[];
  summary: { customers: number; agreements: number; terms: number; replaced: number; removed?: number; documents: number; warnings: number; errors: number };
  successes?: { customerId: string; customerName: string; agreements: number; terms: number;
    seasons?: { agreementId: string; termId: string; season: string }[] }[];
  failures?: { customerId: string; customerName: string; error: string }[];
}

const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const mb = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const LINES: Record<string, string> = { landscape: "Landscape", snow: "Snow", both: "Landscape + Snow" };
const docCount = (d: Term["documents"]) => typeof d === "number" ? d : d ? (d.total ?? (d.signed ?? 0) + (d.their_form ?? 0) + (d.other ?? 0)) : 0;
const sig = (files: File[]) => files.map(f => `${f.name}:${f.size}:${f.lastModified}`).join("|");
const STATUS_TONE: Record<string, string> = {
  signed: "bg-[var(--ts-done)]/15 text-[var(--ts-done)]", renewed: "bg-[var(--ts-active)]/15 text-[var(--ts-active)]",
  sent: "bg-[var(--ts-waiting)]/15 text-[var(--ts-waiting)]", draft: "bg-[var(--ts-open)]/15 text-[var(--ts-open)]",
  lost: "bg-[var(--ts-lost)]/15 text-[var(--ts-lost)]", cancelled: "bg-[var(--ts-lost)]/15 text-[var(--ts-lost)]",
};

function group<T extends { file: string }>(items: T[]) {
  const m = new Map<string, T[]>();
  items.forEach(i => m.set(i.file, [...(m.get(i.file) ?? []), i]));
  return Array.from(m.entries());
}

export function AuditExportPanel({ companyId }: { companyId?: string | number | null }) {
  const [size, setSize] = useState(10);
  const [documents, setDocuments] = useState(true);
  const validSize = Number.isInteger(size) && size >= 1 && size <= 50;
  const { data, isLoading, isError, refetch } = useQuery<Batch[]>({
    queryKey: ["/api/admin/contract-center/audit-export/batches", companyId, size],
    queryFn: async () => (await apiRequest("GET", `/api/admin/contract-center/audit-export/batches?size=${size}`)).json(),
    enabled: !!companyId && validSize, staleTime: 30_000,
  });
  return <div className="space-y-3" data-testid="audit-export">
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-xs font-medium text-muted-foreground">Customers per batch
        <input type="number" min={1} max={50} value={Number.isNaN(size) ? "" : size} onChange={e => setSize(e.target.valueAsNumber)}
          className="mt-1 block h-9 w-24 rounded-md border bg-background px-2 text-sm tabular-nums text-foreground" data-testid="input-batch-size" />
      </label>
      <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={documents} onChange={e => setDocuments(e.target.checked)} data-testid="checkbox-include-documents" />Include documents</label>
      {!validSize && <p className="text-xs text-destructive" role="alert">Batch size must be 1–50.</p>}
    </div>
    {isLoading && validSize ? <div className="space-y-1.5" data-testid="skeleton-batches">{[0, 1, 2].map(i => <Skeleton key={i} className="h-11 w-full" />)}</div>
      : isError ? <div className="rounded-md border bg-muted/30 py-5 text-center" data-testid="error-batches">
        <p className="text-sm text-muted-foreground">Could not load batches.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void refetch()} data-testid="button-retry-batches">Retry</Button></div>
      : data && data.length === 0 ? <p className="rounded-md border border-dashed bg-muted/30 py-5 text-center text-sm text-muted-foreground" data-testid="empty-batches">No customers with old contracts to export.</p>
      : <ul className="divide-y rounded-md border">
        {(data ?? []).map(b => <li key={b.batch} className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid={`row-batch-${b.batch}`}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/15 text-xs font-semibold tabular-nums">{b.batch}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{b.firstName} – {b.lastName}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{b.customers} customers · {b.documents} documents · {mb(b.bytes)}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/admin/contract-center/audit-export?batch=${b.batch}&size=${size}&documents=${documents}`} download data-testid={`button-download-batch-${b.batch}`}>
              <Download className="mr-1.5 h-3.5 w-3.5" />Download</a>
          </Button>
        </li>)}
      </ul>}
  </div>;
}

export default function AuditImportCard() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  const [files, setFiles] = useState<File[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [previewSig, setPreviewSig] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const run = useRef(0);
  const companyRef = useRef(companyId);
  const input = useRef<HTMLInputElement>(null);

  // Company switch or unmount: drop everything and ignore in-flight responses.
  useEffect(() => {
    companyRef.current = companyId;
    run.current++;
    setFiles([]); setReport(null); setPreviewSig(null); setConfirming(false); setError(null);
    return () => { run.current++; };
  }, [companyId]);

  const mutation = useMutation({
    mutationFn: async ({ dryRun, picked, id, company }: { dryRun: boolean; picked: File[]; id: number; company: unknown }) => {
      const form = new FormData();
      picked.forEach(f => form.append("files", f, f.name));
      const res = await fetch(`/api/admin/contract-center/import?dryRun=${dryRun}`, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
      return { report: await res.json() as ImportReport, id, company };
    },
  });

  const submit = (dryRun: boolean) => {
    const id = ++run.current;
    const picked = files; const s = sig(files);
    setError(null); setConfirming(false);
    if (!dryRun) setPreviewSig(null);
    mutation.mutate({ dryRun, picked, id, company: companyId }, {
      onSuccess: ({ report: r }) => {
        // A real request can commit even if the admin changes the selected files
        // while it is running. Refresh written data before discarding stale UI.
        if (!r.dryRun) {
          for (const p of ["/api/contract-center", "/api/admin/contract-center", "/api/customers", "/api/contracts", "/api/revenue"])
            void queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(p) });
        }
        if (id !== run.current || companyRef.current !== companyId) return;
        setReport(r);
        setPreviewSig(r.dryRun ? s : null);
      },
      onError: (e) => {
        if (id !== run.current) return;
        setPreviewSig(null);
        setError(extractApiErrorMessage(e) ?? "Request failed. Run Preview again before retrying.");
      },
    });
  };

  const pick = (list: FileList | File[] | null) => {
    run.current++; // stale responses for the old selection are discarded
    setFiles(Array.from(list ?? [])); setReport(null); setPreviewSig(null); setConfirming(false); setError(null);
  };

  const pending = mutation.isPending;
  const validPreview = !!report?.dryRun && previewSig === sig(files) && files.length > 0;
  const canImport = validPreview && report!.errors.length === 0 && report!.summary.terms > 0 && !pending;
  const dry = report?.dryRun;

  return <Card data-testid="audit-import-card">
    <CardHeader>
      <CardTitle>Audit export and import</CardTitle>
      <CardDescription>Export old records for an audit, or download current contracts to prepare signed renewals. Preview either import before confirming. Renewals add seasons to existing contracts; earlier seasons are preserved.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <section className="space-y-2"><h3 className="text-sm font-semibold tracking-tight">1 · Audit export</h3><AuditExportPanel key={String(companyId)} companyId={companyId} />
        <Button variant="outline" asChild><a href="/api/admin/contract-center/current-export" download data-testid="button-current-contracts"><Download className="mr-2 h-4 w-4" />Download current contracts</a></Button>
      </section>

      <section className="space-y-3" data-testid="import-section">
        <h3 className="text-sm font-semibold tracking-tight">2 · Import</h3>
        <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors ${drag ? "border-primary bg-primary/10" : "bg-muted/30 hover:bg-muted/50"}`} data-testid="dropzone-import">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Drop a ZIP, or several CSVs (manifest.json optional)</p>
          <p className="text-xs text-muted-foreground">Audit: contracts.csv + four child CSVs, optional remove_agreements.csv · 10 MB uploaded, 30 MB expanded, 20 ZIP entries. Renewal: renewals.csv + optional child CSVs · 40 MB uploaded, 60 MB expanded, 60 entries; PDFs under files/, up to 15 MB each. Removals are audit-only.</p>
          <input ref={input} type="file" multiple accept=".zip,.csv,.json,application/zip,text/csv,application/json" className="hidden"
            onChange={e => { pick(e.target.files); e.target.value = ""; }} data-testid="input-import-files" />
        </div>
        {files.length > 0 && <ul className="flex flex-wrap gap-1.5" data-testid="list-import-files">
          {files.map(f => <li key={f.name + f.lastModified} className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs">
            <FileArchive className="h-3 w-3 text-muted-foreground" />{f.name}<span className="text-muted-foreground tabular-nums">{mb(f.size)}</span></li>)}
        </ul>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={files.length === 0 || pending} onClick={() => submit(true)} data-testid="button-preview-import">
            {pending && mutation.variables?.dryRun ? "Previewing…" : "Preview"}</Button>
          <Button disabled={!canImport} onClick={() => setConfirming(true)} data-testid="button-import">
            {canImport ? `Import ${report!.summary.terms} seasons` : validPreview && report!.errors.length > 0 ? "Fix errors first" : "Preview first"}</Button>
        </div>
        {confirming && canImport && <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4" data-testid="import-confirmation">
          <p className="text-sm">Import {report!.summary.terms} seasons across {report!.summary.agreements} agreements for {report!.summary.customers} customers?
            {report!.summary.replaced > 0 && ` ${report!.summary.replaced} existing imported agreements will be replaced.`}
            {(report!.summary.removed ?? 0) > 0
              ? ` ${report!.summary.removed} imported agreements and their seasons will be removed. The entire upload succeeds or rolls back together.`
              : " Each customer is written in full or not at all."} Old records and stored files are not changed.</p>
          <div className="flex gap-2">
            <Button onClick={() => submit(false)} data-testid="button-confirm-import">Confirm import</Button>
            <Button variant="outline" onClick={() => setConfirming(false)} data-testid="button-cancel-import">Cancel</Button>
          </div>
        </div>}
        {pending && mutation.variables?.dryRun === false && <p role="status" className="text-sm">Importing contracts…</p>}
        {error && <p role="alert" className="text-sm text-destructive" data-testid="error-import">{error}</p>}

        {report && <div className="space-y-4" aria-live="polite" data-testid="import-report">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{report.mode === "renewal" ? "Renewal import" : "Audit import"} · {dry ? "Preview" : "Import"} results</h4>
            {report.errors.length > 0 ? <span className="rounded bg-[var(--ts-lost)]/15 px-1.5 py-0.5 text-xs font-medium text-[var(--ts-lost)]">Blocked</span>
              : dry ? <span className="rounded bg-[var(--ts-done)]/15 px-1.5 py-0.5 text-xs font-medium text-[var(--ts-done)]">Ready to import</span> : null}
          </div>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-8" data-testid="import-summary">
            {(["customers", "agreements", "terms", "replaced", "removed", "documents", "warnings", "errors"] as const).map(k => {
              const v = report.summary[k] ?? 0; const tone = k === "errors" && v > 0 ? "text-[var(--ts-lost)]" : k === "warnings" && v > 0 ? "text-[var(--ts-waiting)]" : "";
              return <div key={k} className="bg-card px-2.5 py-2"><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className={`text-lg font-semibold tabular-nums ${tone}`} data-testid={`summary-${k}`}>{v}</dd></div>;
            })}
          </dl>
          {dry && !!report.removals?.length && <ul aria-label="Planned removals" className="space-y-1 rounded-md border p-3 text-sm">
            {report.removals.map(r => <li key={r.id}>Remove {r.ref} ({r.customerName}): {r.seasons} seasons</li>)}
          </ul>}

          {!dry && <div className="space-y-2" data-testid="import-result">
            {!!report.removed?.length && <p className="text-sm">Removed {report.removed.length} imported agreements: {report.removed.map(r => r.ref).join(", ")}</p>}
            {(report.successes ?? []).length > 0 && <div className="rounded-md border border-[var(--ts-done)]/40 bg-[var(--ts-done)]/10 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-4 w-4 text-[var(--ts-done)]" />Imported {report.successes!.length} customers</p>
              <ul className="mt-1 text-xs text-muted-foreground">{report.successes!.map(s => <li key={s.customerId}>{s.customerName}: {s.agreements} agreements, {s.terms} seasons
                {s.seasons?.map(t => <Link key={t.termId} href={`/dashboard/contracts/${t.agreementId}#term-${t.termId}`} className="ml-2 underline">{t.season}</Link>)}
              </li>)}</ul></div>}
            {(report.failures ?? []).length > 0 && <div role="alert" className="rounded-md border border-[var(--ts-lost)]/50 bg-[var(--ts-lost)]/10 p-3 text-sm" data-testid="import-failures">
              <p className="flex items-center gap-1.5 font-medium"><XCircle className="h-4 w-4 text-[var(--ts-lost)]" />These customers were not imported:</p>
              <ul className="mt-1 list-disc pl-5">{report.failures!.map(f => <li key={f.customerId}>{f.customerName}: {f.error}</li>)}</ul></div>}
            {report.errors.length > 0 && <p className="text-sm text-muted-foreground">Nothing was written because of the errors below.</p>}
          </div>}

          {report.errors.length > 0 && <div className="space-y-2" data-testid="import-errors">
            {group(report.errors).map(([file, items]) => <div key={file} className="rounded-md border border-[var(--ts-lost)]/50 bg-[var(--ts-lost)]/5">
              <p className="flex items-center gap-1.5 border-b border-[var(--ts-lost)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--ts-lost)]"><XCircle className="h-3.5 w-3.5" />{file}<span className="tabular-nums">({items.length})</span></p>
              <ul className="divide-y divide-[var(--ts-lost)]/15 text-sm">{items.map((e, i) => <li key={i} className="flex gap-3 px-3 py-1">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">row {e.row}{e.column ? ` · ${e.column}` : ""}</span><span>{e.message}</span></li>)}</ul></div>)}
          </div>}

          {report.warnings.length > 0 && <div className="space-y-2" data-testid="import-warnings">
            {group(report.warnings).map(([file, items]) => <div key={file} className="rounded-md border border-[var(--ts-waiting)]/50 bg-[var(--ts-waiting)]/5">
              <p className="flex items-center gap-1.5 border-b border-[var(--ts-waiting)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--warning)]"><AlertTriangle className="h-3.5 w-3.5" />{file}<span className="tabular-nums">({items.length})</span></p>
              <ul className="divide-y divide-[var(--ts-waiting)]/15 text-sm">{items.map((w, i) => <li key={i} className="flex gap-3 px-3 py-1">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{w.row !== undefined ? `row ${w.row}` : "—"}</span>
                <span>{w.contractRef && <code className="mr-1.5 rounded bg-muted px-1 text-xs">{w.contractRef}</code>}{w.message}</span></li>)}</ul></div>)}
          </div>}

          {report.customers.length > 0 && <div className="overflow-x-auto rounded-md border" data-testid="import-customers">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                {["Agreement / season", "Dates", "Status", "Annual price", "Pay lines", "Rates", "Scope", "Docs", ""].map(h => <th key={h} className="px-3 py-1.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {report.customers.map(c => <Fragment key={c.customerId}>
                  <tr className="border-t bg-[hsl(var(--table-header))]"><td colSpan={9} className="px-3 py-1.5 font-semibold">{c.customerName}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{c.agreements.length} agreements</span></td></tr>
                  {c.agreements.map(a => <Fragment key={a.agreementRef}>
                    <tr className="border-t">
                      <td colSpan={8} className="px-3 py-1 text-xs"><code className="rounded bg-muted px-1">{a.agreementRef}</code>
                        <span className="ml-2 text-muted-foreground">{LINES[a.line] ?? a.line} · {a.form === "ours" ? "Our form" : "Their form"}</span></td>
                      <td className="px-3 py-1 text-right"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${a.action === "replace" ? "bg-[var(--ts-waiting)]/15 text-[var(--warning)]" : "bg-primary/15"}`} data-testid={`action-${a.agreementRef}`}>{a.action}</span></td>
                    </tr>
                    {a.terms.map(t => <tr key={t.contractRef} className={`border-t ${t.needsReview ? "bg-[var(--ts-waiting)]/5" : ""}`} data-testid={`term-${t.contractRef}`}>
                      <td className="py-1 pl-8 pr-3"><span className="font-medium">{t.description ?? t.season}</span><span className="ml-2 font-mono text-[11px] text-muted-foreground">{t.contractRef}</span></td>
                      <td className="whitespace-nowrap px-3 py-1 tabular-nums">{t.startDate} – {t.endDate}</td>
                      <td className="px-3 py-1"><span className={`rounded px-1.5 py-0.5 text-xs capitalize ${STATUS_TONE[t.status] ?? "bg-muted"}`}>{t.status}</span>
                        {t.needsReview && <span className="ml-1 text-[11px] font-medium text-[var(--warning)]">review</span>}</td>
                      <td className="px-3 py-1 tabular-nums">{money(t.annualPrice)}</td>
                      <td className="px-3 py-1 tabular-nums">{t.paymentLines}</td><td className="px-3 py-1 tabular-nums">{t.rates}</td>
                      <td className="px-3 py-1 tabular-nums">{t.scope}</td><td className="px-3 py-1 tabular-nums">{docCount(t.documents)}</td><td />
                    </tr>)}
                  </Fragment>)}
                </Fragment>)}
              </tbody>
            </table>
          </div>}
          {dry && report.customers.length === 0 && report.errors.length === 0 && <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">Nothing to import in these files.</p>}
        </div>}
      </section>
    </CardContent>
  </Card>;
}
