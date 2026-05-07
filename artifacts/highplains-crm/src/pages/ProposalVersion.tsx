import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Eye, CheckCircle2, Plus, History, Map } from "lucide-react";
import type { ProposalWithDetails } from "@shared/schema";

function formatDateTime(ts: string | Date) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
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
  const { t } = useTranslation();

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
        <p className="text-muted-foreground">{t("proposalVersion.proposalNotFound")}</p>
      </div>
    );
  }

  const version = proposal.versions.find(v => v.id === versionId);

  if (!version) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">{t("proposalVersion.versionNotFound")}</p>
      </div>
    );
  }

  const otherVersions = proposal.versions.filter(v => v.id !== versionId);
  const downloadUrl = `/api/proposals/${id}/versions/${versionId}/download`;
  const previewUrl = `${downloadUrl}?inline=1`;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link href="/dashboard/tools/proposals">
          <button className="flex items-center gap-1 hover:text-foreground transition-colors" data-testid="link-back-to-list">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("proposals.title")}
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

      <div>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-version-title">
            {version.title}
          </h1>
          {proposal.proposalNumber && (
            <span className="text-sm font-mono text-muted-foreground" data-testid="text-proposal-number">
              {proposal.proposalNumber}
            </span>
          )}
          <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-version-status">
            <CheckCircle2 className="w-3 h-3" />
            {t("proposalVersion.finalizedVersion", { version: version.versionNumber })}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("common.customer")}:{" "}
          <Link href={`/dashboard/customers/${proposal.customerId}`}>
            <span className="text-foreground hover:underline cursor-pointer" data-testid="link-customer-name">
              {proposal.customerName}
            </span>
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("proposalVersion.versionDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("proposals.proposalDate")}</p>
              <p className="font-medium" data-testid="text-proposal-date">{formatDate(version.proposalDate)}</p>
            </div>
            {version.estimateNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t("proposalVersion.qbEstimate")}</p>
                <p className="font-medium" data-testid="text-estimate-number">#{version.estimateNumber}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("proposalVersion.finalizedBy")}</p>
              <p className="font-medium" data-testid="text-finalized-by">
                {version.finalizedByName ?? t("common.unknown")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("proposalVersion.finalizedOn")}</p>
              <p className="font-medium" data-testid="text-finalized-at">
                {formatDateTime(version.finalizedAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("proposalVersion.pdfDocument")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t("proposalVersion.immutableCopy")}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => window.open(previewUrl, '_blank')}
              data-testid="button-preview-version-pdf"
            >
              <Eye className="w-4 h-4 mr-2" />
              {t("proposals.previewPdf")}
            </Button>
            <a href={downloadUrl} download data-testid="button-download-version-pdf">
              <Button>
                <Download className="w-4 h-4 mr-2" />
                {t("proposals.downloadPdf")}
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {version.vsCombinedPath && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Map className="w-4 h-4" />
              {t("proposalVersion.visualScopeSnapshot")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {version.visualScopeTitle && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{t("proposalVersion.sheetTitle")}</p>
                  <p className="font-medium" data-testid="text-vs-snapshot-title">{version.visualScopeTitle}</p>
                </div>
              )}
              {version.visualScopeDate && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{t("proposalVersion.scopeDate")}</p>
                  <p className="font-medium" data-testid="text-vs-snapshot-date">{formatDate(version.visualScopeDate)}</p>
                </div>
              )}
              {version.vsFrozenAt && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{t("proposalVersion.frozenAt")}</p>
                  <p className="font-medium" data-testid="text-vs-frozen-at">{formatDateTime(version.vsFrozenAt)}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("proposalVersion.frozenSnapshots")}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/proposals/${id}/versions/${versionId}/visual-scope/combined?inline=1`, "_blank")}
                data-testid="button-preview-vs-combined"
              >
                <Eye className="w-4 h-4 mr-2" /> {t("proposalVersion.previewCombined")}
              </Button>
              <a href={`/api/proposals/${id}/versions/${versionId}/visual-scope/combined`} download data-testid="button-download-vs-combined">
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" /> {t("proposalVersion.downloadCombined")}
                </Button>
              </a>
              {version.vsBasePath && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/proposals/${id}/versions/${versionId}/visual-scope/base?inline=1`, "_blank")}
                    data-testid="button-preview-vs-base"
                  >
                    <Eye className="w-4 h-4 mr-2" /> {t("proposalVersion.previewBase")}
                  </Button>
                  <a href={`/api/proposals/${id}/versions/${versionId}/visual-scope/base`} download data-testid="button-download-vs-base">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" /> {t("proposalVersion.downloadBase")}
                    </Button>
                  </a>
                </>
              )}
              {version.vsOverlayPath && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/proposals/${id}/versions/${versionId}/visual-scope/overlay?inline=1`, "_blank")}
                    data-testid="button-preview-vs-overlay"
                  >
                    <Eye className="w-4 h-4 mr-2" /> {t("proposalVersion.previewOverlay")}
                  </Button>
                  <a href={`/api/proposals/${id}/versions/${versionId}/visual-scope/overlay`} download data-testid="button-download-vs-overlay">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" /> {t("proposalVersion.downloadOverlay")}
                    </Button>
                  </a>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("proposalVersion.proposalDraft")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("proposalVersion.draftEditable", { next: version.versionNumber + 1 })}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => navigate(`/dashboard/tools/proposals/${id}`)}
              data-testid="button-back-to-draft"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("proposalVersion.backToDraft")}
            </Button>
            <Button
              onClick={() => navigate(`/dashboard/tools/proposals/${id}`)}
              data-testid="button-create-new-version"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("proposalVersion.createNewVersion")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {otherVersions.length > 0 && (
        <Card data-testid="div-other-versions">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              {t("proposalVersion.otherVersions")}
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
