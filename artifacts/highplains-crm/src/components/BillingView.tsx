import { useMemo, useState, Fragment } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Loader2, AlertCircle, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { saveTicketOrigin, ticketDetailHref } from "@/lib/ticketListReturn";
import { TicketTypeBadge } from "@/components/TicketIdentity";
import {
  canViewBilling, groupByProperty, pendingInvoicesKey, readGroupPref, sortPendingInvoices, writeGroupPref,
  type PendingInvoice, type PendingScope, type PendingView,
} from "@/lib/billing";

interface Props {
  role?: string | null;
  activeTags?: string[] | null;
  userId?: string | null;
  companyId?: string | null;
  users: Map<string, { name?: string | null }>;
  scope?: PendingScope;
  showAssignee?: boolean;
  onOpenTicket?: (id: string) => void;
}

interface InvoiceCompletion {
  parentTicketId?: string | null;
  parentTitle?: string | null;
  parentTypeKey?: string | null;
  parentAdvanced?: boolean;
  siblingHeld?: boolean;
}

const fmtDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { timeZone: "America/Denver" });
};
const cat = (c?: string | null) => (c ? c.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase()) : "—");

/** Truthful toast: only a verified Task advance claims Done. */
export function invoicedToastText(title: string, c?: InvoiceCompletion | null): string {
  if (c?.parentAdvanced && c.parentTypeKey === "task") return `Invoiced. ${c.parentTitle || title} is Done.`;
  if (c?.siblingHeld) return `Invoiced. This invoice is closed; ${c.parentTitle || "the linked job"} waits on its other invoices.`;
  return "Invoiced.";
}

/** Keyed by company + viewer so group preference, dialogs and queries never carry over. */
export default function BillingView(props: Props) {
  return <BillingViewInner key={`${props.companyId ?? ""}:${props.userId ?? ""}`} {...props} />;
}

function BillingViewInner({
  role, activeTags, userId, companyId, users, scope = "all", showAssignee = false, onOpenTicket,
}: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const allowed = canViewBilling({ activeRole: role, activeTags });
  const [view, setView] = useState<PendingView>("waiting");
  const [grouped, setGrouped] = useState(() => readGroupPref(userId));
  const [invoiceTarget, setInvoiceTarget] = useState<PendingInvoice | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const fetchPending = (v: PendingView) => async () =>
    (await apiRequest("GET", `/api/pending-invoices?scope=${scope}&view=${v}`)).json();
  // The waiting query always runs so the header keeps its waiting count in either mode.
  const waitingQuery = useQuery<PendingInvoice[]>({
    queryKey: pendingInvoicesKey(companyId, userId, scope, "waiting"),
    queryFn: fetchPending("waiting"),
    enabled: allowed,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: "always",
  });
  const recentQuery = useQuery<PendingInvoice[]>({
    queryKey: pendingInvoicesKey(companyId, userId, scope, "recent"),
    queryFn: fetchPending("recent"),
    enabled: allowed && view === "recent",
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: "always",
  });
  const active = view === "recent" ? recentQuery : waitingQuery;
  const { isLoading, isError, refetch, isFetching } = active;
  const data = active.data;
  const waitingCount = Array.isArray(waitingQuery.data) ? waitingQuery.data.length : 0;
  const { data: typesData } = useQuery<any[]>({
    queryKey: ["/api/ticket-types", companyId],
    queryFn: async () => (await apiRequest("GET", "/api/ticket-types")).json(),
    enabled: allowed,
  });
  const { data: statusesData } = useQuery<any[]>({
    queryKey: ["/api/ticket-type-statuses", companyId],
    queryFn: async () => (await apiRequest("GET", "/api/ticket-type-statuses")).json(),
    enabled: allowed,
  });
  const invoicedStatusId = useMemo(() => {
    const types = Array.isArray(typesData) ? typesData : [];
    const statuses = Array.isArray(statusesData) ? statusesData : [];
    const invoiceType = types.find((t) => t?.typeKey === "invoice");
    return statuses.find((s) => s?.ticketTypeId === invoiceType?.id && s?.statusKey === "invoiced")?.id as string | undefined;
  }, [typesData, statusesData]);

  const refreshAll = () => {
    for (const key of ["/api/pending-invoices", "/api/tickets/my", "/api/tickets", "/api/dashboard/action-queue"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const markInvoiced = useMutation({
    mutationFn: async ({ row, number }: { row: PendingInvoice; number: string }) => {
      const body: Record<string, unknown> = { currentStatusId: invoicedStatusId };
      if (number.trim()) body.invoiceNumber = number.trim();
      const res = await apiRequest("PATCH", `/api/tickets/${row.id}`, body);
      return (await res.json()) as { invoiceCompletion?: InvoiceCompletion | null };
    },
    onSuccess: (result, { row }) => {
      toast({ title: invoicedToastText(row.title, result?.invoiceCompletion) });
      refreshAll();
    },
    onError: (e: Error) => toast({ title: "Couldn't mark invoiced", description: e.message, variant: "destructive" }),
  });

  const createInvoice = useMutation({
    mutationFn: async (row: PendingInvoice) => (await apiRequest("POST", `/api/tickets/${row.id}/create-invoice`, {})).json(),
    onSuccess: (_r, row) => { toast({ title: `Invoice created for ${row.title}.` }); refreshAll(); },
    onError: (e: Error) => toast({ title: "Couldn't create invoice", description: e.message, variant: "destructive" }),
  });

  const openTicket = (id: string) => { saveTicketOrigin(id); onOpenTicket?.(id); };
  const rows = useMemo(() => {
    const base = sortPendingInvoices(Array.isArray(data) ? data : []);
    return view === "recent"
      ? [...base].sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
      : base;
  }, [data, view]);
  const groups = useMemo(() => {
    if (!grouped) return [];
    const gs = groupByProperty(rows);
    if (view !== "recent") return gs;
    const t = (r: PendingInvoice) => new Date(r.completedAt ?? 0).getTime();
    return gs.map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => t(b) - t(a) || a.id.localeCompare(b.id)) }));
  }, [grouped, rows, view]);
  if (!allowed) return null;

  if (isLoading) {
    return <div className="flex justify-center py-16" data-testid="billing-loading"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (isError) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-3 py-12" data-testid="billing-error">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Couldn't load charges waiting to be invoiced.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-billing-retry">Retry</Button>
      </CardContent></Card>
    );
  }

  const recent = view === "recent";
  const headers = [
    "Property", "Charge", "From", recent ? "Invoiced" : "Work completed", recent ? "Invoice #" : "Category",
    ...(recent ? [] : ["Age"]), ...(showAssignee ? ["Assignee"] : []), ...(recent ? [] : [""]),
  ];
  const span = headers.length;

  const renderRow = (r: PendingInvoice) => {
    const src = r.sourceTicket;
    const stranded = r.kind === "stranded";
    const old = (r.ageDays ?? 0) >= 5;
    const busy = (markInvoiced.isPending && markInvoiced.variables?.row.id === r.id) ||
      (createInvoice.isPending && createInvoice.variables?.id === r.id);
    return (
      <tr key={`${r.kind ?? "invoice"}-${r.id}`}
        className={`border-t transition-colors ${recent ? "" : "cursor-pointer"} ${stranded ? "bg-amber-50/70 dark:bg-amber-950/20 hover:bg-amber-100/70 dark:hover:bg-amber-950/30" : "hover:bg-muted/40"}`}
        data-testid={`row-billing-${r.id}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a,button")) return;
          openTicket(r.id);
          navigate(ticketDetailHref(r.id));
        }}>
        <td className="px-3 py-2 font-medium">{r.customer?.name || "—"}</td>
        <td className="px-3 py-2">
          <Link href={ticketDetailHref(r.id)} onClick={() => openTicket(r.id)} className="hover:underline text-primary" data-testid={`link-billing-${r.id}`}>
            {r.title}
          </Link>
          {stranded && <div className="text-xs text-muted-foreground" data-testid={`text-stranded-${r.id}`}>Ready for billing, no invoice yet</div>}
        </td>
        <td className="px-3 py-2">
          {src ? (
            <span className="flex items-center gap-2 min-w-0">
              <TicketTypeBadge type={{ name: src.typeName ?? "", typeKey: src.typeKey }} />
              <span className="truncate max-w-[220px]">{src.title}</span>
            </span>
          ) : <span className="text-muted-foreground">Standalone</span>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(recent ? r.completedAt : r.workCompletedDate)}</td>
        {recent ? (
          <td className="px-3 py-2 whitespace-nowrap tabular-nums" data-testid={`text-invoice-number-${r.id}`}>{r.invoiceNumber || "—"}</td>
        ) : (
          <>
            <td className="px-3 py-2">{cat(r.invoiceCategory)}</td>
            <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${old ? "text-destructive font-semibold" : ""}`} data-testid={`text-age-${r.id}`}>
              {r.ageDays != null ? `${r.ageDays}d` : "—"}
            </td>
          </>
        )}
        {showAssignee && (
          <td className="px-3 py-2">{r.assignedToId
            ? r.assigneeName || users.get(r.assignedToId)?.name || <span className="text-muted-foreground">Assignee unavailable</span>
            : <span className="text-muted-foreground">Unassigned</span>}</td>
        )}
        {!recent && (
          <td className="px-3 py-2 text-right whitespace-nowrap">
            {stranded ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => createInvoice.mutate(r)} data-testid={`button-create-invoice-${r.id}`}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create invoice"}
              </Button>
            ) : (
              <Button size="sm" disabled={busy || !invoicedStatusId}
                onClick={() => { setInvoiceNumber(""); setInvoiceTarget(r); }}
                data-testid={`button-mark-invoiced-${r.id}`}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark invoiced"}
              </Button>
            )}
          </td>
        )}
      </tr>
    );
  };

  const noun = (n: number) => (n === 1 ? "charge" : "charges");
  return (
    <div className="space-y-3" data-testid="billing-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" data-testid="text-billing-count">
          {`${waitingCount} ${noun(waitingCount)} waiting`}
        </h2>
        {recent && <span className="text-sm text-muted-foreground" data-testid="text-billing-recent-count">{rows.length} recently invoiced</span>}
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Billing list view">
            {(["waiting", "recent"] as const).map((v) => (
              <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} aria-pressed={view === v}
                onClick={() => setView(v)} data-testid={`button-billing-view-${v}`}>
                {v === "waiting" ? "Waiting" : "Recently invoiced"}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={grouped}
              onCheckedChange={(v) => { const b = v === true; setGrouped(b); writeGroupPref(userId, b); }}
              data-testid="checkbox-group-by-property"
            />
            Group by property
          </label>
        </div>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12" data-testid="billing-empty">
          <Receipt className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{recent ? "Nothing invoiced in the last 30 days." : "Nothing waiting to be invoiced."}</p>
        </CardContent></Card>
      ) : (
        <Card className={`overflow-x-auto ${isFetching ? "opacity-90" : ""}`}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{headers.map((h, i) => <th key={`${h}-${i}`} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {grouped
                ? groups.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="bg-muted/30 border-t" data-testid={`group-billing-${g.key}`}>
                        <td colSpan={span} className="px-3 py-1.5 font-semibold">
                          {g.name} <span className="text-muted-foreground font-normal">· {g.rows.length} {noun(g.rows.length)}</span>
                        </td>
                      </tr>
                      {g.rows.map(renderRow)}
                    </Fragment>
                  ))
                : rows.map(renderRow)}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground" data-testid="text-billing-footer">
        {recent
          ? scope === "mine"
            ? "Final invoices assigned to you or unassigned, invoiced in the last 30 Colorado calendar days."
            : "Every final invoice in the company invoiced in the last 30 Colorado calendar days."
          : scope === "mine"
            ? "Same list as the Billing page, filtered to you, plus any job stuck at Ready for billing."
            : "Every charge in the company, plus any job stuck at Ready for billing with no invoice."}
      </p>
      <AlertDialog open={invoiceTarget !== null} onOpenChange={(open) => { if (!open) setInvoiceTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark invoice as invoiced?</AlertDialogTitle>
            <AlertDialogDescription>
              This changes the ticket status only. It does not create or sync an invoice in QuickBooks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="input-qbo-invoice-number">QuickBooks invoice # (optional)</Label>
            <Input id="input-qbo-invoice-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
              data-testid="input-qbo-invoice-number" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-mark-invoiced"
              onClick={() => { if (invoiceTarget) markInvoiced.mutate({ row: invoiceTarget, number: invoiceNumber }); setInvoiceTarget(null); }}>
              Mark invoiced
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
