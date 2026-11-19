import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import { TicketCustomerChoices, TicketCustomerSearch } from "./TicketCustomerChoices";

export function LockedTicketField({ label, value, reason }: { label: string; value: string; reason: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex min-h-9 items-center gap-2 rounded-md border bg-muted/50 px-3 text-sm" title={reason}>
        <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        {value}
      </div>
      <p className="text-xs text-muted-foreground">{reason}</p>
    </div>
  );
}

export function TicketEditCustomerPicker({ customer, onChange, companyId }: {
  customer: Customer | null;
  onChange: (customer: Customer) => void;
  companyId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 180);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({ ticketPicker: "true", search: term });
  const result = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers", "ticket-picker", companyId, term],
    enabled: open && !!companyId,
    queryFn: ({ signal }) => apiRequest("GET", `/api/customers?${params}`, undefined, {
      signal, headers: { "X-Company-Id": companyId! },
    }).then(r => r.json()),
  });
  function toggle(next: boolean) {
    setOpen(next);
    if (!next) { setSearch(""); setTerm(""); }
  }
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-customer">{t("ticketEdit.customer")}</Label>
      <Dialog open={open} onOpenChange={toggle}>
        <DialogTrigger asChild>
          <Button id="edit-customer" variant="outline" className="w-full justify-start" data-testid="select-edit-customer">
            {customer?.name ?? t("newTicket.selectCustomer")}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("newTicket.selectCustomer")}</DialogTitle>
            <DialogDescription>{t("ticketEdit.customerSearchHint")}</DialogDescription>
          </DialogHeader>
          <TicketCustomerSearch value={search} onChange={setSearch} />
          <TicketCustomerChoices customers={(result.data?.customers ?? []).filter(c => c.isParent !== "true")}
            selectedId={customer?.id ?? null} busy={result.isPending || search.trim() !== term} failed={result.isError}
            onSelect={next => { onChange(next); toggle(false); }} />
          {result.data && result.data.total > result.data.customers.length ? (
            <p className="text-xs text-muted-foreground">{t("ticketEdit.narrowCustomerSearch")}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
