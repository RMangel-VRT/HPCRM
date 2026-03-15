import { useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Clock,
  SkipForward,
  Camera,
  X,
  RotateCcw,
  MapPin,
  User,
  Layers,
  ExternalLink,
  CalendarDays,
  StickyNote,
  ImageIcon,
  Mail,
  Wrench,
  Send,
  AlertCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import type { Campaign, CampaignItem } from "@shared/schema";
import LayerMapViewer from "@/components/LayerMapViewer";

interface CampaignItemWithUser extends CampaignItem {
  completedByName?: string | null;
  chemPreSentByName?: string | null;
  chemWorkCompletedByName?: string | null;
  chemPostSentByName?: string | null;
}

interface CampaignDetailData extends Campaign {
  items: CampaignItemWithUser[];
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  assignedToName?: string;
  createdByName?: string;
}

export default function CampaignItemDetail() {
  const { id: campaignId, itemId } = useParams<{ id: string; itemId: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [notes, setNotes] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [showSkip, setShowSkip] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPropertyMaps, setShowPropertyMaps] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", campaignId],
  });

  const item = campaign?.items?.find(i => i.id === itemId);

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";
  const canComplete = ["admin", "office", "field_manager", "field", "chemical_manager"].includes(user?.activeRole || "");
  const canSendChemEmails = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const isChemicalCampaign = campaign?.category === "chemical";
  const [showChemReset, setShowChemReset] = useState(false);

  useEffect(() => {
    if (item) {
      setNotes(item.notes || "");
      setSkipReason(item.skipReason || "");
      setPhotos(item.photos || []);
      setShowSkip(false);
    }
  }, [item?.id, item?.notes, item?.skipReason, item?.photos]);

  const updateItemMutation = useMutation({
    mutationFn: async (data: { status?: string; notes?: string; skipReason?: string; photos?: string[]; chemAction?: string }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/items/${itemId}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      if (variables.chemAction) {
        if (variables.chemAction === "reset") {
          toast({ title: t("campaigns.chemWorkflowReset") });
        } else {
          toast({ title: t("campaigns.chemStepAdvanced") });
        }
      } else {
        toast({ title: t("campaigns.itemUpdated") });
      }
    },
    onError: () => {
      toast({ title: t("campaigns.updateFailed"), variant: "destructive" });
    },
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await apiRequest("POST", "/api/campaigns/photo-upload-url");
      const { uploadURL, objectPath } = await res.json();
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const newPhotos = [...photos, objectPath];
      setPhotos(newPhotos);
      updateItemMutation.mutate({ photos: newPhotos });
    } catch {
      toast({ title: t("campaigns.photoUploadFailed"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (idx: number) => {
    const newPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(newPhotos);
    updateItemMutation.mutate({ photos: newPhotos });
  };

  const getPhotoUrl = (photo: string) => {
    return photo.startsWith("/objects/") ? photo : `/objects/${photo.replace(/^\/[^/]+\/[^/]+\//, "")}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign || !item) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        {t("campaigns.notFound")}
      </div>
    );
  }

  const formatWindowDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return format(d, "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const statusIcon = item.status === "completed"
    ? <CheckCircle2 className="w-5 h-5 text-green-600" />
    : item.status === "skipped"
      ? <SkipForward className="w-5 h-5 text-amber-500" />
      : <Clock className="w-5 h-5 text-muted-foreground" />;

  const statusBadge = (
    <Badge
      variant={item.status === "completed" ? "default" : item.status === "skipped" ? "secondary" : "outline"}
      className={item.status === "completed" ? "bg-green-600" : ""}
      data-testid="badge-item-status"
    >
      {item.status === "completed" ? t("campaigns.completed")
        : item.status === "skipped" ? t("campaigns.skippedLabel")
        : t("campaigns.pending")}
    </Badge>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/dashboard/campaigns/${campaignId}`)}
          data-testid="button-back-campaign"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {statusIcon}
            <h1 className="text-2xl font-bold truncate" data-testid="text-item-detail-name">
              {item.customerName}
            </h1>
            {statusBadge}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {campaign.title}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5" />
              {t("campaigns.itemLocation")}
            </div>
            <div className="text-sm font-medium">{item.customerCity || t("common.unknown")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CalendarDays className="w-3.5 h-3.5" />
              {t("campaigns.window")}
            </div>
            <div className="text-sm font-medium">
              {formatWindowDate(campaign.windowStart)} – {formatWindowDate(campaign.windowEnd)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <User className="w-3.5 h-3.5" />
              {t("campaigns.assignedTo")}
            </div>
            <div className="text-sm font-medium">{campaign.assignedToName || t("common.unassigned")}</div>
          </CardContent>
        </Card>
      </div>

      {item.completedAt && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-muted-foreground">{t("campaigns.completedAt")}:</span>
              <span className="font-medium">{format(new Date(item.completedAt), "PPp")}</span>
              {item.completedByName && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  {item.completedByName}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {item.skipReason && item.status === "skipped" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm">
              <SkipForward className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-muted-foreground">{t("campaigns.skipReason")}:</span>
              <span>{item.skipReason}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="w-4 h-4" />
            {t("common.notes")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("campaigns.notesPlaceholder")}
            rows={5}
            data-testid="textarea-item-notes"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateItemMutation.mutate({ notes })}
            disabled={updateItemMutation.isPending}
            data-testid="button-save-notes"
          >
            {updateItemMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {t("campaigns.saveNotes")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            {t("campaigns.photos")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {photos.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-md overflow-hidden border group">
                  <img
                    src={getPhotoUrl(photo)}
                    alt=""
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewPhoto(getPhotoUrl(photo))}
                    data-testid={`img-photo-${idx}`}
                  />
                  <button
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-md p-1 invisible group-hover:visible"
                    onClick={() => removePhoto(idx)}
                    data-testid={`button-remove-photo-${idx}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("campaigns.noPhotos")}</p>
          )}
          <label className="cursor-pointer inline-block">
            <Button size="sm" variant="outline" asChild disabled={uploading}>
              <span>
                {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Camera className="w-3 h-3 mr-1" />}
                {t("campaigns.addPhoto")}
              </span>
            </Button>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
              data-testid="input-photo-upload"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t("campaigns.itemCustomerLinks")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPropertyMaps(true)}
              data-testid="button-view-property-maps"
            >
              <Layers className="w-3 h-3 mr-1" />
              {t("campaigns.viewPropertyMaps")}
            </Button>
            {user?.activeRole !== "field" && (
              <Link href={`/dashboard/customers/${item.customerId}`}>
                <Button variant="outline" size="sm" data-testid="button-view-customer">
                  {t("campaigns.viewCustomer")}
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {isChemicalCampaign && item.chemWorkflowStep && (
        <Card data-testid="card-chem-workflow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              {t("campaigns.chemWorkflow")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="flex items-center gap-1">
              {["pre_communication", "work_completion", "post_communication", "done"].map((step, idx) => {
                const stepLabels = [
                  t("campaigns.chemStepPre"),
                  t("campaigns.chemStepWork"),
                  t("campaigns.chemStepPost"),
                  t("campaigns.chemStepDone"),
                ];
                const steps = ["pre_communication", "work_completion", "post_communication", "done"];
                const currentIdx = steps.indexOf(item.chemWorkflowStep || "pre_communication");
                const isComplete = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                return (
                  <div key={step} className="flex items-center gap-1 flex-1">
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium flex-1 text-center justify-center ${
                      isComplete ? "bg-green-600/10 text-green-700 dark:text-green-400" :
                      isCurrent ? "bg-primary/10 text-primary border border-primary/30" :
                      "bg-muted text-muted-foreground"
                    }`} data-testid={`chem-step-${step}`}>
                      {isComplete ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : isCurrent ? <Clock className="w-3 h-3 shrink-0" /> : null}
                      <span className="truncate">{stepLabels[idx]}</span>
                    </div>
                    {idx < 3 && <div className="w-2 h-px bg-muted-foreground/30 shrink-0" />}
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              {item.chemPreSentAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-pre-sent">
                  <Mail className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemPreSentAt")}: {format(new Date(item.chemPreSentAt), "PPp")}</span>
                  {item.chemPreSentByName && <span>({item.chemPreSentByName})</span>}
                </div>
              )}
              {item.chemWorkCompletedAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-work-done">
                  <Wrench className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemWorkCompletedAt")}: {format(new Date(item.chemWorkCompletedAt), "PPp")}</span>
                  {item.chemWorkCompletedByName && <span>({item.chemWorkCompletedByName})</span>}
                </div>
              )}
              {item.chemPostSentAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-post-sent">
                  <Send className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemPostSentAt")}: {format(new Date(item.chemPostSentAt), "PPp")}</span>
                  {item.chemPostSentByName && <span>({item.chemPostSentByName})</span>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {item.chemWorkflowStep === "pre_communication" && canSendChemEmails && (
                <Button
                  onClick={() => updateItemMutation.mutate({ chemAction: "send_pre_communication", notes })}
                  disabled={updateItemMutation.isPending}
                  data-testid="button-chem-send-pre"
                >
                  {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  <Mail className="w-4 h-4 mr-1" />
                  {t("campaigns.chemSendPreNotice")}
                </Button>
              )}
              {item.chemWorkflowStep === "work_completion" && canComplete && (
                <Button
                  onClick={() => updateItemMutation.mutate({ chemAction: "complete_work", notes })}
                  disabled={updateItemMutation.isPending}
                  data-testid="button-chem-complete-work"
                >
                  {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  <Wrench className="w-4 h-4 mr-1" />
                  {t("campaigns.chemMarkWorkDone")}
                </Button>
              )}
              {item.chemWorkflowStep === "post_communication" && canSendChemEmails && (
                <Button
                  onClick={() => updateItemMutation.mutate({ chemAction: "send_post_communication", notes })}
                  disabled={updateItemMutation.isPending}
                  data-testid="button-chem-send-post"
                >
                  {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  <Send className="w-4 h-4 mr-1" />
                  {t("campaigns.chemSendPostNotice")}
                </Button>
              )}
              {item.chemWorkflowStep === "done" && (
                <Badge variant="default" className="bg-green-600" data-testid="badge-chem-done">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {t("campaigns.chemStepDone")}
                </Badge>
              )}
              {canManage && item.chemWorkflowStep !== "pre_communication" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChemReset(true)}
                  data-testid="button-chem-reset"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {t("campaigns.chemResetWorkflow")}
                </Button>
              )}
            </div>

            {item.chemWorkflowStep !== "done" && (
              <div className="flex items-center gap-2 flex-wrap">
                {!showSkip ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSkip(true)}
                    data-testid="button-show-skip"
                  >
                    <SkipForward className="w-4 h-4 mr-1" />
                    {t("campaigns.skip")}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[200px]">
                    <Input
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      placeholder={t("campaigns.skipReasonPlaceholder")}
                      className="flex-1 min-w-[150px]"
                      data-testid="input-skip-reason"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateItemMutation.mutate({ status: "skipped", notes, skipReason })}
                      disabled={updateItemMutation.isPending || !skipReason.trim()}
                      data-testid="button-confirm-skip"
                    >
                      <SkipForward className="w-4 h-4 mr-1" />
                      {t("campaigns.confirmSkip")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isChemicalCampaign && canComplete && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              {item.status === "pending" && (
                <>
                  <Button
                    onClick={() => updateItemMutation.mutate({ status: "completed", notes })}
                    disabled={updateItemMutation.isPending}
                    data-testid="button-complete-item"
                  >
                    {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {t("campaigns.markComplete")}
                  </Button>
                  {!showSkip ? (
                    <Button
                      variant="outline"
                      onClick={() => setShowSkip(true)}
                      data-testid="button-show-skip"
                    >
                      <SkipForward className="w-4 h-4 mr-1" />
                      {t("campaigns.skip")}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[200px]">
                      <Input
                        value={skipReason}
                        onChange={(e) => setSkipReason(e.target.value)}
                        placeholder={t("campaigns.skipReasonPlaceholder")}
                        className="flex-1 min-w-[150px]"
                        data-testid="input-skip-reason"
                      />
                      <Button
                        variant="outline"
                        onClick={() => updateItemMutation.mutate({ status: "skipped", notes, skipReason })}
                        disabled={updateItemMutation.isPending || !skipReason.trim()}
                        data-testid="button-confirm-skip"
                      >
                        <SkipForward className="w-4 h-4 mr-1" />
                        {t("campaigns.confirmSkip")}
                      </Button>
                    </div>
                  )}
                </>
              )}
              {canManage && (item.status === "completed" || item.status === "skipped") && (
                <Button
                  variant="outline"
                  onClick={() => updateItemMutation.mutate({ status: "pending", notes: "", skipReason: "" })}
                  disabled={updateItemMutation.isPending}
                  data-testid="button-reopen-item"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  {t("campaigns.reopen")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showChemReset} onOpenChange={setShowChemReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("campaigns.chemResetConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("campaigns.chemResetMsg")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateItemMutation.mutate({ chemAction: "reset" });
                setShowChemReset(false);
              }}
              data-testid="button-chem-reset-confirm"
            >
              {t("campaigns.chemResetWorkflow")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showPropertyMaps && (
        <LayerMapViewer
          customerId={item.customerId}
          fullScreen
          onClose={() => setShowPropertyMaps(false)}
        />
      )}

      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {previewPhoto && (
            <img src={previewPhoto} alt="" className="w-full h-auto" data-testid="img-photo-preview" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
