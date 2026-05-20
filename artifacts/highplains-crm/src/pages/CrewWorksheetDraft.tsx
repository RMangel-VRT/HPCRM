import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  ArrowLeft, FileText, ImagePlus, Trash2, Loader2, Plus, X, Printer, Download, HardHat, Calendar, Clock, GripVertical, Lock, ChevronUp, ChevronDown,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { CrewWorksheetWithDetails, CrewWorksheetPhoto } from "@shared/schema";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ChecklistItem { id: string; label: string; checked: boolean }
interface MaterialItem extends ChecklistItem { quantity: string }

type VsSheetSummary = { id: string; title: string | null; viewMode?: string | null };

function VisualScopePicker({
  crewWorksheetId, customerName, value, attachedSheet, disabled, onChange,
}: {
  crewWorksheetId: string;
  customerName: string;
  value: string | null;
  attachedSheet: { id: string; title: string | null } | null;
  disabled: boolean;
  onChange: (sheetId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: sheets = [] } = useQuery<VsSheetSummary[]>({
    queryKey: ["/api/crew-worksheets", crewWorksheetId, "visual-scope-sheets"],
    enabled: open && !disabled,
  });

  if (value && attachedSheet) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border p-3" data-testid="vs-attached">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("crewWorksheets.visualScope", { defaultValue: "Visual Scope / Site Map" })}
          </p>
          <p className="font-medium truncate" data-testid="text-vs-title">{attachedSheet.title || customerName}</p>
        </div>
        {!disabled && (
          <Button variant="outline" size="sm" onClick={() => onChange(null)} data-testid="button-vs-remove">
            {t("crewWorksheets.removeSiteMap", { defaultValue: "Remove" })}
          </Button>
        )}
      </div>
    );
  }

  if (disabled) {
    return <p className="text-sm text-muted-foreground" data-testid="text-vs-none">{t("crewWorksheets.noSiteMap", { defaultValue: "No site map attached." })}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {t("crewWorksheets.attachSiteMapHelp", { defaultValue: "Attach a Visual Scope sheet to print the combined site map with this worksheet." })}
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-vs-attach">
          <Plus className="w-4 h-4 mr-2" />
          {t("crewWorksheets.attachSiteMap", { defaultValue: "Attach Site Map" })}
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crewWorksheets.attachSiteMap", { defaultValue: "Attach Site Map" })}</DialogTitle>
            <DialogDescription>{customerName}</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
            {sheets.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center" data-testid="text-vs-empty">
                {t("crewWorksheets.noSiteMapForCustomer", { defaultValue: "No Visual Scope sheets exist for this customer." })}
              </p>
            ) : (
              sheets.map(s => (
                <button key={s.id} type="button"
                  className="w-full text-left p-3 hover:bg-muted text-sm"
                  onClick={() => { onChange(s.id); setOpen(false); }}
                  data-testid={`button-vs-pick-${s.id}`}>
                  <p className="font-medium">{s.title || `Sheet ${s.id.slice(0, 8)}`}</p>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type CompanyUserItem = { userId: string; role: string; user: { firstName: string; lastName: string; email: string } };

function CrewLeadPicker({
  value, valueName, disabled, onChange,
}: {
  value: string | null;
  valueName: string | null;
  disabled: boolean;
  onChange: (userId: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: companyUsers = [] } = useQuery<CompanyUserItem[]>({
    queryKey: ["/api/company-users"],
    enabled: !disabled,
  });
  const eligibleRoles = new Set(["admin", "office", "field_manager", "crew_supervisor", "landscape_supervisor"]);
  const eligible = companyUsers.filter(cu => eligibleRoles.has(cu.role));

  if (disabled) {
    return <p className="text-sm" data-testid="text-crew-lead">{valueName || t("crewWorksheets.noCrewLead", { defaultValue: "—" })}</p>;
  }

  return (
    <select
      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      data-testid="select-crew-lead"
    >
      <option value="">{t("crewWorksheets.unassigned", { defaultValue: "Unassigned" })}</option>
      {eligible.map(cu => {
        const name = `${cu.user.firstName} ${cu.user.lastName}`.trim() || cu.user.email;
        return <option key={cu.userId} value={cu.userId}>{name}</option>;
      })}
    </select>
  );
}

function PhotoRow({
  photo, selected, onSelect, onCaption, onDelete, isReadOnly,
}: {
  photo: CrewWorksheetPhoto; selected: boolean; onSelect: (v: boolean) => void;
  onCaption: (v: string) => void; onDelete: () => void; isReadOnly: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id, disabled: selected || isReadOnly });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-3 items-start p-3 rounded-md border bg-background" data-testid={`div-photo-${photo.id}`}>
      <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} className="mt-1.5 shrink-0" disabled={isReadOnly} data-testid={`checkbox-photo-${photo.id}`} />
      <button type="button" className="shrink-0 mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={selected || isReadOnly} {...attributes} {...listeners} data-testid={`button-drag-photo-${photo.id}`}>
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-16 h-16 rounded-md overflow-hidden shrink-0 bg-muted">
        <img src={`/objects/${photo.storageObjectPath.replace(/^\//, "")}`} alt={photo.caption ?? photo.filename}
          className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          data-testid={`img-thumb-${photo.id}`} />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-xs text-muted-foreground truncate">{photo.filename}</p>
        <Input placeholder={t("crewWorksheets.captionPlaceholder")} defaultValue={photo.caption ?? ""}
          onBlur={(e) => onCaption(e.target.value)} className="text-sm" disabled={isReadOnly}
          data-testid={`input-caption-${photo.id}`} />
      </div>
      {!isReadOnly && (
        <Button size="icon" variant="ghost" onClick={onDelete} className="shrink-0" data-testid={`button-delete-photo-${photo.id}`}>
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

export default function CrewWorksheetDraft() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.activeRole ?? "";
  const canWrite = role === "admin" || role === "office" || role === "field_manager" || role === "crew_supervisor" || role === "landscape_supervisor";
  const canFinalize = role === "admin" || role === "office";

  const [title, setTitle] = useState("");
  const [worksheetDate, setWorksheetDate] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [crewNotes, setCrewNotes] = useState("");
  const [crewLabel, setCrewLabel] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [equipment, setEquipment] = useState<ChecklistItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [newEquipment, setNewEquipment] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [newMaterialQty, setNewMaterialQty] = useState("");

  const [initialized, setInitialized] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: ws, isLoading } = useQuery<CrewWorksheetWithDetails>({
    queryKey: ["/api/crew-worksheets", id],
    enabled: !!id,
    select: (data) => {
      if (!initialized) {
        setTitle(data.title ?? "");
        setWorksheetDate(data.worksheetDate ?? "");
        setScopeOfWork(data.scopeOfWork ?? "");
        setCrewNotes(data.crewNotes ?? "");
        setCrewLabel(data.crewLabel ?? "");
        setScheduledDate(data.scheduledDate ?? "");
        setScheduledStartTime(data.scheduledStartTime ?? "");
        setEstimatedHours(data.estimatedHours ?? "");
        setEquipment((data.equipmentChecklist ?? []) as ChecklistItem[]);
        setMaterials((data.materialsChecklist ?? []) as MaterialItem[]);
        setInitialized(true);
      }
      return data;
    },
  });

  const isReadOnly = ws?.status === "finalized" || !canWrite;
  const isAdminAndDraft = canFinalize && ws?.status === "draft";

  useEffect(() => {
    if (ws?.title) {
      document.title = `${ws.title} | High Plains Property Maintenance`;
      return () => { document.title = "High Plains Property Maintenance"; };
    }
    return undefined;
  }, [ws?.title]);

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      return apiRequest("PATCH", `/api/crew-worksheets/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets"] });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const handleBlur = useCallback((field: string, value: unknown) => {
    if (!ws) return;
    saveMutation.mutate({ [field]: value });
  }, [ws, saveMutation]);

  const photos = useMemo(() => {
    return [...(ws?.photos ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [ws?.photos]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderMutation = useMutation({
    mutationFn: async (orderedPhotoIds: string[]) => {
      const res = await apiRequest("POST", `/api/crew-worksheets/${id}/photos/reorder`, { orderedPhotoIds });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets", id] }),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets", id] });
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const handlePhotoDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (selectedPhotoIds.has(String(active.id))) return;
    const oldIdx = photos.findIndex(p => p.id === active.id);
    const newIdx = photos.findIndex(p => p.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const newOrder = arrayMove(photos, oldIdx, newIdx);
    queryClient.setQueryData<CrewWorksheetWithDetails | undefined>(["/api/crew-worksheets", id], (old: CrewWorksheetWithDetails | undefined) => {
      if (!old) return old;
      const idx = new Map(newOrder.map((p: CrewWorksheetPhoto, i: number) => [p.id, i] as const));
      return { ...old, photos: old.photos.map((p: CrewWorksheetPhoto) => idx.has(p.id) ? { ...p, displayOrder: idx.get(p.id)! } : p) };
    });
    reorderMutation.mutate(newOrder.map(p => p.id));
  };

  const captionMutation = useMutation({
    mutationFn: async ({ photoId, caption }: { photoId: string; caption: string }) =>
      apiRequest("PATCH", `/api/crew-worksheets/${id}/photos/${photoId}`, { caption: caption || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets", id] }),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => apiRequest("DELETE", `/api/crew-worksheets/${id}/photos/${photoId}`),
    onSuccess: (_d, photoId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets", id] });
      setSelectedPhotoIds(prev => { const n = new Set(prev); n.delete(photoId); return n; });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (photoIds: string[]) => {
      const res = await apiRequest("POST", `/api/crew-worksheets/${id}/photos/bulk-delete`, { photoIds });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ deletedCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets", id] });
      setSelectedPhotoIds(new Set());
      setBulkDeleteOpen(false);
      toast({ title: t("crewWorksheets.photosDeleted", { count: data.deletedCount, defaultValue: "{{count}} photos deleted" }) });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const deleteWorksheetMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/crew-worksheets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets"] });
      navigate("/dashboard/tools/crew-worksheets");
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  // Finalize is not yet implemented server-side (returns 501). The button is
  // hidden below until the endpoint lands; keep this stub commented so the
  // wiring is obvious when finalize ships.

  const uploadPhoto = async (file: File) => {
    const urlRes = await apiRequest("POST", `/api/crew-worksheets/${id}/photos/upload-url`, { mimeType: file.type, fileSize: file.size, filename: file.name });
    if (!urlRes.ok) throw new Error(await urlRes.text());
    const { uploadUrl, storagePath } = await urlRes.json();
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    const finalRes = await apiRequest("POST", `/api/crew-worksheets/${id}/photos`, {
      storagePath, filename: file.name, mimeType: file.type, fileSize: file.size, caption: null,
    });
    if (!finalRes.ok) throw new Error(await finalRes.text());
    return finalRes.json();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) await uploadPhoto(f);
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets", id] });
      toast({ title: t("crewWorksheets.photosUploaded", { count: files.length, defaultValue: "{{count}} photo uploaded", defaultValue_other: "{{count}} photos uploaded" }) });
    } catch (err: any) {
      toast({ title: t("crewWorksheets.uploadFailed"), description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // ---- Equipment / Materials list helpers ----
  const persistEquipment = (next: ChecklistItem[]) => { setEquipment(next); saveMutation.mutate({ equipmentChecklist: next }); };
  const persistMaterials = (next: MaterialItem[]) => { setMaterials(next); saveMutation.mutate({ materialsChecklist: next }); };

  const addEquipment = () => {
    const label = newEquipment.trim();
    if (!label) return;
    persistEquipment([...equipment, { id: crypto.randomUUID(), label, checked: false }]);
    setNewEquipment("");
  };
  const addMaterial = () => {
    const label = newMaterial.trim();
    if (!label) return;
    persistMaterials([...materials, { id: crypto.randomUUID(), label, quantity: newMaterialQty.trim(), checked: false }]);
    setNewMaterial(""); setNewMaterialQty("");
  };

  if (isLoading || !ws) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse mb-4" />
        <div className="h-32 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/tools/crew-worksheets")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("crewWorksheets.backToList")}
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-mono text-xs" data-testid="badge-worksheet-number">{ws.worksheetNumber}</Badge>
          {isReadOnly ? (
            <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-500/50" data-testid="badge-status">
              <Lock className="w-3 h-3 mr-1" />{t("statuses.finalized")}
            </Badge>
          ) : (
            <Badge variant="secondary" data-testid="badge-status">{t("statuses.draft")}</Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/crew-worksheets/${id}/pdf?inline=1`, "_blank")} data-testid="button-preview-pdf">
            <FileText className="w-4 h-4 mr-2" />{t("common.preview")} PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/dashboard/tools/crew-worksheets/${id}/print`, "_blank")} data-testid="button-print">
            <Printer className="w-4 h-4 mr-2" />{t("common.print")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.href = `/api/crew-worksheets/${id}/pdf`} data-testid="button-download-pdf">
            <Download className="w-4 h-4 mr-2" />{t("common.download")}
          </Button>
          {isAdminAndDraft && (
            <Button variant="outline" size="sm" disabled data-testid="button-finalize-coming-soon" title={t("crewWorksheets.finalizeComingSoonHelp", { defaultValue: "Finalize is coming soon." })}>
              <Lock className="w-4 h-4 mr-2" />
              {t("crewWorksheets.finalize")} · {t("common.comingSoon", { defaultValue: "Coming soon" })}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <HardHat className="w-5 h-5" />{t("crewWorksheets.details")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cw-title">{t("common.title")}</Label>
              <Input id="cw-title" value={title} onChange={(e) => setTitle(e.target.value)}
                onBlur={() => handleBlur("title", title)} disabled={isReadOnly} data-testid="input-title" />
            </div>
            <div>
              <Label htmlFor="cw-date">{t("crewWorksheets.worksheetDate")}</Label>
              <Input id="cw-date" type="date" value={worksheetDate} onChange={(e) => setWorksheetDate(e.target.value)}
                onBlur={() => handleBlur("worksheetDate", worksheetDate)} disabled={isReadOnly} data-testid="input-worksheet-date" />
            </div>
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-medium" data-testid="text-customer-name">{ws.customerName}</p>
            {ws.customerStreet && <p className="text-muted-foreground text-xs">{ws.customerStreet}{ws.customerCity ? `, ${ws.customerCity}` : ""}{ws.customerState ? `, ${ws.customerState}` : ""}</p>}
          </div>
          {ws.sourceProposalId ? (
            <div className="rounded-md border border-green-700/30 bg-green-50 dark:bg-green-950/30 p-3 text-sm flex items-start justify-between gap-3" data-testid="banner-source-proposal">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-green-800 dark:text-green-300 font-medium">
                  {t("crewWorksheets.sourceProposalBanner", { defaultValue: "Generated from Proposal" })}
                </p>
                <p className="font-medium truncate">
                  {ws.sourceProposalNumber}{ws.sourceProposalTitle ? ` — ${ws.sourceProposalTitle}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/tools/proposals/${ws.sourceProposalId}`)}
                data-testid="link-source-proposal">
                {t("common.view")}
              </Button>
            </div>
          ) : ws.sourceProposalDeleted ? (
            <div className="rounded-md border border-amber-700/30 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm" data-testid="banner-source-proposal-deleted">
              <p className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-300 font-medium">
                {t("crewWorksheets.sourceProposalBanner", { defaultValue: "Generated from Proposal" })}
              </p>
              <p className="font-medium">
                {t("crewWorksheets.sourceProposalDeleted", { defaultValue: "Generated from a proposal that has been deleted." })}
              </p>
              {(ws.sourceProposalNumber || ws.sourceProposalTitle) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {ws.sourceProposalNumber}{ws.sourceProposalTitle ? ` — ${ws.sourceProposalTitle}` : ""}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5" />{t("crewWorksheets.scheduling")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>{t("crewWorksheets.scheduledDate")}</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
              onBlur={() => handleBlur("scheduledDate", scheduledDate || null)} disabled={isReadOnly} data-testid="input-scheduled-date" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{t("crewWorksheets.startTime")}</Label>
            <Input type="time" value={scheduledStartTime} onChange={(e) => setScheduledStartTime(e.target.value)}
              onBlur={() => handleBlur("scheduledStartTime", scheduledStartTime || null)} disabled={isReadOnly} data-testid="input-start-time" />
          </div>
          <div>
            <Label>{t("crewWorksheets.crewLabel")}</Label>
            <Input value={crewLabel} onChange={(e) => setCrewLabel(e.target.value)} onBlur={() => handleBlur("crewLabel", crewLabel || null)}
              placeholder="Randy's Crew" disabled={isReadOnly} data-testid="input-crew-label" />
          </div>
          <div>
            <Label>{t("crewWorksheets.estimatedHours")}</Label>
            <Input value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} onBlur={() => handleBlur("estimatedHours", estimatedHours || null)}
              placeholder="3.5" disabled={isReadOnly} data-testid="input-estimated-hours" />
          </div>
          <div className="md:col-span-2">
            <Label>{t("crewWorksheets.crewLead", { defaultValue: "Crew Lead" })}</Label>
            <CrewLeadPicker
              value={ws.assignedCrewLeadId ?? null}
              valueName={ws.assignedCrewLeadName ?? null}
              disabled={isReadOnly}
              onChange={(userId) => saveMutation.mutate({ assignedCrewLeadId: userId })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("crewWorksheets.visualScope", { defaultValue: "Visual Scope / Site Map" })}</CardTitle>
        </CardHeader>
        <CardContent>
          <VisualScopePicker
            crewWorksheetId={id!}
            customerName={ws.customerName ?? ""}
            value={ws.visualScopeSheetId ?? null}
            attachedSheet={ws.visualScopeSheet ?? null}
            disabled={isReadOnly}
            onChange={(sheetId) => saveMutation.mutate({ visualScopeSheetId: sheetId })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t("crewWorksheets.scopeOfWork")}</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} onBlur={() => handleBlur("scopeOfWork", scopeOfWork)}
            placeholder={t("crewWorksheets.scopePlaceholder")} className="min-h-[200px] font-mono text-sm" disabled={isReadOnly} data-testid="textarea-scope" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t("crewWorksheets.equipment")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {equipment.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2 p-2 rounded-md border">
              <Checkbox checked={item.checked}
                onCheckedChange={(v) => persistEquipment(equipment.map((e, idx) => idx === i ? { ...e, checked: v === true } : e))}
                disabled={isReadOnly} data-testid={`checkbox-equipment-${item.id}`} />
              <Input value={item.label} onChange={(e) => setEquipment(equipment.map((eq, idx) => idx === i ? { ...eq, label: e.target.value } : eq))}
                onBlur={() => persistEquipment(equipment)} className="flex-1 border-0 shadow-none px-1 focus-visible:ring-0" disabled={isReadOnly}
                data-testid={`input-equipment-${item.id}`} />
              {!isReadOnly && (
                <>
                  <Button size="icon" variant="ghost" disabled={i === 0}
                    onClick={() => { const next = [...equipment]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; persistEquipment(next); }}
                    aria-label={t("common.moveUp", { defaultValue: "Move up" })}
                    data-testid={`button-move-equipment-up-${item.id}`}>
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={i === equipment.length - 1}
                    onClick={() => { const next = [...equipment]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; persistEquipment(next); }}
                    aria-label={t("common.moveDown", { defaultValue: "Move down" })}
                    data-testid={`button-move-equipment-down-${item.id}`}>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => persistEquipment(equipment.filter((_, idx) => idx !== i))} data-testid={`button-remove-equipment-${item.id}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {!isReadOnly && (
            <div className="flex gap-2">
              <Input placeholder={t("crewWorksheets.addEquipment")} value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEquipment(); } }}
                data-testid="input-new-equipment" />
              <Button onClick={addEquipment} variant="outline" data-testid="button-add-equipment">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t("crewWorksheets.materials")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {materials.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2 p-2 rounded-md border">
              <Checkbox checked={item.checked}
                onCheckedChange={(v) => persistMaterials(materials.map((m, idx) => idx === i ? { ...m, checked: v === true } : m))}
                disabled={isReadOnly} data-testid={`checkbox-material-${item.id}`} />
              <Input value={item.label} onChange={(e) => setMaterials(materials.map((m, idx) => idx === i ? { ...m, label: e.target.value } : m))}
                onBlur={() => persistMaterials(materials)} className="flex-1 border-0 shadow-none px-1 focus-visible:ring-0" disabled={isReadOnly}
                data-testid={`input-material-${item.id}`} />
              <Input value={item.quantity} placeholder={t("crewWorksheets.quantity")}
                onChange={(e) => setMaterials(materials.map((m, idx) => idx === i ? { ...m, quantity: e.target.value } : m))}
                onBlur={() => persistMaterials(materials)} className="w-32" disabled={isReadOnly}
                data-testid={`input-material-qty-${item.id}`} />
              {!isReadOnly && (
                <>
                  <Button size="icon" variant="ghost" disabled={i === 0}
                    onClick={() => { const next = [...materials]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; persistMaterials(next); }}
                    aria-label={t("common.moveUp", { defaultValue: "Move up" })}
                    data-testid={`button-move-material-up-${item.id}`}>
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={i === materials.length - 1}
                    onClick={() => { const next = [...materials]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; persistMaterials(next); }}
                    aria-label={t("common.moveDown", { defaultValue: "Move down" })}
                    data-testid={`button-move-material-down-${item.id}`}>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => persistMaterials(materials.filter((_, idx) => idx !== i))} data-testid={`button-remove-material-${item.id}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {!isReadOnly && (
            <div className="flex gap-2">
              <Input placeholder={t("crewWorksheets.addMaterial")} value={newMaterial}
                onChange={(e) => setNewMaterial(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMaterial(); } }}
                data-testid="input-new-material" />
              <Input placeholder={t("crewWorksheets.quantity")} value={newMaterialQty}
                onChange={(e) => setNewMaterialQty(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMaterial(); } }}
                className="w-32" data-testid="input-new-material-qty" />
              <Button onClick={addMaterial} variant="outline" data-testid="button-add-material">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t("crewWorksheets.crewNotes")}</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={crewNotes} onChange={(e) => setCrewNotes(e.target.value)} onBlur={() => handleBlur("crewNotes", crewNotes)}
            placeholder={t("crewWorksheets.crewNotesPlaceholder")} className="min-h-[100px]" disabled={isReadOnly} data-testid="textarea-crew-notes" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>{t("crewWorksheets.photos")} ({photos.length})</span>
            {!isReadOnly && (
              <div className="flex gap-2">
                {selectedPhotoIds.size > 0 && (
                  <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} data-testid="button-bulk-delete-photos">
                    <Trash2 className="w-4 h-4 mr-2" />{t("common.delete")} ({selectedPhotoIds.size})
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} disabled={uploading} data-testid="button-upload-photos">
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
                  {t("crewWorksheets.addPhotos")}
                </Button>
                <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} data-testid="input-photo-upload" />
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("crewWorksheets.noPhotos")}</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
              <SortableContext items={photos.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {photos.map(p => (
                    <PhotoRow key={p.id} photo={p} isReadOnly={isReadOnly}
                      selected={selectedPhotoIds.has(p.id)}
                      onSelect={(v) => setSelectedPhotoIds(prev => { const n = new Set(prev); if (v) n.add(p.id); else n.delete(p.id); return n; })}
                      onCaption={(caption) => captionMutation.mutate({ photoId: p.id, caption })}
                      onDelete={() => deletePhotoMutation.mutate(p.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {!isReadOnly && (
        <div className="flex justify-end pt-4 border-t">
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} data-testid="button-delete-worksheet">
            <Trash2 className="w-4 h-4 mr-2" />{t("crewWorksheets.deleteWorksheet")}
          </Button>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crewWorksheets.deleteWorksheet")}</DialogTitle>
            <DialogDescription>{t("crewWorksheets.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteWorksheetMutation.mutate()} disabled={deleteWorksheetMutation.isPending} data-testid="button-confirm-delete-worksheet">
              {deleteWorksheetMutation.isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crewWorksheets.deletePhotos")}</DialogTitle>
            <DialogDescription>{t("crewWorksheets.deletePhotosConfirm", { count: selectedPhotoIds.size })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => bulkDeleteMutation.mutate(Array.from(selectedPhotoIds))} disabled={bulkDeleteMutation.isPending} data-testid="button-confirm-bulk-delete">
              {bulkDeleteMutation.isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
