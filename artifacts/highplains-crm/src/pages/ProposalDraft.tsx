import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Download, Eye, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { OLD_PROPOSALS_PATH, PROPOSALS_API, ProposalRetiredNotice, useProposalHistory } from "@/components/proposals/ProposalHistory";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { scopeOf } from "@/lib/estimateSettings";
import { ESTIMATE_BUILDER_PATH, errorStatus, formatCalendarDate } from "@/lib/estimateBuilder";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { apiRequest } from "@/lib/queryClient";

interface HistoryFile { id: string; filename: string; fileType: string; storageObjectPath: string }
interface HistoryVersion { id: string; versionNumber: number; proposalDate: string }

// Keep the historic draft route, including links created before retirement.
export default function ProposalDraft() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  return <ProposalViewer key={`${scopeOf(user)}|${id}`} id={id} companyId={user?.activeCompanyId ?? ""} />;
}

function ProposalViewer({ id, companyId }: { id: string; companyId: string }) {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const mounted = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const history = useProposalHistory(id);
  const proposal = history.data;
  const viewPath = `${OLD_PROPOSALS_PATH}/${encodeURIComponent(id)}`;
  const apiPath = `${PROPOSALS_API}/${encodeURIComponent(id)}`;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!proposal?.title) return;
    const original = document.title;
    document.title = `${proposal.title} | High Plains Property Maintenance`;
    return () => { document.title = original; };
  }, [proposal?.title]);

  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", apiPath, undefined, { headers: companyHeaders(companyId) }),
    onSuccess: () => {
      // Do not refetch the deleted viewer before navigating away.
      void qc.invalidateQueries({ queryKey: [PROPOSALS_API], predicate: q => q.queryKey[1] !== id });
      if (proposal?.customerId) void qc.invalidateQueries({ queryKey: ["/api/customers", proposal.customerId, "proposals"] });
      if (proposal?.ticketId) void qc.invalidateQueries({ queryKey: ["/api/tickets", proposal.ticketId, "proposals"] });
      if (mounted.current) navigate(OLD_PROPOSALS_PATH, { replace: true });
      qc.removeQueries({ queryKey: [PROPOSALS_API, id] });
    },
    onError: () => { if (mounted.current) toast({ title: t("proposals.history.deleteError"), variant: "destructive" }); },
  });

  const back = <Link href={OLD_PROPOSALS_PATH} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-to-proposals">
    <ArrowLeft className="h-4 w-4" />{t("proposals.history.title")}
  </Link>;

  if (history.isPending) return <div className="space-y-4 p-6">{back}<Skeleton className="h-32 w-full" /></div>;
  if (history.isError || !proposal) return <div className="space-y-4 p-6">{back}<p role="alert">{
    errorStatus(history.error) === 404 ? t("proposalVersion.proposalNotFound") : t("proposals.history.loadError")
  }</p></div>;

  const attachments = proposal.files as HistoryFile[];
  const versions = [...proposal.versions as HistoryVersion[]].sort((a, b) => b.versionNumber - a.versionNumber);
  const issued = proposal.status === "finalized" || proposal.status === "published";
  const draftSource = !!proposal.estimateId || attachments.some(file => file.fileType === "estimate_pdf");
  const showingStored = issued || !draftSource;
  const latest = versions[0];
  const versionDownload = (versionId: string) => `${apiPath}/versions/${encodeURIComponent(versionId)}/download`;
  const pdf = showingStored ? (latest ? versionDownload(latest.id) : undefined) : `${apiPath}/pdf`;
  const status = issued ? proposal.status : "draft";

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6" data-testid="page-proposal-draft">
      <nav className="flex flex-wrap gap-x-4 gap-y-2">
        {back}
        {proposal.ticketId && <Link href={`/dashboard/tickets/${encodeURIComponent(proposal.ticketId)}`} className="text-sm text-primary underline" data-testid="link-back-to-ticket">{t("proposals.backToTicket")}</Link>}
      </nav>
      <ProposalRetiredNotice />
      <header className="space-y-3 rounded-md border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold" data-testid="text-proposal-title">{proposal.title}</h1>
          {proposal.proposalNumber && <span className="font-mono text-sm text-muted-foreground">{proposal.proposalNumber}</span>}
          <Badge variant="outline">{t(`statuses.${status}`)}</Badge>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-muted-foreground">{t("common.customer")}</dt><dd><Link href={`/dashboard/customers/${encodeURIComponent(proposal.customerId)}`} className="hover:underline">{proposal.customerName || "—"}</Link></dd></div>
          <div><dt className="text-muted-foreground">{t("common.date")}</dt><dd>{formatCalendarDate(proposal.proposalDate, i18n.language) || "—"}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {pdf && <>
            <Button asChild size="sm" variant="outline"><a href={`${pdf}?inline=1`} target="_blank" rel="noopener" data-testid="button-preview-pdf"><Eye className="mr-2 h-4 w-4" />{t("proposals.previewPdf")}</a></Button>
            <Button asChild size="sm" variant="outline"><a href={pdf} download data-testid="button-download-pdf"><Download className="mr-2 h-4 w-4" />{t("proposals.downloadPdf")}</a></Button>
          </>}
          <Button size="sm" variant="outline" className="text-destructive" disabled={remove.isPending} onClick={() => setConfirm(true)} data-testid="button-delete-proposal"><Trash2 className="mr-2 h-4 w-4" />{t("proposals.deleteProposal")}</Button>
          <Link href={ESTIMATE_BUILDER_PATH} className="ml-auto text-sm text-primary underline underline-offset-2">{t("proposals.history.goToEstimates")}</Link>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-proposal-preview-kind">{t(!pdf ? "proposals.history.noPdf" : showingStored ? "proposals.history.storedPdf" : "proposals.history.draftPdf")}</p>
      </header>

      {!proposal.estimateId && proposal.scopeOfWork && <section className="rounded-md border p-4">
        <h2 className="text-sm font-semibold">{t("proposals.scopeOfWork")}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm">{proposal.scopeOfWork}</p>
      </section>}

      {attachments.length > 0 && <section className="rounded-md border p-4" data-testid="proposal-retained-files">
        <h2 className="text-sm font-semibold">{t("proposals.history.savedFiles")}</h2>
        <ul className="mt-2 space-y-2 text-sm">{attachments.map(file => <li key={file.id}>
          <a href={file.storageObjectPath.startsWith("/objects/") ? file.storageObjectPath : `/objects/${file.storageObjectPath.replace(/^\//, "")}`}
            download={file.filename} className="break-all text-primary underline" data-testid={`link-retained-${file.fileType === "estimate_pdf" ? "estimate" : "attachment"}-${file.id}`}>
            {file.filename}
          </a>
        </li>)}</ul>
      </section>}

      {versions.length > 0 && <section className="rounded-md border p-4" data-testid="proposal-version-history">
        <h2 className="text-sm font-semibold">{t("proposals.history.savedVersions")}</h2>
        <ul className="mt-2 divide-y">{versions.map(v => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <Link href={`${viewPath}/versions/${encodeURIComponent(v.id)}`} className="text-primary underline" data-testid={`button-view-version-${v.id}`}>
            {t("proposalVersion.finalizedVersion", { version: v.versionNumber })}
            {v.proposalDate && ` · ${formatCalendarDate(v.proposalDate, i18n.language)}`}
          </Link>
          <Button asChild size="sm" variant="ghost"><a href={versionDownload(v.id)} download data-testid={`button-download-version-${v.id}`}><Download className="mr-2 h-4 w-4" />{t("proposals.downloadPdf")}</a></Button>
        </li>)}</ul>
      </section>}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("proposals.deleteProposal")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ticketDetail.cannotUndo")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-proposal">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate()} data-testid="button-confirm-delete-proposal">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
