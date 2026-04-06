import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
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
  const currentDate = new Date();
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentDate.getFullYear() - 3 + i);
  const monthNames = [
    t("months.january"), t("months.february"), t("months.march"), t("months.april"),
    t("months.mayFull"), t("months.june"), t("months.july"), t("months.august"),
    t("months.september"), t("months.october"), t("months.november"), t("months.december"),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
          {t("revenue.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("revenue.description")}</p>
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
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-auto" data-testid="badge-audit-issue-count">
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
