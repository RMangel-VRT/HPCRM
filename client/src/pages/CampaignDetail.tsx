import { useState, useMemo, useRef, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  ChevronDown,
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
  Pencil,
  CalendarIcon,
  X,
  Plus,
  List,
  Columns,
} from "lucide-react";
import type { Campaign, CampaignItem, Season, CampaignChecklistTask, Customer, CompanyUser, User as UserType } from "@shared/schema";

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
  checklistTasks?: CampaignChecklistTask[];
  itemTaskCompletions?: Record<string, string[]>;
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
  const [editOpen, setEditOpen] = useState(false);
  const [openSectionCollapsed, setOpenSectionCollapsed] = useState(false);
  const [completedSectionCollapsed, setCompletedSectionCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState<string>("default");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", id],
  });

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";
  const isAdmin = user?.activeRole === "admin";
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
    if (sortBy !== "default") {
      items = [...items].sort((a, b) => {
        switch (sortBy) {
          case "name_asc":
            return a.customerName.localeCompare(b.customerName);
          case "name_desc":
            return b.customerName.localeCompare(a.customerName);
          case "city_asc":
            return (a.customerCity || "").localeCompare(b.customerCity || "");
          case "city_desc":
            return (b.customerCity || "").localeCompare(a.customerCity || "");
          case "completed_newest":
            return (b.completedAt ? new Date(b.completedAt).getTime() : 0) - (a.completedAt ? new Date(a.completedAt).getTime() : 0);
          case "completed_oldest":
            return (a.completedAt ? new Date(a.completedAt).getTime() : 0) - (b.completedAt ? new Date(b.completedAt).getTime() : 0);
          default:
            return 0;
        }
      });
    }
    return items;
  }, [campaign?.items, filterStatus, search, sortBy]);

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
  const isIrrigationCampaign = campaign?.category === "irrigation";

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
              {campaign.category === "irrigation" && <Droplets className="w-3 h-3 mr-1" />}
              {campaign.category === "chemical" ? t("campaigns.categoryChemical") : campaign.category === "irrigation" ? t("campaigns.categoryIrrigation") : t("campaigns.categoryGeneral")}
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
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              data-testid="button-edit-campaign"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Edit Campaign
            </Button>
          )}
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
      <div className="space-y-4">
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
        {viewMode === "list" && (
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
        )}
        {viewMode === "list" && (
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]" data-testid="select-item-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("campaigns.sortDefault")}</SelectItem>
              <SelectItem value="name_asc">{t("campaigns.sortNameAZ")}</SelectItem>
              <SelectItem value="name_desc">{t("campaigns.sortNameZA")}</SelectItem>
              <SelectItem value="city_asc">{t("campaigns.sortCityAZ")}</SelectItem>
              <SelectItem value="city_desc">{t("campaigns.sortCityZA")}</SelectItem>
              <SelectItem value="completed_newest">{t("campaigns.sortCompletedNewest")}</SelectItem>
              <SelectItem value="completed_oldest">{t("campaigns.sortCompletedOldest")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1" data-testid="view-toggle-group">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
            data-testid="button-view-list"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "kanban" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("kanban")}
            data-testid="button-view-kanban"
          >
            <Columns className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <KanbanView
          items={campaign.items}
          search={search}
          isChemicalCampaign={isChemicalCampaign}
          isIrrigationCampaign={isIrrigationCampaign}
          campaign={campaign}
          campaignId={id!}
          navigate={navigate}
          getChemStepIcon={getChemStepIcon}
          getChemStepLabel={getChemStepLabel}
          t={t}
        />
      ) : (
        <ListView
          filteredItems={filteredItems}
          isChemicalCampaign={isChemicalCampaign}
          isIrrigationCampaign={isIrrigationCampaign}
          campaign={campaign}
          campaignId={id!}
          navigate={navigate}
          getChemStepIcon={getChemStepIcon}
          getChemStepLabel={getChemStepLabel}
          t={t}
          openSectionCollapsed={openSectionCollapsed}
          setOpenSectionCollapsed={setOpenSectionCollapsed}
          completedSectionCollapsed={completedSectionCollapsed}
          setCompletedSectionCollapsed={setCompletedSectionCollapsed}
        />
      )}
      </div>
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

      {isAdmin && campaign && (
        <EditCampaignDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          campaign={campaign}
          campaignId={id!}
        />
      )}
    </div>
  );
}

interface ItemCardProps {
  item: CampaignItemWithUser;
  isChemicalCampaign: boolean;
  isIrrigationCampaign: boolean;
  campaign: CampaignDetailData;
  campaignId: string;
  navigate: (path: string) => void;
  getChemStepIcon: (step: string | null, itemStatus?: string) => (React.JSX.Element | null);
  getChemStepLabel: (step: string | null, itemStatus?: string) => string;
  t: (key: string) => string;
}

function ItemCard({ item, isChemicalCampaign, isIrrigationCampaign, campaign, campaignId, navigate, getChemStepIcon, getChemStepLabel, t }: ItemCardProps) {
  const statusIconEl = item.status === "completed"
    ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
    : item.status === "skipped"
      ? <SkipForward className="w-4 h-4 text-amber-500 shrink-0" />
      : <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
  return (
    <Card
      className="hover-elevate cursor-pointer"
      onClick={() => navigate(`/dashboard/campaigns/${campaignId}/items/${item.id}`)}
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
            {isIrrigationCampaign && campaign.checklistTasks && campaign.checklistTasks.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1" data-testid={`irrigation-progress-${item.id}`}>
                <Droplets className="w-3 h-3 text-blue-500" />
                <span className="text-xs text-muted-foreground">
                  {t("campaigns.checklistProgress")}: {campaign.itemTaskCompletions?.[item.id]?.length || 0}/{campaign.checklistTasks.length}
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
}

interface ListViewProps extends Omit<ItemCardProps, "item"> {
  filteredItems: CampaignItemWithUser[];
  openSectionCollapsed: boolean;
  setOpenSectionCollapsed: (v: boolean) => void;
  completedSectionCollapsed: boolean;
  setCompletedSectionCollapsed: (v: boolean) => void;
}

function ListView({ filteredItems, isChemicalCampaign, isIrrigationCampaign, campaign, campaignId, navigate, getChemStepIcon, getChemStepLabel, t, openSectionCollapsed, setOpenSectionCollapsed, completedSectionCollapsed, setCompletedSectionCollapsed }: ListViewProps) {
  const openItems = filteredItems.filter(i => i.status === "pending");
  const completedItems = filteredItems.filter(i => i.status === "completed" || i.status === "skipped");

  const cardProps = { isChemicalCampaign, isIrrigationCampaign, campaign, campaignId, navigate, getChemStepIcon, getChemStepLabel, t };

  if (filteredItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("common.noResults")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {openItems.length > 0 && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
            onClick={() => setOpenSectionCollapsed(!openSectionCollapsed)}
            data-testid="button-toggle-open-section"
          >
            {openSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Open ({openItems.length})
          </button>
          {!openSectionCollapsed && (
            <div className="space-y-2">
              {openItems.map(item => <ItemCard key={item.id} item={item} {...cardProps} />)}
            </div>
          )}
        </div>
      )}
      {completedItems.length > 0 && (
        <div className="space-y-2 mt-6">
          <button
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
            onClick={() => setCompletedSectionCollapsed(!completedSectionCollapsed)}
            data-testid="button-toggle-completed-section"
          >
            {completedSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {t("campaigns.completed")} ({completedItems.length})
          </button>
          {!completedSectionCollapsed && (
            <div className="space-y-2 opacity-75">
              {completedItems.map(item => <ItemCard key={item.id} item={item} {...cardProps} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface KanbanViewProps extends Omit<ItemCardProps, "item"> {
  items: CampaignItemWithUser[];
  search: string;
}

function KanbanView({ items, search, isChemicalCampaign, isIrrigationCampaign, campaign, campaignId, navigate, getChemStepIcon, getChemStepLabel, t }: KanbanViewProps) {
  const cardProps = { isChemicalCampaign, isIrrigationCampaign, campaign, campaignId, navigate, getChemStepIcon, getChemStepLabel, t };

  const searchLower = search.trim().toLowerCase();
  const filteredItems = searchLower
    ? items.filter(i => i.customerName.toLowerCase().includes(searchLower))
    : items;

  type KanbanColumn = { key: string; label: string };

  const columns: KanbanColumn[] = isChemicalCampaign
    ? [
        { key: "pre_communication", label: t("campaigns.chemStepPre") },
        { key: "work_in_progress", label: t("campaigns.chemStepInProgress") },
        { key: "work_completed", label: t("campaigns.chemStepWorkDone") },
        { key: "post_communication", label: t("campaigns.chemStepPost") },
        { key: "completed", label: t("campaigns.completed") },
        { key: "skipped", label: t("campaigns.skippedLabel") },
      ]
    : [
        { key: "pending", label: t("campaigns.pending") },
        { key: "completed", label: t("campaigns.completed") },
        { key: "skipped", label: t("campaigns.skippedLabel") },
      ];

  const getColumnItems = (columnKey: string): CampaignItemWithUser[] => {
    if (isChemicalCampaign) {
      if (columnKey === "completed") return filteredItems.filter(i => i.status === "completed");
      if (columnKey === "skipped") return filteredItems.filter(i => i.status === "skipped");
      return filteredItems.filter(i => i.status === "pending" && i.workflowStep === columnKey);
    } else {
      if (columnKey === "pending") return filteredItems.filter(i => i.status === "pending");
      if (columnKey === "completed") return filteredItems.filter(i => i.status === "completed");
      if (columnKey === "skipped") return filteredItems.filter(i => i.status === "skipped");
      return [];
    }
  };

  return (
    <div className="overflow-x-auto pb-4" data-testid="kanban-board">
      <div className="flex gap-4 min-w-max">
        {columns.map(col => {
          const colItems = getColumnItems(col.key);
          return (
            <div key={col.key} className="flex flex-col w-72 shrink-0" data-testid={`kanban-column-${col.key}`}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-sm font-semibold truncate">{col.label}</span>
                <Badge variant="secondary" className="shrink-0" data-testid={`kanban-count-${col.key}`}>{colItems.length}</Badge>
              </div>
              <div className="space-y-2 flex-1">
                {colItems.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground" data-testid={`kanban-empty-${col.key}`}>
                    No items
                  </div>
                ) : (
                  colItems.map(item => <ItemCard key={item.id} item={item} {...cardProps} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: UserType;
  isSuperAdmin: boolean;
}

function EditCampaignDialog({
  open,
  onOpenChange,
  campaign,
  campaignId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: CampaignDetailData;
  campaignId: string;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(campaign.title);
  const [description, setDescription] = useState(campaign.description || "");
  const [assignedToId, setAssignedToId] = useState(campaign.assignedToId || "none");
  const [windowStart, setWindowStart] = useState<Date | undefined>(
    campaign.windowStart ? new Date(campaign.windowStart + "T00:00:00") : undefined
  );
  const [windowEnd, setWindowEnd] = useState<Date | undefined>(
    campaign.windowEnd ? new Date(campaign.windowEnd + "T00:00:00") : undefined
  );
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [propertySearch, setPropertySearch] = useState("");
  const [selectedNewCustomerIds, setSelectedNewCustomerIds] = useState<Set<string>>(new Set());
  const [itemsToRemove, setItemsToRemove] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setTitle(campaign.title);
      setDescription(campaign.description || "");
      setAssignedToId(campaign.assignedToId || "none");
      setWindowStart(campaign.windowStart ? new Date(campaign.windowStart + "T00:00:00") : undefined);
      setWindowEnd(campaign.windowEnd ? new Date(campaign.windowEnd + "T00:00:00") : undefined);
      setPropertySearch("");
      setSelectedNewCustomerIds(new Set());
      setItemsToRemove(new Set());
    }
  }, [open, campaign]);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: open,
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
    enabled: open,
  });

  const teamMembers = companyUsersData
    .filter(item =>
      item.companyUser.role === "admin" ||
      item.companyUser.role === "office" ||
      item.companyUser.role === "field_manager" ||
      item.companyUser.role === "field" ||
      item.companyUser.role === "chemical_manager"
    )
    .map(item => ({
      id: item.companyUser.userId,
      name: item.user.name,
    }));

  const existingCustomerIds = useMemo(
    () => new Set(campaign.items.map(i => i.customerId)),
    [campaign.items]
  );

  const availableCustomers = useMemo(() => {
    return customers.filter(c =>
      c.active === "true" &&
      c.name !== "Internal Tasks" &&
      !existingCustomerIds.has(c.id)
    );
  }, [customers, existingCustomerIds]);

  const filteredAvailableCustomers = useMemo(() => {
    if (!propertySearch.trim()) return availableCustomers;
    const s = propertySearch.toLowerCase();
    return availableCustomers.filter(c =>
      c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s)
    );
  }, [availableCustomers, propertySearch]);

  const updateMutation = useMutation({
    mutationFn: async (data: { title: string; description: string | null; assignedToId: string | null; windowStart: string; windowEnd: string }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, data);
      return res.json();
    },
  });

  const addItemsMutation = useMutation({
    mutationFn: async (customerIds: string[]) => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items`, { customerIds });
      return res.json();
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("DELETE", `/api/campaigns/${campaignId}/items/${itemId}`);
      return res.json();
    },
  });

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!windowStart || !windowEnd) {
      toast({ title: "Start and end dates are required", variant: "destructive" });
      return;
    }
    const startStr = format(windowStart, "yyyy-MM-dd");
    const endStr = format(windowEnd, "yyyy-MM-dd");
    if (startStr > endStr) {
      toast({ title: "Start date must be before or equal to end date", variant: "destructive" });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        assignedToId: assignedToId === "none" ? null : assignedToId || null,
        windowStart: startStr,
        windowEnd: endStr,
      });

      if (itemsToRemove.size > 0) {
        for (const itemId of itemsToRemove) {
          await removeItemMutation.mutateAsync(itemId);
        }
      }

      if (selectedNewCustomerIds.size > 0) {
        await addItemsMutation.mutateAsync(Array.from(selectedNewCustomerIds));
      }

      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campaign updated successfully" });
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to save changes", variant: "destructive" });
    }
  };

  const isPending = updateMutation.isPending || addItemsMutation.isPending || removeItemMutation.isPending;

  const toggleRemoveItem = (itemId: string) => {
    setItemsToRemove(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleNewCustomer = (id: string) => {
    setSelectedNewCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            Edit Campaign
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-edit-campaign-title"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="input-edit-campaign-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Window Start</Label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-edit-start-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {windowStart ? format(windowStart, "PPP") : "Select"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={windowStart}
                    onSelect={(d) => { setWindowStart(d); setStartOpen(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Window End</Label>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-edit-end-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {windowEnd ? format(windowEnd, "PPP") : "Select"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={windowEnd}
                    onSelect={(d) => { setWindowEnd(d); setEndOpen(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assigned To (optional)</Label>
            <Select value={assignedToId} onValueChange={setAssignedToId}>
              <SelectTrigger data-testid="select-edit-assignee">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {teamMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Current Properties</Label>
            <ScrollArea className="h-48 border rounded-md">
              <div className="p-2 space-y-1">
                {campaign.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover-elevate" data-testid={`edit-item-row-${item.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === "pending" ? (
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      ) : item.status === "completed" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      ) : (
                        <SkipForward className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className={`text-sm truncate ${itemsToRemove.has(item.id) ? "line-through text-muted-foreground" : ""}`}>{item.customerName}</span>
                      {item.customerCity && (
                        <span className="text-xs text-muted-foreground shrink-0">{item.customerCity}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {item.status}
                      </Badge>
                      {item.status === "pending" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleRemoveItem(item.id)}
                          data-testid={`button-remove-item-${item.id}`}
                          className={itemsToRemove.has(item.id) ? "text-primary" : "text-destructive"}
                        >
                          {itemsToRemove.has(item.id) ? <Plus className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {itemsToRemove.size > 0 && (
              <p className="text-xs text-destructive">{itemsToRemove.size} pending {itemsToRemove.size === 1 ? "property" : "properties"} will be removed on save.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Add Properties</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                placeholder="Search properties..."
                className="pl-9"
                data-testid="input-edit-property-search"
              />
            </div>
            <ScrollArea className="h-48 border rounded-md">
              <div className="p-2 space-y-1">
                {filteredAvailableCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {availableCustomers.length === 0 ? "All properties already in campaign" : "No matching properties"}
                  </p>
                ) : (
                  filteredAvailableCustomers.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                      onClick={() => toggleNewCustomer(c.id)}
                      data-testid={`edit-add-customer-${c.id}`}
                    >
                      <Checkbox
                        checked={selectedNewCustomerIds.has(c.id)}
                        onCheckedChange={() => toggleNewCustomer(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`checkbox-add-customer-${c.id}`}
                      />
                      <span className="text-sm">{c.name}</span>
                      {c.city && <span className="text-xs text-muted-foreground">{c.city}</span>}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            {selectedNewCustomerIds.size > 0 && (
              <p className="text-xs text-muted-foreground">{selectedNewCustomerIds.size} {selectedNewCustomerIds.size === 1 ? "property" : "properties"} will be added on save.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending} data-testid="button-save-edit-campaign">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
