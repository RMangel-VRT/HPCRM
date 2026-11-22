import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CONVERSATIONS_NS } from "./i18n";
import ConversationsWorkspace from "./ConversationsWorkspace";
import type { ConversationFilter } from "./api";

/** Customer-scoped conversations (replaces CommunicationsQuickViewModal). */
export default function CustomerConversationsDialog({ open, onOpenChange, customer }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: { id: string; name: string };
}) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88dvh,860px)] max-w-[min(96vw,1240px)] flex-col gap-0 overflow-hidden p-0" data-testid="dialog-customer-conversations">
        <DialogHeader className="border-b px-5 py-3.5">
          <DialogTitle className="text-base">{t("customerDialogTitle", { name: customer.name })}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {open && <ConversationsWorkspace customerId={customer.id} filter={filter} onFilterChange={(f) => setFilter(f === "unsorted" ? "all" : f)} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
