import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, Check, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FIELD_LABELS, KIND_LABELS, REVIEW_KINDS, canPromote, errorText, formatValue, kindLabel, qboJson, scopeKey,
  useQboInvalidate, useQboReviews, useResolveReview, useReviewOptions,
  type QboReview, type ResolveBody, type ReviewKind,
} from "@/lib/qboReview";

const fmtDate = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };

function summary(r: QboReview): string {
  if (r.kind === "changed_in_qbo") {
    const keys = Object.keys(r.fields ?? {});
    return keys.length ? `${keys.map(k => FIELD_LABELS[k] ?? k).join(", ")} changed` : "Fields changed";
  }
  return r.message ?? r.qboSnapshot?.displayName ?? "";
}

/** Shared feedback line: errors stay visible until the next attempt. */
function Feedback({ error, testId }: { error: string | null; testId: string }) {
  if (!error) return null;
  return <p role="alert" className="text-sm text-destructive flex items-start gap-1.5" data-testid={testId}>
    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>;
}

function useAct(review: QboReview) {
  const resolve = useResolveReview();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const run = (body: ResolveBody, done: string) => {
    setError(null);
    resolve.mutate({ review, body }, {
      onSuccess: () => toast({ title: done }),
      onError: e => setError(errorText(e)),
    });
  };
  return { run, error, setError, pending: resolve.isPending };
}

function SnapshotView({ r }: { r: QboReview }) {
  const s = r.qboSnapshot ?? {};
  const rows: [string, unknown][] = [["Name", s.displayName ?? r.qboName], ["Company", s.companyName], ["Contact", s.contactName],
    ["Emails", s.emails], ["Phone", s.phone], ["Bill-to", s.billAddr], ["Service address", s.shipAddr],
    ["QuickBooks ID", r.qboId], ["Parent QuickBooks ID", s.parentQboId]];
  return <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-sm" data-testid="qbo-snapshot">
    {rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) =>
      <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{formatValue(v)}</dd></div>)}
  </dl>;
}

function ChangedPanel({ r }: { r: QboReview }) {
  const fields = r.fields ?? {};
  const keys = Object.keys(fields);
  const initial = () => Object.fromEntries(keys.filter(k => !fields[k].bothChanged).map(k => [k, "qbo" as const]));
  const [choices, setChoices] = useState<Record<string, "qbo" | "crm">>(initial);
  const { run, error, pending } = useAct(r);
  const complete = keys.length > 0 && keys.every(k => choices[k]);
  const setAll = (v: "qbo" | "crm") => setChoices(Object.fromEntries(keys.map(k => [k, v])));
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setAll("qbo")} data-testid="button-use-qbo-all">Use QuickBooks for all</Button>
      <Button size="sm" variant="outline" onClick={() => setAll("crm")} data-testid="button-keep-crm-all">Keep CRM for all</Button>
    </div>
    <div className="overflow-x-auto"><Table>
      <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>CRM</TableHead><TableHead>QuickBooks</TableHead><TableHead>Was</TableHead><TableHead>Choice</TableHead></TableRow></TableHeader>
      <TableBody>{keys.map(k => {
        const f = fields[k];
        return <TableRow key={k} data-testid={`row-field-${k}`}>
          <TableCell className="font-medium">{FIELD_LABELS[k] ?? k}
            {f.bothChanged && <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700 dark:text-amber-400" data-testid={`chip-both-changed-${k}`}>
              <AlertTriangle className="w-3 h-3 mr-1" />Changed on both sides</Badge>}</TableCell>
          <TableCell>{formatValue(f.crm)}</TableCell><TableCell>{formatValue(f.qbo)}</TableCell>
          <TableCell className="text-muted-foreground">{formatValue(f.baseline)}</TableCell>
          <TableCell><div role="radiogroup" aria-label={`${FIELD_LABELS[k] ?? k} choice`} className="inline-flex rounded-md border overflow-hidden">
            {(["crm", "qbo"] as const).map(v => <button key={v} type="button" role="radio" aria-checked={choices[k] === v}
              onClick={() => setChoices(c => ({ ...c, [k]: v }))} data-testid={`choice-${k}-${v}`}
              className={`px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${choices[k] === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {v === "crm" ? "Keep CRM" : "Use QuickBooks"}</button>)}
          </div></TableCell>
        </TableRow>;
      })}</TableBody></Table></div>
    {!complete && <p className="text-xs text-muted-foreground" data-testid="text-choices-required">Choose a side for every field to apply.</p>}
    <Feedback error={error} testId="error-resolve" />
    <Button disabled={!complete || pending} onClick={() => run({ choices }, "Changes applied")} data-testid="button-apply-choices">
      {pending ? "Applying..." : "Apply"}</Button>
  </div>;
}

/** Promotion opens the CQ5 wizard prefilled from this QuickBooks record with linkQboId set; nothing is created here. */
export const promoteHref = (qboId: string) => `/dashboard/customers/new?fromQbo=${encodeURIComponent(qboId)}`;
function PromoteForm({ r }: { r: QboReview }) {
  if (!r.qboId) return null;
  return <Button size="sm" asChild><Link href={promoteHref(r.qboId)} data-testid="button-create-crm-customer">Create CRM customer</Link></Button>;
}

function NewPanel({ r }: { r: QboReview }) {
  const { user } = useAuth();
  const { run, error, pending } = useAct(r);
  const options = useReviewOptions(true);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmSeparate, setConfirmSeparate] = useState(false);
  const isSub = r.kind === "sub_customer";
  const parentQbo = r.qboSnapshot?.parentQboId ?? null;
  const all = options.data?.customers ?? [];
  const byId = useMemo(() => new Map(all.map(c => [c.id, c])), [all]);
  const matchesParent = (c: typeof all[number]) => !!parentQbo && !!c.parentCustomerId && byId.get(c.parentCustomerId)?.qboCustomerId === parentQbo;
  const list = all.filter(c => !c.qboCustomerId && c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(isSub && matchesParent(b)) - Number(isSub && matchesParent(a)) || a.name.localeCompare(b.name)).slice(0, 30);
  return <div className="space-y-4">
    <SnapshotView r={r} />
    {isSub ? <p className="text-sm rounded-md bg-muted/60 p-3" data-testid="text-sub-customer-note">
      Creating sub-customers from QuickBooks isn't available yet. Link this record to the CRM branch whose parent already matches the QuickBooks parent.</p>
      : canPromote(user) ? <PromoteForm r={r} />
      : <p className="text-xs text-muted-foreground" data-testid="text-promote-restricted">Only admin or office can create CRM customers.</p>}
    <div className="space-y-2">
      <Label htmlFor="search-link-customer">Link to existing CRM customer</Label>
      <Input id="search-link-customer" placeholder="Search customers" value={q} onChange={e => setQ(e.target.value)} data-testid="input-search-link-customer" />
      {options.isLoading ? <Skeleton className="h-24" /> : options.isError ? <Feedback error="Couldn't load customers." testId="error-options" /> :
        <ul className="max-h-48 overflow-y-auto rounded-md border divide-y text-sm" data-testid="list-link-customers">
          {list.length === 0 && <li className="p-2 text-muted-foreground">No unlinked customers match.</li>}
          {list.map(c => <li key={c.id}><button type="button" onClick={() => setPicked(c.id)} aria-pressed={picked === c.id}
            className={`w-full text-left px-3 py-1.5 flex items-center justify-between ${picked === c.id ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
            data-testid={`option-customer-${c.id}`}><span>{c.name}</span>
            {isSub && matchesParent(c) && <span className="text-xs text-muted-foreground">matching branch</span>}</button></li>)}
        </ul>}
      {isSub && <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={confirmSeparate} onCheckedChange={v => setConfirmSeparate(v === true)} data-testid="checkbox-confirm-separate" />
        <span>Switch the parent to separate branch billing if it currently bills as master.</span></label>}
      <Button size="sm" variant="secondary" disabled={!picked || pending} data-testid="button-link-customer"
        onClick={() => picked && run({ action: "link", customerId: picked, ...(isSub && confirmSeparate ? { confirmSeparate: true as const } : {}) }, "Linked")}>Link</Button>
    </div>
    <Feedback error={error} testId="error-resolve" />
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ action: "ignore" }, "Ignored")} data-testid="button-ignore">Ignore</Button>
  </div>;
}

function RemovedPanel({ r }: { r: QboReview }) {
  const { run, error, pending } = useAct(r);
  const options = useReviewOptions(true);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const list = (options.data?.quickbooks ?? []).filter(x => x.qboId !== r.qboId && x.displayName.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  return <div className="space-y-4">
    {r.message && <p className="text-sm" data-testid="text-review-message">{r.message}</p>}
    <SnapshotView r={r} />
    <div className="space-y-2">
      <Label htmlFor="search-link-qbo">Link to another QuickBooks customer</Label>
      <Input id="search-link-qbo" placeholder="Search QuickBooks customers" value={q} onChange={e => setQ(e.target.value)} data-testid="input-search-link-qbo" />
      {options.isLoading ? <Skeleton className="h-24" /> : options.isError ? <Feedback error="Couldn't load QuickBooks customers." testId="error-options" /> :
        <ul className="max-h-48 overflow-y-auto rounded-md border divide-y text-sm" data-testid="list-link-qbo">
          {list.length === 0 && <li className="p-2 text-muted-foreground">No QuickBooks customers match.</li>}
          {list.map(x => <li key={x.qboId}><button type="button" onClick={() => setPicked(x.qboId)} aria-pressed={picked === x.qboId}
            className={`w-full text-left px-3 py-1.5 flex justify-between ${picked === x.qboId ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
            data-testid={`option-qbo-${x.qboId}`}><span>{x.displayName}</span>
            {!x.active && <span className="text-xs text-muted-foreground">inactive</span>}</button></li>)}
        </ul>}
      <Button size="sm" variant="secondary" disabled={!picked || pending} onClick={() => picked && run({ action: "link", qboId: picked }, "Linked")} data-testid="button-link-qbo">Link to another QuickBooks customer</Button>
    </div>
    <Feedback error={error} testId="error-resolve" />
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run({ action: "unlink" }, "Unlinked")} data-testid="button-unlink">Unlink</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ action: "dismiss" }, "Dismissed")} data-testid="button-dismiss">Dismiss</Button>
    </div>
  </div>;
}

function NameTakenPanel({ r }: { r: QboReview }) {
  const { user } = useAuth();
  const { run, error, setError, pending } = useAct(r);
  const invalidate = useQboInvalidate();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const renameAndRetry = async () => {
    if (!r.customerId || !name.trim()) return;
    setError(null); setSaving(true);
    try {
      await qboJson("PATCH", `/api/customers/${encodeURIComponent(r.customerId)}`, user?.activeCompanyId, { billingName: name.trim() });
      invalidate([r.customerId]);
      run({ action: "renamed" }, "Renamed; retrying QuickBooks");
    } catch (e) { setError(errorText(e)); } finally { setSaving(false); }
  };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">QuickBooks already has a customer with this name:</p>
    <SnapshotView r={r} />
    <Feedback error={error} testId="error-resolve" />
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={() => run({ action: "link" }, "Linked")} data-testid="button-link-existing">Link to it</Button>
      {canPromote(user) && !renaming && <Button size="sm" variant="outline" onClick={() => { setName(r.customerName ?? ""); setRenaming(true); }} data-testid="button-rename">Rename in CRM</Button>}
    </div>
    {renaming && <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-48"><Label htmlFor="input-rename" className="text-xs">New billing name</Label>
        <Input id="input-rename" value={name} onChange={e => setName(e.target.value)} data-testid="input-rename-billing" /></div>
      <Button size="sm" disabled={!name.trim() || saving || pending} onClick={renameAndRetry} data-testid="button-rename-retry">{saving || pending ? "Saving..." : "Save and retry"}</Button>
      <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
    </div>}
  </div>;
}

function SimplePanel({ r }: { r: QboReview }) {
  const { run, error, pending } = useAct(r);
  const inactive = r.kind === "qbo_inactive";
  return <div className="space-y-4">
    {r.message && <p className={`text-sm ${inactive ? "" : "rounded-md bg-destructive/10 p-3 font-mono text-xs"}`} data-testid="text-review-message">{r.message}</p>}
    {inactive && <SnapshotView r={r} />}
    <Feedback error={error} testId="error-resolve" />
    <div className="flex gap-2">
      {inactive ? <>
        <Button size="sm" disabled={pending} onClick={() => run({ action: "set_crm_inactive" }, "CRM customer set inactive")} data-testid="button-set-inactive">Set CRM customer inactive</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ action: "ignore" }, "Ignored")} data-testid="button-ignore">Ignore</Button>
      </> : <>
        <Button size="sm" disabled={pending} onClick={() => run({ action: "retry" }, "Queued to retry")} data-testid="button-retry"><RefreshCw className="w-3.5 h-3.5 mr-1" />Retry</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ action: "dismiss" }, "Dismissed")} data-testid="button-dismiss">Dismiss</Button>
      </>}
    </div>
  </div>;
}

export function ReviewPanel({ r }: { r: QboReview }) {
  switch (r.kind) {
    case "changed_in_qbo": return <ChangedPanel r={r} />;
    case "new_in_qbo": case "sub_customer": return <NewPanel r={r} />;
    case "qbo_removed": return <RemovedPanel r={r} />;
    case "name_taken": return <NameTakenPanel r={r} />;
    default: return <SimplePanel r={r} />;
  }
}

/** Remounts all selection, filter and mutation state on company/viewer change. */
export default function QboCustomerReview() {
  const { user } = useAuth();
  if (!user) return null;
  return <ReviewQueue key={scopeKey(user)} />;
}

function ReviewQueue() {
  const { user } = useAuth();
  const reviews = useQboReviews();
  const [kind, setKind] = useState<"all" | ReviewKind>("all");
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("review") : null);
  const rows = useMemo(() => [...(reviews.data ?? [])]
    .filter(r => kind === "all" || r.kind === kind)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [reviews.data, kind]);
  const current = rows.find(r => r.id === selected) ?? null;
  useEffect(() => { setSelected(s => (s && reviews.data && !reviews.data.some(r => r.id === s) ? null : s)); }, [reviews.data]);
  if (!user) return null;
  return <div className="space-y-4" data-testid="page-qbo-review">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/dashboard/invoicing" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline" data-testid="link-back-invoicing"><ArrowLeft className="w-3 h-3" />Invoicing</Link>
        <h1 className="text-2xl font-semibold" data-testid="text-qbo-review-title">QuickBooks customer review</h1>
      </div>
      <Select value={kind} onValueChange={v => setKind(v as typeof kind)}>
        <SelectTrigger className="w-60" data-testid="select-review-kind" aria-label="Filter by kind"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All kinds</SelectItem>
          {REVIEW_KINDS.map(k => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {reviews.isLoading ? <div className="space-y-2" data-testid="loading-reviews">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
      : reviews.isError ? <Card><CardContent className="py-8 text-center space-y-3">
          <Feedback error={errorText(reviews.error, "Couldn't load reviews.")} testId="error-reviews" />
          <Button size="sm" variant="outline" onClick={() => reviews.refetch()} data-testid="button-retry-reviews">Try again</Button></CardContent></Card>
      : rows.length === 0 ? <Card><CardContent className="py-14 text-center" data-testid="empty-reviews">
          <Check className="w-8 h-8 mx-auto mb-2 text-primary" />
          <p className="font-medium">Nothing to review. QuickBooks and the CRM agree.</p></CardContent></Card>
      : <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card className="overflow-hidden"><Table>
            <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Customer</TableHead><TableHead className="hidden md:table-cell">Summary</TableHead><TableHead>Raised</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map(r => <TableRow key={r.id} onClick={() => setSelected(r.id)} data-state={r.id === selected ? "selected" : undefined}
              tabIndex={0} role="button" aria-pressed={r.id === selected} aria-label={`Open ${kindLabel(r.kind)} review for ${r.customerName ?? r.qboName ?? "customer"}`}
              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelected(r.id); } }}
              className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`row-review-${r.id}`}>
              <TableCell><Badge variant="outline" className="whitespace-nowrap" data-testid={`kind-${r.id}`}>{kindLabel(r.kind)}</Badge></TableCell>
              <TableCell className="text-sm">{r.customerId ? <Link href={`/dashboard/customers/${r.customerId}`} onClick={e => e.stopPropagation()} className="hover:underline font-medium" data-testid={`link-customer-${r.id}`}>{r.customerName ?? "Customer"}</Link> : null}
                {r.qboName && <div className="text-xs text-muted-foreground">{r.qboName}</div>}</TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-64 truncate">{summary(r)}</TableCell>
              <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
            </TableRow>)}</TableBody></Table></Card>
          <Card data-testid="panel-review">
            {current ? <><CardHeader className="pb-3"><CardTitle className="text-base flex flex-wrap items-center gap-2">
                {kindLabel(current.kind)}<span className="text-muted-foreground font-normal">{current.customerName ?? current.qboName}</span></CardTitle></CardHeader>
              <CardContent><ReviewPanel key={`${current.id}:${current.updatedAt}`} r={current} /></CardContent></>
              : <CardContent className="py-12 text-center text-sm text-muted-foreground">Select a review to see its details.</CardContent>}
          </Card>
        </div>}
  </div>;
}
