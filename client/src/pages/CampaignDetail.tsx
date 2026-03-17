import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowLeft,
  Search,
  CheckCircle2,
  Clock,
  SkipForward,
  Trash2,
  Archive,
  RotateCcw,
  AlertTriangle,
  MapPin,
  User,
  ChevronRight,
  FlaskConical,
  Mail,
  Wrench,
  Send,
  FileText,
  Download,
  Cloud,
  Thermometer,
  Wind,
  Droplets,
  Leaf,
} from "lucide-react";
import type { Campaign, CampaignItem, Season } from "@shared/schema";

interface CampaignItemWithUser extends CampaignItem {
  completedByName?: string | null;
  customerAddress?: string;
}

interface CampaignDetailData extends Campaign {
  items: CampaignItemWithUser[];
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  assignedToName?: string;
  createdByName?: string;
  seasonName?: string;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function windDirectionLabel(deg: number | null | undefined): string {
  if (deg == null) return "N/A";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function generateCampaignReportCSV(items: CampaignItemWithUser[], campaignTitle: string): string {
  const headers = ["Property", "Address", "Completed At", "Temperature (°F)", "Wind (mph)", "Wind Direction", "Humidity (%)", "Conditions", "Weather Recorded At", "Notes", "Photo Count"];
  const rows = items.filter(i => i.status === "completed").map(i => [
    i.customerName,
    i.customerAddress || i.customerCity || "",
    i.completedAt ? format(new Date(i.completedAt), "yyyy-MM-dd HH:mm") : "",
    i.weatherTemp != null ? String(Math.round(i.weatherTemp)) : "",
    i.weatherWindSpeed != null ? String(Math.round(i.weatherWindSpeed)) : "",
    i.weatherWindDirection != null ? windDirectionLabel(i.weatherWindDirection) : "",
    i.weatherHumidity != null ? String(Math.round(i.weatherHumidity)) : "",
    i.weatherConditions || "",
    i.weatherRecordedAt ? format(new Date(i.weatherRecordedAt), "yyyy-MM-dd HH:mm") : "",
    (i.notes || "").replace(/"/g, '""'),
    String(i.photos?.length || 0),
  ]);
  return [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "report">("items");
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", id],
  });

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";
  const canManageSeasons = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");

  const { data: allSeasons } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    enabled: canManageSeasons,
  });

  const assignSeasonMutation = useMutation({
    mutationFn: async (seasonId: string | null) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${id}/season`, { seasonId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Season updated" });
      setSeasonDialogOpen(false);
    },
  });

  const handleExportCSV = () => {
    if (!campaign) return;
    const csv = generateCampaignReportCSV(campaign.items, campaign.title);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaign.title.replace(/[^a-z0-9]/gi, "_")}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!campaign) return;
    const completedItems = campaign.items.filter(i => i.status === "completed");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${escapeHtml(campaign.title)} - Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
        th { background: #f5f5f5; font-weight: bold; }
        .summary { margin-bottom: 16px; color: #555; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${escapeHtml(campaign.title)}</h1>
      <h2>Campaign Report - ${campaign.category === "chemical" ? "Chemical Application" : "General"}</h2>
      <div class="summary">
        Window: ${escapeHtml(campaign.windowStart || "")} to ${escapeHtml(campaign.windowEnd || "")} | 
        Completed: ${campaign.completedItems} of ${campaign.totalItems} |
        Generated: ${new Date().toLocaleDateString()}
      </div>
      <table>
        <thead><tr>
          <th>Property</th><th>Address</th><th>Completed</th>
          <th>Temp (°F)</th><th>Wind (mph)</th><th>Dir</th><th>Humidity</th><th>Conditions</th>
          <th>Notes</th><th>Photos</th>
        </tr></thead>
        <tbody>
          ${completedItems.map(i => `<tr>
            <td>${escapeHtml(i.customerName)}</td>
            <td>${escapeHtml(i.customerAddress || i.customerCity || "")}</td>
            <td>${i.completedAt ? format(new Date(i.completedAt), "MM/dd/yy HH:mm") : ""}</td>
            <td>${i.weatherTemp != null ? Math.round(i.weatherTemp) : ""}</td>
            <td>${i.weatherWindSpeed != null ? Math.round(i.weatherWindSpeed) : ""}</td>
            <td>${windDirectionLabel(i.weatherWindDirection)}</td>
            <td>${i.weatherHumidity != null ? Math.round(i.weatherHumidity) + "%" : ""}</td>
            <td>${escapeHtml(i.weatherConditions || "")}</td>
            <td>${escapeHtml((i.notes || "").substring(0, 100))}</td>
            <td>${i.photos?.length || 0}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const filteredItems = useMemo(() => {
    if (!campaign?.items) return [];
    let items = campaign.items;
    if (filterStatus !== "all") {
      items = items.filter(i => i.status === filterStatus);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter(i => i.customerName.toLowerCase().includes(s));
    }
    return items;
  }, [campaign?.items, filterStatus, search]);

  const updateCampaignMutation = useMutation({
    mutationFn: async (data: { status?: string; title?: string; description?: string }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: t("campaigns.deleted") });
      navigate("/dashboard/campaigns");
    },
    onError: () => {
      toast({ title: t("campaigns.deleteFailed"), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        {t("campaigns.notFound")}
      </div>
    );
  }

  const progressPercent = campaign.totalItems > 0
    ? Math.round(((campaign.completedItems + campaign.skippedItems) / campaign.totalItems) * 100)
    : 0;

  const formatWindowDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return format(d, "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const isChemicalCampaign = campaign?.category === "chemical";

  const getChemStepLabel = (step: string | null, itemStatus?: string) => {
    if (itemStatus === "completed") return t("campaigns.chemStepComplete");
    switch (step) {
      case "pre_communication": return t("campaigns.chemStepPre");
      case "work_in_progress": return t("campaigns.chemStepInProgress");
      case "work_completed": return t("campaigns.chemStepWorkDone");
      case "post_communication": return t("campaigns.chemStepPost");
      default: return "";
    }
  };

  const getChemStepIcon = (step: string | null, itemStatus?: string) => {
    if (itemStatus === "completed") return <CheckCircle2 className="w-3 h-3 text-green-600" />;
    switch (step) {
      case "pre_communication": return <Mail className="w-3 h-3" />;
      case "work_in_progress": return <Wrench className="w-3 h-3" />;
      case "work_completed": return <CheckCircle2 className="w-3 h-3" />;
      case "post_communication": return <Send className="w-3 h-3" />;
      default: return null;
    }
  };

  const isOverdue = campaign.status === "active" && (() => {
    try {
      return new Date(campaign.windowEnd + "T23:59:59") < new Date();
    } catch { return false; }
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/campaigns")} data-testid="button-back-campaigns">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold truncate" data-testid="text-campaign-detail-title">{campaign.title}</h1>
            {campaign.status === "completed" && <Badge className="bg-green-600">{t("campaigns.completed")}</Badge>}
            {campaign.status === "archived" && <Badge variant="secondary">{t("campaigns.archived")}</Badge>}
            {campaign.status === "active" && <Badge>{t("campaigns.active")}</Badge>}
            <Badge variant="outline" data-testid="badge-campaign-category">
              {campaign.category === "chemical" && <FlaskConical className="w-3 h-3 mr-1" />}
              {campaign.category === "chemical" ? t("campaigns.categoryChemical") : t("campaigns.categoryGeneral")}
            </Badge>
            {isOverdue && (
              <Badge variant="destructive">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {t("campaigns.overdue")}
              </Badge>
            )}
          </div>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("campaigns.window")}</div>
            <div className="text-sm font-medium mt-1">{formatWindowDate(campaign.windowStart)} – {formatWindowDate(campaign.windowEnd)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("campaigns.assignedTo")}</div>
            <div className="text-sm font-medium mt-1">{campaign.assignedToName || t("common.unassigned")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("campaigns.progress")}</div>
            <div className="mt-2 space-y-1">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{campaign.completedItems} {t("campaigns.done")}, {campaign.skippedItems} {t("campaigns.skipped")}</span>
                <span>{progressPercent}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("common.total")}</div>
            <div className="text-2xl font-bold mt-1">{campaign.totalItems}</div>
            <div className="text-xs text-muted-foreground">{t("common.properties")}</div>
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <div className="flex items-center gap-2 flex-wrap">
          {campaign.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateCampaignMutation.mutate({ status: "archived" })}
              data-testid="button-archive-campaign"
            >
              <Archive className="w-4 h-4 mr-2" />
              {t("campaigns.archive")}
            </Button>
          )}
          {campaign.status === "archived" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateCampaignMutation.mutate({ status: "active" })}
              data-testid="button-reactivate-campaign"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {t("campaigns.reactivate")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
            data-testid="button-delete-campaign"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t("common.delete")}
          </Button>
        </div>
      )}

      {canManageSeasons && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedSeasonId(campaign.seasonId || "");
            setSeasonDialogOpen(true);
          }}
          data-testid="button-assign-season"
        >
          <Leaf className="w-4 h-4 mr-2" />
          {campaign.seasonName ? `Season: ${campaign.seasonName}` : "Assign Season"}
        </Button>
      )}

      {isChemicalCampaign && (
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "items" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("items")}
            data-testid="button-tab-items"
          >
            Items
          </Button>
          <Button
            variant={activeTab === "report" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("report")}
            data-testid="button-tab-report"
          >
            <FileText className="w-3 h-3 mr-1" />
            Report
          </Button>
        </div>
      )}

      {activeTab === "report" && isChemicalCampaign ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="w-3 h-3 mr-1" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} data-testid="button-export-pdf">
              <FileText className="w-3 h-3 mr-1" />
              Export PDF
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
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
                {campaign.items.filter(i => i.status === "completed").map(item => (
                  <tr key={item.id} className="border-b hover-elevate cursor-pointer" onClick={() => navigate(`/dashboard/campaigns/${id}/items/${item.id}`)} data-testid={`report-row-${item.id}`}>
                    <td className="p-2 font-medium">{item.customerName}</td>
                    <td className="p-2 text-muted-foreground">{item.customerAddress || item.customerCity}</td>
                    <td className="p-2">{item.completedAt ? format(new Date(item.completedAt), "MM/dd/yy HH:mm") : ""}</td>
                    <td className="p-2">{item.weatherTemp != null ? `${Math.round(item.weatherTemp)}°F` : <span className="text-muted-foreground">--</span>}</td>
                    <td className="p-2">{item.weatherWindSpeed != null ? `${Math.round(item.weatherWindSpeed)} mph ${windDirectionLabel(item.weatherWindDirection)}` : <span className="text-muted-foreground">--</span>}</td>
                    <td className="p-2">{item.weatherHumidity != null ? `${Math.round(item.weatherHumidity)}%` : <span className="text-muted-foreground">--</span>}</td>
                    <td className="p-2">{item.weatherConditions || <span className="text-muted-foreground">--</span>}</td>
                    <td className="p-2 max-w-[200px] truncate">{item.notes || ""}</td>
                    <td className="p-2">{item.photos?.length || 0}</td>
                  </tr>
                ))}
                {campaign.items.filter(i => i.status === "completed").length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No completed items yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("campaigns.searchProperties")}
            className="pl-9"
            data-testid="input-campaign-item-search"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]" data-testid="select-item-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="pending">{t("campaigns.pending")}</SelectItem>
            <SelectItem value="completed">{t("campaigns.completed")}</SelectItem>
            <SelectItem value="skipped">{t("campaigns.skippedLabel")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filteredItems.map(item => {
          const statusIconEl = item.status === "completed"
            ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            : item.status === "skipped"
              ? <SkipForward className="w-4 h-4 text-amber-500 shrink-0" />
              : <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
          return (
            <Card
              key={item.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/campaigns/${id}/items/${item.id}`)}
              data-testid={`card-campaign-item-${item.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {statusIconEl}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" data-testid={`text-item-name-${item.id}`}>{item.customerName}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {item.customerCity && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {item.customerCity}
                        </span>
                      )}
                      {item.completedByName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {item.completedByName}
                        </span>
                      )}
                      {item.completedAt && (
                        <span>{format(new Date(item.completedAt), "PPp")}</span>
                      )}
                    </div>
                    {isChemicalCampaign && item.workflowStep && (
                      <div className="flex items-center gap-1.5 mt-1" data-testid={`chem-step-indicator-${item.id}`}>
                        {item.status === "skipped"
                          ? <SkipForward className="w-3 h-3 text-amber-500" />
                          : getChemStepIcon(item.workflowStep, item.status)}
                        <span className={`text-xs font-medium ${
                          item.status === "skipped" ? "text-amber-500" :
                          item.status === "completed" ? "text-green-600" : "text-primary"
                        }`}>
                          {item.status === "skipped" ? t("campaigns.skippedLabel") : getChemStepLabel(item.workflowStep, item.status)}
                        </span>
                      </div>
                    )}
                  </div>
                  <Badge
                    variant={item.status === "completed" ? "default" : item.status === "skipped" ? "secondary" : "outline"}
                    className={item.status === "completed" ? "bg-green-600" : ""}
                    data-testid={`badge-item-status-${item.id}`}
                  >
                    {item.status === "completed" ? t("campaigns.completed")
                      : item.status === "skipped" ? t("campaigns.skippedLabel")
                      : t("campaigns.pending")}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredItems.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("common.noResults")}
            </CardContent>
          </Card>
        )}
      </div>

      </>
      )}

      <Dialog open={seasonDialogOpen} onOpenChange={setSeasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Season</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={selectedSeasonId} onValueChange={setSelectedSeasonId}>
              <SelectTrigger data-testid="select-season">
                <SelectValue placeholder="Select a season..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Season</SelectItem>
                {allSeasons?.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => assignSeasonMutation.mutate(selectedSeasonId === "none" ? null : selectedSeasonId || null)}
              disabled={assignSeasonMutation.isPending}
              data-testid="button-confirm-assign-season"
            >
              {assignSeasonMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("campaigns.deleteConfirm")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("campaigns.deleteMsg")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteCampaignMutation.mutate()}
              disabled={deleteCampaignMutation.isPending}
              data-testid="button-confirm-delete-campaign"
            >
              {deleteCampaignMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
