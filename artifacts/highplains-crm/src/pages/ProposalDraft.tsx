import { useState, useRef, useCallback, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
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
  Upload,
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
  Map,
  X,
  ExternalLink,
  Link2,
  Unlink,
  AlertTriangle,
  GripVertical,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProposalWithDetails, ProposalFile, Ticket, VisualScopeSheetWithCustomer } from "@shared/schema";

function formatDateTime(ts: string | Date) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return String(ts); }
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
          src={`/objects/${img.storageObjectPath.replace(/^\//, "")}`}
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
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { t } = useTranslation();

  const urlParams = new URLSearchParams(search);
  const urlTicketId = urlParams.get("ticketId") || null;
  const urlTicketTitle = urlParams.get("ticketTitle") || null;

  const [title, setTitle] = useState("");
  const [proposalDate, setProposalDate] = useState("");
  const [estimateNumber, setEstimateNumber] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [initialized, setInitialized] = useState(false);

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ProposalFile | null>(null);
  const [deleteProposalOpen, setDeleteProposalOpen] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef<HTMLTextAreaElement>(null);

  const { data: proposal, isLoading } = useQuery<ProposalWithDetails>({
    queryKey: ["/api/proposals", id],
    enabled: !!id,
    select: (data: ProposalWithDetails) => {
      if (!initialized) {
        setTitle(data.title ?? "Proposal");
        setProposalDate(data.proposalDate ?? "");
        setEstimateNumber(data.estimateNumber ?? "");
        setScopeOfWork(data.scopeOfWork ?? "");
        setInitialized(true);
        const drafts: Record<string, string> = {};
        data.files.filter(f => f.fileType === "image").forEach(f => {
          drafts[f.id] = f.caption ?? "";
        });
        setCaptionDrafts(drafts);
      }
      return data;
    },
  });

  const linkedTicketId = proposal?.ticketId;
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
    document.title = `${proposalTitle} | Greenfield`;
    return () => {
      document.title = "Greenfield";
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

  const handleBlur = useCallback((field: string, value: string) => {
    if (!proposal) return;
    const current = proposal[field as keyof ProposalWithDetails] as string | null ?? "";
    if (value !== current) {
      saveMutation.mutate({ [field]: value || (field === "estimateNumber" ? null : value) });
    }
  }, [proposal, saveMutation]);

  const insertPageBreak = () => {
    const ta = scopeRef.current;
    const marker = '\n[PAGE BREAK]\n';
    const start = ta ? ta.selectionStart ?? scopeOfWork.length : scopeOfWork.length;
    const end = ta ? ta.selectionEnd ?? scopeOfWork.length : scopeOfWork.length;
    const newValue = scopeOfWork.slice(0, start) + marker + scopeOfWork.slice(end);
    setScopeOfWork(newValue);
    saveMutation.mutate({ scopeOfWork: newValue });
    if (ta) {
      setTimeout(() => {
        ta.focus();
        const newPos = start + marker.length;
        ta.setSelectionRange(newPos, newPos);
      }, 0);
    }
  };

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
      toast({ title: t("proposals.photosDeleted", { count: data.deletedCount, defaultValue: "{{count}} photos deleted" }) });
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
    queryClient.setQueryData<ProposalWithDetails | undefined>(["/api/proposals", id], (old) => {
      if (!old) return old;
      const reorderedIds = new Map(newOrder.map((f, idx) => [f.id, idx] as const));
      const updatedFiles = old.files.map(f => {
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

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/proposals/${id}/finalize`, {});
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Finalization failed");
      }
      return res.json();
    },
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      setFinalizeDialogOpen(false);
      toast({ title: t("proposals.finalized", { version: version.versionNumber }), description: t("proposals.finalizedMsg") });
    },
    onError: (err: Error) => {
      setFinalizeDialogOpen(false);
      toast({ title: t("proposals.finalizeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const uploadFile = async (file: File, fileType: "estimate_pdf" | "image") => {
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

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      await uploadFile(file, "estimate_pdf");
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      toast({ title: t("proposals.pdfUploaded") });
    } catch (err: any) {
      toast({ title: t("proposals.uploadFailed"), description: err.message, variant: "destructive" });
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (!rawFiles.length) return;
    setUploadingImages(true);
    const hasHeic = rawFiles.some(f =>
      f.type === "image/heic" || f.type === "image/heif" ||
      f.name.toLowerCase().endsWith(".heic") || f.name.toLowerCase().endsWith(".heif")
    );
    if (hasHeic) {
      toast({ title: t("proposals.convertingHeic") });
    }
    try {
      const files = await Promise.all(rawFiles.map(convertIfHeic));
      for (const file of files) {
        await uploadFile(file, "image");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      toast({ title: `${files.length} image${files.length > 1 ? "s" : ""} uploaded` });
    } catch (err: any) {
      toast({ title: t("proposals.imageUploadFailed"), description: err.message, variant: "destructive" });
    } finally {
      setUploadingImages(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  };

  const { data: vsSheets } = useQuery<VisualScopeSheetWithCustomer[]>({
    queryKey: ["/api/customers", proposal?.customerId, "visual-scope-sheets"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${proposal!.customerId}/visual-scope-sheets`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!proposal?.customerId,
  });

  const estimatePdf = proposal?.files.find(f => f.fileType === "estimate_pdf");
  const images = proposal?.files.filter(f => f.fileType === "image").sort((a, b) => a.displayOrder - b.displayOrder) ?? [];
  const versions = proposal?.versions ?? [];
  const hasVersions = versions.length > 0;
  const nextVersionNumber = hasVersions ? (versions[versions.length - 1].versionNumber + 1) : 1;

  const estimateBytes = estimatePdf?.fileSize ?? 0;
  const imagesBytes = images.reduce((s, f) => s + (f.fileSize ?? 0), 0);
  const estimatedPdfMB = (estimateBytes + imagesBytes / 10) / 1024 / 1024;
  const showSizeWarning = estimatePdf != null && estimatedPdfMB > 20;

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
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">{t("proposals.proposalNotFound")}</p>
      </div>
    );
  }

  const finalizeButton = (
    <Button
      size="sm"
      variant="default"
      onClick={() => setFinalizeDialogOpen(true)}
      disabled={!estimatePdf || finalizeMutation.isPending}
      data-testid="button-finalize-proposal"
    >
      {finalizeMutation.isPending ? (
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("proposals.finalizing")}</>
      ) : (
        <><Lock className="w-4 h-4 mr-2" />{t("proposals.finalizeProposal")}</>
      )}
    </Button>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3 flex-wrap">
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
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-proposal-title">
            {proposal.title}
          </h1>
          {proposal.proposalNumber && (
            <span className="text-sm font-mono text-muted-foreground" data-testid="text-proposal-number">
              {proposal.proposalNumber}
            </span>
          )}
          {getStatusBadge(proposal.status)}
          <div className="flex-1" />
          {estimatePdf ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`/api/proposals/${id}/pdf?inline=1`, '_blank')}
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
              {finalizeButton}
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
                  <Button size="sm" variant="default" disabled data-testid="button-finalize-proposal">
                    <Lock className="w-4 h-4 mr-2" />{t("proposals.finalizeProposal")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t("proposals.uploadBeforeGenerate")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {estimatePdf && (
          <p className="text-xs text-muted-foreground mt-2" data-testid="text-next-version-hint">
            {t("proposals.nextVersion")} <strong>v{nextVersionNumber}</strong>
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          {t("common.customer")}:{" "}
          <Link href={`/dashboard/customers/${proposal.customerId}`}>
            <span className="text-foreground hover:underline cursor-pointer" data-testid="link-customer-name">
              {proposal.customerName}
            </span>
          </Link>
        </p>
      </div>

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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => saveMutation.mutate({ ticketId: null })}
              disabled={saveMutation.isPending}
              data-testid="button-unlink-ticket"
            >
              <Unlink className="w-3.5 h-3.5 mr-1.5" />
              {t("proposals.unlink")}
            </Button>
          </div>
        </div>
      )}

      {hasVersions && (
        <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 px-4 py-3" data-testid="div-version-banner">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {t("proposals.draftEditsNote")}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("common.details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-estimate-num">{t("proposals.qbEstimateNumber")} <span className="text-muted-foreground font-normal">({t("common.optional")})</span></Label>
            <Input
              id="field-estimate-num"
              value={estimateNumber}
              onChange={(e) => setEstimateNumber(e.target.value)}
              onBlur={(e) => handleBlur("estimateNumber", e.target.value || null as any)}
              placeholder={t("proposals.qbEstimatePlaceholder")}
              data-testid="input-estimate-number"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="field-scope">{t("proposals.scopeOfWork")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={insertPageBreak}
                className="h-auto py-0.5 px-2 text-xs text-muted-foreground gap-1"
                data-testid="button-insert-page-break"
              >
                <FileText className="w-3 h-3" />
                {t("proposals.insertPageBreak")}
              </Button>
            </div>
            <Textarea
              id="field-scope"
              ref={scopeRef}
              value={scopeOfWork}
              onChange={(e) => setScopeOfWork(e.target.value)}
              onBlur={(e) => handleBlur("scopeOfWork", e.target.value)}
              rows={6}
              placeholder={t("proposals.scopePlaceholder")}
              data-testid="input-scope-of-work"
            />
            <p className="text-xs text-muted-foreground">
              {t("proposals.pageBreakInstructions")} <code className="bg-muted px-1 rounded text-xs">[PAGE BREAK]</code> {t("proposals.pageBreakMarker")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("proposals.qbEstimatePdf")}</CardTitle>
        </CardHeader>
        <CardContent>
          {estimatePdf ? (
            <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30" data-testid="div-estimate-pdf">
              <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 min-w-0 truncate" data-testid="text-pdf-filename">
                {estimatePdf.filename}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/objects/${estimatePdf.storageObjectPath.replace(/^\//, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-download-pdf"
                >
                  <Button size="icon" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </a>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setFileToDelete(estimatePdf)}
                  data-testid="button-delete-pdf"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">{t("proposals.uploadQbPdf")}</p>
          )}

          <div className="mt-3">
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePdfUpload}
              data-testid="input-pdf-file"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => pdfInputRef.current?.click()}
              disabled={uploadingPdf}
              data-testid="button-upload-pdf"
            >
              {uploadingPdf ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("proposals.uploading")}</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> {estimatePdf ? t("common.upload") : t("common.upload")}</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Map className="w-4 h-4" /> {t("tools.visualScope")}
            </CardTitle>
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
        <CardContent>
          {proposal.visualScopeSheetId && proposal.visualScopeSheet ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid="div-vs-attached">
              <div className="flex items-center gap-3 min-w-0">
                <Map className="w-4 h-4 text-muted-foreground shrink-0" />
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">{t("proposals.photoAppendix")}</CardTitle>
            <div className="flex items-center gap-2" role="group" aria-label={t("proposals.photoLayout")}>
              <span className="text-xs text-muted-foreground">{t("proposals.photoLayout")}:</span>
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
                  {t("proposals.photoLayoutLarge")}
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
                  {t("proposals.photoLayoutGrid")}
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {images.length === 0 && (
            <p className="text-sm text-muted-foreground mb-3">{t("proposals.addPhotos")}</p>
          )}

          {images.length > 0 && selectedImageIds.size > 0 && (
            <div
              className="flex items-center justify-between gap-2 mb-3 p-2.5 rounded-md border bg-muted/40"
              data-testid="bar-bulk-photo-actions"
            >
              <div className="flex items-center gap-3 text-sm">
                <span data-testid="text-selected-count">
                  {t("proposals.photosSelected", { count: selectedImageIds.size, defaultValue: "{{count}} selected" })}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setSelectedImageIds(new Set())}
                  data-testid="button-clear-selection"
                >
                  {t("common.clear", { defaultValue: "Clear" })}
                </button>
                {selectedImageIds.size < images.length && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setSelectedImageIds(new Set(images.map(i => i.id)))}
                    data-testid="button-select-all"
                  >
                    {t("common.selectAll", { defaultValue: "Select all" })}
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
                  <><Trash2 className="w-4 h-4 mr-2" /> {t("proposals.deleteSelected", { defaultValue: "Delete selected" })}</>
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
                <div className="space-y-4 mb-4">
                  {images.map((img) => (
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
                      captionPlaceholder={t("proposals.captionPlaceholder")}
                      dragLabel={t("proposals.dragToReorder", { defaultValue: "Drag to reorder" })}
                      selected={selectedImageIds.has(img.id)}
                      onSelectChange={(checked) => {
                        setSelectedImageIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(img.id); else next.delete(img.id);
                          return next;
                        });
                      }}
                      selectLabel={t("proposals.selectPhoto", { defaultValue: "Select photo" })}
                    />
                  ))}
                </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => imgInputRef.current?.click()}
            disabled={uploadingImages}
            data-testid="button-upload-images"
          >
            {uploadingImages ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("proposals.uploading")}</>
            ) : (
              <><ImageIcon className="w-4 h-4 mr-2" /> {t("proposals.addPhotos")}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {hasVersions && (
        <Card data-testid="div-version-history">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
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

      <div className="flex justify-end pt-2">
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => setDeleteProposalOpen(true)}
          data-testid="button-delete-proposal"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t("proposals.deleteProposal")}
        </Button>
      </div>

      <AlertDialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("proposals.finalizeProposal")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("proposalVersion.immutableCopy")} <strong>v{nextVersionNumber}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-finalize">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending}
              data-testid="button-confirm-finalize"
            >
              {finalizeMutation.isPending ? t("proposals.finalizing") : `${t("common.create")} v${nextVersionNumber}`}
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
