import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { RevenueFilters, RevenueFilterSetters, ServiceTypeFilter, StatusFilter } from "@/hooks/use-revenue-filters";

export type RevenueTab = "revenue-matrix" | "contract-audit" | "revenue-exceptions";

interface RevenueModuleHeaderProps extends RevenueFilters, RevenueFilterSetters {
  exceptionCount?: number;
  auditIssueCount?: number;
}

export function RevenueModuleHeader({
  year,
  month,
  searchQuery,
  serviceType,
  statusFilter,
  activeOnly,
  showIssuesOnly,
  exceptionCount = 0,
  auditIssueCount = 0,
  setYear,
  setMonth,
  setSearchQuery,
  setServiceType,
  setStatusFilter,
  setActiveOnly,
  setShowIssuesOnly,
}: RevenueModuleHeaderProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.activeRole === "admin" || user?.isSuperAdminBool;

  const currentDate = new Date();
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentDate.getFullYear() - 3 + i);
  const monthNames = [
    t("months.january"), t("months.february"), t("months.march"), t("months.april"),
    t("months.mayFull"), t("months.june"), t("months.july"), t("months.august"),
    t("months.september"), t("months.october"), t("months.november"), t("months.december"),
  ];

  function buildExportUrl(exportType: "audit" | "exceptions" | "filtered" | "matrix") {
    const params = new URLSearchParams();
    params.set("year", String(year));
    if (exportType === "audit") {
      // "All Audit Results" — year only, no UI filters, downloads the complete dataset
    } else {
      // "Filtered Results", "Exceptions Only", "Revenue Matrix" all respect active filter state
      if (serviceType && serviceType !== "all") params.set("serviceType", serviceType);
      if (searchQuery) params.set("searchQuery", searchQuery);
      if (showIssuesOnly) params.set("showIssuesOnly", "true");
      if (activeOnly) params.set("activeOnly", "true");
    }
    return `/api/revenue/export/${exportType}?${params.toString()}`;
  }

  function downloadExport(exportType: "audit" | "exceptions" | "filtered" | "matrix") {
    const url = buildExportUrl(exportType);
    const a = document.createElement("a");
    a.href = url;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            {t("revenue.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("revenue.description")}</p>
        </div>

        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-dropdown">
                <Download className="h-4 w-4 mr-2" />
                Export
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export as CSV</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => downloadExport("audit")}
                data-testid="menu-export-audit"
              >
                All Audit Results
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadExport("exceptions")}
                data-testid="menu-export-exceptions"
              >
                Exceptions Only
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadExport("matrix")}
                data-testid="menu-export-matrix"
              >
                Revenue Matrix
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadExport("filtered")}
                data-testid="menu-export-filtered"
              >
                Filtered Results
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger className="w-[100px]" data-testid="select-year">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
          <SelectTrigger className="w-[140px]" data-testid="select-month">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {monthNames.map((name, index) => (
              <SelectItem key={index + 1} value={(index + 1).toString()}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search properties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="input-search-properties"
          />
        </div>

        <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceTypeFilter)}>
          <SelectTrigger className="w-[150px]" data-testid="select-service-type">
            <SelectValue placeholder="Service type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="chemical">Chemical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[130px]" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id="active-only"
            checked={activeOnly}
            onCheckedChange={setActiveOnly}
            data-testid="switch-active-only"
          />
          <Label htmlFor="active-only" className="text-sm cursor-pointer select-none">
            Active only
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="show-issues-only"
            checked={showIssuesOnly}
            onCheckedChange={setShowIssuesOnly}
            data-testid="switch-show-issues-only"
          />
          <Label htmlFor="show-issues-only" className="text-sm cursor-pointer select-none">
            Show issues only
          </Label>
        </div>
      </div>

      <TabsList data-testid="tabs-revenue">
        <TabsTrigger value="revenue-matrix" data-testid="tab-revenue-matrix">
          {t("revenue.tabs.revenueMatrix", "Revenue Matrix")}
        </TabsTrigger>
        <TabsTrigger value="contract-audit" data-testid="tab-contract-audit" className="flex items-center gap-1.5">
          {t("revenue.tabs.contractAudit", "Contract Audit")}
          {auditIssueCount > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-auto" data-testid="badge-audit-issue-count">
              {auditIssueCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="revenue-exceptions" data-testid="tab-revenue-exceptions" className="flex items-center gap-1.5">
          {t("revenue.tabs.revenueExceptions", "Revenue Exceptions")}
          {exceptionCount > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-auto" data-testid="badge-exception-count">
              {exceptionCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>
    </div>
  );
}
