import { Check, Loader2, MapPin, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Customer } from "@shared/schema";

export function TicketCustomerSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input placeholder={t("tickets.searchPlaceholder")} aria-label={t("tickets.searchPlaceholder")}
        value={value} onChange={e => onChange(e.target.value)} className="pl-9" data-testid="input-customer-search" />
    </div>
  );
}

export function TicketCustomerChoices({ customers, selectedId, onSelect, busy, failed }: {
  customers: Customer[];
  selectedId: string | null;
  onSelect: (customer: Customer) => void;
  busy?: boolean;
  failed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2 min-h-[200px] max-h-[400px]">
      {busy ? <Loader2 aria-label={t("common.loading")} className="mx-auto my-8 size-5 animate-spin" /> :
        failed || customers.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {t(failed ? "ticketEdit.customerSearchFailed" : "customers.noCustomersFound")}
          </p>
        ) : customers.map(customer => (
          <Card key={customer.id} className="hover-elevate">
            <CardContent className="p-0">
              <button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => onSelect(customer)}
                data-testid={`customer-option-${customer.id}`}>
                <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{customer.name}</span>
                  {customer.city && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {customer.city}{customer.state ? `, ${customer.state}` : ""}
                    </span>
                  )}
                </span>
                {selectedId === customer.id && <Check className="w-5 h-5 text-primary shrink-0" />}
              </button>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
