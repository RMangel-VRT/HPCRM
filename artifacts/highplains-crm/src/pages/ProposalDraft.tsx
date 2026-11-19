import { useState, useRef, useCallback, useEffect } from "react";
import { ProposalPlantExhibits, useProposalExhibits } from "@/components/ProposalPlantExhibits";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/DatePickerField";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  ArrowLeft,
  FileText,
  Trash2,
  Download,
  ImageIcon,
  Loader2,
  Eye,
  Lock,
  Info,
  History,
  CheckCircle2,
  Map as MapIcon,
  X,
  ExternalLink,
  Link2,
  Unlink,
  AlertTriangle,
  GripVertical,
  HardHat,
  Leaf,
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest as baseApiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { scopeOf } from "@/lib/estimateSettings";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { SENT_METHODS, conflictOf, type SentMethod, type EstimateDetailDto } from "@/lib/estimateBuilder";
import { advanceLinkedTicket, ticketRequest } from "@/lib/advanceLinkedTicket";
import { ProposalEstimateSection } from "@/components/estimates/ProposalEstimateSection";
import { EstimateWorkLocation } from "@/components/workLocation/EstimateWorkLocation";
import { ProposalDocSection, useCollapsedSections } from "@/components/proposals/ProposalDocSection";
import { formatCents } from "@/lib/hardscapeCatalog";
import { useProposalLinkedEstimate, linkedEstimateTotalCents } from "@/components/estimates/useProposalLinkedEstimate";
import { useToast } from "@/hooks/use-toast";
import type { ProposalWithDetails, ProposalFile, ProposalPlantItem, Ticket, VisualScopeSheetWithCustomer } from "@shared/schema";

/** Fields this page reads from proposal files; the schema row type is loose in the client build. */
interface DraftFile {
  id: string; fileType: string; filename: string; caption: string | null; storageObjectPath: string;
  displayOrder: number; fileSize: number | null;
}
import PlantLibrary, { type PlantPickerSelection } from "@/pages/PlantLibrary";

function formatDateTime(ts: string | Date) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return String(ts); }
}

// Upload registration already returns the authenticated /objects path.
// Prefix only historical bare object identities, never /objects a second time.
function proposalPhotoUrl(storagePath: string): string {
  return storagePath.startsWith("/objects/") ? storagePath : `/objects/${storagePath.replace(/^\//, "")}`;
}

interface SortablePhotoRowProps {
  img: ProposalFile;
  captionDraft: string | undefined;
  onCaptionChange: (val: string) => void;
  onCaptionBlur: (val: string) => void;
  onDelete: () => void;
  captionPlaceholder: string;
  dragLabel: string;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
  selectLabel: string;
  coverAction?: React.ReactNode;
}

function SortablePhotoRow({
  img,
  captionDraft,
  onCaptionChange,
  onCaptionBlur,
  onDelete,
  captionPlaceholder,
  dragLabel,
  selected,
  onSelectChange,
  selectLabel,
  coverAction,
}: SortablePhotoRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: img.id,
    disabled: selected,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-3 items-start p-3 rounded-md border bg-background"
      data-testid={`div-image-${img.id}`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(v) => onSelectChange(v === true)}
        aria-label={selectLabel}
        className="mt-1.5 shrink-0"
        data-testid={`checkbox-image-${img.id}`}
      />
      <button
        type="button"
        className="shrink-0 mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={dragLabel}
        title={dragLabel}
        data-testid={`button-drag-image-${img.id}`}
        disabled={selected}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-16 h-16 rounded-md overflow-hidden shrink-0 bg-muted flex items-center justify-center">
        <img
          src={proposalPhotoUrl(img.storageObjectPath)}
          alt={img.caption ?? img.filename}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
          data-testid={`img-thumbnail-${img.id}`}
        />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-xs text-muted-foreground truncate">{img.filename}</p>
        {coverAction}
        <Input
          placeholder={captionPlaceholder}
          value={captionDraft ?? img.caption ?? ""}
          onChange={(e) => onCaptionChange(e.target.value)}
          onBlur={(e) => onCaptionBlur(e.target.value)}
          className="text-sm"
          data-testid={`input-caption-${img.id}`}
        />
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onDelete}
        className="shrink-0"
        data-testid={`button-delete-image-${img.id}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function ProposalDraft() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  return <ProposalDraftContent key={`${scopeOf(user)}|${id}`} />;
}

function ProposalDraftContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const companyId = user?.activeCompanyId ?? "";
  const identity = scopeOf(user);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = useCallback(() => mounted.current, []);
  const apiRequest: typeof baseApiRequest = async (method, url, body, options) => {
    if (!active()) throw new Error("Scope changed");
    const res = await baseApiRequest(method, url, body, { ...options, headers: { ...options?.headers, ...companyHeaders(companyId) } });
    if (!active()) throw new Error("Scope changed");
    return res;
  };
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  const urlParams = new URLSearchParams(search);
  const urlTicketId = urlParams.get("ticketId") || null;
  const urlTicketTitle = urlParams.get("ticketTitle") || null;

  const [title, setTitle] = useState("");
  const [proposalDate, setProposalDate] = useState("");
  const [initialized, setInitialized] = useState(false);

  const [uploadingImages, setUploadingImages] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ProposalFile | null>(null);
  const [deleteProposalOpen, setDeleteProposalOpen] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [estimateSendMethod, setEstimateSendMethod] = useState<SentMethod | "">("");
  const [needPrice, setNeedPrice] = useState<{ id: string; name?: string }[]>([]);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeVersionId, setFinalizeVersionId] = useState<string | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const [plantPickerOpen, setPlantPickerOpen] = useState(false);

  const imgInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: proposal, isLoading } = useQuery<ProposalWithDetails>({
    queryKey: ["/api/proposals", id, identity],
    queryFn: async () => (await apiRequest("GET", `/api/proposals/${id}`)).json(),
    enabled: !!id && !!companyId && ["admin", "office"].includes(user?.accessRole ?? ""),
    staleTime: 0,
    refetchInterval: 30_000,
    select: (data: ProposalWithDetails) => {
      if (!initialized) {
        setTitle(data.title ?? "Proposal");
        setProposalDate(data.proposalDate ?? "");
        setInitialized(true);
        const drafts: Record<string, string> = {};
        (data.files as DraftFile[]).filter((f: DraftFile) => f.fileType === "image").forEach((f: DraftFile) => {
          drafts[f.id] = f.caption ?? "";
        });
        setCaptionDrafts(drafts);
      }
      return data;
    },
  });

  const linkedTicketId = proposal?.ticketId;
  // Created before estimates (P1): view, download, version history and delete only.
  const legacy = !!proposal && !proposal.estimateId;
  const collapse = useCollapsedSections(identity);
  const linkedEstimate = useProposalLinkedEstimate(proposal?.estimateId ? proposal : null, companyId);
  const liveWorkLocation = linkedEstimate.data?.display?.workLocation;
  const previewPath = `/api/proposals/${encodeURIComponent(id)}/pdf?inline=1`;
  const previewTab = useRef<Window | null>(null);
  const previewLocation = useRef(liveWorkLocation);
  useEffect(() => {
    const changed = previewLocation.current !== liveWorkLocation;
    previewLocation.current = liveWorkLocation;
    const tab = previewTab.current;
    if (!changed || liveWorkLocation === undefined || !tab || tab.closed) return;
    try {
      // Don't take over a tab the user has navigated away from.
      if (tab.location.href === new URL(previewPath, window.location.origin).href) tab.location.reload();
    } catch { /* The tab has navigated cross-origin. The next preview opens fresh. */ }
  }, [liveWorkLocation, previewPath]);
  const exhibits = useProposalExhibits(
    { id: proposal?.id ?? id, estimateId: proposal?.estimateId ?? "", estimate: proposal?.estimate ?? null },
    companyId, identity, !!proposal?.estimateId);
  const { data: linkedTicket } = useQuery<Ticket>({
    queryKey: ["/api/tickets", linkedTicketId],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${linkedTicketId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ticket not found");
      const data = await res.json();
      return data.ticket ?? data;
    },
    enabled: !!linkedTicketId,
  });

  useEffect(() => {
    const proposalTitle = proposal?.title;
    if (!proposalTitle) return;
    document.title = `${proposalTitle} | High Plains Property Maintenance`;
    return () => {
      document.title = "High Plains Property Maintenance";
    };
  }, [proposal?.title]);

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string | boolean | null>) => {
      return apiRequest("PATCH", `/api/proposals/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      if (linkedTicketId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tickets", linkedTicketId, "proposals"] });
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      toast({ title: t("common.error"), description: t("common.saving"), variant: "destructive" });
    },
  });

  const coverMutation = useMutation({
    mutationFn: (updates: Record<string, string | null>) => apiRequest("PATCH", `/api/proposals/${id}`, updates),
    onSuccess: () => {
      if (!active()) return;
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: () => {
      if (active()) toast({ title: t("common.error"), description: t("proposals.coverSaveError"), variant: "destructive" });
    },
  });

  const handleBlur = useCallback((field: string, value: string) => {
    if (!proposal) return;
    const current = proposal[field as keyof ProposalWithDetails] as string | null ?? "";
    if (value !== current) {
      saveMutation.mutate({ [field]: value });
    }
  }, [proposal, saveMutation]);

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("DELETE", `/api/proposals/${id}/files/${fileId}`);
    },
    onSuccess: (_data, fileId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      setFileToDelete(null);
      setSelectedImageIds((prev) => {
        if (!prev.has(fileId)) return prev;
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
      toast({ title: t("common.delete") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const bulkDeleteFilesMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      const res = await apiRequest("POST", `/api/proposals/${id}/files/bulk-delete`, { fileIds });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Bulk delete failed");
      }
      return res.json() as Promise<{ deletedCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      setSelectedImageIds(new Set());
      setBulkDeleteOpen(false);
      toast({ title: t("proposals.photosDeleted", { count: data.deletedCount }) });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const saveCaptionMutation = useMutation({
    mutationFn: async ({ fileId, caption }: { fileId: string; caption: string }) => {
      return apiRequest("PATCH", `/api/proposals/${id}/files/${fileId}`, { caption: caption || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: () => {
      toast({ title: t("proposals.captionSaveFailed"), variant: "destructive" });
    },
  });

  const sortableSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handlePhotoDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (selectedImageIds.has(String(active.id))) return;
    const oldIndex = images.findIndex(i => i.id === active.id);
    const newIndex = images.findIndex(i => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(images, oldIndex, newIndex);
    queryClient.setQueryData<ProposalWithDetails | undefined>(["/api/proposals", id], (old: ProposalWithDetails | undefined) => {
      if (!old) return old;
      const reorderedIds = new Map(newOrder.map((f, idx) => [f.id, idx] as const));
      const updatedFiles = (old.files as DraftFile[]).map((f: DraftFile) => {
        const newIdx = reorderedIds.get(f.id);
        return newIdx === undefined ? f : { ...f, displayOrder: newIdx };
      });
      return { ...old, files: updatedFiles };
    });
    reorderImagesMutation.mutate(newOrder.map(f => f.id));
  };

  const reorderImagesMutation = useMutation({
    mutationFn: async (orderedFileIds: string[]) => {
      const res = await apiRequest("POST", `/api/proposals/${id}/files/reorder`, { orderedFileIds });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to reorder photos");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const addPlantItemsMutation = useMutation({
    mutationFn: async (items: PlantPickerSelection[]) => {
      const payload = items.map((item, i) => ({
        plantCatalogItemId: item.plantCatalogItemId,
        quantity: item.quantity,
        displayOrder: (proposal?.plantItems?.length ?? 0) + i,
      }));
      const res = await apiRequest("POST", `/api/proposals/${id}/plant-items`, payload);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      setPlantPickerOpen(false);
      toast({ title: "Plants added to proposal" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add plants", description: err.message, variant: "destructive" });
    },
  });

  const deletePlantItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("DELETE", `/api/proposals/${id}/plant-items/${itemId}`);
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const updatePlantItemMutation = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: Partial<ProposalPlantItem> }) => {
      const res = await apiRequest("PATCH", `/api/proposals/${id}/plant-items/${itemId}`, updates);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const reorderPlantItemsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", `/api/proposals/${id}/plant-items/reorder`, { ids });
      if (!res.ok) throw new Error(await res.text());
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
  });

  function movePlantItem(items: ProposalPlantItem[], fromIdx: number, toIdx: number) {
    const sorted = [...items].sort((a, b) => a.displayOrder - b.displayOrder);
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(toIdx, 0, moved);
    const ids = sorted.map(i => i.id);
    queryClient.setQueryData<ProposalWithDetails | undefined>(["/api/proposals", id], (old: ProposalWithDetails | undefined) => {
      if (!old) return old;
      const updated = sorted.map((item, idx) => ({ ...item, displayOrder: idx }));
      return { ...old, plantItems: updated };
    });
    reorderPlantItemsMutation.mutate(ids);
  }

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/proposals/${id}/finalize`, {
        ...(estimateSendMethod ? { estimateSendMethod } : {}),
        ...(needPrice.length ? { confirmZeroPriced: true } : {}),
        ...(finalizeVersionId ? { expectedEstimateVersionId: finalizeVersionId } : {}),
      });
      return res.json();
    },
    onSuccess: async (version) => {
      if (!active()) return;
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      setFinalizeDialogOpen(false);
      setNeedPrice([]); setEstimateSendMethod(""); setFinalizeError(null);
      toast({ title: t("proposals.finalized", { version: version.versionNumber }), description: t("proposals.finalizedMsg") });
      // Proposal success is independent of forward-only ticket orchestration.
      if (version.estimateTransition?.sent) {
        try {
          const request = ticketRequest(companyId, active);
          const estimate = await request("GET", `/api/estimates/${version.estimateTransition.estimateId}`) as EstimateDetailDto;
          const advance = await advanceLinkedTicket(estimate, request);
          if (active() && advance.message) toast({ title: t("tickets.unexpectedError"), description: advance.message, variant: "destructive" });
        } catch { /* State-derived recovery is mounted in the Estimate section. */ }
      }
      if (active()) {
        queryClient.invalidateQueries({ queryKey: ["estimate-ticket-recovery"] });
        queryClient.invalidateQueries({ predicate: q => q.queryKey.some(k => typeof k === "string" && /estimate/i.test(k)) });
        queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      }
    },
    onError: async (err: Error) => {
      if (!active()) return;
      const conflict = conflictOf(err);
      if (conflict?.error === "LINES_NEED_PRICE") {
        const ids = conflict.lineIds ?? [];
        try {
          const detail = await (await apiRequest("GET", `/api/estimates/${proposal!.estimateId}`)).json() as EstimateDetailDto;
          if (!active()) return;
          if (finalizeVersionId && detail.version.id !== finalizeVersionId) {
            setNeedPrice([]); setFinalizeError(t("proposalEstimate.finalizeError")); return;
          }
          const lines = detail.version.sections.flatMap(s => s.lines);
          setNeedPrice(ids.map(id => ({ id, name: lines.find(l => l.id === id)?.name })));
        } catch { if (active()) setNeedPrice(ids.map(id => ({ id }))); }
        return;
      }
      let code = conflict?.error;
      try { code = JSON.parse(err.message.replace(/^\d{3}: /, "")).error ?? code; } catch { /* legacy text error */ }
      setFinalizeError(t(code === "PROPOSAL_FINALIZE_FAILED" ? "proposalEstimate.partialFailure"
        : code === "ESTIMATE_VOID" ? "proposalEstimate.voidError"
        : code === "ESTIMATE_SEND_METHOD_REQUIRED" ? "proposalEstimate.methodRequired"
        : proposal?.estimateId ? "proposalEstimate.finalizeError" : "proposals.finalizeFailed"));
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      queryClient.invalidateQueries({ predicate: q => q.queryKey.some(k => typeof k === "string" && /estimate/i.test(k)) });
    },
  });

  const uploadFile = async (file: File, fileType: "image") => {
    const urlRes = await apiRequest("POST", `/api/proposals/${id}/files/upload-url`, {
      fileType,
      mimeType: file.type,
      fileSize: file.size,
    });

    if (!urlRes.ok) {
      const err = await urlRes.text();
      throw new Error(err || "Failed to get upload URL");
    }

    const { uploadUrl, storagePath } = await urlRes.json();

    await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    const finalizeRes = await apiRequest("POST", `/api/proposals/${id}/files`, {
      fileType,
      storagePath,
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      caption: null,
    });

    if (!finalizeRes.ok) {
      const err = await finalizeRes.text();
      throw new Error(err || "Failed to save file");
    }

    return finalizeRes.json();
  };

  const compressImageBeforeUpload = async (file: File): Promise<File> => {
    try {
      const bitmap = await createImageBitmap(file);
      const MAX_DIM = 1200;
      const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
          "image/jpeg",
          0.72,
        );
      });
      const baseName = file.name.replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    } catch {
      // If compression fails for any reason, fall back to the original file
      return file;
    }
  };

  const convertIfHeic = async (file: File): Promise<File> => {
    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif");
    if (!isHeic) return file;
    const response = await fetch("/api/convert-heic", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Conversion failed" }));
      throw new Error(err.error ?? "HEIC conversion failed");
    }
    const jpegBlob = await response.blob();
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([jpegBlob], newName, { type: "image/jpeg" });
  };

  const isImageFile = (f: File) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name);
  /** Shared by the drop zone and the file picker: HEIC conversion, compression, upload, refresh and toast. */
  const uploadImages = async (rawFiles: File[]) => {
    if (!rawFiles.length || legacy || uploadingRef.current) return;
    uploadingRef.current = true;
    setUploadingImages(true);
    const hasHeic = rawFiles.some(f =>
      f.type === "image/heic" || f.type === "image/heif" ||
      f.name.toLowerCase().endsWith(".heic") || f.name.toLowerCase().endsWith(".heif")
    );
    if (hasHeic) {
      toast({ title: t("proposals.convertingHeic") });
    }
    try {
      const heicConverted = await Promise.all(rawFiles.map(convertIfHeic));
      const files = await Promise.all(heicConverted.map(compressImageBeforeUpload));
      for (const file of files) {
        await uploadFile(file, "image");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      toast({ title: t("proposalP3.imagesUploaded", { count: files.length }) });
    } catch (err: any) {
      toast({ title: t("proposals.imageUploadFailed"), description: err.message, variant: "destructive" });
    } finally {
      uploadingRef.current = false;
      setUploadingImages(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  };
  /** Refuses non-images with a toast, uploads the rest through the shared path. */
  const acceptPhotoFiles = (all: File[]) => {
    const images = all.filter(isImageFile);
    if (images.length < all.length) {
      toast({ title: t("proposalP3.notImageTitle"), description: t("proposalP3.notImageBody", { count: all.length - images.length }), variant: "destructive" });
    }
    void uploadImages(images);
  };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => acceptPhotoFiles(Array.from(e.target.files ?? []));
  /** Only native file drags (dataTransfer carries "Files"); dnd-kit pointer reorders never reach here. */
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const { data: vsSheets } = useQuery<VisualScopeSheetWithCustomer[]>({
    queryKey: ["/api/customers", proposal?.customerId, "visual-scope-sheets"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${proposal!.customerId}/visual-scope-sheets`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!proposal?.customerId,
  });


  const allFiles: DraftFile[] = proposal?.files ?? [];
  const byOrder = (a: DraftFile, b: DraftFile) => a.displayOrder - b.displayOrder;
  const estimatePdfs = allFiles.filter(f => f.fileType === "estimate_pdf").sort(byOrder);
  const images = allFiles.filter(f => f.fileType === "image").sort(byOrder);
  const versions = proposal?.versions ?? [];
  const hasVersions = versions.length > 0;
  const nextVersionNumber = hasVersions ? (versions[versions.length - 1].versionNumber + 1) : 1;

  const estimateBytes = estimatePdfs.reduce((s, f) => s + (f.fileSize ?? 0), 0);
  const imagesBytes = images.reduce((s, f) => s + (f.fileSize ?? 0), 0);
  const estimatedPdfMB = (estimateBytes + imagesBytes / 25) / 1024 / 1024;
  const showSizeWarning = !proposal?.estimateId && estimatePdfs.length > 0 && estimatedPdfMB > 20;

  const getStatusBadge = (status: string | null | undefined) => {
    if (status === "finalized") {
      return <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-500/50" data-testid="badge-draft-status">{t("statuses.finalized")}</Badge>;
    }
    if (status === "published") {
      return <Badge data-testid="badge-draft-status">{t("statuses.published")}</Badge>;
    }
    return <Badge variant="secondary" data-testid="badge-draft-status">{t("statuses.draft")}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-[1480px] mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="p-6 max-w-[1480px] mx-auto">
        <p className="text-muted-foreground">{t("proposals.proposalNotFound")}</p>
      </div>
    );
  }

  const finalizeButton = legacy ? null : (
    <Button
      size="sm"
      variant="default"
      className="w-full"
      onClick={() => { setFinalizeVersionId(proposal.estimate?.currentVersion?.id ?? null); setEstimateSendMethod(""); setNeedPrice([]); setFinalizeError(null); setFinalizeDialogOpen(true); }}
      disabled={finalizeMutation.isPending}
      data-testid="button-finalize-proposal"
    >
      {finalizeMutation.isPending ? (
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("proposals.finalizing")}</>
      ) : (
        <><Lock className="w-4 h-4 mr-2" />{t("proposals.finalizeProposal")}</>
      )}
    </Button>
  );

  const generateCrewWorksheetButton = legacy ? null : (
    <Button
      size="sm"
      variant="outline"
      className="w-full"
      onClick={async () => {
        try {
          const res = await apiRequest("POST", `/api/proposals/${id}/crew-worksheets`, {});
          if (!res.ok) throw new Error(await res.text());
          const ws = await res.json();
          queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets"] });
          if (ws?.customerId) {
            queryClient.invalidateQueries({ queryKey: ["/api/customers", ws.customerId, "crew-worksheets"] });
          }
          if (ws?.ticketId) {
            queryClient.invalidateQueries({ queryKey: ["/api/tickets", ws.ticketId, "crew-worksheets"] });
          }
          toast({ title: t("crewWorksheets.generatedFromProposal") });
          navigate(`/dashboard/tools/crew-worksheets/${ws.id}`);
        } catch (err: any) {
          toast({ title: t("crewWorksheets.generateFailed"), description: err.message, variant: "destructive" });
        }
      }}
      data-testid="button-generate-crew-worksheet"
    >
      <HardHat className="w-4 h-4 mr-2" />
      {t("crewWorksheets.generateFromProposal")}
    </Button>
  );

  const coverSource = proposal.coverSource ?? "none";
  const coverLabel = t(coverSource === "photo" ? "proposalP3.cover.photo" : coverSource === "visual_scope" ? "proposalP3.cover.visual" : "proposalP3.cover.logo");
  const scheduleOn = proposal.includePlantSchedule !== false;
  const paletteOn = proposal.includePlantPalette !== false;
  const exData = exhibits.data;
  const scheduleAvail = !!exData?.schedule.length;
  const paletteAvail = !!exData?.palette.groups.some(g => g.cards.length);
  const plantParts = [scheduleOn && t("proposalP3.plants.schedule"), paletteOn && t("proposalP3.plants.palette")].filter(Boolean) as string[];
  const plantsValue = legacy ? t("proposalP3.notIncluded")
    : !plantParts.length ? t("proposalP3.notIncluded")
    : exData && !((scheduleOn && scheduleAvail) || (paletteOn && paletteAvail)) ? t("proposalP3.plants.noneOnEstimate")
    : plantParts.join(" + ");
  const plantsOk = !legacy && plantParts.length > 0 && (!exData || (scheduleOn && scheduleAvail) || (paletteOn && paletteAvail));
  const photoLayoutLabel = t((proposal.photoLayout ?? "large") === "grid" ? "proposalP3.layout.grid" : "proposalP3.layout.full");
  const photosValue = images.length ? t("proposalP3.photosValue", { count: images.length, layout: photoLayoutLabel }) : t("proposalP3.none");
  const estimateNumber = proposal.estimate?.number ?? proposal.estimateNumber ?? null;
  const totalCents = linkedEstimateTotalCents(linkedEstimate.data) ?? proposal.estimate?.subtotalCents ?? null;
  const estimateScope = linkedEstimate.data?.version.scopeOfWork?.trim() ?? "";
  const scopeRow = legacy
    ? { ok: !!proposal.scopeOfWork?.trim(), value: t(proposal.scopeOfWork?.trim() ? "proposalP3.scopeOnProposal" : "proposalP3.none") }
    : linkedEstimate.data
      ? { ok: !!estimateScope, value: t(estimateScope ? "proposalP3.scopeFromEstimate" : "proposalP3.scopeMissing") }
      : { ok: false, value: t(linkedEstimate.isError ? "proposalP3.scopeUnavailable" : "proposalP3.checking") };
  const checklist = [
    { key: "estimate", label: t("proposalP3.check.estimate"), ok: !!proposal.estimateId, value: proposal.estimateId ? estimateNumber ?? "" : t("proposalP3.none") },
    ...(!legacy ? [{ key: "work-location", label: t("workLocation.title"), ok: !!liveWorkLocation,
      value: liveWorkLocation || "—" }] : []),
    { key: "total", label: t("proposalP3.check.total"), ok: totalCents != null, value: totalCents != null ? formatCents(totalCents, i18n.language) : "—" },
    { key: "scope", label: t("proposalP3.check.scope"), ...scopeRow },
    { key: "cover", label: t("proposalP3.check.cover"), ok: coverSource !== "none", value: coverLabel },
    { key: "plants", label: t("proposalP3.check.plants"), ok: plantsOk, value: plantsValue },
    { key: "visual", label: t("proposalP3.check.visual"), ok: !!proposal.visualScopeSheetId, value: t(proposal.visualScopeSheetId ? "proposalP3.attached" : "proposalP3.none") },
    { key: "photos", label: t("proposalP3.check.photos"), ok: images.length > 0, value: photosValue },
  ];
  const coverSummary = coverLabel;
  const visualSummary = proposal.visualScopeSheet?.title ?? t(proposal.visualScopeSheetId ? "proposalP3.attached" : "proposalP3.none");
  const estimateSummary = legacy ? t("proposalP3.legacySummary") : estimateNumber ? t("proposalP3.estimateSummary", { number: estimateNumber }) : null;
  const plantsSummary = legacy ? t("proposalP3.notIncluded") : t("proposalP3.plantsSummary", { value: plantsValue });
  const photosSummary = t("proposalP3.photosSummary", { count: images.length });

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 p-4 sm:p-6" data-testid="page-proposal-draft">
      <header className="space-y-2" data-testid="proposal-header">
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2 flex-wrap">
          <Link href="/dashboard/tools/proposals">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors" data-testid="link-back-to-proposals">
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("proposals.title")}
            </button>
          </Link>
          {(() => {
            const backId = urlTicketId || linkedTicketId;
            const backTitle = urlTicketTitle || linkedTicket?.title;
            if (!backId || !backTitle) return null;
            return (
              <>
                <span className="text-muted-foreground/40">|</span>
                <Link href={`/dashboard/tickets/${backId}`}>
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" data-testid="link-back-to-ticket">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {backTitle}
                  </button>
                </Link>
              </>
            );
          })()}
        </div>
        {showSizeWarning && (
          <div className="flex items-start gap-2 mb-3 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300" data-testid="banner-size-warning">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {t("proposals.pdfSizeWarning")} ({(estimateBytes / 1024 / 1024).toFixed(1)} MB)
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="row-proposal-header">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-proposal-title">{proposal.title}</h1>
            {proposal.proposalNumber && (
              <span className="text-sm font-mono text-muted-foreground" data-testid="text-proposal-number">{proposal.proposalNumber}</span>
            )}
            {getStatusBadge(proposal.status)}
            <span className="text-sm text-muted-foreground">
              <span className="sr-only">{t("common.customer")}: </span>
              <Link href={`/dashboard/customers/${proposal.customerId}`}>
                <span className="text-foreground hover:underline cursor-pointer" data-testid="link-customer-name">{proposal.customerName}</span>
              </Link>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("proposalP3.headerActions")} data-testid="bar-proposal-header-actions">
          {proposal.estimateId || estimatePdfs.length > 0 ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={coverMutation.isPending}
                onClick={() => {
                  const tab = window.open(previewPath, "_blank");
                  if (tab) tab.opener = null;
                  previewTab.current = tab;
                }}
                data-testid="button-preview-pdf"
              >
                <Eye className="w-4 h-4 mr-2" />
                {t("proposals.previewPdf")}
              </Button>
              <a href={`/api/proposals/${id}/pdf`} download data-testid="button-download-pdf">
                <Button size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  {t("proposals.downloadPdf")}
                </Button>
              </a>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled data-testid="button-preview-pdf">
                    <Eye className="w-4 h-4 mr-2" />{t("proposals.previewPdf")}
                  </Button>
                  <Button size="sm" variant="outline" disabled data-testid="button-download-pdf">
                    <Download className="w-4 h-4 mr-2" />{t("proposals.downloadPdf")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t("proposalP1.legacyBanner")}
              </TooltipContent>
            </Tooltip>
          )}
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteProposalOpen(true)}
              data-testid="button-delete-proposal"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t("proposals.deleteProposal")}
            </Button>
          </div>
        </div>
        {legacy && (
          <div role="note" className="flex items-start gap-2 mt-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" data-testid="banner-legacy-proposal">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t("proposalP1.legacyBanner")}</span>
          </div>
        )}
        {legacy && estimatePdfs.length > 0 && (
          <section className="mt-3 rounded-md border px-3 py-2.5" aria-labelledby="legacy-estimate-files-title" data-testid="legacy-estimate-files">
            <h2 id="legacy-estimate-files-title" className="text-sm font-medium">{t("proposalP1.retainedEstimateFiles")}</h2>
            <ul className="mt-2 space-y-2">
              {estimatePdfs.map(file => (
                <li key={file.id}>
                  <a href={proposalPhotoUrl(file.storageObjectPath)} download={file.filename}
                    aria-label={t("proposalP1.downloadRetainedFile", { name: file.filename })}
                    className="inline-flex max-w-full items-center gap-2 text-sm text-primary underline underline-offset-2"
                    data-testid={`link-retained-estimate-${file.id}`}>
                    <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-all">{file.filename}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </header>

      {linkedTicket && (
        <div
          className="flex items-center gap-3 p-3 rounded-md border bg-muted/40 flex-wrap"
          data-testid="div-linked-ticket-banner"
        >
          <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("proposals.linkedToTicket")}</p>
            <p className="text-sm font-medium truncate">{linkedTicket.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/dashboard/tickets/${linkedTicket.id}`)}
              data-testid="button-view-linked-ticket"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              {t("proposals.viewTicket")}
            </Button>
            {!legacy && <Button
              size="sm"
              variant="ghost"
              onClick={() => saveMutation.mutate({ ticketId: null })}
              disabled={saveMutation.isPending}
              data-testid="button-unlink-ticket"
            >
              <Unlink className="w-3.5 h-3.5 mr-1.5" />
              {t("proposals.unlink")}
            </Button>}
          </div>
        </div>
      )}

      <fieldset disabled={legacy} className="min-w-0" data-testid="fieldset-proposal-title-row">
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_220px] ${legacy ? "" : "xl:grid-cols-[minmax(0,1fr)_175px_minmax(0,1fr)]"}`} data-testid="row-title-date">
          <div className="space-y-1.5">
            <Label htmlFor="field-title">{t("common.title")}</Label>
            <Input
              id="field-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => handleBlur("title", e.target.value)}
              data-testid="input-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("proposals.proposalDate")}</Label>
            <DatePickerField
              value={proposalDate ? new Date(proposalDate + 'T00:00:00') : undefined}
              onChange={(date) => {
                const str = date ? format(date, 'yyyy-MM-dd') : '';
                setProposalDate(str);
                handleBlur("proposalDate", str);
              }}
              data-testid="input-proposal-date"
            />
          </div>
          {!legacy && (
            <div className="min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1" data-testid="proposal-work-location">
              <p className="text-sm font-medium">{t("workLocation.title")}</p>
              {linkedEstimate.data ? <EstimateWorkLocation key={linkedEstimate.data.id} estimate={linkedEstimate.data}
                companyId={companyId} canEdit={["admin", "office"].includes(user?.accessRole ?? "")} showOwner />
                : <p className="text-sm text-muted-foreground">{t(linkedEstimate.isError ? "proposalEstimate.error" : "common.loading")}</p>}
            </div>
          )}
        </div>
      </fieldset>
      {hasVersions && (
        <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 px-4 py-3" data-testid="div-version-banner">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {t("proposals.draftEditsNote")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="layout-proposal-columns">
        <div className="min-w-0 space-y-4" data-testid="column-document">
          <fieldset disabled={legacy} aria-disabled={legacy} className="min-w-0 space-y-4" data-testid="fieldset-proposal-content">
          <div className="grid gap-4 xl:grid-cols-2" data-testid="row-cover-visual">
          <ProposalDocSection n={1} sectionKey="cover" title={t("proposalP3.sections.cover")} summary={coverSummary}
            collapsed={!!collapse.collapsed["cover"]} onToggle={() => collapse.toggle("cover")}>
      {proposal.estimateId ? <div className="space-y-3" data-testid="proposal-cover-controls">
          <p className="text-sm text-muted-foreground">{t("proposals.coverHelp")}</p>
          <div role="group" aria-label={t("proposals.coverTitle")} className="flex flex-wrap gap-2">
            {(["none", "visual_scope", "photo"] as const).map(source => (
              <Button key={source} variant={(proposal.coverSource ?? "none") === source ? "default" : "outline"}
                disabled={coverMutation.isPending || (source === "visual_scope" && !proposal.visualScopeSheetId) || (source === "photo" && !images.length)}
                aria-pressed={(proposal.coverSource ?? "none") === source}
                onClick={() => coverMutation.mutate({ coverSource: source, coverPhotoFileId: source === "photo" ? proposal.coverPhotoFileId ?? images[0]?.id : null })}>
                {t(source === "none" ? "proposals.coverNone" : source === "photo" ? "proposals.coverPhoto" : "proposals.coverVisualScope")}
              </Button>
            ))}
          </div>
          {proposal.coverSource === "photo" && <div role="group" aria-label={t("proposals.coverChoosePhoto")} className="flex flex-wrap gap-3">
            {images.map(img => <button key={img.id} type="button" className="rounded border p-1"
              disabled={coverMutation.isPending} aria-label={t("proposals.coverSelectPhoto", { name: img.caption || img.filename })}
              aria-pressed={proposal.coverPhotoFileId === img.id}
              onClick={() => coverMutation.mutate({ coverSource: "photo", coverPhotoFileId: img.id })}>
              <img className="h-24 w-28 object-cover" src={proposalPhotoUrl(img.storageObjectPath)} alt={img.caption || img.filename} />
              {proposal.coverPhotoFileId === img.id && <span className="block text-xs">{t("proposals.coverSelected")}</span>}
            </button>)}
          </div>}
      </div> : <p className="text-sm text-muted-foreground" data-testid="text-cover-legacy">{t("proposalP3.coverLegacy")}</p>}
          </ProposalDocSection>
          <ProposalDocSection n={2} sectionKey="visual" title={t("proposalP3.sections.visual")} summary={visualSummary}
            collapsed={!!collapse.collapsed["visual"]} onToggle={() => collapse.toggle("visual")}>
      <Card className="border-0 shadow-none">
        <CardHeader className="p-0 pb-3">
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {proposal.visualScopeSheetId && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="vs-include-base"
                    checked={proposal.vsIncludeBase ?? false}
                    onCheckedChange={(v) => saveMutation.mutate({ vsIncludeBase: v === true } as any)}
                    data-testid="checkbox-vs-include-base"
                  />
                  <Label htmlFor="vs-include-base" className="text-sm cursor-pointer">{t("proposalVersion.downloadBase")}</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="vs-include-overlay"
                    checked={proposal.vsIncludeOverlay ?? false}
                    onCheckedChange={(v) => saveMutation.mutate({ vsIncludeOverlay: v === true } as any)}
                    data-testid="checkbox-vs-include-overlay"
                  />
                  <Label htmlFor="vs-include-overlay" className="text-sm cursor-pointer">{t("proposalVersion.downloadOverlay")}</Label>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {proposal.visualScopeSheetId && proposal.visualScopeSheet ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid="div-vs-attached">
              <div className="flex items-center gap-3 min-w-0">
                <MapIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" data-testid="text-vs-sheet-title">
                    {proposal.visualScopeSheet.title}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="text-vs-sheet-date">
                    {proposal.visualScopeSheet.scopeDate} · {proposal.visualScopeSheet.customerName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/dashboard/tools/visual-scope/${proposal.visualScopeSheetId}/draft`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" data-testid="button-open-vs-draft">
                    <ExternalLink className="w-3 h-3 mr-1" /> {t("tools.openTool")}
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveMutation.mutate({ visualScopeSheetId: null, vsIncludeBase: false, vsIncludeOverlay: false } as any)}
                  data-testid="button-remove-vs"
                >
                  <X className="w-3 h-3 mr-1" /> {t("common.remove")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {!vsSheets || vsSheets.length === 0 ? (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{t("visualScope.noSheets")}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {vsSheets.map(sheet => {
                    const hasImage = !!sheet.baseImagePath;
                    return (
                      <div
                        key={sheet.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-md border ${hasImage ? "hover-elevate cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                        onClick={() => {
                          if (!hasImage) return;
                          saveMutation.mutate({ visualScopeSheetId: sheet.id } as any);
                        }}
                        data-testid={`row-vs-sheet-${sheet.id}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{sheet.title}</p>
                          <p className="text-xs text-muted-foreground">{sheet.scopeDate}</p>
                        </div>
                        {!hasImage ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="shrink-0 text-xs">{t("visualScope.captureBaseImage")}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>{t("visualScope.captureBaseImage")}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Badge variant="outline" className="shrink-0 text-xs">{t("common.select")}</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

          </ProposalDocSection>
          </div>
          </fieldset>
          <ProposalDocSection n={3} sectionKey="estimate" title={t("proposalP3.sections.estimate")} summary={estimateSummary}
            collapsed={!!collapse.collapsed["estimate"]} onToggle={() => collapse.toggle("estimate")}>
      <ProposalEstimateSection hideHeading proposal={proposal} companyId={companyId} active={active} onLinked={() => {
        queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
        queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      }} />
          {legacy && (
            <div className="space-y-1.5" data-testid="section-legacy-scope">
              <Label>{t("proposals.scopeOfWork")}</Label>
              {proposal.scopeOfWork?.trim()
                ? <p className="whitespace-pre-line rounded-md border bg-muted/30 p-3 text-sm leading-relaxed" data-testid="text-legacy-scope">{proposal.scopeOfWork}</p>
                : <p className="text-sm text-muted-foreground" data-testid="text-legacy-scope-empty">{t("proposalP2.legacyEmpty")}</p>}
            </div>
          )}
          </ProposalDocSection>
          <fieldset disabled={legacy} aria-disabled={legacy} className="min-w-0 space-y-4" data-testid="fieldset-proposal-content-2">
          <ProposalDocSection n={4} sectionKey="plants" title={t("proposalP3.sections.plants")} summary={plantsSummary}
            collapsed={!!collapse.collapsed["plants"]} onToggle={() => collapse.toggle("plants")}>
      {proposal.estimateId ? <ProposalPlantExhibits key={`${identity}:${proposal.estimateId}`} proposal={proposal} companyId={companyId!} identity={identity} /> : <>
      {proposal.plantPaletteId && <Card data-testid="div-palette-attached">
        <CardContent className="pt-6 space-y-3">
          <p>{t("paletteRetirement.legacyNote")}</p>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Leaf className="w-4 h-4" /> Plant Schedule
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPlantPickerOpen(true)}
              data-testid="button-open-plant-picker"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Browse Plant Library
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(!proposal.plantItems || proposal.plantItems.length === 0) ? (
            <p className="text-sm text-muted-foreground">
              No plants added yet. Click "Browse Plant Library" to add plants to this proposal.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {[...proposal.plantItems].sort((a, b) => a.displayOrder - b.displayOrder).map((item, idx, arr) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-md border bg-background"
                  data-testid={`div-plant-item-${item.id}`}
                >
                  {item.imageUrlSnapshot && (
                    <img
                      src={item.imageUrlSnapshot}
                      alt={item.nameSnapshot}
                      className="w-12 h-12 object-cover rounded flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" data-testid={`text-plant-name-${item.id}`}>{item.nameSnapshot}</p>
                    {item.botanicalSnapshot && (
                      <p className="text-xs text-muted-foreground italic">{item.botanicalSnapshot}</p>
                    )}
                    {item.sizeSnapshot && (
                      <p className="text-xs text-muted-foreground">{item.sizeSnapshot}</p>
                    )}
                    {item.wholesaleCostSnapshot && (
                      <p className="text-xs text-muted-foreground">
                        Wholesale: ${parseFloat(item.wholesaleCostSnapshot).toFixed(2)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <label className="text-xs text-muted-foreground">Qty:</label>
                      <input
                        type="number"
                        min={1}
                        defaultValue={item.quantity}
                        className="w-16 text-sm border rounded px-1.5 py-0.5"
                        onBlur={(e) => {
                          const qty = Math.max(1, parseInt(e.target.value) || 1);
                          if (qty !== item.quantity) {
                            updatePlantItemMutation.mutate({ itemId: item.id, updates: { quantity: qty } });
                          }
                        }}
                        data-testid={`input-plant-qty-${item.id}`}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <label className="text-xs text-muted-foreground shrink-0">Notes:</label>
                      <input
                        type="text"
                        defaultValue={item.notes ?? ""}
                        placeholder="Internal notes…"
                        className="flex-1 text-xs border rounded px-1.5 py-0.5 min-w-0"
                        onBlur={(e) => {
                          const notes = e.target.value.trim() || null;
                          if (notes !== (item.notes ?? null)) {
                            updatePlantItemMutation.mutate({ itemId: item.id, updates: { notes } });
                          }
                        }}
                        data-testid={`input-plant-notes-${item.id}`}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={idx === 0}
                      onClick={() => movePlantItem(proposal.plantItems!, idx, idx - 1)}
                      data-testid={`button-plant-move-up-${item.id}`}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={idx === arr.length - 1}
                      onClick={() => movePlantItem(proposal.plantItems!, idx, idx + 1)}
                      data-testid={`button-plant-move-down-${item.id}`}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deletePlantItemMutation.mutate(item.id)}
                      disabled={deletePlantItemMutation.isPending}
                      data-testid={`button-plant-delete-${item.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      </>}
          </ProposalDocSection>
          <ProposalDocSection n={5} sectionKey="photos" title={t("proposalP3.sections.photos")} summary={photosSummary}
            collapsed={!!collapse.collapsed["photos"]} onToggle={() => collapse.toggle("photos")}>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <div className="flex items-center gap-2" role="group" aria-label={t(proposal.estimateId ? "proposals.attachmentLayout" : "proposals.photoLayout")}>
              <span className="text-xs text-muted-foreground">{t(proposal.estimateId ? "proposals.attachmentLayout" : "proposals.photoLayout")}:</span>
              <div className="inline-flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  className={`px-2.5 py-1 text-xs ${(proposal.photoLayout ?? "large") === "large" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  onClick={() => {
                    if ((proposal.photoLayout ?? "large") === "large") return;
                    queryClient.setQueryData(["/api/proposals", id], (old: any) => old ? { ...old, photoLayout: "large" } : old);
                    saveMutation.mutate({ photoLayout: "large" });
                  }}
                  data-testid="button-photo-layout-large"
                  aria-pressed={(proposal.photoLayout ?? "large") === "large"}
                >
                  {t(proposal.estimateId ? "proposals.attachmentFullPage" : "proposals.photoLayoutLarge")}
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-xs border-l ${proposal.photoLayout === "grid" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  onClick={() => {
                    if (proposal.photoLayout === "grid") return;
                    queryClient.setQueryData(["/api/proposals", id], (old: any) => old ? { ...old, photoLayout: "grid" } : old);
                    saveMutation.mutate({ photoLayout: "grid" });
                  }}
                  data-testid="button-photo-layout-grid"
                  aria-pressed={proposal.photoLayout === "grid"}
                >
                  {t(proposal.estimateId ? "proposals.attachmentGrid" : "proposals.photoLayoutGrid")}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={() => imgInputRef.current?.click()}
            disabled={uploadingImages || legacy}
            onDragEnter={(e) => { if (!isFileDrag(e)) return; e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragOver={(e) => { if (!isFileDrag(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = legacy ? "none" : "copy"; if (!dragOver) setDragOver(true); }}
            onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; setDragOver(false); }}
            onDrop={(e) => {
              if (!isFileDrag(e)) return;
              e.preventDefault(); e.stopPropagation(); setDragOver(false);
              if (legacy || uploadingImages) return;
              acceptPhotoFiles(Array.from(e.dataTransfer.files ?? []));
            }}
            aria-describedby="photo-drop-hint"
            data-drag-over={dragOver ? "true" : "false"}
            className={`mb-3 flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 ${images.length ? "py-5" : "py-10"} text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${dragOver ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:bg-muted/40"}`}
            data-testid="button-drop-photos"
          >
            {uploadingImages ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />}
            <span className="text-sm font-medium text-foreground">
              {uploadingImages ? t("proposals.uploading") : dragOver ? t("proposalP3.dropActive") : t("proposalP3.dropIdle")}
            </span>
            <span id="photo-drop-hint" className="text-xs">{t("proposalP3.dropHint")}</span>
          </button>

          {images.length > 0 && selectedImageIds.size > 0 && (
            <div
              className="flex items-center justify-between gap-2 mb-3 p-2.5 rounded-md border bg-muted/40"
              data-testid="bar-bulk-photo-actions"
            >
              <div className="flex items-center gap-3 text-sm">
                <span data-testid="text-selected-count">
                  {t("proposals.photosSelected", { count: selectedImageIds.size })}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setSelectedImageIds(new Set())}
                  data-testid="button-clear-selection"
                >
                  {t("common.clear")}
                </button>
                {selectedImageIds.size < images.length && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setSelectedImageIds(new Set(images.map(i => i.id)))}
                    data-testid="button-select-all"
                  >
                    {t("proposalP3.selectAll")}
                  </button>
                )}
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkDeleteFilesMutation.isPending}
                data-testid="button-delete-selected-photos"
              >
                {bulkDeleteFilesMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("common.delete")}</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" /> {t("proposals.deleteSelected")}</>
                )}
              </Button>
            </div>
          )}

          {images.length > 0 && (
            <DndContext
              sensors={sortableSensors}
              collisionDetection={closestCenter}
              onDragEnd={handlePhotoDragEnd}
            >
              <SortableContext
                items={images.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {(() => {
                  const perPage = (proposal.photoLayout === "grid") ? (proposal.estimateId ? 4 : 6) : (proposal.estimateId ? 2 : 1);
                  const totalPages = Math.max(1, Math.ceil(images.length / perPage));
                  const rows: React.ReactNode[] = [];
                  images.forEach((img, idx) => {
                    const pageIdx = Math.floor(idx / perPage);
                    const pageNum = pageIdx + 1;
                    const isFirstOnPage = idx % perPage === 0;
                    const isLastOnPage = (idx + 1) % perPage === 0 || idx === images.length - 1;
                    if (isFirstOnPage) {
                      rows.push(
                        <div
                          key={`page-header-${pageNum}`}
                          className="flex items-center gap-2 pt-1"
                          data-testid={`div-photo-page-header-${pageNum}`}
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("proposals.photoPageLabel", { page: pageNum })}
                            {totalPages > 1 ? ` / ${totalPages}` : ""}
                          </span>
                          <span className="flex-1 h-px bg-border" />
                        </div>
                      );
                    }
                    rows.push(
                      <SortablePhotoRow
                        key={img.id}
                        img={img}
                        captionDraft={captionDrafts[img.id]}
                        onCaptionChange={(val) => setCaptionDrafts(prev => ({ ...prev, [img.id]: val }))}
                        onCaptionBlur={(val) => {
                          if (val !== (img.caption ?? "")) {
                            saveCaptionMutation.mutate({ fileId: img.id, caption: val });
                          }
                        }}
                        onDelete={() => setFileToDelete(img)}
                        coverAction={proposal.estimateId ? <Button size="sm" variant="outline" disabled={coverMutation.isPending}
                          aria-pressed={proposal.coverSource === "photo" && proposal.coverPhotoFileId === img.id}
                          onClick={() => coverMutation.mutate({ coverSource: "photo", coverPhotoFileId: img.id })}>
                          {t(proposal.coverSource === "photo" && proposal.coverPhotoFileId === img.id ? "proposals.coverSelected" : "proposals.useAsCover")}
                        </Button> : undefined}
                        captionPlaceholder={t("proposals.captionPlaceholder")}
                        dragLabel={t("proposalP3.dragToReorder")}
                        selected={selectedImageIds.has(img.id)}
                        onSelectChange={(checked) => {
                          setSelectedImageIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(img.id); else next.delete(img.id);
                            return next;
                          });
                        }}
                        selectLabel={t("proposals.selectPhoto")}
                      />
                    );
                    if (isLastOnPage && idx < images.length - 1) {
                      rows.push(
                        <div
                          key={`page-break-${pageNum}`}
                          className="flex items-center gap-2 py-1"
                          aria-hidden="true"
                          data-testid={`div-photo-page-break-${pageNum}`}
                          title={t("proposals.photoPageBreakHint", { page: pageNum, defaultValue: `End of page ${pageNum}` })}
                        >
                          <span className="flex-1 border-t border-dashed border-border" />
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("proposals.photoPageBreakHint", { page: pageNum, defaultValue: `End of page ${pageNum}` })}
                          </span>
                          <span className="flex-1 border-t border-dashed border-border" />
                        </div>
                      );
                    }
                  });
                  return <div className="space-y-3 mb-4">{rows}</div>;
                })()}
              </SortableContext>
            </DndContext>
          )}

          <input
            ref={imgInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={handleImageUpload}
            data-testid="input-image-files"
          />
        </div>
      </div>

          </ProposalDocSection>
          </fieldset>
      <Sheet open={!proposal.estimateId && plantPickerOpen} onOpenChange={setPlantPickerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle className="flex items-center gap-2">
              <Leaf className="w-4 h-4" /> Browse Plant Library
            </SheetTitle>
          </SheetHeader>
          <PlantLibrary
            insertMode
            onAddSelections={(selections) => addPlantItemsMutation.mutate(selections)}
            addPending={addPlantItemsMutation.isPending}
          />
        </SheetContent>
      </Sheet>

        </div>
        <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-4" aria-label={t("proposalP3.whatGoesOut")} data-testid="column-what-goes-out">
          <Card data-testid="proposal-ready-checklist">
            <CardHeader className="pb-2"><CardTitle className="text-base">{t("proposalP3.whatGoesOut")}</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <ul className="space-y-2.5" aria-label={t("proposalP3.checklist")}>
                {checklist.map((row) => (
                  <li key={row.key} className="flex items-center gap-2" data-testid={`check-${row.key}`} data-ok={row.ok ? "true" : "false"}>
                    {row.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label={t("proposalP3.set")} />
                      : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30" role="img" aria-label={t("proposalP3.notSet")} />}
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`ml-auto text-right font-medium ${row.key === "work-location" ? "min-w-0 whitespace-pre-wrap break-words" : "truncate"}`}
                      data-testid={`text-check-${row.key}`}>{row.value}</span>
                  </li>
                ))}
              </ul>
              {!legacy && (
                <div className="space-y-1.5 border-t pt-3" data-testid="rail-finalize">
                  {finalizeButton}
                  {generateCrewWorksheetButton}
                  <p className="text-center text-xs text-muted-foreground" data-testid="text-next-version-hint">
                    {t("proposals.nextVersion")} <strong>v{nextVersionNumber}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
      {hasVersions && (
        <Card data-testid="div-version-history" className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4" />
              {t("contracts.versionHistory")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...versions].reverse().map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border"
                data-testid={`row-version-${v.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-version-label-${v.id}`}>v{v.versionNumber}</span>
                      {v.finalizedByName && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-finalized-by-${v.id}`}>
                          by {v.finalizedByName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid={`text-finalized-at-${v.id}`}>
                      {formatDateTime(v.finalizedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/dashboard/tools/proposals/${id}/versions/${v.id}`)}
                    data-testid={`button-view-version-${v.id}`}
                  >
                    {t("common.view")}
                  </Button>
                  <a href={`/api/proposals/${id}/versions/${v.id}/download`} download data-testid={`button-download-version-${v.id}`}>
                    <Button size="icon" variant="ghost">
                      <Download className="w-4 h-4" />
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

        </aside>
      </div>

      <AlertDialog open={finalizeDialogOpen} onOpenChange={open => {
        if (finalizeMutation.isPending) return;
        setFinalizeDialogOpen(open); setEstimateSendMethod(""); setNeedPrice([]); setFinalizeError(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("proposals.finalizeProposal")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("proposalVersion.immutableCopy")} <strong>v{nextVersionNumber}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {proposal.estimate?.currentVersion?.status === "draft" && <div className="space-y-3">
            <p className="text-sm">{t("proposalEstimate.lockExplanation", { number: proposal.estimate.number, n: proposal.estimate.currentVersion.versionNumber })}</p>
            <fieldset disabled={finalizeMutation.isPending}>
              <legend className="text-sm font-medium mb-2">{t("estimateBuilder.life.send.method")}</legend>
              <div className="flex flex-wrap gap-3">
                {SENT_METHODS.map(method => <label className="flex items-center gap-1 text-sm" key={method}>
                  <input type="radio" name="proposal-send-method" checked={estimateSendMethod === method} onChange={() => { setEstimateSendMethod(method); setNeedPrice([]); }} />
                  {t(`estimateBuilder.life.sentMethod.${method}`)}
                </label>)}
              </div>
            </fieldset>
          </div>}
          {!!needPrice.length && <div role="alert" className="rounded-md border border-amber-400 p-3 text-sm">
            <p className="font-medium">{t("estimateBuilder.life.send.needPriceTitle")}</p>
            <p>{t("estimateBuilder.life.send.needPriceBody")}</p>
            <ul className="list-disc pl-5">{needPrice.map(line => <li key={line.id}>{line.name ?? t("estimateBuilder.life.send.unknownLine", { id: line.id })}</li>)}</ul>
          </div>}
          {finalizeError && <p role="alert" className="text-sm text-destructive">{finalizeError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-finalize">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => { event.preventDefault(); setFinalizeError(null); finalizeMutation.mutate(); }}
              disabled={finalizeMutation.isPending || (proposal.estimate?.currentVersion?.status === "draft" && !estimateSendMethod)}
              data-testid="button-confirm-finalize"
            >
              {finalizeMutation.isPending ? t("proposals.finalizing") : needPrice.length ? t("estimateBuilder.life.send.sendAnyway") : `${t("common.create")} v${nextVersionNumber}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => { if (!open) setFileToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("ticketDetail.cannotUndo")} "{fileToDelete?.filename}"
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-file">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => fileToDelete && deleteFileMutation.mutate(fileToDelete.id)}
              data-testid="button-confirm-delete-file"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("proposals.deleteSelectedPhotos", { count: selectedImageIds.size, defaultValue: "Delete {{count}} photos?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ticketDetail.cannotUndo")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteFilesMutation.mutate(Array.from(selectedImageIds))}
              disabled={bulkDeleteFilesMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteProposalOpen} onOpenChange={setDeleteProposalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("proposals.deleteProposal")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("ticketDetail.cannotUndo")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-proposal">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await apiRequest("DELETE", `/api/proposals/${id}`);
                  queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
                  window.location.href = "/dashboard/tools/proposals";
                } catch {
                  toast({ title: t("common.error"), variant: "destructive" });
                }
              }}
              data-testid="button-confirm-delete-proposal"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
