import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, Building2, CheckCircle2, Edit2, FileText, Info, Loader2,
  MessageSquare, Plus, RefreshCw, Ticket as TicketIcon, DollarSign, UserMinus, UserPlus, X,
} from "lucide-react";
import type { Customer } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useCustomerScope } from "@/lib/customerScope";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface ParentRollupData {
  parent: Customer;
  children: { id: string; name: string; activeContracts: number; openTickets: number;
    /** Current CP1 terms for the branch (same projection as the regular page). Optional until the API ships it. */
    currentTerms?: { label: string; line: string; startDate: string; endDate: string }[]; annualRevenue: number | null; lastCommunication: string | null }[];
  totals: { activeContracts: number; openTickets: number; annualRevenue: number | null; recentCommunications: number; completedWorkOrdersYtd: number };
  recentActivity: { type: "communication" | "completion" | "status_change"; id: string; date: string | null; title: string; subtitle: string; childId: string; childName: string }[];
}

type ParentCustomer = Customer & { childCustomers?: Customer[] };

export const parentRollupKey = (id: string) => ["/api/customers", id, "parent-rollup"];

export function useParentRollup(customerId?: string) {
  const scope = useCustomerScope();
  return useQuery<ParentRollupData>({
    queryKey: [...parentRollupKey(customerId ?? ""), ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<ParentRollupData>(`/api/customers/${customerId}/parent-rollup`, signal),
    enabled: !!customerId && scope.enabled,
    staleTime: 0, refetchOnMount: "always", refetchInterval: 60_000,
  });
}

const ago = (d: string | null) => {
  if (!d) return null;
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return null; }
};

function invalidateGroup(parentId: string) {
  void queryClient.invalidateQueries({ queryKey: ["/api/customer-account-managers"] });
  void queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/customers") });
  void queryClient.invalidateQueries({ queryKey: parentRollupKey(parentId) });
}

function RollupError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card><CardContent className="py-8 text-center space-y-3" role="alert">
      <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
      <p className="text-sm text-muted-foreground">{t("customerPages.parent.loadFailed")}</p>
      <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry-rollup">{t("common.retry", { defaultValue: "Retry" })}</Button>
    </CardContent></Card>
  );
}

/* ---------------- Dashboard ---------------- */

export function ParentDashboardPage({ customer, showActivity }: { customer: ParentCustomer; showActivity: boolean }) {
  const { t, i18n } = useTranslation();
  const rollup = useParentRollup(customer.id);
  const money = (v: number | null) => v == null ? t("customerPages.parent.unknown") : formatCurrency(v, true, i18n.language);

  if (rollup.isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div>;
  if (rollup.error || !rollup.data) return <RollupError onRetry={() => rollup.refetch()} />;
  const d = rollup.data;
  const kpis = [
    { id: "branches", icon: Building2, label: t("customerPages.parent.kpiBranches"), value: String(d.children.length) },
    { id: "active-contracts", icon: FileText, label: t("customerPages.parent.kpiContracts"), value: String(d.totals.activeContracts) },
    { id: "open-tickets", icon: TicketIcon, label: t("customerPages.parent.kpiTickets"), value: String(d.totals.openTickets) },
    { id: "annual-revenue", icon: DollarSign, label: t("customerPages.parent.kpiValue"), value: money(d.totals.annualRevenue) },
  ];
  return (
    <div className="space-y-5" data-testid="parent-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.id} data-testid={`card-stat-${k.id}`}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-1.5 text-muted-foreground"><k.icon className="w-4 h-4" /><span className="text-xs font-medium">{k.label}</span></div>
              <p className="text-2xl font-semibold tabular-nums mt-1" data-testid={`text-stat-${k.id}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("customerPages.pages.branches")}</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1">
            {d.children.length === 0 ? <p className="text-sm text-muted-foreground">{t("customerPages.parent.noBranches")}</p>
              : d.children.slice(0, 8).map(c => (
                <Link key={c.id} href={`/dashboard/customers/${c.id}`} className="flex items-center gap-2 py-1.5 text-sm hover:underline" data-testid={`link-dashboard-branch-${c.id}`}>
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.openTickets > 0 && <Badge variant="secondary" className="text-xs">{t("customerPages.parent.openTicketsCount", { count: c.openTickets })}</Badge>}
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
              ))}
          </CardContent>
        </Card>
        {showActivity && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{t("customerPages.parent.recentActivity")}</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {d.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Activity className="w-4 h-4" />{t("customerPages.parent.noActivity")}</p>
              ) : (
                <div className="divide-y" data-testid="list-recent-activity">
                  {d.recentActivity.map((item, i) => (
                    <Link key={`${item.type}-${item.id}-${i}`} href={`/dashboard/customers/${item.childId}`} className="flex items-start gap-2.5 py-2 text-sm"
                      data-testid={`activity-item-${item.type}-${item.id}`}>
                      {item.type === "communication" ? <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground" />
                        : item.type === "completion" ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-muted-foreground" />
                          : <RefreshCw className="w-4 h-4 mt-0.5 text-muted-foreground" />}
                      <span className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{item.title}</span>
                        <span className="text-xs text-muted-foreground">{item.childName}{item.date && ` · ${ago(item.date) ?? ""}`}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------------- Branches ---------------- */

export function BranchesPage({ customer, canManage }: { customer: ParentCustomer; canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const rollup = useParentRollup(customer.id);
  const scope = useCustomerScope();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(customer.name);
  const [candidates, setCandidates] = useState<{ id: string; name: string; parentCustomerId?: string | null }[]>([]);
  const [linking, setLinking] = useState(false);
  const [unlinkId, setUnlinkId] = useState<string | null>(null);
  const cityOf = new Map<string, string>((customer.childCustomers ?? []).map((c: { id: string; city?: string | null }) => [c.id, c.city ?? ""]));
  const money = (v: number | null) => v == null ? t("customerPages.parent.unknown") : formatCurrency(v, true, i18n.language);

  const rename = useMutation({
    mutationFn: (name: string) => scope.request("PATCH", `/api/customers/${customer.id}`, { name }),
    onSuccess: () => { invalidateGroup(customer.id); setRenameOpen(false); toast({ title: t("customerPages.parent.renamed") }); },
    onError: () => toast({ title: t("customerPages.parent.actionFailed"), variant: "destructive" }),
  });
  const unlink = useMutation({
    mutationFn: (childId: string) => scope.request("PATCH", `/api/customers/${childId}`, { parentCustomerId: null }),
    onSuccess: () => { invalidateGroup(customer.id); setUnlinkId(null); toast({ title: t("customerPages.parent.unlinked") }); },
    onError: () => toast({ title: t("customerPages.parent.actionFailed"), variant: "destructive" }),
  });
  const convert = useMutation({
    mutationFn: () => scope.request("PATCH", `/api/customers/${customer.id}`, { isParent: "false" }),
    onSuccess: () => { invalidateGroup(customer.id); navigate(`/dashboard/customers/${customer.id}?tab=dashboard`); },
    onError: () => toast({ title: t("customerPages.parent.actionFailed"), variant: "destructive" }),
  });
  async function linkAll() {
    if (!candidates.length || linking) return;
    setLinking(true);
    const results = await Promise.allSettled(candidates.map(c => scope.request("PATCH", `/api/customers/${c.id}`, { parentCustomerId: customer.id })));
    const failed = candidates.filter((_, i) => results[i].status === "rejected");
    if (failed.length < candidates.length) invalidateGroup(customer.id);
    if (failed.length) toast({ title: t("customerPages.parent.linkPartial", { count: failed.length }), variant: "destructive" });
    else toast({ title: t("customerPages.parent.linked") });
    setCandidates(failed);
    setLinking(false);
  }

  if (rollup.isLoading) return <Skeleton className="h-48 w-full" />;
  if (rollup.error || !rollup.data) return <RollupError onRetry={() => rollup.refetch()} />;
  const children = rollup.data.children;

  return (
    <div className="space-y-5" data-testid="branches-page">
      {canManage && (
        <div className="flex justify-end gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { setRenameValue(customer.name); setRenameOpen(true); }} data-testid="button-rename-parent">
            <Edit2 className="w-4 h-4 mr-2" />{t("customerPages.parent.rename")}
          </Button>
          <Button size="sm" asChild>
            <Link href={`/dashboard/customers/new?parentId=${customer.id}`} data-testid="button-add-branch">
              <Plus className="w-4 h-4 mr-2" />{t("customerPages.parent.addBranch")}
            </Link>
          </Button>
        </div>
      )}

      {children.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground" data-testid="branches-empty">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />{t("customerPages.parent.noBranches")}
        </CardContent></Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table data-testid="table-branches">
            <TableHeader><TableRow>
              <TableHead>{t("customerPages.parent.branch")}</TableHead>
              <TableHead>{t("customerPages.parent.city")}</TableHead>
              <TableHead>{t("customerPages.parent.thisSeason")}</TableHead>
              <TableHead className="text-center">{t("customerPages.parent.activeContracts")}</TableHead>
              <TableHead className="text-center">{t("customerPages.parent.openTickets")}</TableHead>
              <TableHead>{t("customerPages.parent.lastCommunication")}</TableHead>
              <TableHead className="text-right">{t("customerPages.parent.contractValue")}</TableHead>
              {canManage && <TableHead className="w-10"><span className="sr-only">{t("common.actions")}</span></TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {children.map(c => (
                <TableRow key={c.id} data-testid={`row-child-${c.id}`}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/customers/${c.id}`} className="hover:underline" data-testid={`link-branch-${c.id}`}>{c.name}</Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" data-testid={`text-child-city-${c.id}`}>{cityOf.get(c.id) || "\u2014"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground" data-testid={`text-child-season-${c.id}`}>
                    {c.currentTerms === undefined ? t("customerPages.parent.notAvailable")
                      : c.currentTerms.length === 0 ? t("customerPages.parent.noCurrentTerm")
                      : c.currentTerms.map(term => term.label).join(", ")}
                  </TableCell>
                  <TableCell className="text-center tabular-nums" data-testid={`text-child-contracts-${c.id}`}>{c.activeContracts}</TableCell>
                  <TableCell className="text-center tabular-nums" data-testid={`text-child-tickets-${c.id}`}>{c.openTickets}</TableCell>
                  <TableCell className="text-sm text-muted-foreground" data-testid={`text-child-last-comm-${c.id}`}>{ago(c.lastCommunication) ?? "\u2014"}</TableCell>
                  <TableCell className="text-right tabular-nums" data-testid={`text-child-revenue-${c.id}`}>{money(c.annualRevenue)}</TableCell>
                  {canManage && (
                    <TableCell>
                      <AlertDialog open={unlinkId === c.id} onOpenChange={o => setUnlinkId(o ? c.id : null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={t("customerPages.parent.unlink")} data-testid={`button-unlink-child-${c.id}`}>
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("customerPages.parent.unlinkTitle", { name: c.name })}</AlertDialogTitle>
                            <AlertDialogDescription>{t("customerPages.parent.unlinkDesc", { name: c.name, group: customer.name })}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => unlink.mutate(c.id)} data-testid={`button-confirm-unlink-${c.id}`}>
                              {unlink.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customerPages.parent.unlink")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {children.some(c => c.currentTerms === undefined) && (
            <p className="text-xs text-muted-foreground px-4 py-2 border-t flex items-center gap-1.5" data-testid="text-season-unavailable"><Info className="w-3.5 h-3.5" />{t("customerPages.parent.seasonUnavailable")}</p>
          )}
        </Card>
      )}

      {canManage && (
        <Card className="max-w-xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("customerPages.parent.linkExisting")}</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-2">
            <CustomerSearchInput mode="any" placeholder={t("customerPages.parent.searchPlaceholder")} testId="input-link-child-search"
              excludeIds={[customer.id, ...children.map(c => c.id), ...candidates.map(c => c.id)]}
              selectedId={undefined} selectedCustomerName="" disabled={linking}
              onSelect={c => { if (c.id) setCandidates(prev => prev.some(p => p.id === c.id) ? prev : [...prev, { id: c.id, name: c.name, parentCustomerId: c.parentCustomerId }]); }} />
            {candidates.map(c => {
              const moving = !!c.parentCustomerId && c.parentCustomerId !== customer.id;
              return (
                <div key={c.id} className="rounded-md border px-3 py-1.5" data-testid={`row-link-candidate-${c.id}`}>
                  <div className="flex items-center gap-2">
                    {moving ? <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--est-warn))]" /> : <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-sm flex-1 truncate">{c.name}</span>
                    {!linking && <Button size="icon" variant="ghost" aria-label={t("common.remove", { defaultValue: "Remove" })} onClick={() => setCandidates(p => p.filter(x => x.id !== c.id))}><X className="w-3.5 h-3.5" /></Button>}
                  </div>
                  {moving && <p className="text-xs text-muted-foreground">{t("customerPages.parent.movingWarning")}</p>}
                </div>
              );
            })}
            {candidates.length > 0 && (
              <Button size="sm" className="w-full" onClick={linkAll} disabled={linking} data-testid="button-link-all">
                {linking ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
                {t("customerPages.parent.linkCount", { count: candidates.length })}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {canManage && children.length === 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-convert-to-customer">{t("customerPages.parent.convert")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("customerPages.parent.convert")}</AlertDialogTitle>
              <AlertDialogDescription>{t("customerPages.parent.convertDesc", { name: customer.name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => convert.mutate()} data-testid="button-confirm-convert">{t("customerPages.parent.convertConfirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("customerPages.parent.rename")}</DialogTitle>
            <DialogDescription>{t("customerPages.parent.renameDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">{t("common.name", { defaultValue: "Name" })}</Label>
            <Input id="rename-input" value={renameValue} onChange={e => setRenameValue(e.target.value)} data-testid="input-rename-parent"
              onKeyDown={e => { if (e.key === "Enter" && renameValue.trim()) rename.mutate(renameValue.trim()); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => renameValue.trim() && rename.mutate(renameValue.trim())} disabled={!renameValue.trim() || rename.isPending} data-testid="button-rename-save">
              {rename.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Tickets (parent) ---------------- */

export function ParentTicketsPage({ customer }: { customer: ParentCustomer }) {
  const { t } = useTranslation();
  const rollup = useParentRollup(customer.id);
  return (
    <div className="space-y-4" data-testid="parent-tickets-page">
      <div className="rounded-md border bg-muted/40 p-3 text-sm flex gap-2" data-testid="parent-tickets-notice">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
        <span>{t("customerPages.parent.ticketsNotice")}</span>
      </div>
      {rollup.isLoading ? <Skeleton className="h-32 w-full" /> : rollup.error || !rollup.data ? <RollupError onRetry={() => rollup.refetch()} /> : (
        <Card className="divide-y">
          {rollup.data.children.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("customerPages.parent.noBranches")}</p>
            : rollup.data.children.map(c => (
              <Link key={c.id} href={`/dashboard/customers/${c.id}?tab=tickets`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover-elevate" data-testid={`link-branch-tickets-${c.id}`}>
                <span className="flex-1 truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground tabular-nums">{t("customerPages.parent.openTicketsCount", { count: c.openTickets })}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Link>
            ))}
        </Card>
      )}
    </div>
  );
}
