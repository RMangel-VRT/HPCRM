import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LineBadge, StatusPill, RenewalChip } from "./ContractBadges";
import { dateOnly, dateTime, money } from "./contractFormat";
import type { ContractListItem } from "./contractTypes";

export function CustomerContracts({ customerId, children }: { customerId: string; children: ReactNode }) {
  const { user } = useAuth();
  const permitted = !!user && (user.isSuperAdminBool || user.activeRole === "admin" || user.activeRole === "office");
  const companyId = user?.activeCompanyId;
  const list = useQuery<ContractListItem[]>({
    queryKey: ["/api/contract-center/contracts", companyId, customerId],
    queryFn: async () => (await apiRequest("GET", `/api/contract-center/contracts?customerId=${encodeURIComponent(customerId)}`)).json(),
    enabled: permitted && !!companyId,
  });
  const copy = useQuery<{ firstCopiedAt: string | null; copiedContracts: number }>({
    queryKey: ["/api/contract-center/copy-status", companyId],
    queryFn: async () => (await apiRequest("GET", "/api/contract-center/copy-status")).json(),
    enabled: permitted && !!companyId,
  });
  return <div className="space-y-4">
    {permitted && <section aria-label="Contract Center" data-testid="customer-contract-center">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Contract Center</h2>
        <Link href={`/dashboard/contracts/new?customerId=${encodeURIComponent(customerId)}`}>
          <Button size="sm" data-testid="button-new-center-contract">New contract</Button>
        </Link>
      </div>
      {list.isLoading ? <p role="status">Loading contracts…</p>
        : list.isError ? <p role="alert">Could not load contracts. <Button variant="outline" onClick={() => list.refetch()}>Retry</Button></p>
        : !list.data?.length ? <p>No contracts yet.</p>
        : <div className="space-y-3">{list.data.map(contract => {
          const term = contract.current ?? contract.renewalDraft ?? contract.latest;
          return <Card key={contract.id} data-testid={`center-contract-${contract.id}`}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <LineBadge line={contract.line} />
                <span className="text-sm">{contract.form === "ours" ? "Our form" : "Their form"}</span>
                {term && <StatusPill status={term.displayStatus} />}
                {contract.renewalDue && <RenewalChip />}
              </div>
              {term && <>
                <p className="font-medium">{term.seasonLabel}</p>
                <p className="text-sm text-muted-foreground">{dateOnly(term.startDate)} – {dateOnly(term.endDate)}</p>
                <p className="text-sm">Annual price: {money(term.annualPriceCents)}</p>
              </>}
              <Link href={`/dashboard/contracts/${contract.id}`}><Button variant="outline" size="sm">Open</Button></Link>
            </CardContent>
          </Card>;
        })}</div>}
    </section>}
    <details data-testid="old-system-contracts" className="rounded-md border p-4">
      <summary className="cursor-pointer font-medium">Old system (read-only)</summary>
      <div className="mt-4 space-y-4">
        {permitted && (copy.isLoading ? <p role="status">Loading copy status…</p>
          : copy.isError ? <p role="alert">Could not load copy status. <Button variant="outline" onClick={() => copy.refetch()}>Retry</Button></p>
          : <p className="text-sm text-muted-foreground">
            These records were moved into the Contract Center on {copy.data?.firstCopiedAt ? dateTime(copy.data.firstCopiedAt) : "not yet moved"}.
          </p>)}
        {children}
      </div>
    </details>
  </div>;
}
