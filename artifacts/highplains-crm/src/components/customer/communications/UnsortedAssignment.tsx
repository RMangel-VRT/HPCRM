import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useCustomerScope } from "@/lib/customerScope";
import { useToast } from "@/hooks/use-toast";
import type { UnsortedEmail } from "@shared/schema";
import CustomerSearchInput from "@/components/CustomerSearchInput";

export function CandidateCustomerChips({ email, onRoute }: {
  email: UnsortedEmail;
  onRoute?: (emailId: string, customerId: string) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [routingId, setRoutingId] = useState<string | null>(null);
  const scope = useCustomerScope();

  const ids: string[] = (email.candidateCustomerIds ?? []).filter((id: unknown): id is string => typeof id === "string" && !!id);

  const { data: candidateCustomers = [] } = useQuery<{ id: string; name: string; customerNumber?: string }[]>({
    queryKey: ["/api/customers", "candidates-by-ids", ids.join(","), ...scope.scope],
    queryFn: async ({ signal }) => {
      if (ids.length === 0) return [];
      const results = await Promise.all(
        ids.slice(0, 5).map(id =>
          scope.getJson<{ id: string; name: string }>(`/api/customers/${encodeURIComponent(id)}`, signal)
            .catch(() => null)
        )
      );
      return results.filter(result => result !== null);
    },
    staleTime: 60_000,
    enabled: scope.enabled && ids.length > 0,
  });

  const searchTerm = ids.length === 0 ? (email.fromAddress.split("@")[0] || email.fromAddress) : "";
  const { data: searchResults = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/customers", "by-email-search", searchTerm, ...scope.scope],
    queryFn: async ({ signal }) => {
      const data = await scope.getJson<{ id: string; name: string }[] | { data?: { id: string; name: string }[] }>(
        `/api/customers?search=${encodeURIComponent(searchTerm)}&limit=3`, signal);
      return Array.isArray(data) ? data.slice(0, 3) : (data?.data ?? []).slice(0, 3);
    },
    staleTime: 60_000,
    enabled: scope.enabled && searchTerm.length >= 2,
  });

  const chips: { id: string; name: string }[] = ids.length > 0 ? candidateCustomers : searchResults;
  if (chips.length === 0) return null;

  const handleRoute = async (e: React.MouseEvent, customerId: string) => {
    e.stopPropagation();
    setRoutingId(customerId);
    try {
      const res = await scope.request("POST", `/api/unsorted-emails/${encodeURIComponent(email.id)}/route`, { customerId });
      if (!res.ok) throw new Error("Route failed");
      toast({ title: t("emailTracking.routedSuccessfully") });
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      onRoute?.(email.id, customerId);
    } catch {
      toast({ title: t("emailTracking.routeEmailError"), variant: "destructive" });
    } finally {
      setRoutingId(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map(c => (
        <button
          key={c.id}
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary text-xs px-1.5 py-0.5 hover-elevate disabled:opacity-50"
          onClick={(e) => handleRoute(e, c.id)}
          disabled={routingId !== null}
          data-testid={`chip-candidate-${c.id}`}
          title={c.name}
        >
          <User className="w-2.5 h-2.5" />
          {c.name}
        </button>
      ))}
    </div>
  );
}

export interface RouteEmailDialogProps {
  onRouted?: (customerId: string) => void;
  email: UnsortedEmail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preselectedCustomer?: { id: string; name: string } | null;
}

export function RouteEmailDialog({ email, open, onOpenChange, preselectedCustomer, onRouted }: RouteEmailDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const scope = useCustomerScope();
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(preselectedCustomer ?? null);

  const routeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error("Select a customer");
      return scope.request("POST", `/api/unsorted-emails/${encodeURIComponent(email.id)}/route`, { customerId: selectedCustomer.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      toast({ title: t("emailTracking.routeToCustomer") });
      if (selectedCustomer) onRouted?.(selectedCustomer.id);
      onOpenChange(false);
      setSelectedCustomer(null);
    },
    onError: () => {
      toast({ title: t("emailTracking.routeEmailError"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-route-email">
        <DialogHeader>
          <DialogTitle>{t("emailTracking.routeEmailTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
            </p>
            <p className="text-sm font-medium line-clamp-2">{email.subject}</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("emailTracking.searchCustomer")}</label>
            <CustomerSearchInput
              onSelect={(c) => setSelectedCustomer(c)}
              selectedId={selectedCustomer?.id}
              placeholder={t("emailTracking.searchCustomer")}
              testId="input-customer-search-route"
              mode="operational"
            />
            {selectedCustomer && (
              <p className="text-xs text-muted-foreground mt-1">{selectedCustomer.name}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-route-cancel">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!selectedCustomer || routeMutation.isPending}
            onClick={() => routeMutation.mutate()}
            data-testid="button-route-confirm"
          >
            {routeMutation.isPending ? `${t("emailTracking.routeToCustomer")}…` : t("emailTracking.confirmRoute")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

