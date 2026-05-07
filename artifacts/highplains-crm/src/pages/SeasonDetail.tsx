import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ArrowLeft,
  Leaf,
  Download,
  FileText,
  CalendarDays,
  Cloud,
} from "lucide-react";
import type { Season, CampaignWithProgress } from "@shared/schema";

interface SeasonReportItem {
  campaignName: string;
  campaignId: string;
  customerName: string;
  customerCity: string;
  customerAddress: string;
  completedAt: string | null;
  notes: string | null;
  photoCount: number;
  weatherTemp: number | null;
  weatherWindSpeed: number | null;
  weatherWindDirection: number | null;
  weatherHumidity: number | null;
  weatherConditions: string | null;
  weatherRecordedAt: string | null;
}

interface SeasonReportData {
  season: Season;
  campaigns: CampaignWithProgress[];
  items: SeasonReportItem[];
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function windDirectionLabel(deg: number | null | undefined): string {
  if (deg == null) return "N/A";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export default function SeasonDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: report, isLoading } = useQuery<SeasonReportData>({
    queryKey: ["/api/seasons", id, "report"],
    queryFn: async () => {
      const res = await fetch(`/api/seasons/${id}/report`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    const seasonName = report?.season?.name;
    if (!seasonName) return;
    document.title = `${seasonName} | Greenfield`;
    return () => {
      document.title = "Greenfield";
    };
  }, [report?.season?.name]);

  const handleExportCSV = () => {
    if (!report) return;
    const headers = ["Campaign", "Property", "Address", "Completed At", "Temperature (°F)", "Wind (mph)", "Wind Direction", "Humidity (%)", "Conditions", "Notes", "Photos"];
    const rows = report.items.map(i => [
      i.campaignName,
      i.customerName,
      i.customerAddress || i.customerCity,
      i.completedAt ? format(new Date(i.completedAt), "yyyy-MM-dd HH:mm") : "",
      i.weatherTemp != null ? String(Math.round(i.weatherTemp)) : "",
      i.weatherWindSpeed != null ? String(Math.round(i.weatherWindSpeed)) : "",
      i.weatherWindDirection != null ? windDirectionLabel(i.weatherWindDirection) : "",
      i.weatherHumidity != null ? String(Math.round(i.weatherHumidity)) : "",
      i.weatherConditions || "",
      (i.notes || "").replace(/"/g, '""'),
      String(i.photoCount),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.season.name.replace(/[^a-z0-9]/gi, "_")}_season_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!report) return;
    const campaignGroups = new Map<string, SeasonReportItem[]>();
    report.items.forEach(item => {
      const group = campaignGroups.get(item.campaignName) || [];
      group.push(item);
      campaignGroups.set(item.campaignName, group);
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let tableHTML = "";
    for (const [campName, items] of Array.from(campaignGroups)) {
      tableHTML += `<h3 style="margin-top:20px;font-size:13px;">${escapeHtml(campName)} (${items.length} items)</h3>`;
      tableHTML += `<table><thead><tr>
        <th>Property</th><th>Address</th><th>Completed</th>
        <th>Temp (°F)</th><th>Wind (mph)</th><th>Dir</th><th>Humidity</th><th>Conditions</th>
        <th>Notes</th><th>Photos</th>
      </tr></thead><tbody>`;
      items.forEach(i => {
        tableHTML += `<tr>
          <td>${escapeHtml(i.customerName)}</td>
          <td>${escapeHtml(i.customerAddress || i.customerCity)}</td>
          <td>${i.completedAt ? format(new Date(i.completedAt), "MM/dd/yy HH:mm") : ""}</td>
          <td>${i.weatherTemp != null ? Math.round(i.weatherTemp) : ""}</td>
          <td>${i.weatherWindSpeed != null ? Math.round(i.weatherWindSpeed) : ""}</td>
          <td>${windDirectionLabel(i.weatherWindDirection)}</td>
          <td>${i.weatherHumidity != null ? Math.round(i.weatherHumidity) + "%" : ""}</td>
          <td>${escapeHtml(i.weatherConditions || "")}</td>
          <td>${escapeHtml((i.notes || "").substring(0, 80))}</td>
          <td>${i.photoCount}</td>
        </tr>`;
      });
      tableHTML += "</tbody></table>";
    }

    printWindow.document.write(`
      <html><head><title>${report.season.name} - Season Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #666; margin-bottom: 16px; }
        h3 { font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #ddd; padding: 5px 6px; text-align: left; font-size: 10px; }
        th { background: #f5f5f5; font-weight: bold; }
        .summary { margin-bottom: 16px; color: #555; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${escapeHtml(report.season.name)}</h1>
      <h2>Season Report</h2>
      <div class="summary">
        ${report.season.startDate ? `Period: ${escapeHtml(report.season.startDate)} to ${escapeHtml(report.season.endDate || "Ongoing")}` : ""}
        | Campaigns: ${report.campaigns.length}
        | Total Completed Items: ${report.items.length}
        | Generated: ${new Date().toLocaleDateString()}
      </div>
      ${tableHTML}
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-20 text-muted-foreground">Season not found</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/seasons")} data-testid="button-back-seasons">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Leaf className="w-5 h-5 text-green-600" />
            <h1 className="text-2xl font-bold truncate" data-testid="text-season-detail-name">
              {report.season.name}
            </h1>
          </div>
          {report.season.description && (
            <p className="text-sm text-muted-foreground mt-1">{report.season.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Period</div>
            <div className="text-sm font-medium mt-1">
              {report.season.startDate || "Not set"} – {report.season.endDate || "Not set"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Campaigns</div>
            <div className="text-2xl font-bold mt-1">{report.campaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Completed Items</div>
            <div className="text-2xl font-bold mt-1">{report.items.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-season-export-csv">
          <Download className="w-3 h-3 mr-1" />
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} data-testid="button-season-export-pdf">
          <FileText className="w-3 h-3 mr-1" />
          Export PDF
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium">Campaign</th>
              <th className="text-left p-2 font-medium">Property</th>
              <th className="text-left p-2 font-medium">Address</th>
              <th className="text-left p-2 font-medium">Completed</th>
              <th className="text-left p-2 font-medium">Temp</th>
              <th className="text-left p-2 font-medium">Wind</th>
              <th className="text-left p-2 font-medium">Humidity</th>
              <th className="text-left p-2 font-medium">Conditions</th>
              <th className="text-left p-2 font-medium">Notes</th>
              <th className="text-left p-2 font-medium">Photos</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((item, idx) => (
              <tr key={idx} className="border-b" data-testid={`season-report-row-${idx}`}>
                <td className="p-2 font-medium">{item.campaignName}</td>
                <td className="p-2">{item.customerName}</td>
                <td className="p-2 text-muted-foreground">{item.customerAddress || item.customerCity}</td>
                <td className="p-2">{item.completedAt ? format(new Date(item.completedAt), "MM/dd/yy HH:mm") : ""}</td>
                <td className="p-2">{item.weatherTemp != null ? `${Math.round(item.weatherTemp)}°F` : <span className="text-muted-foreground">--</span>}</td>
                <td className="p-2">{item.weatherWindSpeed != null ? `${Math.round(item.weatherWindSpeed)} mph ${windDirectionLabel(item.weatherWindDirection)}` : <span className="text-muted-foreground">--</span>}</td>
                <td className="p-2">{item.weatherHumidity != null ? `${Math.round(item.weatherHumidity)}%` : <span className="text-muted-foreground">--</span>}</td>
                <td className="p-2">{item.weatherConditions || <span className="text-muted-foreground">--</span>}</td>
                <td className="p-2 max-w-[150px] truncate">{item.notes || ""}</td>
                <td className="p-2">{item.photoCount}</td>
              </tr>
            ))}
            {report.items.length === 0 && (
              <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No completed items in this season yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {report.campaigns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Campaigns in this season</h2>
          {report.campaigns.map(camp => (
            <Card
              key={camp.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/campaigns/${camp.id}`)}
              data-testid={`card-season-campaign-${camp.id}`}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{camp.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {camp.completedItems}/{camp.totalItems} completed
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {camp.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
