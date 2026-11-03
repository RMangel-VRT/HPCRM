import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, CheckCircle2, Clock, Link2, RefreshCw, Send, Pencil, CircleDashed, GitBranch } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { canViewBilling } from "@/lib/billing";
import {
  canPromote, cardKey, errorText, qboJson, reviewHref, scopeKey, useQboInvalidate, useQboTerms, type QuickBooksCard,
} from "@/lib/qboReview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Customer } from "@shared/schema";

export const POLL_MS = 5_000;
export const POLL_LIMIT_MS = 60_000;

type StateKind = "linked" | "not_linked" | "waiting" | "via_parent" | "error" | "collision";
export function cardState(d: QuickBooksCard): StateKind {
  const c = d.customer;
  if (d.billsThroughParent || c.qboSyncState === "via_parent") return "via_parent";
  if (d.reviews.some(r => r.kind === "name_taken")) return "collision";
  if (c.qboSyncState === "error") return "error";
  if (c.qboSyncState === "pending_push") return "waiting";
  if (c.qboCustomerId) return "linked";
  return "not_linked";
}
const TERMINAL: StateKind[] = ["linked", "collision", "error"];
const fmt = (s: unknown) => { if (!s) return null; const d = new Date(s as string); return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); };

const ZIP = /^\d{5}(-?\d{4})?$/;
const billingSchema = z.object({
  billingName: z.string().trim().max(100, "100 characters max"),
  billingCompanyName: z.string().trim(), billingContactName: z.string().trim(),
  billingEmails: z.string().refine(s => s.split(/[\s,;]+/).filter(Boolean).every(e => z.string().email().safeParse(e).success), "Enter valid email addresses, separated by commas"),
  billingPhone: z.string().trim(), billingMobile: z.string().trim(),
  billToMode: z.enum(["property", "management_company", "custom"]),
  billStreet: z.string().trim(), billStreet2: z.string().trim(), billCity: z.string().trim(), billState: z.string().trim(), billZip: z.string().trim(),
  qboTermId: z.string(), branchBillingMode: z.enum(["master", "separate"]),
}).superRefine((v, ctx) => {
  if (v.billToMode !== "custom") return;
  for (const k of ["billStreet", "billCity", "billState", "billZip"] as const) if (!v[k]) ctx.addIssue({ code: "custom", path: [k], message: "Required for another address" });
  if (v.billZip && !ZIP.test(v.billZip)) ctx.addIssue({ code: "custom", path: ["billZip"], message: "ZIP must be 12345 or 12345-6789" });
});
type BillingForm = z.infer<typeof billingSchema>;
const nul = (s: string) => (s.trim() ? s.trim() : null);

function BillingDialog({ customer, isParent, open, onOpenChange, onSaved }: { customer: Customer; isParent: boolean; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { user } = useAuth();
  const terms = useQboTerms();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<BillingForm>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      billingName: customer.billingName ?? "", billingCompanyName: customer.billingCompanyName ?? "", billingContactName: customer.billingContactName ?? "",
      billingEmails: (customer.billingEmails ?? []).join(", "), billingPhone: customer.billingPhone ?? "", billingMobile: customer.billingMobile ?? "",
      billToMode: (customer.billToMode as BillingForm["billToMode"]) ?? "property", billStreet: customer.billStreet ?? "", billStreet2: customer.billStreet2 ?? "",
      billCity: customer.billCity ?? "", billState: customer.billState ?? "", billZip: customer.billZip ?? "", qboTermId: customer.qboTermId ?? "",
      branchBillingMode: (customer.branchBillingMode as BillingForm["branchBillingMode"]) ?? "master",
    },
  });
  const save = useMutation({
    mutationFn: (v: BillingForm) => {
      // CQ1 owner fields only; sync metadata is never sent.
      const body: Record<string, unknown> = {
        billingName: nul(v.billingName), billingCompanyName: nul(v.billingCompanyName), billingContactName: nul(v.billingContactName),
        billingEmails: v.billingEmails.split(/[\s,;]+/).filter(Boolean), billingPhone: nul(v.billingPhone), billingMobile: nul(v.billingMobile),
        billToMode: v.billToMode, qboTermId: nul(v.qboTermId),
        ...(v.billToMode === "custom" ? { billStreet: v.billStreet, billStreet2: nul(v.billStreet2), billCity: v.billCity, billState: v.billState, billZip: v.billZip } : {}),
        ...(isParent ? { branchBillingMode: v.branchBillingMode } : {}),
      };
      return qboJson("PATCH", `/api/customers/${encodeURIComponent(customer.id)}`, user?.activeCompanyId, body);
    },
    onSuccess: () => { onSaved(); onOpenChange(false); },
    onError: e => setServerError(errorText(e)),
  });
  const mode = form.watch("billToMode");
  const text = (name: keyof BillingForm, label: string, cls = "") => <FormField control={form.control} name={name} render={({ field }) =>
    <FormItem className={cls}><FormLabel>{label}</FormLabel><FormControl><Input {...field} value={field.value as string} data-testid={`input-${name}`} /></FormControl><FormMessage /></FormItem>} />;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" data-testid="dialog-edit-billing">
      <DialogHeader><DialogTitle>Edit billing</DialogTitle><DialogDescription>The CRM owns these details. QuickBooks receives them on the next send.</DialogDescription></DialogHeader>
      <Form {...form}><form onSubmit={form.handleSubmit(v => { setServerError(null); save.mutate(v); })} className="grid grid-cols-2 gap-3">
        {text("billingName", "Billing name", "col-span-2")}
        {text("billingCompanyName", "Company")}{text("billingContactName", "Contact")}
        {text("billingEmails", "Billing emails", "col-span-2")}
        {text("billingPhone", "Phone")}{text("billingMobile", "Mobile")}
        <FormField control={form.control} name="billToMode" render={({ field }) => <FormItem className="col-span-2"><FormLabel>Bill to</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-billToMode"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent><SelectItem value="property">Property</SelectItem>
              <SelectItem value="management_company" disabled={!customer.propertyManagementCompanyId}>Management company</SelectItem>
              <SelectItem value="custom">Other address</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
        {mode === "custom" && <>{text("billStreet", "Street", "col-span-2")}{text("billStreet2", "Street 2", "col-span-2")}
          {text("billCity", "City")}{text("billState", "State")}{text("billZip", "ZIP")}</>}
        <FormField control={form.control} name="qboTermId" render={({ field }) => <FormItem><FormLabel>Terms</FormLabel>
          {terms.data?.length ? <Select value={field.value || "none"} onValueChange={v => field.onChange(v === "none" ? "" : v)}>
            <FormControl><SelectTrigger data-testid="select-qboTermId"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent><SelectItem value="none">No terms</SelectItem>{terms.data.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
            : <FormControl><Input {...field} placeholder="QuickBooks term ID" data-testid="input-qboTermId" /></FormControl>}<FormMessage /></FormItem>} />
        {isParent && <FormField control={form.control} name="branchBillingMode" render={({ field }) => <FormItem><FormLabel>Branch billing</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-branchBillingMode"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent><SelectItem value="master">Master (branches bill here)</SelectItem><SelectItem value="separate">Separate per branch</SelectItem></SelectContent></Select></FormItem>} />}
        {serverError && <p role="alert" className="col-span-2 text-sm text-destructive" data-testid="error-billing-save">{serverError}</p>}
        <DialogFooter className="col-span-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending} data-testid="button-save-billing">{save.isPending ? "Saving..." : "Save billing"}</Button></DialogFooter>
      </form></Form>
    </DialogContent>
  </Dialog>;
}

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words" data-testid={testId}>{children}</dd></div>;
}

function CardBody({ customerId, isParent }: { customerId: string; isParent: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const invalidate = useQboInvalidate();
  const billing = canViewBilling(user);
  const [pollUntil, setPollUntil] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [editing, setEditing] = useState(false);
  const polling = pollUntil !== null && !expired;
  const card = useQuery<QuickBooksCard>({
    queryKey: cardKey(customerId, user),
    queryFn: () => qboJson("GET", `/api/customers/${encodeURIComponent(customerId)}/quickbooks-card`, user?.activeCompanyId),
    refetchInterval: polling ? POLL_MS : false,
    refetchOnWindowFocus: polling,
    staleTime: 15_000,
  });
  const terms = useQboTerms();
  const sentAt = pollUntil !== null ? pollUntil - POLL_LIMIT_MS : null;
  // Only a read that started after the 202 can report a result; until then show the server's 202 state.
  const fresh = sentAt !== null && card.dataUpdatedAt >= sentAt && !card.isFetching;
  const serverState = card.data ? cardState(card.data) : null;
  const state = sentAt !== null && !fresh && serverState !== "via_parent" ? "waiting" : serverState;

  useEffect(() => {
    if (pollUntil === null || expired) return;
    const t = setTimeout(() => setExpired(true), Math.max(0, pollUntil - Date.now()));
    return () => clearTimeout(t);
  }, [pollUntil, expired]);
  useEffect(() => {
    if (polling && fresh && serverState && TERMINAL.includes(serverState)) {
      setPollUntil(null);
      invalidate([customerId]);
    }
  }, [polling, fresh, serverState]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!polling) return;
    const onFocus = () => { card.refetch(); invalidate([]); };
    window.addEventListener("focus", onFocus);
    const t = setInterval(() => invalidate([]), POLL_MS);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(t); };
  }, [polling]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: () => qboJson<{ message?: string }>("POST", `/api/qbo/customers/${encodeURIComponent(customerId)}/send-now`, user?.activeCompanyId, {}),
    onSuccess: r => {
      toast({ title: r?.message ?? "Waiting to send" });
      setExpired(false); setPollUntil(Date.now() + POLL_LIMIT_MS);
      void card.refetch({ cancelRefetch: true });
    },
    onError: e => toast({ title: "Couldn't send to QuickBooks", description: errorText(e), variant: "destructive" }),
  });

  if (card.isLoading) return <CardContent className="space-y-2" data-testid="loading-qbo-card"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></CardContent>;
  if (card.isError || !card.data) return <CardContent className="space-y-2">
    <p role="alert" className="text-sm text-destructive" data-testid="error-qbo-card">{errorText(card.error, "Couldn't load QuickBooks status.")}</p>
    <Button size="sm" variant="outline" onClick={() => card.refetch()} data-testid="button-retry-qbo-card">Try again</Button></CardContent>;

  const d = card.data; const c = d.customer; const eff = d.effectiveCustomer;
  const collision = d.reviews.find(r => r.kind === "name_taken");
  const otherReviews = d.reviews.filter(r => r.kind !== "name_taken");
  const reviewLink = (id: string | undefined, label: string, testId: string) => billing
    ? <Link href={reviewHref(id)} className="underline underline-offset-2" data-testid={testId}>{label}</Link>
    : <span data-testid={testId}>{label}</span>;
  const termId = eff.qboTermId;
  const termLabel = termId ? (d.termLabel ?? terms.data?.find(t => t.id === termId)?.name ?? `Term ${termId}`) : "None";
  const canSend = canPromote(user) && !c.qboCustomerId && state !== "via_parent" && state !== "collision";
  const sendBlocked = state === "waiting" || polling || send.isPending;
  const billTo = "problem" in d.billTo ? null : d.billTo;

  const line = (() => {
    switch (state) {
      case "linked": return { icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-400", text: <>Linked{d.linkedName ? <> to <strong>{d.linkedName}</strong></> : null}{fmt(c.qboPushedAt) ? <span className="text-muted-foreground"> · last pushed {fmt(c.qboPushedAt)}</span> : null}</> };
      case "via_parent": return { icon: GitBranch, tone: "text-sky-700 dark:text-sky-400", text: <>Bills through {d.parent ? <Link href={`/dashboard/customers/${d.parent.id}`} className="underline underline-offset-2">{d.parent.name}</Link> : "parent"}</> };
      case "collision": return { icon: AlertTriangle, tone: "text-amber-700 dark:text-amber-400", text: <>Name already used in QuickBooks. {reviewLink(collision?.id, "Open review", "link-qbo-collision-review")}</> };
      case "error": return { icon: AlertTriangle, tone: "text-destructive", text: <>Couldn't update QuickBooks{c.qboLastError ? <span className="block text-xs font-mono text-muted-foreground mt-0.5">{c.qboLastError}</span> : null}</> };
      case "waiting": return { icon: Clock, tone: "text-amber-700 dark:text-amber-400", text: <>Waiting to send{!d.writeEnabled ? <span className="text-muted-foreground"> (write access off)</span> : null}</> };
      default: return { icon: CircleDashed, tone: "text-muted-foreground", text: <>Not in QuickBooks yet</> };
    }
  })();
  const Icon = line.icon;
  return <CardContent className="space-y-3">
    <div className={`flex items-start gap-2 text-sm ${line.tone}`} data-testid="text-qbo-state" data-state={state ?? ""}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${polling ? "animate-pulse" : ""}`} /><div>{line.text}</div></div>
    {otherReviews.length > 0 && <p className="text-sm flex items-center gap-1.5 text-amber-800 dark:text-amber-300" data-testid="text-qbo-has-reviews">
      <Link2 className="w-3.5 h-3.5" />{reviewLink(otherReviews[0].id, "Has QuickBooks changes to review", "link-qbo-card-review")}</p>}
    {state === "waiting" && expired && <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-qbo-poll-expired">
      Still waiting. QuickBooks hasn't reported back yet.
      <Button size="sm" variant="outline" className="h-7" onClick={() => { card.refetch(); invalidate([]); }} data-testid="button-qbo-refresh"><RefreshCw className="w-3 h-3 mr-1" />Refresh</Button></div>}
    <dl className="space-y-1.5 border-t pt-3">
      <Row label="Billing name" testId="text-qbo-billing-name">{eff.billingName ?? eff.name}</Row>
      <Row label="Bill to" testId="text-qbo-bill-to">
        {billTo ? <><span className="block">{billTo.lines.join(", ")}</span><span className="text-xs text-muted-foreground">{d.billToModeLabel}</span></>
          : <span className="text-destructive">Billing address is incomplete</span>}</Row>
      {eff.billingContactName && <Row label="Contact" testId="text-qbo-contact">{eff.billingContactName}</Row>}
      <Row label="Emails" testId="text-qbo-emails">{eff.billingEmails?.length ? eff.billingEmails.join(", ") : "None"}</Row>
      {(eff.billingPhone || eff.billingMobile) && <Row label="Phone" testId="text-qbo-phone">{[eff.billingPhone, eff.billingMobile && `${eff.billingMobile} (mobile)`].filter(Boolean).join(" · ")}</Row>}
      <Row label="Terms" testId="text-qbo-terms">{termLabel}</Row>
      {d.termLookupError && <p role="alert" className="text-xs text-muted-foreground" data-testid="error-qbo-assigned-term">{d.termLookupError}</p>}
      {!c.parentCustomerId && isParent && <Row label="Branches" testId="text-qbo-branch-mode">{c.branchBillingMode === "separate" ? "Each branch bills separately" : "Branches bill to this parent"}</Row>}
    </dl>
    {canPromote(user) && <div className="flex flex-wrap gap-2 pt-1">
      {canSend && <Button size="sm" onClick={() => send.mutate()} disabled={sendBlocked} aria-describedby={sendBlocked ? "qbo-send-hint" : undefined} data-testid="button-send-to-qbo">
        <Send className="w-3.5 h-3.5 mr-1" />{send.isPending ? "Sending..." : "Send to QuickBooks now"}</Button>}
      {d.billsThroughParent ? (d.parent && <Link href={`/dashboard/customers/${d.parent.id}`} className="text-xs text-muted-foreground underline self-center" data-testid="link-edit-parent-billing">Billing is edited on {d.parent.name}</Link>)
        : <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-billing"><Pencil className="w-3.5 h-3.5 mr-1" />Edit billing</Button>}
    </div>}
    {canSend && sendBlocked && !send.isPending && <p id="qbo-send-hint" className="text-xs text-muted-foreground" data-testid="text-qbo-send-hint">
      {d.writeEnabled ? "Already waiting to send. The CRM will report back when QuickBooks answers." : "QuickBooks write access is off. This customer will send once it is turned on."}</p>}
    {editing && <BillingDialog customer={c} isParent={isParent} open={editing} onOpenChange={setEditing}
      onSaved={() => { toast({ title: "Billing saved" }); invalidate([customerId]); }} />}
  </CardContent>;
}

/** Compact QuickBooks status card for the customer financial area. Remounts per company/viewer scope. */
export default function QboCustomerCard({ customerId, isParent = false }: { customerId: string; isParent?: boolean }) {
  const { user } = useAuth();
  if (!user) return null;
  return <Card data-testid="card-qbo-customer" className="border-l-4 border-l-primary/60">
    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">QuickBooks</CardTitle></CardHeader>
    <CardBody key={`${scopeKey(user)}:${customerId}`} customerId={customerId} isParent={isParent} />
  </Card>;
}
