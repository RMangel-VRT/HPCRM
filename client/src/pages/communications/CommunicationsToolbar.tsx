import { useState } from "react";
import { Search, CalendarDays, X, PenSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerField } from "@/components/DatePickerField";
import MailboxViewAsPicker from "@/components/customer/communications/MailboxViewAsPicker";
import { useCommunicationsShell } from "./CommunicationsPageShell";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import LogCommunicationForm from "@/components/customer/communications/LogCommunicationForm";
import type { MailboxAccount } from "@shared/schema";

function parseDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatDate(d: Date | undefined): string {
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

interface SelectedCustomer {
  id: string;
  name: string;
}

function ComposeDialog({ open, onOpenChange, defaultMailboxAccountId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultMailboxAccountId?: string;
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);

  function handleClose() {
    setSelectedCustomer(null);
    onOpenChange(false);
  }

  function handleSuccess() {
    queryClient.invalidateQueries({ queryKey: ["/api/communications", "sent-tab"] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-compose">
        <DialogHeader>
          <DialogTitle>Compose Communication</DialogTitle>
        </DialogHeader>
        {!selectedCustomer ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Select a customer to log this communication against:</p>
            <CustomerSearchInput
              onSelect={(c) => setSelectedCustomer(c)}
              selectedId={undefined}
              placeholder="Search customers..."
              testId="input-compose-customer-search"
              mode="operational"
            />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Customer:</span>
              <span className="text-sm font-medium">{selectedCustomer.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs"
                onClick={() => setSelectedCustomer(null)}
                data-testid="button-compose-change-customer"
              >
                Change
              </Button>
            </div>
            <LogCommunicationForm
              customerId={selectedCustomer.id}
              onSuccess={handleSuccess}
              onCancel={handleClose}
              defaultMailboxAccountId={defaultMailboxAccountId}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CommunicationsToolbar() {
  const { search, setSearch, fromDate, setFromDate, toDate, setToDate, viewAs, setViewAs } = useCommunicationsShell();
  const { user } = useAuth();
  const isAdminOrOffice = user?.activeRole === "admin" || user?.activeRole === "office";
  const [composeOpen, setComposeOpen] = useState(false);

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
    retry: false,
    staleTime: 60_000,
  });

  const activeMailboxes = mailboxAccounts.filter(m => m.isActive);
  const hasMailbox = activeMailboxes.length > 0;

  const defaultMailboxAccountId = activeMailboxes.length === 1 ? activeMailboxes[0].id : undefined;

  const hasDateFilter = fromDate || toDate;

  function clearDates() {
    setFromDate("");
    setToDate("");
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0 flex-wrap">
      <div className="relative flex-1 min-w-[160px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search communications..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-comms-search"
        />
        {search && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch("")}
            data-testid="button-clear-search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <DatePickerField
          value={parseDate(fromDate)}
          onChange={(d) => setFromDate(formatDate(d))}
          placeholder="From date"
          compact
          data-testid="input-comms-from-date"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <DatePickerField
          value={parseDate(toDate)}
          onChange={(d) => setToDate(formatDate(d))}
          placeholder="To date"
          compact
          data-testid="input-comms-to-date"
        />
        {hasDateFilter && (
          <Button size="icon" variant="ghost" onClick={clearDates} data-testid="button-clear-dates">
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {isAdminOrOffice && (
        <div className="shrink-0">
          <MailboxViewAsPicker value={viewAs} onChange={setViewAs} />
        </div>
      )}

      {hasMailbox && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setComposeOpen(true)}
          data-testid="button-compose"
          className="shrink-0 gap-1.5"
        >
          <PenSquare className="w-3.5 h-3.5" />
          Compose
        </Button>
      )}

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        defaultMailboxAccountId={defaultMailboxAccountId}
      />
    </div>
  );
}
