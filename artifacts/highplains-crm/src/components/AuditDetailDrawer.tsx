import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle, ExternalLink } from "lucide-react";
import type { ContractAuditRow, AuditFlag } from "@shared/auditTypes";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCurrency(val: number | null): string {
  if (val === null || val === 0) return "—";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function flagToExplanation(flag: AuditFlag, row: ContractAuditRow): string {
  switch (flag) {
    case "missing_month": {
      const missingNames = row.expectedActiveMonths
        .filter((m) => !row.actualPopulatedMonths.includes(m))
        .map((m) => MONTH_NAMES_FULL[m - 1]);
      if (missingNames.length === 1) {
        return `${missingNames[0]} is missing even though this service is active during that month.`;
      }
      if (missingNames.length <= 3) {
        return `${missingNames.join(", ")} are missing even though this service is active during those months.`;
      }
      return `${missingNames.length} months are missing even though this service is active during those months (${missingNames.slice(0, 3).join(", ")}, and more).`;
    }
    case "zero_value_active_row":
      return `This service line has no revenue entries even though the contract is active for ${row.expectedActiveMonths.length} month${row.expectedActiveMonths.length !== 1 ? "s" : ""} this year.`;
    case "annual_total_mismatch":
      return `The stored annual total (${formatCurrency(row.annualTotalStored)}) does not equal the sum of the populated months (${formatCurrency(row.annualTotalCalculated)}). The difference is ${formatCurrency(Math.abs(row.annualTotalStored - row.annualTotalCalculated))}.`;
    case "duplicate_service_line":
      return `There is more than one ${row.serviceType} service contract for this property. This may indicate a duplicate entry or an overlapping contract period.`;
    case "inconsistent_monthly_values":
      return `The monthly revenue values vary significantly from one another. This may indicate a data entry error or an uneven billing schedule.`;
    case "populated_outside_contract_term": {
      const unexpectedNames = row.actualPopulatedMonths
        .filter((m) => !row.expectedActiveMonths.includes(m))
        .map((m) => MONTH_NAMES_FULL[m - 1]);
      if (unexpectedNames.length === 1) {
        return `Revenue appears in ${unexpectedNames[0]} even though the contract term does not include that month.`;
      }
      return `Revenue appears in ${unexpectedNames.join(", ")} even though the contract term does not include those months.`;
    }
    default:
      return "An unknown audit issue was detected for this row.";
  }
}

function auditStatusVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "Complete": return "default";
    case "Error": return "destructive";
    case "Incomplete": return "destructive";
    case "Needs Review": return "secondary";
    default: return "outline";
  }
}

interface MonthValueGridProps {
  row: ContractAuditRow;
}

export function MonthValueGrid({ row }: MonthValueGridProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5" data-testid="month-value-grid">
      {row.monthlyValues.map((val, idx) => {
        const monthNum = idx + 1;
        const isExpected = row.expectedActiveMonths.includes(monthNum);
        const isPopulated = val !== null && val > 0;
        const isOutsideTerm = isPopulated && !isExpected;

        let cellClass = "rounded-md p-2 text-center text-xs flex flex-col items-center gap-0.5 ";

        if (isOutsideTerm) {
          cellClass += "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300";
        } else if (isExpected && isPopulated) {
          cellClass += "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300";
        } else if (isExpected && !isPopulated) {
          cellClass += "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
        } else {
          cellClass += "bg-muted/40 text-muted-foreground";
        }

        return (
          <div
            key={monthNum}
            className={cellClass}
            data-testid={`month-cell-${monthNum}`}
          >
            <span className="font-medium">{MONTH_NAMES[idx]}</span>
            <span>{isPopulated ? formatCurrency(val) : isExpected ? "missing" : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

interface AuditDetailDrawerProps {
  row: ContractAuditRow | null;
  onClose: () => void;
}

export function AuditDetailDrawer({ row, onClose }: AuditDetailDrawerProps) {
  const [, navigate] = useLocation();

  const handleOpenContract = () => {
    if (!row) return;
    onClose();
    navigate(`/dashboard/contracts/${row.contractId}`);
  };

  const handleOpenCustomer = () => {
    if (!row) return;
    onClose();
    navigate(`/dashboard/customers/${row.customerId}?tab=revenue`);
  };

  return (
    <Sheet open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0"
        data-testid="audit-detail-drawer"
      >
        {row && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg leading-tight" data-testid="drawer-property-name">
                    {row.propertyName}
                  </SheetTitle>
                  <p className="text-sm text-muted-foreground mt-0.5" data-testid="drawer-service-type">
                    {row.serviceType}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={auditStatusVariant(row.auditStatus)} data-testid="drawer-status-badge">
                    {row.auditStatus}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <div>
                  <span className="text-xs text-muted-foreground">Stored Annual Total</span>
                  <p className="text-sm font-semibold" data-testid="drawer-annual-value">
                    {formatCurrency(row.annualTotalStored)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Calculated Total</span>
                  <p className="text-sm font-semibold" data-testid="drawer-calculated-total">
                    {formatCurrency(row.annualTotalCalculated)}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4 space-y-6">
                <section>
                  <h3 className="text-sm font-semibold mb-3">Contract Details</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs">Term Start</span>
                      <span data-testid="drawer-term-start">{formatDate(row.contractTermStart)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Term End</span>
                      <span data-testid="drawer-term-end">{formatDate(row.contractTermEnd)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Billing Pattern</span>
                      <span data-testid="drawer-billing-pattern" className="capitalize">{row.billingPattern}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Contract Status</span>
                      <span data-testid="drawer-contract-status" className="capitalize">{row.contractStatus}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground block text-xs">Expected Active Months</span>
                      <span data-testid="drawer-expected-months">
                        {row.expectedActiveMonths.length > 0
                          ? row.expectedActiveMonths.map((m) => MONTH_NAMES[m - 1]).join(", ")
                          : "None this year"}
                      </span>
                    </div>
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold mb-3">Revenue Detail</h3>
                  <MonthValueGrid row={row} />
                  <div className="flex gap-6 mt-3 pt-3 border-t text-sm flex-wrap">
                    <div>
                      <span className="text-muted-foreground text-xs block">Stored Annual Total</span>
                      <span className="font-semibold" data-testid="drawer-stored-total">{formatCurrency(row.annualTotalStored)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Calculated Annual Total</span>
                      <span className="font-semibold" data-testid="drawer-calc-total">{formatCurrency(row.annualTotalCalculated)}</span>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-3 flex-wrap text-xs">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/40"></span>
                      Expected &amp; populated
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-sm bg-red-200 dark:bg-red-900/40"></span>
                      Expected but missing
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-900/40"></span>
                      Outside contract term
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-sm bg-muted"></span>
                      Not applicable
                    </span>
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    Issues
                    {row.auditFlags.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {row.auditFlags.length}
                      </Badge>
                    )}
                  </h3>
                  {row.auditFlags.length === 0 ? (
                    <div
                      className="flex items-center gap-2 text-sm text-muted-foreground py-2"
                      data-testid="no-issues-state"
                    >
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      No issues found — this service line looks clean.
                    </div>
                  ) : (
                    <ul className="space-y-2" data-testid="issues-list">
                      {row.auditFlags.map((flag) => (
                        <li
                          key={flag}
                          className="flex gap-2 text-sm"
                          data-testid={`issue-${flag}`}
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span>{flagToExplanation(flag, row)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </ScrollArea>

            <div className="px-6 py-4 border-t flex gap-3 flex-wrap">
              <Button
                variant="default"
                onClick={handleOpenContract}
                data-testid="button-open-contract"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Contract
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenCustomer}
                data-testid="button-open-customer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Customer
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
