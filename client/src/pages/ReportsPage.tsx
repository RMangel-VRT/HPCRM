import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Building2,
  Users,
  Truck,
  FileText,
  ClipboardList,
  Download,
  Printer,
  Search,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileBarChart,
} from "lucide-react";

interface ReportColumn {
  key: string;
  label: string;
}

interface ReportData {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
}

const REPORT_TYPE_KEYS = [
  { id: "customers", labelKey: "reports.types.customerPropertyList", icon: Building2, descKey: "reports.types.customerPropertyDesc" },
  { id: "contacts", labelKey: "reports.types.contactsByCustomer", icon: Users, descKey: "reports.types.contactsByCustomerDesc" },
  { id: "equipment", labelKey: "reports.types.equipmentList", icon: Truck, descKey: "reports.types.equipmentListDesc" },
  { id: "contracts", labelKey: "reports.types.contractsList", icon: FileText, descKey: "reports.types.contractsListDesc" },
  { id: "tickets", labelKey: "reports.types.ticketsSummary", icon: ClipboardList, descKey: "reports.types.ticketsSummaryDesc" },
];

function downloadCSV(data: ReportData, filename: string) {
  const headers = data.columns.map(c => `"${c.label}"`).join(",");
  const csvRows = data.rows.map(row =>
    data.columns
      .map(c => {
        const val = (row[c.key] || "").replace(/"/g, '""');
        return `"${val}"`;
      })
      .join(",")
  );
  const csv = [headers, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState("customers");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: reportData, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/reports", selectedType],
  });

  const filteredAndSortedRows = useMemo(() => {
    if (!reportData) return [];
    let rows = reportData.rows;

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(row =>
        reportData.columns.some(col => (row[col.key] || "").toLowerCase().includes(q))
      );
    }

    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const aVal = (a[sortKey] || "").toLowerCase();
        const bVal = (b[sortKey] || "").toLowerCase();
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [reportData, search, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleDownload = () => {
    if (!reportData) return;
    const filtered = { ...reportData, rows: filteredAndSortedRows };
    const type = REPORT_TYPE_KEYS.find(rt => rt.id === selectedType);
    downloadCSV(filtered, (type ? t(type.labelKey) : t("reports.report")).replace(/\s+/g, "_").toLowerCase());
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedReportInfo = REPORT_TYPE_KEYS.find(rt => rt.id === selectedType);
  const hasData = !!reportData && filteredAndSortedRows.length > 0;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6" id="reports-page">
      {/* Print-only header — hidden on screen */}
      <div className="print-only-block" id="print-report-header">
        <h1 style={{ fontSize: "18pt", fontWeight: "bold", marginBottom: "4px" }}>
          {reportData?.title || (selectedReportInfo ? t(selectedReportInfo.labelKey) : t("reports.report"))}
        </h1>
        <p style={{ fontSize: "9pt", color: "#666", marginBottom: "16px" }}>
          {t("reports.generated")} {new Date().toLocaleString()} &nbsp;·&nbsp; {filteredAndSortedRows.length} {t("reports.records")}
          {search ? ` (${t("reports.filteredBy")} "${search}")` : ""}
        </p>
      </div>

      <div data-print-hide>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" data-testid="text-reports-title">
          {t("reports.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("reports.description")}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3" data-print-hide>
        {REPORT_TYPE_KEYS.map(rt => (
          <Card
            key={rt.id}
            className={`cursor-pointer transition-colors hover-elevate active-elevate-2 ${
              selectedType === rt.id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => {
              setSelectedType(rt.id);
              setSearch("");
              setSortKey(null);
            }}
            data-testid={`card-report-${rt.id}`}
          >
            <CardContent className="p-3 md:p-4 flex flex-col items-center text-center gap-2">
              <rt.icon className={`w-6 h-6 ${selectedType === rt.id ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-xs md:text-sm font-medium leading-tight">{t(rt.labelKey)}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card id="print-report-table">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-4 flex-wrap" data-print-hide>
          <div className="flex items-center gap-3 min-w-0">
            <FileBarChart className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-lg" data-testid="text-report-title">
                {reportData?.title || (selectedReportInfo ? t(selectedReportInfo.labelKey) : t("reports.report"))}
              </CardTitle>
              {reportData && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredAndSortedRows.length} / {reportData.rows.length} {t("reports.records")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!hasData}
              data-testid="button-print-report"
              className="gap-2"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">{t("reports.printReport")}</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!hasData}
              data-testid="button-download-csv"
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("reports.downloadCsv")}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative" data-print-hide>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("reports.searchPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-report-search"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12" data-print-hide>
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : reportData && filteredAndSortedRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border" id="print-table-wrapper">
              <Table>
                <TableHeader>
                  <TableRow>
                    {reportData.columns.map(col => (
                      <TableHead
                        key={col.key}
                        className="cursor-pointer select-none whitespace-nowrap"
                        onClick={() => handleSort(col.key)}
                        data-testid={`header-${col.key}`}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          <span data-print-hide>
                            {sortKey === col.key ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                            )}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedRows.map((row, idx) => (
                    <TableRow key={idx} data-testid={`row-report-${idx}`}>
                      {reportData.columns.map(col => (
                        <TableCell key={col.key} className="whitespace-nowrap text-sm">
                          {row[col.key] || ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : reportData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-print-hide>
              <FileBarChart className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? t("reports.noRecordsMatch") : t("reports.noDataAvailable")}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
