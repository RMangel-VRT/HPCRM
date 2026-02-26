import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProposalWithDetails, ProposalFile } from "@shared/schema";

function formatDateTime(ts: string | Date) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return String(ts); }
}

export default function ProposalDraft() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

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

  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const { data: proposal, isLoading } = useQuery<ProposalWithDetails>({
    queryKey: ["/api/proposals", id],
    enabled: !!id,
    select: (data) => {
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

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string | null>) => {
      return apiRequest("PATCH", `/api/proposals/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save changes", variant: "destructive" });
    },
  });

  const handleBlur = useCallback((field: string, value: string) => {
    if (!proposal) return;
    const current = proposal[field as keyof ProposalWithDetails] as string | null ?? "";
    if (value !== current) {
      saveMutation.mutate({ [field]: value || (field === "estimateNumber" ? null : value) });
    }
  }, [proposal, saveMutation]);

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("DELETE", `/api/proposals/${id}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      setFileToDelete(null);
      toast({ title: "File deleted" });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
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
      toast({ title: "Caption save failed", variant: "destructive" });
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
      toast({ title: `Proposal finalized as v${version.versionNumber}`, description: "A permanent version has been saved." });
    },
    onError: (err: Error) => {
      setFinalizeDialogOpen(false);
      toast({ title: "Finalization failed", description: err.message, variant: "destructive" });
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
      toast({ title: "PDF uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingImages(true);
    try {
      for (const file of files) {
        await uploadFile(file, "image");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      toast({ title: `${files.length} image${files.length > 1 ? "s" : ""} uploaded` });
    } catch (err: any) {
      toast({ title: "Image upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingImages(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  };

  const estimatePdf = proposal?.files.find(f => f.fileType === "estimate_pdf");
  const images = proposal?.files.filter(f => f.fileType === "image").sort((a, b) => a.displayOrder - b.displayOrder) ?? [];
  const versions = proposal?.versions ?? [];
  const hasVersions = versions.length > 0;
  const nextVersionNumber = hasVersions ? (versions[versions.length - 1].versionNumber + 1) : 1;

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
        <p className="text-muted-foreground">Proposal not found.</p>
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
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Finalizing...</>
      ) : (
        <><Lock className="w-4 h-4 mr-2" />Finalize Proposal</>
      )}
    </Button>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Link href="/dashboard/tools/proposals">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors" data-testid="link-back-to-proposals">
              <ArrowLeft className="w-3.5 h-3.5" />
              Proposal Maker
            </button>
          </Link>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-proposal-title">
            {proposal.title}
          </h1>
          <Badge variant="secondary" data-testid="badge-draft-status">Draft</Badge>
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
                Preview PDF
              </Button>
              <a href={`/api/proposals/${id}/pdf`} download data-testid="button-download-pdf">
                <Button size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </a>
              {finalizeButton}
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled data-testid="button-preview-pdf">
                    <Eye className="w-4 h-4 mr-2" />Preview PDF
                  </Button>
                  <Button size="sm" variant="outline" disabled data-testid="button-download-pdf">
                    <Download className="w-4 h-4 mr-2" />Download PDF
                  </Button>
                  <Button size="sm" variant="default" disabled data-testid="button-finalize-proposal">
                    <Lock className="w-4 h-4 mr-2" />Finalize Proposal
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Upload a QB Estimate PDF before generating
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {estimatePdf && (
          <p className="text-xs text-muted-foreground mt-2" data-testid="text-next-version-hint">
            Next finalize will create <strong>v{nextVersionNumber}</strong>
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          Customer:{" "}
          <Link href={`/dashboard/customers/${proposal.customerId}`}>
            <span className="text-foreground hover:underline cursor-pointer" data-testid="link-customer-name">
              {proposal.customerName}
            </span>
          </Link>
        </p>
      </div>

      {/* Version banner — shown when prior versions exist */}
      {hasVersions && (
        <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 px-4 py-3" data-testid="div-version-banner">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Edits to this draft only affect the next finalized version — all prior versions are permanently preserved.
          </p>
        </div>
      )}

      {/* Core Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="field-title">Title</Label>
              <Input
                id="field-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={(e) => handleBlur("title", e.target.value)}
                data-testid="input-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="field-date">Proposal Date</Label>
              <Input
                id="field-date"
                type="date"
                value={proposalDate}
                onChange={(e) => setProposalDate(e.target.value)}
                onBlur={(e) => handleBlur("proposalDate", e.target.value)}
                data-testid="input-proposal-date"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-estimate-num">QB Estimate Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="field-estimate-num"
              value={estimateNumber}
              onChange={(e) => setEstimateNumber(e.target.value)}
              onBlur={(e) => handleBlur("estimateNumber", e.target.value || null as any)}
              placeholder="e.g. 1042"
              data-testid="input-estimate-number"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-scope">Scope of Work</Label>
            <Textarea
              id="field-scope"
              value={scopeOfWork}
              onChange={(e) => setScopeOfWork(e.target.value)}
              onBlur={(e) => handleBlur("scopeOfWork", e.target.value)}
              rows={6}
              placeholder="Describe the work to be performed..."
              data-testid="input-scope-of-work"
            />
          </div>
        </CardContent>
      </Card>

      {/* QB Estimate PDF */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">QB Estimate PDF</CardTitle>
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
            <p className="text-sm text-muted-foreground mb-3">No PDF uploaded yet.</p>
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
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> {estimatePdf ? "Replace PDF" : "Upload PDF"}</>
              )}
            </Button>
            {estimatePdf && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Uploading a new PDF will replace the existing one automatically.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supporting Images</CardTitle>
        </CardHeader>
        <CardContent>
          {images.length === 0 && (
            <p className="text-sm text-muted-foreground mb-3">No images uploaded yet.</p>
          )}

          {images.length > 0 && (
            <div className="space-y-4 mb-4">
              {images.map((img) => (
                <div key={img.id} className="flex gap-3 items-start p-3 rounded-md border" data-testid={`div-image-${img.id}`}>
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
                      placeholder="Add a caption..."
                      value={captionDrafts[img.id] ?? img.caption ?? ""}
                      onChange={(e) => setCaptionDrafts(prev => ({ ...prev, [img.id]: e.target.value }))}
                      onBlur={(e) => {
                        const val = e.target.value;
                        if (val !== (img.caption ?? "")) {
                          saveCaptionMutation.mutate({ fileId: img.id, caption: val });
                        }
                      }}
                      className="text-sm"
                      data-testid={`input-caption-${img.id}`}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setFileToDelete(img)}
                    className="shrink-0"
                    data-testid={`button-delete-image-${img.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
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
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
            ) : (
              <><ImageIcon className="w-4 h-4 mr-2" /> Add Images</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Version History */}
      {hasVersions && (
        <Card data-testid="div-version-history">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Version History
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
                    View
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

      {/* Delete Proposal */}
      <div className="flex justify-end pt-2">
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => setDeleteProposalOpen(true)}
          data-testid="button-delete-proposal"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Proposal
        </Button>
      </div>

      {/* Finalize Confirmation Dialog */}
      <AlertDialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize Proposal</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently create <strong>v{nextVersionNumber}</strong> of this proposal. The finalized version will be stored as an immutable PDF record and cannot be edited after creation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-finalize">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending}
              data-testid="button-confirm-finalize"
            >
              {finalizeMutation.isPending ? "Finalizing..." : `Create v${nextVersionNumber}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete File Dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => { if (!open) setFileToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileToDelete?.filename}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-file">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => fileToDelete && deleteFileMutation.mutate(fileToDelete.id)}
              data-testid="button-confirm-delete-file"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Proposal Dialog */}
      <AlertDialog open={deleteProposalOpen} onOpenChange={setDeleteProposalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Proposal</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this proposal and all its uploaded files. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-proposal">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await apiRequest("DELETE", `/api/proposals/${id}`);
                  queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
                  window.location.href = "/dashboard/tools/proposals";
                } catch {
                  toast({ title: "Delete failed", variant: "destructive" });
                }
              }}
              data-testid="button-confirm-delete-proposal"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
