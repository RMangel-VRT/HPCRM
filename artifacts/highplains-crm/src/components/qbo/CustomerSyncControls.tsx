import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { QboCustomerSyncStatus, QboInitialSyncResult } from "@shared/schema";

const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : "Not yet";
export function CustomerSyncControls({ connected }: { connected: boolean }) {
  const { user } = useAuth();
  return <ScopedSyncControls key={`${user?.activeCompanyId}:${user?.id}:${user?.activeRole}`} connected={connected} />;
}
function ScopedSyncControls({ connected }: { connected: boolean }) {
  const { user } = useAuth();
  const admin = user?.activeRole === "admin" || user?.isSuperAdminBool;
  const companyId = user?.activeCompanyId ?? "";
  const headers = { "X-Company-Id": companyId };
  const [confirm, setConfirm] = useState(false);
  const [summary, setSummary] = useState<QboInitialSyncResult | null>(null);
  const status = useQuery<QboCustomerSyncStatus>({
    queryKey: ["/api/qbo/customers/sync-status", companyId, user?.id, user?.activeRole], refetchInterval: 60_000,
    queryFn: async () => (await apiRequest("GET", "/api/qbo/customers/sync-status", undefined, { headers })).json(),
    enabled: !!companyId && !!(admin || user?.activeRole === "office"),
  });
  const mutation = useMutation({
    mutationFn: async (initial: boolean) => {
      const response = await apiRequest("POST", `/api/qbo/customers/${initial ? "initial-sync" : "sync-now"}`, {}, { headers });
      return { initial, result: await response.json() };
    },
    onSuccess: ({ initial, result }) => {
      setConfirm(false);
      if (initial) setSummary(result);
      for (const key of ["/api/qbo/customers/sync-status", "/api/qbo/customers/cache", "/api/qbo/customers/mapping",
        "/api/qbo/customers/unbound-count", "/api/customers", "/api/invoices"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  const data = status.data;
  return <section className="rounded-lg border p-4 space-y-3" aria-label="QuickBooks customer sync">
    <h2 className="font-medium">Customer synchronization</h2>
    {status.isPending ? <p role="status">Loading sync status…</p> : status.isError
      ? <p role="alert">Unable to load sync status. <Button variant="outline" size="sm" onClick={() => status.refetch()}>Retry</Button></p>
      : data && <>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>Initial reconciliation: {stamp(data.baselineAt)}</span>
          <span>Last sync: {stamp(data.lastSyncAt)}</span>
          <span>Next sync: {connected ? stamp(data.nextSyncAt) : "Paused — disconnected"}</span>
          <span>Open reviews: {data.openReviews}</span>
        </div>
        {!data.baselineAt && <p className="text-sm">Customers are waiting to send. Initial reconciliation must finish before customer writes are enabled.</p>}
        {data.baselineAt
          ? <Button disabled={!connected || mutation.isPending} onClick={() => mutation.mutate(false)}>{mutation.isPending ? "Syncing…" : "Sync now"}</Button>
          : admin ? <Button disabled={!connected || mutation.isPending} onClick={() => setConfirm(true)}>Run initial QuickBooks sync</Button>
          : <p className="text-sm">An administrator must run the initial QuickBooks sync.</p>}
      </>}
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    {mutation.isSuccess && !mutation.variables && <p role="status" className="text-sm">Customer sync completed.</p>}
    {summary && <div role="status" className="text-sm space-y-1">
      <p>{summary.linkedUpdated} linked customers reconciled; {summary.reviewsRaised} review items raised or updated.</p>
      <p>{summary.unboundCrmCustomers} CRM customers still unlinked; {summary.qboCustomersNotInCrm} QuickBooks customers not linked to CRM.</p>
      {summary.branchesLinkedUnderMasterParent.length > 0 && <div>
        <p className="font-medium">Linked branches under master-billed parents were skipped:</p>
        <ul className="list-disc pl-5">{summary.branchesLinkedUnderMasterParent.map(c => <li key={c.customerId}>{c.name} — QuickBooks {c.qboId}</li>)}</ul>
      </div>}
      <p>Existing non-empty billing values were preserved. Unsent differences remain waiting to send; review resolution is handled separately.</p>
    </div>}
    <Dialog open={confirm} onOpenChange={open => { if (!mutation.isPending) setConfirm(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Run initial QuickBooks sync?</DialogTitle>
          <DialogDescription>This fills empty CRM billing fields from QuickBooks, preserves differing non-empty values for review, and establishes the sync baseline. It does not create CRM customers, send changes to QuickBooks, or email customers.</DialogDescription>
        </DialogHeader>
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setConfirm(false)}>Cancel</Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>{mutation.isPending ? "Reconciling…" : "Confirm initial sync"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
