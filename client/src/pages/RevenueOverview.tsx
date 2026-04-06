import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, CheckCircle2, ArrowUpDown, AlertTriangle, XCircle, Minus } from "lucide-react";
import { RevenueModuleHeader } from "@/components/RevenueModuleHeader";
import { useRevenueFilters } from "@/hooks/use-revenue-filters";
import { AuditDetailDrawer } from "@/components/AuditDetailDrawer";
import type { ContractAuditRow, AuditFlag } from "@shared/auditTypes";
import { RevenueMatrixPanel } from "@/components/RevenueMatrixPanel";

// ─── Matrix-only types (local, separate from shared AuditFlag) ───────────────

type MatrixStatusFlag = "ok" | "warning" | "error" | "neutral";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_SHORT = MONTHS_SHORT;

interface CustomerRevenue {
  customerId: string;
  customerName: string;
  monthlyRevenue: number;
  annualProjection: number;
  maintenanceMonth: number;
  maintenanceYtd: number;
  maintenanceAnnual: number;
  chemicalMonth: number;
  chemicalYtd: number;
  chemicalAnnual: number;
}

function getMatrixFlag(maintenanceMonth: number, chemicalMonth: number, totalMonth: number): MatrixStatusFlag {
  if (totalMonth === 0) return "neutral";
  const chemicalRatio = chemicalMonth / (totalMonth || 1);
  if (chemicalRatio > 0.7) return "warning";
  return "ok";
}

function MatrixStatusIcon({ flag, size = 14 }: { flag: MatrixStatusFlag; size?: number }) {
  if (flag === "error") return <XCircle size={size} className="text-destructive shrink-0" />;
  if (flag === "warning") return <AlertTriangle size={size} className="text-yellow-500 shrink-0" />;
  if (flag === "ok") return <CheckCircle2 size={size} className="text-green-500 shrink-0" />;
  return <Minus size={size} className="text-muted-foreground/40 shrink-0" />;
}

interface PropertyGroup {
  propertyId: string;
  propertyName: string;
  rows: { serviceType: "Maintenance" | "Chemical"; monthlyAmounts: number[]; auditFlag: MatrixStatusFlag }[];
  totals: number[];
}

function buildPropertyGroups(customers: CustomerRevenue[], month: number): PropertyGroup[] {
  return customers.map((c) => {
    const maintenanceAmounts: number[] = Array(12).fill(0);
    const chemicalAmounts: number[] = Array(12).fill(0);
    const selectedIdx = month - 1;
    maintenanceAmounts[selectedIdx] = c.maintenanceMonth;
    chemicalAmounts[selectedIdx] = c.chemicalMonth;
    const totals = Array.from({ length: 12 }, (_, i) => maintenanceAmounts[i] + chemicalAmounts[i]);
    const flag = getMatrixFlag(c.maintenanceMonth, c.chemicalMonth, c.monthlyRevenue);
    return {
      propertyId: c.customerId,
      propertyName: c.customerName,
      rows: [
        { serviceType: "Maintenance", monthlyAmounts: maintenanceAmounts, auditFlag: flag },
        { serviceType: "Chemical", monthlyAmounts: chemicalAmounts, auditFlag: flag },
      ],
      totals,
    };
  });
}

function formatMatrixCurrency(amount: number): string {
  if (amount === 0) return "";
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function MatrixCell({ amount, shadingMode, flag, isEmpty }: { amount: number; shadingMode: boolean; flag: MatrixStatusFlag; isEmpty: boolean }) {
  if (shadingMode) {
    let bg = "bg-transparent";
    if (!isEmpty) {
      if (flag === "error") bg = "bg-red-100 dark:bg-red-950/60";
      else if (flag === "warning") bg = "bg-yellow-100 dark:bg-yellow-950/60";
      else if (flag === "ok") bg = "bg-green-100 dark:bg-green-950/40";
      else bg = "bg-muted/30";
    }
    return (
      <div className={`h-full w-full flex items-center justify-center ${bg} rounded-sm`}>
        <span className={isEmpty ? "text-muted-foreground/30 text-xs" : "text-xs font-medium"}>
          {isEmpty ? "—" : formatMatrixCurrency(amount)}
        </span>
      </div>
    );
  }
  return (
    <span className={isEmpty ? "text-muted-foreground/30 text-xs" : "text-xs tabular-nums"}>
      {isEmpty ? "—" : formatMatrixCurrency(amount)}
    </span>
  );
}

function RevenueMatrixTable({ customers, month, shadingMode, onRowClick }: {
  customers: CustomerRevenue[];
  month: number;
  shadingMode: boolean;
  onRowClick: (customer: CustomerRevenue, serviceType: "Maintenance" | "Chemical") => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (propertyId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  };
  const groups = useMemo(() => buildPropertyGroups(customers, month), [customers, month]);

  return (
    <div className="relative overflow-auto border rounded-md">
      <table className="text-sm border-collapse" style={{ minWidth: "900px" }}>
        <thead>
          <tr className="bg-muted/50">
            <th className="sticky left-0 z-20 bg-muted/80 text-left px-3 py-2 text-xs font-semibold border-b border-r whitespace-nowrap" style={{ minWidth: "180px" }}>Property</th>
            <th className="sticky z-20 bg-muted/80 text-left px-3 py-2 text-xs font-semibold border-b border-r whitespace-nowrap" style={{ left: "180px", minWidth: "120px" }}>Service</th>
            {MONTHS_SHORT.map((m, i) => (
              <th key={m} className={`px-3 py-2 text-xs font-semibold border-b text-right whitespace-nowrap ${i + 1 === month ? "bg-primary/10" : ""}`} style={{ minWidth: "90px" }}>{m}</th>
            ))}
            <th className="px-3 py-2 text-xs font-semibold border-b text-center whitespace-nowrap" style={{ minWidth: "48px" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.propertyId);
            const groupTotal = group.rows.reduce((acc, row) => row.monthlyAmounts.map((v, i) => (acc[i] || 0) + v), Array(12).fill(0) as number[]);
            const groupHasIssues = group.rows.some((r) => r.auditFlag === "warning" || r.auditFlag === "error");
            const customer = customers.find((c) => c.customerId === group.propertyId)!;
            return [
              <tr key={`group-${group.propertyId}`} className="cursor-pointer hover-elevate bg-muted/20" onClick={() => toggleGroup(group.propertyId)} data-testid={`row-group-header-${group.propertyId}`}>
                <td className="sticky left-0 z-10 bg-muted/40 px-3 py-2 font-semibold text-xs border-b border-r" style={{ minWidth: "180px" }}>
                  <div className="flex items-center gap-1.5">
                    {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
                    <span className="truncate max-w-[140px]" title={group.propertyName}>{group.propertyName}</span>
                    {groupHasIssues && <AlertTriangle size={12} className="text-yellow-500 shrink-0 ml-1" />}
                  </div>
                </td>
                <td className="sticky z-10 bg-muted/40 px-3 py-2 text-xs text-muted-foreground border-b border-r" style={{ left: "180px", minWidth: "120px" }}>All Services</td>
                {MONTHS_SHORT.map((m, i) => {
                  const val = groupTotal[i] ?? 0;
                  return (
                    <td key={m} className={`px-3 py-2 text-right border-b ${i + 1 === month ? "bg-primary/5" : ""}`}>
                      <MatrixCell amount={val} shadingMode={shadingMode} flag="neutral" isEmpty={val === 0} />
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center border-b">
                  {groupHasIssues ? <AlertTriangle size={14} className="text-yellow-500 mx-auto" /> : <Minus size={14} className="text-muted-foreground/30 mx-auto" />}
                </td>
              </tr>,
              ...(!isCollapsed ? [
                ...group.rows.map((row) => (
                  <tr key={`${group.propertyId}-${row.serviceType}`} className="hover-elevate cursor-pointer group" onClick={() => onRowClick(customer, row.serviceType)} data-testid={`row-service-${group.propertyId}-${row.serviceType}`}>
                    <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-xs text-muted-foreground border-b border-r pl-8" style={{ minWidth: "180px" }} />
                    <td className="sticky z-10 bg-background px-3 py-1.5 text-xs border-b border-r" style={{ left: "180px", minWidth: "120px" }}>{row.serviceType}</td>
                    {row.monthlyAmounts.map((val, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right border-b ${i + 1 === month ? "bg-primary/5" : ""}`}>
                        <MatrixCell amount={val} shadingMode={shadingMode} flag={row.auditFlag} isEmpty={val === 0} />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-center border-b">
                      <button onClick={(e) => { e.stopPropagation(); onRowClick(customer, row.serviceType); }} className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-audit-${group.propertyId}-${row.serviceType}`}>
                        <MatrixStatusIcon flag={row.auditFlag} size={14} />
                      </button>
                      <span className="group-hover:hidden"><MatrixStatusIcon flag={row.auditFlag} size={14} /></span>
                    </td>
                  </tr>
                )),
                <tr key={`totals-${group.propertyId}`} className="bg-muted/10" data-testid={`row-totals-${group.propertyId}`}>
                  <td className="sticky left-0 z-10 bg-muted/20 px-3 py-1.5 text-xs font-semibold border-b border-r" style={{ minWidth: "180px" }} />
                  <td className="sticky z-10 bg-muted/20 px-3 py-1.5 text-xs font-bold border-b border-r" style={{ left: "180px", minWidth: "120px" }}>Total</td>
                  {groupTotal.map((val, i) => (
                    <td key={i} className={`px-2 py-1.5 text-right border-b font-bold ${i + 1 === month ? "bg-primary/5" : ""}`}>
                      <span className={val === 0 ? "text-muted-foreground/30 text-xs" : "text-xs"}>{val === 0 ? "—" : formatMatrixCurrency(val)}</span>
                    </td>
                  ))}
                  <td className="px-3 py-1.5 border-b" />
                </tr>,
              ] : []),
            ];
          })}
        </tbody>
      </table>
      {groups.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">No properties match the current filters.</div>
      )}
    </div>
  );
}

// ─── Contract Audit Tab ───────────────────────────────────────────────────────

function formatCurrency(val: number | null): string {
  if (val === null || val === 0) return "—";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

function flagLabel(flag: AuditFlag): string {
  switch (flag) {
    case "missing_month": return "Missing Month";
    case "zero_value_active_row": return "Zero Value";
    case "annual_total_mismatch": return "Total Mismatch";
    case "duplicate_service_line": return "Duplicate";
    case "inconsistent_monthly_values": return "Inconsistent";
    case "populated_outside_contract_term": return "Outside Term";
    default: return flag;
  }
}

type SortField = "status" | "name" | "annual" | "missing";
type SortDir = "asc" | "desc";

function MonthStrip({ row }: { row: ContractAuditRow }) {
  return (
    <div className="flex gap-0.5">
      {row.monthlyValues.map((val, idx) => {
        const monthNum = idx + 1;
        const isExpected = row.expectedActiveMonths.includes(monthNum);
        const isPopulated = val !== null && val > 0;
        const isOutside = isPopulated && !isExpected;
        let bg = "bg-muted/50";
        let label = "Not applicable";
        if (isOutside) {
          bg = "bg-amber-400 dark:bg-amber-600";
          label = `${MONTH_NAMES_SHORT[idx]}: $${val?.toLocaleString("en-US", { minimumFractionDigits: 2 })} (outside term)`;
        } else if (isExpected && isPopulated) {
          bg = "bg-green-500 dark:bg-green-600";
          label = `${MONTH_NAMES_SHORT[idx]}: $${val?.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
        } else if (isExpected && !isPopulated) {
          bg = "bg-red-400 dark:bg-red-600";
          label = `${MONTH_NAMES_SHORT[idx]}: missing`;
        }
        return (
          <Tooltip key={monthNum}>
            <TooltipTrigger asChild>
              <div className={`w-4 h-4 rounded-sm flex-shrink-0 cursor-default ${bg}`} data-testid={`strip-cell-${monthNum}`} />
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{label}</p></TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function ContractAuditTab({ year }: { year: number }) {
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<ContractAuditRow | null>(null);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: "status", dir: "asc" });

  const { data, isLoading } = useQuery<{ year: number; rows: ContractAuditRow[] }>({
    queryKey: [`/api/revenue/contract-audit?year=${year}`],
  });

  const toggleExpand = (customerId: string) => {
    setExpandedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  const cycleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const totalProps = new Set(rows.map((r) => r.customerId)).size;
  const totalLines = rows.length;
  const completeLines = rows.filter((r) => r.auditStatus === "Complete").length;
  const reviewLines = rows.filter((r) => r.auditStatus !== "Complete").length;
  const totalAnnual = rows.reduce((s, r) => s + r.annualTotalStored, 0);
  const statusOrder: Record<string, number> = { Error: 0, Incomplete: 1, "Needs Review": 2, Complete: 3 };

  const grouped = new Map<string, { customerId: string; propertyName: string; rows: ContractAuditRow[] }>();
  for (const row of rows) {
    if (!grouped.has(row.customerId)) grouped.set(row.customerId, { customerId: row.customerId, propertyName: row.propertyName, rows: [] });
    grouped.get(row.customerId)!.rows.push(row);
  }

  const sortedGroups = Array.from(grouped.values()).sort((a, b) => {
    const worstA = Math.min(...a.rows.map((r) => statusOrder[r.auditStatus] ?? 3));
    const worstB = Math.min(...b.rows.map((r) => statusOrder[r.auditStatus] ?? 3));
    let cmp = 0;
    if (sort.field === "status") cmp = worstA - worstB;
    else if (sort.field === "name") cmp = a.propertyName.localeCompare(b.propertyName);
    else if (sort.field === "annual") cmp = a.rows.reduce((s, r) => s + r.annualTotalStored, 0) - b.rows.reduce((s, r) => s + r.annualTotalStored, 0);
    else if (sort.field === "missing") cmp = a.rows.reduce((s, r) => s + r.missingMonthCount, 0) - b.rows.reduce((s, r) => s + r.missingMonthCount, 0);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button onClick={() => cycleSort(field)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid={`sort-${field}`}>
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Active Properties", value: totalProps.toString(), testId: "stat-total-properties" },
          { label: "Service Lines", value: totalLines.toString(), testId: "stat-total-lines" },
          { label: "Complete", value: completeLines.toString(), testId: "stat-complete-lines" },
          { label: "Need Attention", value: reviewLines.toString(), testId: "stat-review-lines" },
          { label: "Projected Annual", value: `$${totalAnnual.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, testId: "stat-annual-revenue" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-semibold mt-1" data-testid={stat.testId}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No contract lines found for {year}.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 w-8"></th>
                    <th className="text-left p-3"><SortButton field="name" label="Property / Service" /></th>
                    <th className="text-left p-3 hidden md:table-cell"><span className="text-xs font-medium text-muted-foreground">Billing</span></th>
                    <th className="text-right p-3 hidden md:table-cell"><SortButton field="missing" label="Missing" /></th>
                    <th className="text-right p-3"><SortButton field="annual" label="Annual" /></th>
                    <th className="text-left p-3"><SortButton field="status" label="Status" /></th>
                    <th className="text-left p-3 hidden lg:table-cell"><span className="text-xs font-medium text-muted-foreground">12-Month Strip</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGroups.map((group) => {
                    const isExpanded = expandedProperties.has(group.customerId);
                    const totalMissing = group.rows.reduce((s, r) => s + r.missingMonthCount, 0);
                    const groupAnnual = group.rows.reduce((s, r) => s + r.annualTotalStored, 0);
                    const worstStatus = [...group.rows].sort((a, b) => (statusOrder[a.auditStatus] ?? 3) - (statusOrder[b.auditStatus] ?? 3))[0]?.auditStatus ?? "Complete";
                    return [
                      <tr key={`group-${group.customerId}`} className="border-b hover-elevate cursor-pointer bg-muted/10" onClick={() => toggleExpand(group.customerId)} data-testid={`row-group-${group.customerId}`}>
                        <td className="p-3">{isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}</td>
                        <td className="p-3">
                          <span className="font-medium text-sm">{group.propertyName}</span>
                          <span className="text-xs text-muted-foreground ml-2">{group.rows.length} line{group.rows.length !== 1 ? "s" : ""}</span>
                        </td>
                        <td className="p-3 hidden md:table-cell"><span className="text-xs text-muted-foreground">—</span></td>
                        <td className="p-3 text-right hidden md:table-cell">{totalMissing > 0 && <span className="text-sm font-medium text-red-600 dark:text-red-400">{totalMissing}</span>}</td>
                        <td className="p-3 text-right"><span className="text-sm font-medium">${groupAnnual.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></td>
                        <td className="p-3"><Badge variant={auditStatusVariant(worstStatus)}>{worstStatus}</Badge></td>
                        <td className="p-3 hidden lg:table-cell"></td>
                      </tr>,
                      ...(isExpanded ? group.rows.map((row) => (
                        <tr key={`row-${row.contractId}`} className={`border-b hover-elevate cursor-pointer ${selectedRow?.contractId === row.contractId ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`} onClick={() => setSelectedRow(row)} data-testid={`row-service-${row.contractId}`}>
                          <td className="p-3"></td>
                          <td className="p-3 pl-6">
                            <span className="text-sm">{row.serviceType}</span>
                            <span className="text-xs text-muted-foreground block">
                              {new Date(row.contractTermStart).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                              {row.contractTermEnd ? ` → ${new Date(row.contractTermEnd).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : " → ongoing"}
                            </span>
                          </td>
                          <td className="p-3 hidden md:table-cell"><span className="text-xs capitalize text-muted-foreground">{row.billingPattern}</span></td>
                          <td className="p-3 text-right hidden md:table-cell">{row.missingMonthCount > 0 && <span className="text-sm text-red-600 dark:text-red-400">{row.missingMonthCount}</span>}</td>
                          <td className="p-3 text-right"><span className="text-sm">{formatCurrency(row.annualTotalStored)}</span></td>
                          <td className="p-3"><Badge variant={auditStatusVariant(row.auditStatus)}>{row.auditStatus}</Badge></td>
                          <td className="p-3 hidden lg:table-cell"><MonthStrip row={row} /></td>
                        </tr>
                      )) : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <AuditDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

// ─── Revenue Exceptions Tab ───────────────────────────────────────────────────

function RevenueExceptionsTab({ year }: { year: number }) {
  const [activeFilters, setActiveFilters] = useState<Set<AuditFlag>>(new Set());
  const [sortBy, setSortBy] = useState<"severity" | "revenue" | "missing">("severity");
  const [selectedRow, setSelectedRow] = useState<ContractAuditRow | null>(null);

  const { data, isLoading } = useQuery<{ year: number; rows: ContractAuditRow[] }>({
    queryKey: [`/api/revenue/exceptions?year=${year}`],
  });

  const allRows = data?.rows ?? [];

  const toggleFilter = (flag: AuditFlag) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  };

  const filteredRows = activeFilters.size === 0 ? allRows : allRows.filter((r) => r.auditFlags.some((f) => activeFilters.has(f)));
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortBy === "severity") return b.auditFlags.length - a.auditFlags.length;
    if (sortBy === "revenue") return b.annualTotalStored - a.annualTotalStored;
    return b.missingMonthCount - a.missingMonthCount;
  });

  const filterOptions: { flag: AuditFlag; label: string }[] = [
    { flag: "missing_month", label: "Missing Months" },
    { flag: "annual_total_mismatch", label: "Annual Mismatch" },
    { flag: "duplicate_service_line", label: "Duplicates" },
    { flag: "zero_value_active_row", label: "Zero Value" },
    { flag: "populated_outside_contract_term", label: "Outside Term" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Filter:</span>
        {filterOptions.map(({ flag, label }) => (
          <Button key={flag} variant={activeFilters.has(flag) ? "default" : "outline"} size="sm" onClick={() => toggleFilter(flag)} data-testid={`filter-${flag}`}>
            {label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[160px]" data-testid="select-exceptions-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="severity">Most Severe First</SelectItem>
              <SelectItem value="revenue">Highest Revenue First</SelectItem>
              <SelectItem value="missing">Most Missing Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mb-3" />
            <p className="font-medium">No exceptions found — your revenue data looks clean.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeFilters.size > 0 ? "Try adjusting your filters." : `All contracts for ${year} passed the audit checks.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium">Property</th>
                    <th className="text-left p-3 text-xs font-medium">Service</th>
                    <th className="text-left p-3 text-xs font-medium hidden md:table-cell">Status</th>
                    <th className="text-left p-3 text-xs font-medium">Audit Flags</th>
                    <th className="text-right p-3 text-xs font-medium hidden md:table-cell">Missing</th>
                    <th className="text-right p-3 text-xs font-medium">Stored</th>
                    <th className="text-right p-3 text-xs font-medium hidden md:table-cell">Calculated</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.contractId} className={`border-b hover-elevate cursor-pointer ${selectedRow?.contractId === row.contractId ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`} onClick={() => setSelectedRow(row)} data-testid={`row-exception-${row.contractId}`}>
                      <td className="p-3 text-sm font-medium">{row.propertyName}</td>
                      <td className="p-3 text-sm">{row.serviceType}</td>
                      <td className="p-3 hidden md:table-cell"><Badge variant={auditStatusVariant(row.auditStatus)}>{row.auditStatus}</Badge></td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {row.auditFlags.map((f) => (
                            <Badge key={f} variant="outline" className="text-xs" data-testid={`badge-flag-${f}-${row.contractId}`}>{flagLabel(f)}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right text-sm hidden md:table-cell">
                        {row.missingMonthCount > 0 ? <span className="text-red-600 dark:text-red-400 font-medium">{row.missingMonthCount}</span> : "—"}
                      </td>
                      <td className="p-3 text-right text-sm">{formatCurrency(row.annualTotalStored)}</td>
                      <td className="p-3 text-right text-sm hidden md:table-cell">
                        <span className={Math.abs(row.annualTotalStored - row.annualTotalCalculated) > 0.01 ? "text-amber-600 dark:text-amber-400" : ""}>
                          {formatCurrency(row.annualTotalCalculated)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <AuditDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function RevenueOverview() {
  const search = useSearch();
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(search);
  const tabFromUrl = searchParams.get("tab") || "revenue-matrix";

  const filters = useRevenueFilters();

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(search);
    params.set("tab", value);
    navigate(`?${params.toString()}`);
  };

  const { data: exceptionsData } = useQuery<{ year: number; rows: ContractAuditRow[] }>({
    queryKey: [`/api/revenue/exceptions?year=${filters.year}`],
    enabled: tabFromUrl !== "revenue-matrix",
  });

  const exceptionCount = exceptionsData?.rows?.length ?? 0;

  return (
    <div className="space-y-6">
      <Tabs value={tabFromUrl} onValueChange={handleTabChange}>
        <RevenueModuleHeader {...filters} exceptionCount={exceptionCount} />

        <TabsContent value="revenue-matrix" className="mt-4">
          <RevenueMatrixPanel
            year={filters.year}
            month={filters.month}
            searchQuery={filters.searchQuery}
            serviceType={filters.serviceType}
            activeOnly={filters.activeOnly}
            showIssuesOnly={filters.showIssuesOnly}
          />
        </TabsContent>

        <TabsContent value="contract-audit" className="mt-6">
          <ContractAuditTab year={filters.year} />
        </TabsContent>

        <TabsContent value="revenue-exceptions" className="mt-6">
          <RevenueExceptionsTab year={filters.year} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
