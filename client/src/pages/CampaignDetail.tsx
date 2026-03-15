import { useState, useMemo } from "react";
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
} from "lucide-react";
import type { Campaign, CampaignItem } from "@shared/schema";

interface CampaignItemWithUser extends CampaignItem {
  completedByName?: string | null;
}

interface CampaignDetailData extends Campaign {
  items: CampaignItemWithUser[];
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  assignedToName?: string;
  createdByName?: string;
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

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", id],
  });

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";

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
                        {getChemStepIcon(item.workflowStep, item.status)}
                        <span className={`text-xs font-medium ${item.status === "completed" ? "text-green-600" : "text-primary"}`}>
                          {getChemStepLabel(item.workflowStep, item.status)}
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
