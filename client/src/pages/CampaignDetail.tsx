import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Camera,
  X,
  Trash2,
  Archive,
  RotateCcw,
  Upload,
} from "lucide-react";
import type { Campaign, CampaignItem } from "@shared/schema";

interface CampaignDetailData extends Campaign {
  items: CampaignItem[];
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
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", id],
  });

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";
  const canComplete = ["admin", "office", "field_manager", "field"].includes(user?.activeRole || "");

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

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, ...data }: { itemId: string; status?: string; notes?: string; skipReason?: string; photos?: string[] }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${id}/items/${itemId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
    onError: () => {
      toast({ title: t("campaigns.updateFailed"), variant: "destructive" });
    },
  });

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
            <div className="text-sm font-medium mt-1">{campaign.windowStart} — {campaign.windowEnd}</div>
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
        {filteredItems.map(item => (
          <CampaignItemRow
            key={item.id}
            item={item}
            campaignId={id!}
            canComplete={canComplete}
            canManage={canManage}
            isExpanded={activeItemId === item.id}
            onToggle={() => setActiveItemId(activeItemId === item.id ? null : item.id)}
            onUpdate={(data) => updateItemMutation.mutate({ itemId: item.id, ...data })}
            isPending={updateItemMutation.isPending}
          />
        ))}
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

function CampaignItemRow({
  item,
  campaignId,
  canComplete,
  canManage,
  isExpanded,
  onToggle,
  onUpdate,
  isPending,
}: {
  item: CampaignItem;
  campaignId: string;
  canComplete: boolean;
  canManage: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (data: { status?: string; notes?: string; skipReason?: string; photos?: string[] }) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [notes, setNotes] = useState(item.notes || "");
  const [skipReason, setSkipReason] = useState(item.skipReason || "");
  const [photos, setPhotos] = useState<string[]>(item.photos || []);
  const [showSkip, setShowSkip] = useState(false);
  const [uploading, setUploading] = useState(false);

  const statusIcon = () => {
    if (item.status === "completed") return <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />;
    if (item.status === "skipped") return <SkipForward className="w-5 h-5 text-amber-500 shrink-0" />;
    return <Clock className="w-5 h-5 text-muted-foreground shrink-0" />;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await apiRequest("POST", "/api/campaigns/photo-upload-url");
      const { uploadURL, objectPath } = await res.json();
      await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const newPhotos = [...photos, objectPath];
      setPhotos(newPhotos);
      onUpdate({ photos: newPhotos });
    } catch {
      toast({ title: t("campaigns.photoUploadFailed"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (idx: number) => {
    const newPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(newPhotos);
    onUpdate({ photos: newPhotos });
  };

  return (
    <Card data-testid={`campaign-item-${item.id}`}>
      <CardContent className="p-0">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover-elevate"
          onClick={onToggle}
          data-testid={`campaign-item-toggle-${item.id}`}
        >
          {statusIcon()}
          <div className="flex-1 min-w-0">
            <span className="font-medium" data-testid={`text-item-customer-${item.id}`}>{item.customerName}</span>
          </div>
          {item.status === "completed" && (
            <Badge variant="default" className="bg-green-600 shrink-0">{t("campaigns.completed")}</Badge>
          )}
          {item.status === "skipped" && (
            <Badge variant="secondary" className="shrink-0">{t("campaigns.skippedLabel")}</Badge>
          )}
          {item.status === "pending" && (
            <Badge variant="outline" className="shrink-0">{t("campaigns.pending")}</Badge>
          )}
        </div>
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t pt-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("common.notes")}</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("campaigns.notesPlaceholder")}
                rows={2}
                data-testid={`textarea-item-notes-${item.id}`}
              />
            </div>

            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photos.map((photo, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border">
                    <img src={photo.startsWith("/objects/") ? photo : `/objects/${photo.replace(/^\/[^/]+\/[^/]+\//, "")}`} alt="" className="w-full h-full object-cover" />
                    <button
                      className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-md p-0.5"
                      onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                      data-testid={`button-remove-photo-${idx}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showSkip && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("campaigns.skipReason")}</label>
                <Input
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  placeholder={t("campaigns.skipReasonPlaceholder")}
                  data-testid={`input-skip-reason-${item.id}`}
                />
              </div>
            )}

            {canComplete && (
              <div className="flex items-center gap-2 flex-wrap">
                {item.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => onUpdate({ status: "completed", notes })}
                      disabled={isPending}
                      data-testid={`button-complete-item-${item.id}`}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      {t("campaigns.markComplete")}
                    </Button>
                    {!showSkip ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowSkip(true)}
                        data-testid={`button-show-skip-${item.id}`}
                      >
                        <SkipForward className="w-4 h-4 mr-1" />
                        {t("campaigns.skip")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdate({ status: "skipped", notes, skipReason })}
                        disabled={isPending}
                        data-testid={`button-confirm-skip-${item.id}`}
                      >
                        <SkipForward className="w-4 h-4 mr-1" />
                        {t("campaigns.confirmSkip")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdate({ notes })}
                      disabled={isPending}
                      data-testid={`button-save-notes-${item.id}`}
                    >
                      {t("campaigns.saveNotes")}
                    </Button>
                    <label className="cursor-pointer">
                      <Button size="sm" variant="outline" asChild disabled={uploading}>
                        <span>
                          {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
                          {t("campaigns.addPhoto")}
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        data-testid={`input-photo-upload-${item.id}`}
                      />
                    </label>
                  </>
                )}
                {canManage && (item.status === "completed" || item.status === "skipped") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onUpdate({ status: "pending", notes: "", skipReason: "" })}
                    disabled={isPending}
                    data-testid={`button-reopen-item-${item.id}`}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    {t("campaigns.reopen")}
                  </Button>
                )}
              </div>
            )}

            {item.completedAt && (
              <div className="text-xs text-muted-foreground">
                {t("campaigns.completedAt")}: {format(new Date(item.completedAt), "PPp")}
              </div>
            )}
            {item.skipReason && item.status === "skipped" && (
              <div className="text-xs text-muted-foreground">
                {t("campaigns.skipReason")}: {item.skipReason}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
