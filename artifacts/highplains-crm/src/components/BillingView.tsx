import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Loader2, AlertCircle, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { ticketDetailHref } from "@/lib/ticketListReturn";
import { TicketTypeBadge } from "@/components/TicketIdentity";
import {
  canViewBilling, groupByProperty, readGroupPref, sortPendingInvoices, writeGroupPref,
  type PendingInvoice,
} from "@/lib/billing";

interface Props {
  role?: string | null;
  userId?: string | null;
  companyId?: string | null;
  users: Map<string, { name?: string | null }>;
  onOpenTicket?: (id: string) => void;
}

const fmtDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { timeZone: "America/Denver" });
};
const cat = (c?: string | null) => (c ? c.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase()) : "—");

export default function BillingView({ role, userId, companyId, users, onOpenTicket }: Props) {
  const [, navigate] = useLocation();
  const allowed = canViewBilling(role);
  const [grouped, setGrouped] = useState(() => readGroupPref(userId));
  const { data, isLoading, isError, refetch, isFetching } = useQuery<PendingInvoice[]>({
    // Prefix invalidation still works; company/viewer keys prevent stale charges
    // from another session being shown while this session's request loads.
    queryKey: ["/api/pending-invoices", companyId, userId],
    queryFn: async () => (await apiRequest("GET", "/api/pending-invoices")).json(),
    enabled: allowed,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: "always",
  });
  const rows = useMemo(() => sortPendingInvoices(data ?? []), [data]);
  const groups = useMemo(() => (grouped ? groupByProperty(rows) : []), [grouped, rows]);
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

  const renderRow = (r: PendingInvoice) => {
    const src = r.sourceTicket;
    return (
      <tr key={r.id} className="border-t hover:bg-muted/40 transition-colors cursor-pointer" data-testid={`row-billing-${r.id}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) return;
          onOpenTicket?.(r.id);
          navigate(ticketDetailHref(r.id));
        }}>
        <td className="px-3 py-2 font-medium">{r.customer?.name || "—"}</td>
        <td className="px-3 py-2">
          <Link href={ticketDetailHref(r.id)} onClick={() => onOpenTicket?.(r.id)} className="hover:underline text-primary" data-testid={`link-billing-${r.id}`}>
            {r.title}
          </Link>
        </td>
        <td className="px-3 py-2">
          {src ? (
            <span className="flex items-center gap-2 min-w-0">
              <TicketTypeBadge type={{ name: src.typeName ?? "", typeKey: src.typeKey }} />
              <span className="truncate max-w-[220px]">{src.title}</span>
            </span>
          ) : <span className="text-muted-foreground">Standalone</span>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.workCompletedDate)}</td>
        <td className="px-3 py-2">{cat(r.invoiceCategory)}</td>
        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.ageDays != null ? `${r.ageDays}d` : "—"}</td>
        <td className="px-3 py-2">{(r.assignedToId && users.get(r.assignedToId)?.name) || <span className="text-muted-foreground">Unassigned</span>}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-3" data-testid="billing-view">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" data-testid="text-billing-count">
          {rows.length} charges waiting
        </h2>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={grouped}
            onCheckedChange={(v) => { const b = v === true; setGrouped(b); writeGroupPref(userId, b); }}
            data-testid="checkbox-group-by-property"
          />
          Group by property
        </label>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12" data-testid="billing-empty">
          <Receipt className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nothing waiting to be invoiced.</p>
        </CardContent></Card>
      ) : (
        <Card className={`overflow-x-auto ${isFetching ? "opacity-90" : ""}`}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Property", "Charge", "From", "Work completed", "Category", "Age", "Assignee"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped
                ? groups.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="bg-muted/30 border-t" data-testid={`group-billing-${g.key}`}>
                        <td colSpan={7} className="px-3 py-1.5 font-semibold">
                          {g.name} <span className="text-muted-foreground font-normal">· {g.rows.length} {g.rows.length === 1 ? "charge" : "charges"}</span>
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
    </div>
  );
}
