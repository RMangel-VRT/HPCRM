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
import type { Campaign, CampaignItem, CampaignChecklistTask, Contact } from "@shared/schema";
import LayerMapViewer from "@/components/LayerMapViewer";
import WeatherCapturePanel from "@/components/WeatherCapturePanel";
import { Label } from "@/components/ui/label";

interface CampaignItemWithUser extends CampaignItem {
  completedByName?: string | null;
  preCommSentByName?: string | null;
  workCompletedByName?: string | null;
  postCommSentByName?: string | null;
  customerType?: string;
  customerLat?: number | null;
  customerLng?: number | null;
  customerAddress?: string;
  finishedWithoutComms?: string | null;
  weatherTemp?: number | null;
  weatherWindSpeed?: number | null;
  weatherWindDirection?: string | null;
  weatherHumidity?: number | null;
  weatherConditions?: string | null;
  weatherRecordedAt?: string | null;
}

interface CampaignDetailData extends Campaign {
  items: CampaignItemWithUser[];
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  assignedToName?: string;
  createdByName?: string;
  checklistTasks?: CampaignChecklistTask[];
  itemTaskCompletions?: Record<string, string[]>;
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
  const [showEmailConfirm, setShowEmailConfirm] = useState<"pre" | "post" | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ recipientEmail: string | null; subject: string; htmlBody: string; templateName: string; contactName: string | null } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [showFinishWithoutComms, setShowFinishWithoutComms] = useState(false);
  const [finishDate, setFinishDate] = useState("");
  const [finishWeatherTemp, setFinishWeatherTemp] = useState("");
  const [finishWeatherWindSpeed, setFinishWeatherWindSpeed] = useState("");
  const [finishWeatherWindDirection, setFinishWeatherWindDirection] = useState("");
  const [finishWeatherHumidity, setFinishWeatherHumidity] = useState("");
  const [finishWeatherConditions, setFinishWeatherConditions] = useState("");

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", campaignId],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/customers", campaign?.items?.find(i => i.id === itemId)?.customerId, "contacts"],
    queryFn: async () => {
      const custId = campaign?.items?.find(i => i.id === itemId)?.customerId;
      if (!custId) return [];
      const res = await fetch(`/api/customers/${custId}/contacts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaign?.items?.find(i => i.id === itemId)?.customerId && campaign?.category === "chemical",
  });

  const item = campaign?.items?.find(i => i.id === itemId);

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";
  const canComplete = ["admin", "office", "field_manager", "field", "chemical_manager"].includes(user?.activeRole || "");
  const canSendChemEmails = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const canFinishWithoutComms = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const canSkip = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const canReopen = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const isChemicalCampaign = campaign?.category === "chemical";
  const isIrrigationCampaign = campaign?.category === "irrigation";
  const [showChemReset, setShowChemReset] = useState(false);
  const primaryContact = contacts?.find(c => c.isPrimary === "true") || contacts?.[0];
  const recipientEmail = primaryContact?.emails?.[0] || contacts?.find(c => c.emails && c.emails.length > 0)?.emails?.[0] || null;

  useEffect(() => {
    if (item) {
      setNotes(item.notes || "");
      setSkipReason(item.skipReason || "");
      setPhotos(item.photos || []);
      setShowSkip(false);
    }
  }, [item?.id, item?.notes, item?.skipReason, item?.photos]);

  const updateItemMutation = useMutation({
    mutationFn: async (data: { status?: string; notes?: string; skipReason?: string; photos?: string[]; chemAction?: string; overrideEmail?: string; completionDate?: string; weatherTemp?: number; weatherWindSpeed?: number; weatherWindDirection?: string; weatherHumidity?: number; weatherConditions?: string }) => {
      if (data.chemAction && data.chemAction !== "reset" && data.chemAction !== "finish_without_comms") {
        const routeMap: Record<string, string> = {
          send_pre_communication: "send-pre-comm",
          complete_work: "complete-work",
          send_post_communication: "send-post-comm",
        };
        const route = routeMap[data.chemAction];
        if (route) {
          const body: Record<string, string | undefined> = { notes: data.notes };
          if (data.overrideEmail) body.overrideEmail = data.overrideEmail;
          const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/${route}`, body);
          return res.json();
        }
      }
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/items/${itemId}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      if (variables.chemAction) {
        if (variables.chemAction === "reset") {
          toast({ title: t("campaigns.chemWorkflowReset") });
        } else if (variables.chemAction === "finish_without_comms") {
          toast({ title: t("campaigns.chemFinishWithoutCommsSuccess") });
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

  const toggleChecklistTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/checklist/${taskId}/toggle`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
    onError: () => {
      toast({ title: t("campaigns.updateFailed"), variant: "destructive" });
    },
  });

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
    <div className="space-y-6 max-w-4xl mx-auto px-4 sm:px-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 mt-0.5"
          onClick={() => navigate(`/dashboard/campaigns/${campaignId}`)}
          data-testid="button-back-campaign"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {statusIcon}
              <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="text-item-detail-name">
                {item.customerName}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge}
              {item.customerType === "hoa" && (
                <Badge variant="outline" data-testid="badge-customer-type-hoa">
                  {t("campaigns.customerTypeHoa")}
                </Badge>
              )}
            </div>
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

      {item.weatherTemp != null && item.weatherConditions && (
        <Card data-testid="card-weather-data">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {t("campaigns.chemWeatherConditions")}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherTemp")}</span>
                <div className="font-medium">{item.weatherTemp}°F</div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherWindSpeed")}</span>
                <div className="font-medium">{item.weatherWindSpeed} mph</div>
              </div>
              {item.weatherWindDirection && (
                <div>
                  <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherWindDirection")}</span>
                  <div className="font-medium">{item.weatherWindDirection}</div>
                </div>
              )}
              {item.weatherHumidity != null && (
                <div>
                  <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherHumidity")}</span>
                  <div className="font-medium">{item.weatherHumidity}%</div>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherConditions")}</span>
                <div className="font-medium">{item.weatherConditions}</div>
              </div>
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

      {isChemicalCampaign && item && (
        <WeatherCapturePanel
          item={item}
          campaignId={campaignId!}
          customerLat={item.customerLat}
          customerLng={item.customerLng}
          customerAddress={item.customerAddress}
        />
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

      {isChemicalCampaign && item.workflowStep && (
        <Card data-testid="card-chem-workflow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              {t("campaigns.chemWorkflow")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="space-y-2">
              {item.status === "skipped" && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400" data-testid="badge-chem-skipped">
                    <SkipForward className="w-3 h-3 mr-1" />
                    {t("campaigns.skippedLabel")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{t("campaigns.chemSkippedState")}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1">
                {["pre_communication", "work_in_progress", "work_completed", "post_communication", "complete"].map((step, idx) => {
                  const stepLabels = [
                    t("campaigns.chemStepPre"),
                    t("campaigns.chemStepInProgress"),
                    t("campaigns.chemStepWorkDone"),
                    t("campaigns.chemStepPost"),
                    t("campaigns.chemStepComplete"),
                  ];
                  const stepLabelsShort = [
                    t("campaigns.chemStepPreShort"),
                    t("campaigns.chemStepInProgressShort"),
                    t("campaigns.chemStepWorkDoneShort"),
                    t("campaigns.chemStepPostShort"),
                    t("campaigns.chemStepCompleteShort"),
                  ];
                  const isSkipped = item.status === "skipped";
                  const steps = ["pre_communication", "work_in_progress", "work_completed", "post_communication"];
                  const currentIdx = item.status === "completed" ? 4 : isSkipped ? -1 : steps.indexOf(item.workflowStep || "pre_communication");
                  const isComplete = !isSkipped && idx < currentIdx;
                  const isCurrent = !isSkipped && idx === currentIdx;
                  return (
                    <div key={step} className="flex sm:flex-1 items-center gap-1">
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium flex-1 justify-center ${
                        isComplete ? "bg-green-600/10 text-green-700 dark:text-green-400" :
                        isCurrent ? "bg-primary/10 text-primary border border-primary/30" :
                        "bg-muted text-muted-foreground"
                      }`} data-testid={`chem-step-${step}`}>
                        {isComplete ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : isCurrent ? <Clock className="w-3 h-3 shrink-0" /> : null}
                        <span className="hidden sm:inline truncate">{stepLabels[idx]}</span>
                        <span className="sm:hidden">{stepLabelsShort[idx]}</span>
                      </div>
                      {idx < 4 && <div className="hidden sm:block w-2 h-px bg-muted-foreground/30 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              {item.preCommSentAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-pre-sent">
                  <Mail className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemPreSentAt")}: {format(new Date(item.preCommSentAt), "PPp")}</span>
                  {item.preCommSentByName && <span>({item.preCommSentByName})</span>}
                </div>
              )}
              {item.workCompletedAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-work-done">
                  <Wrench className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemWorkCompletedAt")}: {format(new Date(item.workCompletedAt), "PPp")}</span>
                  {item.workCompletedByName && <span>({item.workCompletedByName})</span>}
                </div>
              )}
              {item.postCommSentAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-post-sent">
                  <Send className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemPostSentAt")}: {format(new Date(item.postCommSentAt), "PPp")}</span>
                  {item.postCommSentByName && <span>({item.postCommSentByName})</span>}
                </div>
              )}
            </div>

            {item.status !== "skipped" && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                {item.workflowStep === "pre_communication" && canSendChemEmails && (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      setLoadingPreview(true);
                      setManualEmail("");
                      try {
                        const res = await fetch(`/api/campaigns/${campaignId}/items/${itemId}/email-preview?type=pre`, { credentials: "include" });
                        if (res.ok) setEmailPreview(await res.json());
                      } catch {}
                      setLoadingPreview(false);
                      setShowEmailConfirm("pre");
                    }}
                    disabled={updateItemMutation.isPending || loadingPreview}
                    data-testid="button-chem-send-pre"
                  >
                    {loadingPreview && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <Mail className="w-4 h-4 mr-1" />
                    {t("campaigns.chemSendPreNotice")}
                  </Button>
                )}
                {item.workflowStep === "work_in_progress" && canComplete && (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => updateItemMutation.mutate({ chemAction: "complete_work", notes })}
                    disabled={updateItemMutation.isPending}
                    data-testid="button-chem-complete-work"
                  >
                    {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <Wrench className="w-4 h-4 mr-1" />
                    {t("campaigns.chemMarkWorkDone")}
                  </Button>
                )}
                {item.workflowStep === "work_completed" && canSendChemEmails && (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      setLoadingPreview(true);
                      setManualEmail("");
                      try {
                        const res = await fetch(`/api/campaigns/${campaignId}/items/${itemId}/email-preview?type=post`, { credentials: "include" });
                        if (res.ok) setEmailPreview(await res.json());
                      } catch {}
                      setLoadingPreview(false);
                      setShowEmailConfirm("post");
                    }}
                    disabled={updateItemMutation.isPending || loadingPreview}
                    data-testid="button-chem-send-post"
                  >
                    {loadingPreview && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <Send className="w-4 h-4 mr-1" />
                    {t("campaigns.chemSendPostNotice")}
                  </Button>
                )}
                {item.status === "completed" && isChemicalCampaign && (
                  <Badge variant="default" className="bg-green-600" data-testid="badge-chem-done">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {t("campaigns.chemStepComplete")}
                  </Badge>
                )}
                {item.status === "completed" && item.finishedWithoutComms === "true" && (
                  <Badge variant="secondary" data-testid="badge-chem-no-comms">
                    {t("campaigns.chemCompletedWithoutComms")}
                  </Badge>
                )}
                {canFinishWithoutComms && item.status !== "completed" && item.status !== "skipped" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFinishDate("");
                      setFinishWeatherTemp("");
                      setFinishWeatherWindSpeed("");
                      setFinishWeatherWindDirection("");
                      setFinishWeatherHumidity("");
                      setFinishWeatherConditions("");
                      setShowFinishWithoutComms(true);
                    }}
                    disabled={updateItemMutation.isPending}
                    data-testid="button-chem-finish-no-comms"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {t("campaigns.chemFinishWithoutComms")}
                  </Button>
                )}
                {canManage && item.workflowStep !== "pre_communication" && item.status !== "completed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setShowChemReset(true)}
                    data-testid="button-chem-reset"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {t("campaigns.chemResetWorkflow")}
                  </Button>
                )}
              </div>
            )}

            {item.status !== "completed" && item.status !== "skipped" && canSkip && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {!showSkip ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setShowSkip(true)}
                    data-testid="button-show-skip"
                  >
                    <SkipForward className="w-4 h-4 mr-1" />
                    {t("campaigns.skip")}
                  </Button>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                    <Input
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      placeholder={t("campaigns.skipReasonPlaceholder")}
                      className="flex-1"
                      data-testid="input-skip-reason"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
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

            {item.status === "skipped" && canReopen && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => updateItemMutation.mutate({ chemAction: "reset" })}
                disabled={updateItemMutation.isPending}
                data-testid="button-reopen-chem-item"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                {t("campaigns.reopen")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isIrrigationCampaign && campaign.checklistTasks && campaign.checklistTasks.length > 0 && (
        <Card data-testid="card-irrigation-checklist">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {t("campaigns.checklistTasks")}
              <Badge variant="outline" className="ml-auto text-xs">
                {campaign.itemTaskCompletions?.[item.id]?.length || 0}/{campaign.checklistTasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {campaign.checklistTasks.map(task => {
              const isChecked = campaign.itemTaskCompletions?.[item.id]?.includes(task.id) || false;
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 p-2.5 rounded-md border ${isChecked ? "bg-green-600/5 border-green-600/20" : "bg-muted/20"}`}
                  data-testid={`checklist-item-${task.id}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleChecklistTaskMutation.mutate(task.id)}
                    disabled={toggleChecklistTaskMutation.isPending || item.status === "skipped"}
                    className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                    data-testid={`checkbox-task-${task.id}`}
                  />
                  <span className={`text-sm flex-1 ${isChecked ? "line-through text-muted-foreground" : ""}`}>
                    {task.label}
                  </span>
                </div>
              );
            })}
            {item.status === "completed" && (
              <div className="flex items-center gap-2 pt-2">
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {t("campaigns.completed")}
                </Badge>
              </div>
            )}
            {item.status !== "completed" && item.status !== "skipped" && canSkip && (
              <div className="flex items-center gap-2 pt-2 flex-wrap">
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
            {canManage && (item.status === "completed" || item.status === "skipped") && (
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateItemMutation.mutate({ status: "pending", notes: "", skipReason: "" })}
                  disabled={updateItemMutation.isPending}
                  data-testid="button-reopen-item"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  {t("campaigns.reopen")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isChemicalCampaign && !isIrrigationCampaign && canComplete && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {item.status === "pending" && (
                <>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => updateItemMutation.mutate({ status: "completed", notes })}
                    disabled={updateItemMutation.isPending}
                    data-testid="button-complete-item"
                  >
                    {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {t("campaigns.markComplete")}
                  </Button>
                  {canSkip && (
                    <>
                      {!showSkip ? (
                        <Button
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => setShowSkip(true)}
                          data-testid="button-show-skip"
                        >
                          <SkipForward className="w-4 h-4 mr-1" />
                          {t("campaigns.skip")}
                        </Button>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                          <Input
                            value={skipReason}
                            onChange={(e) => setSkipReason(e.target.value)}
                            placeholder={t("campaigns.skipReasonPlaceholder")}
                            className="flex-1"
                            data-testid="input-skip-reason"
                          />
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto"
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
                </>
              )}
              {canManage && (item.status === "completed" || item.status === "skipped") && (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
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

      <Dialog open={!!showEmailConfirm} onOpenChange={() => { setShowEmailConfirm(null); setEmailPreview(null); setManualEmail(""); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-chem-email-compose">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {showEmailConfirm === "pre" ? <Mail className="w-5 h-5 text-primary" /> : <Send className="w-5 h-5 text-primary" />}
              <h3 className="text-lg font-semibold">
                {showEmailConfirm === "pre" ? t("campaigns.chemSendPreNotice") : t("campaigns.chemSendPostNotice")}
              </h3>
            </div>
            <Separator />
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailRecipient")}</Label>
                {emailPreview?.recipientEmail ? (
                  <div className="text-sm font-medium mt-0.5" data-testid="text-email-recipient">
                    <span>{emailPreview.contactName ? `${emailPreview.contactName} <${emailPreview.recipientEmail}>` : emailPreview.recipientEmail}</span>
                  </div>
                ) : (
                  <div className="mt-1 space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{t("campaigns.chemNoRecipientManual")}</span>
                    </div>
                    <Input
                      type="email"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder={t("campaigns.chemManualEmailPlaceholder")}
                      data-testid="input-manual-email"
                    />
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailTemplate")}</Label>
                <div className="text-sm font-medium mt-0.5">{emailPreview?.templateName || "—"}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailSubject")}</Label>
                <div className="text-sm font-medium mt-0.5 p-2 rounded-md border bg-muted/30" data-testid="text-email-subject">
                  {emailPreview?.subject || "—"}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailBody")}</Label>
                <div
                  className="text-sm mt-0.5 p-3 rounded-md border bg-muted/30 max-h-48 overflow-y-auto"
                  data-testid="text-email-body"
                  dangerouslySetInnerHTML={{ __html: emailPreview?.htmlBody || "—" }}
                />
              </div>
            </div>
            <Separator />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setShowEmailConfirm(null); setEmailPreview(null); setManualEmail(""); }} data-testid="button-cancel-email">
                {t("common.cancel")}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  const action = showEmailConfirm === "pre" ? "send_pre_communication" : "send_post_communication";
                  const effectiveEmail = emailPreview?.recipientEmail || manualEmail.trim();
                  setShowEmailConfirm(null);
                  setEmailPreview(null);
                  updateItemMutation.mutate({ chemAction: action, notes, overrideEmail: !emailPreview?.recipientEmail ? effectiveEmail : undefined });
                  setManualEmail("");
                }}
                disabled={updateItemMutation.isPending || (!emailPreview?.recipientEmail && (!manualEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim())))}
                data-testid="button-confirm-send-email"
              >
                {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {showEmailConfirm === "pre" ? <Mail className="w-4 h-4 mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                {t("campaigns.chemConfirmSend")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinishWithoutComms} onOpenChange={setShowFinishWithoutComms}>
        <DialogContent className="max-w-md" data-testid="dialog-finish-without-comms">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">{t("campaigns.chemFinishWithoutCommsTitle")}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{t("campaigns.chemFinishWithoutCommsDesc")}</p>
            <Separator />
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemCompletionDate")} *</Label>
                <Input
                  type="date"
                  value={finishDate}
                  onChange={(e) => setFinishDate(e.target.value)}
                  data-testid="input-finish-date"
                  className="mt-1"
                />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemWeatherTemp")} *</Label>
                  <Input
                    type="number"
                    value={finishWeatherTemp}
                    onChange={(e) => setFinishWeatherTemp(e.target.value)}
                    placeholder="72"
                    data-testid="input-weather-temp"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemWeatherWindSpeed")} *</Label>
                  <Input
                    type="number"
                    value={finishWeatherWindSpeed}
                    onChange={(e) => setFinishWeatherWindSpeed(e.target.value)}
                    placeholder="5"
                    data-testid="input-weather-wind-speed"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemWeatherWindDirection")}</Label>
                  <Input
                    value={finishWeatherWindDirection}
                    onChange={(e) => setFinishWeatherWindDirection(e.target.value)}
                    placeholder="NW"
                    data-testid="input-weather-wind-dir"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemWeatherHumidity")}</Label>
                  <Input
                    type="number"
                    value={finishWeatherHumidity}
                    onChange={(e) => setFinishWeatherHumidity(e.target.value)}
                    placeholder="45"
                    data-testid="input-weather-humidity"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemWeatherConditions")} *</Label>
                <Input
                  value={finishWeatherConditions}
                  onChange={(e) => setFinishWeatherConditions(e.target.value)}
                  placeholder={t("campaigns.chemWeatherConditionsPlaceholder")}
                  data-testid="input-weather-conditions"
                  className="mt-1"
                />
              </div>
            </div>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFinishWithoutComms(false)} data-testid="button-cancel-finish-no-comms">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  updateItemMutation.mutate({
                    chemAction: "finish_without_comms",
                    notes,
                    completionDate: finishDate,
                    weatherTemp: parseFloat(finishWeatherTemp),
                    weatherWindSpeed: parseFloat(finishWeatherWindSpeed),
                    weatherWindDirection: finishWeatherWindDirection || undefined,
                    weatherHumidity: finishWeatherHumidity ? parseFloat(finishWeatherHumidity) : undefined,
                    weatherConditions: finishWeatherConditions,
                  });
                  setShowFinishWithoutComms(false);
                }}
                disabled={
                  updateItemMutation.isPending ||
                  !finishDate ||
                  !finishWeatherTemp ||
                  !finishWeatherWindSpeed ||
                  !finishWeatherConditions.trim()
                }
                data-testid="button-confirm-finish-no-comms"
              >
                {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {t("campaigns.chemConfirmFinish")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
