import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Eye, CheckCircle2, Plus, History } from "lucide-react";
import type { ProposalWithDetails } from "@shared/schema";

function formatDateTime(ts: string | Date) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return String(ts); }
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  try {
    const [year, month, day] = dateStr.split("-");
    return `${month}/${day}/${year}`;
  } catch { return dateStr; }
}

export default function ProposalVersion() {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const [, navigate] = useLocation();

  const { data: proposal, isLoading, isError } = useQuery<ProposalWithDetails>({
    queryKey: ["/api/proposals", id],
    enabled: !!id,
  });

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

  if (isError || !proposal) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Proposal not found.</p>
      </div>
    );
  }

  const version = proposal.versions.find(v => v.id === versionId);

  if (!version) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Version not found.</p>
      </div>
    );
  }

  const otherVersions = proposal.versions.filter(v => v.id !== versionId);
  const downloadUrl = `/api/proposals/${id}/versions/${versionId}/download`;
  const previewUrl = `${downloadUrl}?inline=1`;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link href="/dashboard/tools/proposals">
          <button className="flex items-center gap-1 hover:text-foreground transition-colors" data-testid="link-back-to-list">
            <ArrowLeft className="w-3.5 h-3.5" />
            Proposal Maker
          </button>
        </Link>
        <span>/</span>
        <Link href={`/dashboard/tools/proposals/${id}`}>
          <button className="hover:text-foreground transition-colors" data-testid="link-back-to-draft">
            {proposal.title}
          </button>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">v{version.versionNumber}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-version-title">
            {version.title}
          </h1>
          <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-version-status">
            <CheckCircle2 className="w-3 h-3" />
            Finalized v{version.versionNumber}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Customer:{" "}
          <Link href={`/dashboard/customers/${proposal.customerId}`}>
            <span className="text-foreground hover:underline cursor-pointer" data-testid="link-customer-name">
              {proposal.customerName}
            </span>
          </Link>
        </p>
      </div>

      {/* Version Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Proposal Date</p>
              <p className="font-medium" data-testid="text-proposal-date">{formatDate(version.proposalDate)}</p>
            </div>
            {version.estimateNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">QB Estimate #</p>
                <p className="font-medium" data-testid="text-estimate-number">#{version.estimateNumber}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Finalized By</p>
              <p className="font-medium" data-testid="text-finalized-by">
                {version.finalizedByName ?? "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Finalized On</p>
              <p className="font-medium" data-testid="text-finalized-at">
                {formatDateTime(version.finalizedAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDF Document</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            This is a permanent, immutable copy of the proposal as it was on {formatDateTime(version.finalizedAt)}.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => window.open(previewUrl, '_blank')}
              data-testid="button-preview-version-pdf"
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview PDF
            </Button>
            <a href={downloadUrl} download data-testid="button-download-version-pdf">
              <Button>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proposal Draft</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The draft remains editable. Finalizing it again will create v{version.versionNumber + 1}.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => navigate(`/dashboard/tools/proposals/${id}`)}
              data-testid="button-back-to-draft"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Draft
            </Button>
            <Button
              onClick={() => navigate(`/dashboard/tools/proposals/${id}`)}
              data-testid="button-create-new-version"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Version
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Other Versions */}
      {otherVersions.length > 0 && (
        <Card data-testid="div-other-versions">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Other Versions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...otherVersions].reverse().map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                onClick={() => navigate(`/dashboard/tools/proposals/${id}/versions/${v.id}`)}
                data-testid={`row-other-version-${v.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-other-version-label-${v.id}`}>v{v.versionNumber}</span>
                      {v.finalizedByName && (
                        <span className="text-xs text-muted-foreground">by {v.finalizedByName}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateTime(v.finalizedAt)}</p>
                  </div>
                </div>
                <a
                  href={`/api/proposals/${id}/versions/${v.id}/download`}
                  download
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-download-other-version-${v.id}`}
                >
                  <Button size="icon" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
