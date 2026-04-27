import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  FileText,
  DollarSign,
  TrendingUp,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import type { Contract } from "@shared/schema";

type ContractWithDetails = Contract & {
  customerName: string;
  annualTotal: number;
};

type SortField = "customerName" | "serviceType" | "billingPattern" | "annualTotal" | "status" | "startDate";
type SortDirection = "asc" | "desc";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  Maintenance: "Maintenance",
  Chemical: "Chemical",
  Snow: "Snow",
  Irrigation: "Irrigation",
  Other: "Other",
};

const BILLING_PATTERN_LABELS: Record<string, string> = {
  monthly: "Monthly",
  seasonal: "Seasonal",
  "12-of-12": "12 of 12",
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "pending":
      return "secondary";
    case "ended":
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

export default function ContractsOverview() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("customerName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { data: contracts, isLoading } = useQuery<ContractWithDetails[]>({
    queryKey: ["/api/contracts"],
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredContracts = useMemo(() => {
    if (!contracts) return [];

    let filtered = contracts;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.customerName.toLowerCase().includes(query) ||
        c.serviceType.toLowerCase().includes(query)
      );
    }

    if (serviceTypeFilter !== "all") {
      filtered = filtered.filter(c => c.serviceType === serviceTypeFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "customerName":
          comparison = a.customerName.localeCompare(b.customerName);
          break;
        case "serviceType":
          comparison = a.serviceType.localeCompare(b.serviceType);
          break;
        case "billingPattern":
          comparison = a.billingPattern.localeCompare(b.billingPattern);
          break;
        case "annualTotal":
          comparison = a.annualTotal - b.annualTotal;
          break;
        case "status":
          comparison = (a.status || "").localeCompare(b.status || "");
          break;
        case "startDate":
          comparison = new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [contracts, searchQuery, serviceTypeFilter, statusFilter, sortField, sortDirection]);

  const summaryData = useMemo(() => {
    if (!contracts) return { total: 0, active: 0, totalAnnualValue: 0, avgContractValue: 0 };

    const activeContracts = contracts.filter(c => c.status === "active");
    const includedContracts = contracts.filter(c => c.status !== "paused" && c.status !== "ended");
    const totalAnnualValue = includedContracts.reduce((sum, c) => sum + c.annualTotal, 0);

    return {
      total: contracts.length,
      active: activeContracts.length,
      totalAnnualValue,
      avgContractValue: includedContracts.length > 0 ? totalAnnualValue / includedContracts.length : 0,
    };
  }, [contracts]);

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 -ml-3 font-medium"
      onClick={() => handleSort(field)}
      data-testid={`sort-${field}`}
    >
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </Button>
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("contracts.contractsOverview")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("contracts.viewAllContracts")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("contracts.totalContracts")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-contracts">
              {summaryData.total}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.activeContracts")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-contracts">
              {summaryData.active}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("contracts.totalAnnualValue")} {currentYear}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-annual-value">
              {formatCurrency(summaryData.totalAnnualValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("contracts.avgContractValue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-contract-value">
              {formatCurrency(summaryData.avgContractValue)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("contracts.searchByCustomer")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-contracts"
          />
        </div>
        <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-service-type-filter">
            <SelectValue placeholder={t("contracts.serviceType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tickets.allTypes")}</SelectItem>
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")} {t("common.status")}</SelectItem>
            <SelectItem value="active">{t("statuses.active")}</SelectItem>
            <SelectItem value="pending">{t("statuses.pending")}</SelectItem>
            <SelectItem value="ended">{t("statuses.ended")}</SelectItem>
            <SelectItem value="cancelled">{t("statuses.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortButton field="customerName">{t("common.customer")}</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="serviceType">{t("contracts.serviceType")}</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="billingPattern">{t("contracts.billingSchedule")}</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="annualTotal">{t("contracts.totalAnnualValue")} {currentYear}</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="status">{t("common.status")}</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="startDate">{t("contracts.startDate")}</SortButton>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {contracts && contracts.length > 0
                      ? t("common.noResults")
                      : t("common.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredContracts.map((contract) => (
                  <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                    <TableCell className="font-medium" data-testid={`text-customer-name-${contract.id}`}>
                      {contract.customerName}
                    </TableCell>
                    <TableCell data-testid={`text-service-type-${contract.id}`}>
                      {SERVICE_TYPE_LABELS[contract.serviceType] || contract.serviceType}
                    </TableCell>
                    <TableCell data-testid={`text-billing-${contract.id}`}>
                      {BILLING_PATTERN_LABELS[contract.billingPattern] || contract.billingPattern}
                    </TableCell>
                    <TableCell className="text-right font-medium" data-testid={`text-annual-value-${contract.id}`}>
                      {formatCurrency(contract.annualTotal)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(contract.status || "active")} data-testid={`badge-status-${contract.id}`}>
                        {contract.status || "active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-start-date-${contract.id}`}>
                      {contract.startDate
                        ? new Date(contract.startDate).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/customers/${contract.customerId}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-customer-${contract.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
