import { Search, CalendarDays, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/DatePickerField";
import MailboxViewAsPicker from "@/components/customer/communications/MailboxViewAsPicker";
import { useCommunicationsShell } from "./CommunicationsPageShell";
import { useAuth } from "@/hooks/use-auth";

function parseDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatDate(d: Date | undefined): string {
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

export function CommunicationsToolbar() {
  const { search, setSearch, fromDate, setFromDate, toDate, setToDate, viewAs, setViewAs } = useCommunicationsShell();
  const { user } = useAuth();
  const isAdminOrOffice = user?.activeRole === "admin" || user?.activeRole === "office";

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
    </div>
  );
}
