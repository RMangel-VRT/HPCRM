import { Fragment, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { extractApiErrorMessage } from "@/lib/apiError";

interface Report {
  dryRun: boolean;
  summary: { customers: number; agreements: number; terms: number; scopeLines: number;
    billingMonths: number; documents: number; needsReview: number; alreadyCopied: number };
  ignoredServicePlans: number;
  failures: { customerId: string; customerName: string; error: string }[];
  customers: { customerId: string; customerName: string; error?: string; agreements: {
    line: string; terms: { legacyContractIds: string[]; seasonLabel: string; startDate: string;
      endDate: string; status: string; billingType: string; annualPriceCents: number | null;
      scope: { serviceKey: string; quantity: number | null }[]; flags: string[] }[];
  }[] }[];
}
const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function LegacyCopyCard({ ratesReady, ratesEmpty, rateRevision }: {
  ratesReady: boolean; ratesEmpty: boolean; rateRevision: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [previewRevision, setPreviewRevision] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [onlyFlags, setOnlyFlags] = useState(false);
  const mutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean; revision: string }) => {
      const res = await apiRequest("POST", "/api/admin/contract-center/copy-legacy", { dryRun });
      return await res.json() as Report;
    },
    onSuccess: (result, request) => {
      setReport(result);
      setPreviewRevision(result.dryRun ? request.revision : null);
      setConfirming(false);
    },
    onError: () => { setPreviewRevision(null); setConfirming(false); },
  });
  const contractCount = report?.customers.filter(c => !c.error).reduce((n, c) =>
    n + c.agreements.reduce((a, g) => a + g.terms.reduce((t, term) => t + term.legacyContractIds.length, 0), 0), 0) ?? 0;
  const canCopy = ratesReady && report?.dryRun && previewRevision === rateRevision && contractCount > 0 && !mutation.isPending;
  const runPreview = () => {
    setPreviewRevision(null);
    setConfirming(false);
    mutation.mutate({ dryRun: true, revision: rateRevision });
  };
  return <Card data-testid="legacy-copy-card">
    <CardHeader>
      <CardTitle>Copy existing contracts</CardTitle>
      <CardDescription>Copies every contract from the old system into the Contract Center. The old screens keep working. Run the preview first; anything uncertain is marked for review, not guessed.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {ratesEmpty && <p className="text-sm text-muted-foreground">Load the standard rates first.</p>}
      {!ratesReady && !ratesEmpty && <p className="text-sm text-muted-foreground">Wait for the rate card to load and finish saving before previewing or copying.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={runPreview} disabled={!ratesReady || mutation.isPending} data-testid="button-preview-copy">
          {mutation.isPending && mutation.variables?.dryRun === true ? "Previewing…" : "Preview"}
        </Button>
        <Button onClick={() => setConfirming(true)} disabled={!canCopy} data-testid="button-copy-legacy">Copy {contractCount} contracts</Button>
      </div>
      {confirming && canCopy && <div className="rounded-md border p-4 space-y-3" data-testid="copy-confirmation">
        <p className="text-sm">Copy {contractCount} legacy contracts into the new tables? Old records and stored files will not change. Each customer is copied in full or not at all. Review flags will be preserved.</p>
        <div className="flex gap-2">
          <Button onClick={() => { setPreviewRevision(null); setConfirming(false); mutation.mutate({ dryRun: false, revision: rateRevision }); }} data-testid="button-confirm-copy">Confirm copy</Button>
          <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      </div>}
      {mutation.isPending && mutation.variables?.dryRun === false && <p role="status">Copying contracts…</p>}
      {mutation.isError && <p role="alert" className="text-sm text-destructive">{extractApiErrorMessage(mutation.error) ?? "Could not copy contracts. Run Preview again before retrying."}</p>}
      {report && <section className="space-y-3" aria-live="polite">
        <h3 className="font-semibold">{report.dryRun ? "Preview" : "Copied"} results</h3>
        <p className="text-sm">{contractCount} {report.dryRun ? "contracts to copy" : "contracts copied"}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {Object.entries(report.summary).map(([key, value]) => <div key={key} className="rounded border p-2">
            <dt className="text-muted-foreground">{({ scopeLines: "Scope lines", billingMonths: "Billing months", needsReview: "Needs review", alreadyCopied: "Already copied" } as Record<string, string>)[key] ?? key.charAt(0).toUpperCase() + key.slice(1)}</dt><dd className="font-medium">{value}</dd>
          </div>)}
        </dl>
        <p className="text-sm text-muted-foreground">{report.ignoredServicePlans} service plans ignored because their year matches no legacy term.</p>
        {report.failures.length > 0 && <div role="alert" className="rounded border border-destructive p-3 text-sm">
          <p className="font-medium">These customers were not copied:</p>
          <ul className="list-disc pl-5">{report.failures.map(f => <li key={f.customerId}>{f.customerName}: {f.error}</li>)}</ul>
        </div>}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyFlags} onCheckedChange={setOnlyFlags} data-testid="toggle-copy-flags" />Show only rows with flags
        </label>
        <div className="overflow-x-auto rounded border">
          <Table>
            <TableHeader><TableRow>{["Customer", "Line", "Season", "Dates", "Status", "Price", "Services", "Flags"].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {report.customers.flatMap(c => c.agreements.flatMap(a => a.terms.filter(t => !onlyFlags || t.flags.length > 0).map(t =>
                <Fragment key={`${c.customerId}:${a.line}:${t.legacyContractIds.join(",")}`}>
                  <TableRow className={t.flags.length ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                    <TableCell>{c.customerName}{c.error && <span className="block text-destructive">Not copied</span>}</TableCell>
                    <TableCell className="capitalize">{a.line}</TableCell><TableCell>{t.seasonLabel}</TableCell>
                    <TableCell className="whitespace-nowrap">{t.startDate} – {t.endDate}</TableCell>
                    <TableCell>{t.status}<span className="block text-xs text-muted-foreground">{t.billingType}</span></TableCell>
                    <TableCell>{t.annualPriceCents === null ? "Not entered" : dollars(t.annualPriceCents)}</TableCell>
                    <TableCell>{t.scope.length}</TableCell><TableCell>{t.flags.length}</TableCell>
                  </TableRow>
                  {t.flags.length > 0 && <TableRow className="bg-amber-50/60 dark:bg-amber-950/20"><TableCell colSpan={8} className="pt-0">
                    <ul className="list-disc pl-5 text-sm">{t.flags.map(flag => <li key={flag}>{flag}</li>)}</ul>
                  </TableCell></TableRow>}
                </Fragment>)))}
              {report.summary.terms === 0 && report.failures.length === 0 && <TableRow><TableCell colSpan={8}>No contracts remain to copy.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>}
    </CardContent>
  </Card>;
}
