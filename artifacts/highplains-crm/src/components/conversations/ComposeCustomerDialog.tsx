import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import LogCommunicationForm from "@/components/customer/communications/LogCommunicationForm";
import { queryClient } from "@/lib/queryClient";
import type { MailboxAccount } from "@shared/schema";
import { invalidateConversations } from "./api";

/**
 * Customer-picker Compose dialog (extracted from the retired CommunicationsToolbar).
 * Pick a customer, then use the existing LogCommunicationForm to email or log.
 */
export function useDefaultMailboxId() {
  const { data = [] } = useQuery<MailboxAccount[]>({ queryKey: ["/api/mailbox-accounts"], retry: false, staleTime: 60_000 });
  return data.filter((m) => m.isActive)[0]?.id;
}

export default function ComposeCustomerDialog({ open, onOpenChange, initialCustomer }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialCustomer?: { id: string; name: string } | null;
}) {
  const { t } = useTranslation();
  const defaultMailboxAccountId = useDefaultMailboxId();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(initialCustomer ?? null);

  function close() {
    setSelected(initialCustomer ?? null);
    onOpenChange(false);
  }
  function done() {
    void queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
    invalidateConversations();
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-compose">
        <DialogHeader>
          <DialogTitle>{t("emailTracking.logCommunicationBtn")}</DialogTitle>
        </DialogHeader>
        {!selected ? (
          <div className="space-y-3 py-2">
            <CustomerSearchInput
              onSelect={(c) => setSelected(c)}
              selectedId={undefined}
              placeholder={t("emailTracking.searchCustomer")}
              testId="input-compose-customer-search"
              mode="operational"
            />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <span className="text-sm font-semibold" data-testid="text-compose-customer">{selected.name}</span>
              {!initialCustomer && (
                <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setSelected(null)} data-testid="button-compose-change-customer">
                  {t("common.change", { defaultValue: "Change" })}
                </Button>
              )}
            </div>
            <LogCommunicationForm customerId={selected.id} onSuccess={done} onCancel={close} defaultMailboxAccountId={defaultMailboxAccountId} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
