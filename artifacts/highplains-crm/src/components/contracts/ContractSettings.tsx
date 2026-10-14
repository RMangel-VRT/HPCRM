import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { extractApiErrorMessage } from "@/lib/apiError";
import RateRow from "./RateRow";
import AddRateForm from "./AddRateForm";
import LegacyCopyCard from "./LegacyCopyCard";
import AuditImportCard from "./AuditImportCard";
import { LINE_LABELS, groupRates, missingDefaultCount, rateCardQueryKey, type RateCardItem } from "./rateCardUtils";

export default function ContractSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.activeRole === "admin" || !!user?.isSuperAdminBool;
  const companyId = user?.activeCompanyId;
  const key = rateCardQueryKey(companyId);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const pendingSaves = useRef(new Map<string, Promise<boolean>>());

  const { data: rows = [], isLoading, isError, refetch } = useQuery<RateCardItem[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contract-center/rate-card");
      return (await res.json()) as RateCardItem[];
    },
    enabled: isAdmin && !!companyId,
    staleTime: 60_000,
  });

  const patchCache = (row: RateCardItem, patch: Record<string, unknown>) =>
    queryClient.setQueryData<RateCardItem[]>(key, (old) => old?.map((r) =>
      r.id === row.id ? { ...r, ...Object.fromEntries(Object.keys(patch).map(field => [field, row[field as keyof RateCardItem]])) } : r));

  const invalid = (message: string) => toast({ title: "Not saved", description: message, variant: "destructive" });

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/contract-center/rate-card/${id}`, patch);
      return (await res.json()) as RateCardItem;
    },
  });

  const save = (id: string, patch: Record<string, unknown>): Promise<boolean> => {
    setSavingIds(old => new Set(old).add(id));
    // Serialize a row's blur writes so late responses cannot undo a newer edit.
    const previous = pendingSaves.current.get(id) ?? Promise.resolve(true);
    const pending = previous.then(async () => {
      try {
        const row = await patchMutation.mutateAsync({ id, patch });
        patchCache(row, patch);
        toast({ title: "Saved" });
        return true;
      } catch (err) {
        toast({ title: "Not saved", description: extractApiErrorMessage(err) ?? "Failed to save rate", variant: "destructive" });
        return false;
      }
    });
    pendingSaves.current.set(id, pending);
    void pending.then(() => {
      if (pendingSaves.current.get(id) === pending) {
        pendingSaves.current.delete(id);
        setSavingIds(old => { const next = new Set(old); next.delete(id); return next; });
      }
    });
    return pending;
  };

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/contract-center/rate-card/seed-defaults");
      return (await res.json()) as { inserted: number; skipped: number };
    },
    onSuccess: async (r) => {
      toast({ title: `Loaded ${r.inserted} standard rates` });
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: Error) => toast({ title: "Error", description: extractApiErrorMessage(err) ?? "Failed to load standard rates", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/contract-center/rate-card", body);
      return (await res.json()) as RateCardItem;
    },
  });

  const create = async (body: Record<string, unknown>) => {
    try {
      await createMutation.mutateAsync(body);
      toast({ title: "Rate added" });
      await queryClient.invalidateQueries({ queryKey: key });
      return true;
    } catch (err) {
      toast({ title: "Error", description: extractApiErrorMessage(err) ?? "Failed to add rate", variant: "destructive" });
      return false;
    }
  };

  if (!isAdmin) return null;

  const groups = groupRates(rows);
  const missing = missingDefaultCount(rows);

  return (
    <div className="space-y-4" data-testid="contract-settings">
      <Card>
        <CardHeader>
          <CardTitle>Rate card</CardTitle>
          <CardDescription>Every new contract and renewal starts from these rates. Signed contracts keep the rates they were signed with.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-2" data-testid="skeleton-rate-card">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="py-8 text-center border rounded-md bg-muted/30" data-testid="error-rate-card">
              <p className="text-sm text-muted-foreground">Could not load the rate card.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void refetch()} data-testid="button-retry-rate-card">Retry</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center border rounded-md bg-muted/30" data-testid="empty-rate-card">
              <p className="text-sm text-muted-foreground">No rates yet.</p>
              <Button className="mt-3" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-rates">
                Load High Plains standard rates
              </Button>
            </div>
          ) : (
            <>
              {groups.map((g) => (
                <section key={g.line} className="space-y-2" data-testid={`section-rate-line-${g.line}`}>
                  <h3 className="text-sm font-semibold tracking-tight">{LINE_LABELS[g.line]}</h3>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rate</TableHead><TableHead>Price</TableHead><TableHead>Unit</TableHead><TableHead>Minimum</TableHead><TableHead>Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.categories.map((c) => (
                          <CategoryBlock key={c.category} category={c.category}>
                            {c.rows.map((r) => (
                              <RateRow key={r.id} row={r} onSave={save} onInvalid={invalid} saving={savingIds.has(r.id)} />
                            ))}
                          </CategoryBlock>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))}
              {missing > 0 && (
                <button type="button" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-add-missing-rates">
                  Add missing standard rates
                </button>
              )}
            </>
          )}
          {!isLoading && !isError && <AddRateForm pending={createMutation.isPending} onSubmit={create} onInvalid={invalid} />}
        </CardContent>
      </Card>

      <Card className="bg-muted/30 border-dashed">
        <CardHeader className="pb-0"><CardTitle className="text-base text-muted-foreground">Coming next</CardTitle></CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground" data-testid="text-coming-next">Word master and scope presets arrive with the Contract Center screens.</p>
        </CardContent>
      </Card>
      <AuditImportCard key={`audit-${companyId}`} />
      <LegacyCopyCard key={companyId} ratesReady={!isLoading && !isError && rows.length > 0 && savingIds.size === 0 && !seedMutation.isPending && !createMutation.isPending}
        ratesEmpty={!isLoading && !isError && rows.length === 0} rateRevision={JSON.stringify(rows)} />
    </div>
  );
}

function CategoryBlock({ category, children }: { category: string; children: React.ReactNode }) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={5} className="py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{category}</TableCell>
      </TableRow>
      {children}
    </>
  );
}
