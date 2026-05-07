import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  AlertCircle,
  SkipForward,
  Search,
  Building2,
  ExternalLink,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OverdueItem {
  itemId: string;
  campaignId: string;
  campaignTitle: string;
  campaignCategory: string;
  windowStart: string;
  windowEnd: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  pmCompanyName: string | null;
  status: string;
}

interface MissingObligation {
  customerId: string;
  customerName: string;
  customerCity: string;
  pmCompanyName: string | null;
  serviceType: string;
  serviceCategory: string;
  expectedQuantity: number;
  expectedUpToNow: number;
  scheduledCount: number;
  completedCount: number;
}

interface ExceptionItem {
  itemId: string;
  campaignId: string;
  campaignTitle: string;
  campaignCategory: string;
  windowStart: string;
  windowEnd: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  pmCompanyName: string | null;
  status: string;
  skipReason: string | null;
  completedAt: string | null;
}

type TabKey = "overdue" | "due-this-week" | "missing-obligations" | "exceptions";
type SortDir = "asc" | "desc";
type SortState<T extends string> = { col: T | null; dir: SortDir };

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr + "T00:00:00"), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function CategoryBadge({ category }: { category: string }) {
  const { t } = useTranslation();
  const label =
    category === "chemical"
      ? t("campaigns.categoryChemical")
      : category === "irrigation"
      ? t("campaigns.categoryIrrigation")
      : t("campaigns.categoryGeneral");
  return (
    <Badge variant="outline" className="text-xs">
      {label}
    </Badge>
  );
}

function SortIcon({ col, sort }: { col: string; sort: SortState<string> }) {
  if (sort.col !== col) return <ArrowUpDown className="ml-1 w-3 h-3 inline text-muted-foreground/50" />;
  return sort.dir === "asc"
    ? <ArrowUp className="ml-1 w-3 h-3 inline text-foreground" />
    : <ArrowDown className="ml-1 w-3 h-3 inline text-foreground" />;
}

function SortableHead({
  col,
  sort,
  onSort,
  children,
}: {
  col: string;
  sort: SortState<string>;
  onSort: (col: string) => void;
  children: React.ReactNode;
}) {
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {children}
      <SortIcon col={col} sort={sort} />
    </TableHead>
  );
}

function applySort<T>(items: T[], sort: SortState<string>, getValue: (item: T, col: string) => string | number | null): T[] {
  if (!sort.col) return items;
  return [...items].sort((a, b) => {
    const va = getValue(a, sort.col!) ?? "";
    const vb = getValue(b, sort.col!) ?? "";
    const cmp = typeof va === "number" && typeof vb === "number"
      ? va - vb
      : String(va).localeCompare(String(vb));
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

function useSort<T extends string>(initial: T | null = null): [SortState<T>, (col: T) => void] {
  const [sort, setSort] = useState<SortState<T>>({ col: initial, dir: "asc" });
  const handleSort = (col: T) => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );
  };
  return [sort, handleSort];
}

export default function OperationsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("overdue");
  const [pmSearch, setPmSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [customerSearch, setCustomerSearch] = useState("");

  type OverdueCol = "customerName" | "pmCompanyName" | "campaignTitle" | "campaignCategory" | "windowEnd" | "status";
  type MissingCol = "customerName" | "pmCompanyName" | "serviceType" | "expectedQuantity" | "scheduledCount" | "completedCount";
  type ExceptionCol = "customerName" | "pmCompanyName" | "campaignTitle" | "campaignCategory" | "skipReason";

  const [overdueSort, handleOverdueSort] = useSort<OverdueCol>("windowEnd");
  const [dueSort, handleDueSort] = useSort<OverdueCol>("windowEnd");
  const [missingSort, handleMissingSort] = useSort<MissingCol>("customerName");
  const [exceptionSort, handleExceptionSort] = useSort<ExceptionCol>("customerName");

  const filterParams = new URLSearchParams();
  if (pmSearch) filterParams.set("pmSearch", pmSearch);
  if (category !== "all") filterParams.set("category", category);
  if (customerSearch) filterParams.set("customerSearch", customerSearch);
  const filterString = filterParams.toString();

  const { data: overdueItems = [], isLoading: isLoadingOverdue } = useQuery<OverdueItem[]>({
    queryKey: ["/api/operations/overdue", filterString],
    queryFn: async () => {
      const res = await fetch(`/api/operations/overdue?${filterString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: dueThisWeekItems = [], isLoading: isLoadingDue } = useQuery<OverdueItem[]>({
    queryKey: ["/api/operations/due-this-week", filterString],
    queryFn: async () => {
      const res = await fetch(`/api/operations/due-this-week?${filterString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: missingObligations = [], isLoading: isLoadingMissing } = useQuery<MissingObligation[]>({
    queryKey: ["/api/operations/missing-obligations", filterString],
    queryFn: async () => {
      const res = await fetch(`/api/operations/missing-obligations?${filterString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: exceptionItems = [], isLoading: isLoadingExceptions } = useQuery<ExceptionItem[]>({
    queryKey: ["/api/operations/exceptions", filterString],
    queryFn: async () => {
      const res = await fetch(`/api/operations/exceptions?${filterString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const tabs: { key: TabKey; label: string; count: number; icon: typeof AlertTriangle; loading: boolean }[] = [
    {
      key: "overdue",
      label: t("operations.overdue"),
      count: overdueItems.length,
      icon: AlertTriangle,
      loading: isLoadingOverdue,
    },
    {
      key: "due-this-week",
      label: t("operations.dueThisWeek"),
      count: dueThisWeekItems.length,
      icon: Calendar,
      loading: isLoadingDue,
    },
    {
      key: "missing-obligations",
      label: t("operations.missingObligations"),
      count: missingObligations.length,
      icon: AlertCircle,
      loading: isLoadingMissing,
    },
    {
      key: "exceptions",
      label: t("operations.exceptions"),
      count: exceptionItems.length,
      icon: SkipForward,
      loading: isLoadingExceptions,
    },
  ];

  const isAnyLoading = isLoadingOverdue || isLoadingDue || isLoadingMissing || isLoadingExceptions;

  function overdueValue(item: OverdueItem, col: string): string | number | null {
    switch (col) {
      case "customerName": return item.customerName;
      case "pmCompanyName": return item.pmCompanyName || "";
      case "campaignTitle": return item.campaignTitle;
      case "campaignCategory": return item.campaignCategory;
      case "windowEnd": return item.windowEnd;
      case "status": return item.status;
      default: return "";
    }
  }

  function missingValue(item: MissingObligation, col: string): string | number | null {
    switch (col) {
      case "customerName": return item.customerName;
      case "pmCompanyName": return item.pmCompanyName || "";
      case "serviceType": return item.serviceType;
      case "expectedQuantity": return item.expectedQuantity;
      case "scheduledCount": return item.scheduledCount;
      case "completedCount": return item.completedCount;
      default: return "";
    }
  }

  function exceptionValue(item: ExceptionItem, col: string): string | number | null {
    switch (col) {
      case "customerName": return item.customerName;
      case "pmCompanyName": return item.pmCompanyName || "";
      case "campaignTitle": return item.campaignTitle;
      case "campaignCategory": return item.campaignCategory;
      case "skipReason": return item.skipReason || "";
      default: return "";
    }
  }

  function renderOverdueTable(items: OverdueItem[], loading: boolean, sort: SortState<OverdueCol>, onSort: (col: OverdueCol) => void, idPrefix: string) {
    if (loading) return <TableSkeleton cols={6} />;
    if (!items.length) return <EmptyState label={t("operations.noItems")} />;
    const sorted = applySort(items, sort as SortState<string>, overdueValue);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead col="customerName" sort={sort as SortState<string>} onSort={c => onSort(c as OverdueCol)}>{t("operations.colCustomer")}</SortableHead>
            <SortableHead col="pmCompanyName" sort={sort as SortState<string>} onSort={c => onSort(c as OverdueCol)}>{t("operations.colPM")}</SortableHead>
            <SortableHead col="campaignTitle" sort={sort as SortState<string>} onSort={c => onSort(c as OverdueCol)}>{t("operations.colCampaign")}</SortableHead>
            <SortableHead col="campaignCategory" sort={sort as SortState<string>} onSort={c => onSort(c as OverdueCol)}>{t("operations.colCategory")}</SortableHead>
            <SortableHead col="windowEnd" sort={sort as SortState<string>} onSort={c => onSort(c as OverdueCol)}>{t("operations.colWindow")}</SortableHead>
            <SortableHead col="status" sort={sort as SortState<string>} onSort={c => onSort(c as OverdueCol)}>{t("operations.colStatus")}</SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item) => (
            <TableRow
              key={`${item.campaignId}-${item.itemId}`}
              className="cursor-pointer hover-elevate"
              data-testid={`row-${idPrefix}-${item.itemId}`}
            >
              <TableCell>
                <Link href={`/dashboard/customers/${item.customerId}`}>
                  <span className="font-medium hover:underline text-foreground flex items-center gap-1" data-testid={`link-customer-${item.customerId}`}>
                    {item.customerName}
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </span>
                </Link>
                {item.customerCity && (
                  <span className="text-xs text-muted-foreground">{item.customerCity}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.pmCompanyName || <span className="text-muted-foreground/50">—</span>}
              </TableCell>
              <TableCell>
                <Link href={`/dashboard/campaigns/${item.campaignId}/items/${item.itemId}`}>
                  <span className="hover:underline text-foreground flex items-center gap-1 text-sm" data-testid={`link-item-${item.itemId}`}>
                    {item.campaignTitle}
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </span>
                </Link>
              </TableCell>
              <TableCell><CategoryBadge category={item.campaignCategory} /></TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(item.windowStart)} – {formatDate(item.windowEnd)}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {item.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  function renderMissingObligationsTable(items: MissingObligation[], loading: boolean) {
    if (loading) return <TableSkeleton cols={6} />;
    if (!items.length) return <EmptyState label={t("operations.noItems")} />;
    const sorted = applySort(items, missingSort as SortState<string>, missingValue);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead col="customerName" sort={missingSort as SortState<string>} onSort={c => handleMissingSort(c as MissingCol)}>{t("operations.colCustomer")}</SortableHead>
            <SortableHead col="pmCompanyName" sort={missingSort as SortState<string>} onSort={c => handleMissingSort(c as MissingCol)}>{t("operations.colPM")}</SortableHead>
            <SortableHead col="serviceType" sort={missingSort as SortState<string>} onSort={c => handleMissingSort(c as MissingCol)}>{t("operations.colServiceType")}</SortableHead>
            <SortableHead col="expectedQuantity" sort={missingSort as SortState<string>} onSort={c => handleMissingSort(c as MissingCol)}>{t("operations.colExpected")}</SortableHead>
            <SortableHead col="scheduledCount" sort={missingSort as SortState<string>} onSort={c => handleMissingSort(c as MissingCol)}>{t("operations.colScheduled")}</SortableHead>
            <SortableHead col="completedCount" sort={missingSort as SortState<string>} onSort={c => handleMissingSort(c as MissingCol)}>{t("operations.colCompleted")}</SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item, idx) => (
            <TableRow
              key={`${item.customerId}-${item.serviceType}-${idx}`}
              className="cursor-pointer hover-elevate"
              data-testid={`row-obligation-${item.customerId}-${item.serviceType}`}
            >
              <TableCell>
                <Link href={`/dashboard/customers/${item.customerId}`}>
                  <span className="font-medium hover:underline text-foreground flex items-center gap-1" data-testid={`link-obligation-customer-${item.customerId}`}>
                    {item.customerName}
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </span>
                </Link>
                {item.customerCity && (
                  <span className="text-xs text-muted-foreground">{item.customerCity}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.pmCompanyName || <span className="text-muted-foreground/50">—</span>}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs capitalize">
                  {item.serviceType.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-center">{item.expectedQuantity}</TableCell>
              <TableCell className="text-sm text-center">{item.scheduledCount}</TableCell>
              <TableCell className="text-sm text-center">
                <span className={item.completedCount < item.expectedQuantity ? "text-destructive font-semibold" : ""}>
                  {item.completedCount}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  function renderExceptionsTable(items: ExceptionItem[], loading: boolean) {
    if (loading) return <TableSkeleton cols={5} />;
    if (!items.length) return <EmptyState label={t("operations.noItems")} />;
    const sorted = applySort(items, exceptionSort as SortState<string>, exceptionValue);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead col="customerName" sort={exceptionSort as SortState<string>} onSort={c => handleExceptionSort(c as ExceptionCol)}>{t("operations.colCustomer")}</SortableHead>
            <SortableHead col="pmCompanyName" sort={exceptionSort as SortState<string>} onSort={c => handleExceptionSort(c as ExceptionCol)}>{t("operations.colPM")}</SortableHead>
            <SortableHead col="campaignTitle" sort={exceptionSort as SortState<string>} onSort={c => handleExceptionSort(c as ExceptionCol)}>{t("operations.colCampaign")}</SortableHead>
            <SortableHead col="campaignCategory" sort={exceptionSort as SortState<string>} onSort={c => handleExceptionSort(c as ExceptionCol)}>{t("operations.colCategory")}</SortableHead>
            <SortableHead col="skipReason" sort={exceptionSort as SortState<string>} onSort={c => handleExceptionSort(c as ExceptionCol)}>{t("operations.colSkipReason")}</SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item) => (
            <TableRow
              key={`${item.campaignId}-${item.itemId}`}
              className="cursor-pointer hover-elevate"
              data-testid={`row-exception-${item.itemId}`}
            >
              <TableCell>
                <Link href={`/dashboard/customers/${item.customerId}`}>
                  <span className="font-medium hover:underline text-foreground flex items-center gap-1" data-testid={`link-exception-customer-${item.customerId}`}>
                    {item.customerName}
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </span>
                </Link>
                {item.customerCity && (
                  <span className="text-xs text-muted-foreground">{item.customerCity}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.pmCompanyName || <span className="text-muted-foreground/50">—</span>}
              </TableCell>
              <TableCell>
                <Link href={`/dashboard/campaigns/${item.campaignId}/items/${item.itemId}`}>
                  <span className="hover:underline text-foreground flex items-center gap-1 text-sm" data-testid={`link-exception-item-${item.itemId}`}>
                    {item.campaignTitle}
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </span>
                </Link>
              </TableCell>
              <TableCell><CategoryBadge category={item.campaignCategory} /></TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                {item.skipReason || <span className="text-muted-foreground/50">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-operations-title">{t("operations.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("operations.description")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Card
              key={tab.key}
              className={`cursor-pointer hover-elevate ${isActive ? "ring-2 ring-primary" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`card-tab-${tab.key}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-tight">{tab.label}</p>
                  {tab.loading ? (
                    <Skeleton className="h-6 w-8 mt-1" />
                  ) : (
                    <p className={`text-xl font-bold ${tab.count > 0 ? "text-destructive" : "text-foreground"}`} data-testid={`count-${tab.key}`}>
                      {tab.count}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("operations.filterCustomer")}
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="pl-8"
            data-testid="input-filter-customer"
          />
        </div>
        <div className="relative flex-1 min-w-48">
          <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("operations.filterPM")}
            value={pmSearch}
            onChange={(e) => setPmSearch(e.target.value)}
            className="pl-8"
            data-testid="input-filter-pm"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44" data-testid="select-filter-category">
            <SelectValue placeholder={t("operations.filterCategory")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("operations.allCategories")}</SelectItem>
            <SelectItem value="general">{t("campaigns.categoryGeneral")}</SelectItem>
            <SelectItem value="chemical">{t("campaigns.categoryChemical")}</SelectItem>
            <SelectItem value="irrigation">{t("campaigns.categoryIrrigation")}</SelectItem>
          </SelectContent>
        </Select>
        {(customerSearch || pmSearch || category !== "all") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCustomerSearch(""); setPmSearch(""); setCategory("all"); }}
            data-testid="button-clear-filters"
          >
            {t("common.clear")}
          </Button>
        )}
        {isAnyLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {activeTab === "overdue" && renderOverdueTable(overdueItems, isLoadingOverdue, overdueSort, handleOverdueSort, "overdue")}
          {activeTab === "due-this-week" && renderOverdueTable(dueThisWeekItems, isLoadingDue, dueSort, handleDueSort, "due")}
          {activeTab === "missing-obligations" && renderMissingObligationsTable(missingObligations, isLoadingMissing)}
          {activeTab === "exceptions" && renderExceptionsTable(exceptionItems, isLoadingExceptions)}
        </CardContent>
      </Card>
    </div>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="p-4 space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4">
          {[...Array(cols)].map((_, j) => (
            <Skeleton key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-empty-state">
      {label}
    </div>
  );
}
