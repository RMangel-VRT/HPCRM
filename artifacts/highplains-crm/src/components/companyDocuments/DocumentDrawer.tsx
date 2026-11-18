import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, Download, Pencil, RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Chip, StatusChip } from "./bits";
import { DocumentSendHistory } from "./EmailDocumentsDialog";
import { DocumentPreview } from "./DocumentPreview";
import {
  companyDocumentErrorText, companyDocumentsUrl, companyRequest, formatDocDate,
  useCompanyDocumentFiles, useInvalidateCompanyDocuments, type CompanyDocumentDto,
} from "./companyDocumentsApi";

interface Props {
  doc: CompanyDocumentDto | null;
  companyId: string;
  canManage: boolean;
  onClose: () => void;
  onEdit: (doc: CompanyDocumentDto) => void;
  onReplace: (doc: CompanyDocumentDto) => void;
  onEmail?: (ids: string[]) => void;
}

export function DocumentDrawer({ doc, companyId, canManage, onClose, onEdit, onReplace, onEmail }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();
  const invalidate = useInvalidateCompanyDocuments(companyId);
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const files = useCompanyDocumentFiles(companyId, doc?.id ?? null, canManage && !!doc);

  const remove = async () => {
    if (!doc) return;
    setRemoving(true);
    try {
      await companyRequest(companyId, "DELETE", companyDocumentsUrl.doc(doc.id));
      await invalidate();
      toast({ title: t("companyDocuments.toast.removed") });
      setConfirm(false); onClose();
    } catch (err) {
      toast({ title: t("companyDocuments.errors.title"), description: companyDocumentErrorText(err, t), variant: "destructive" });
    } finally { setRemoving(false); }
  };

  const days = doc?.daysUntilExpiry;
  return (
    <>
      <Sheet open={!!doc} onOpenChange={o => { if (!o) onClose(); }}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[540px]" data-testid="drawer-company-document">
          {doc && (
            <>
              <SheetHeader className="space-y-2 border-b px-5 pb-3.5 pt-5 text-left">
                <SheetTitle className="pr-6 text-lg">{doc.name}</SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusChip doc={doc} />
                    <Chip>{t(`companyDocuments.categories.${doc.category}`)}</Chip>
                    <Chip testId="chip-company-document-visibility">{t(doc.visibility === "everyone" ? "companyDocuments.visibility.everyoneShort" : "companyDocuments.visibility.officeShort")}</Chip>
                  </div>
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
                <DocumentPreview key={`${companyId}:${doc.id}:${doc.currentFile?.uploadedAt}`} doc={doc} companyId={companyId} />

                <dl className="mb-4 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                  <dt className="text-muted-foreground">{t("companyDocuments.drawer.file")}</dt>
                  <dd className="break-all">{doc.currentFile?.fileName ?? "—"}</dd>
                  <dt className="text-muted-foreground">{t("companyDocuments.drawer.expires")}</dt>
                  <dd data-testid="text-drawer-expires">
                    {doc.expiresOn ? <>{formatDocDate(doc.expiresOn, lang)}{days != null && <span className="text-muted-foreground"> · {days < 0 ? t("companyDocuments.drawer.daysAgo", { count: -days }) : t("companyDocuments.drawer.daysLeft", { count: days })}</span>}</> : t("companyDocuments.status.none")}
                  </dd>
                  <dt className="text-muted-foreground">{t("companyDocuments.drawer.uploaded")}</dt>
                  <dd>{formatDocDate(doc.currentFile?.uploadedAt ?? doc.updatedAt, lang)}{doc.currentFile?.uploadedByName && <> · {doc.currentFile.uploadedByName}</>}</dd>
                </dl>

                {canManage && (
                  <section data-testid="section-company-document-history">
                    <h3 className="mb-1 mt-4 text-[13px] font-semibold">{t("companyDocuments.drawer.earlier")}</h3>
                    <p className="mb-2 text-xs text-muted-foreground">{t("companyDocuments.drawer.earlierNote")}</p>
                    {files.isLoading ? <Skeleton className="h-16 w-full" />
                      : files.isError ? <p className="text-sm text-destructive">{companyDocumentErrorText(files.error, t)} <button className="underline" onClick={() => files.refetch()}>{t("companyDocuments.actions.retry")}</button></p>
                      : (files.data ?? []).map(f => (
                        <div key={f.id} className="flex items-center gap-2.5 border-b py-1.5 text-[13px] last:border-b-0" data-testid={`row-company-document-file-${f.id}`}>
                          <span className="min-w-0 truncate">{f.fileName}</span>
                          {f.isCurrent && <Chip>{t("companyDocuments.drawer.current")}</Chip>}
                          <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{formatDocDate(f.uploadedAt, lang)}</span>
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <a href={f.downloadUrl} aria-label={t("companyDocuments.actions.downloadNamed", { name: f.fileName })}><Download className="h-3.5 w-3.5" /></a>
                          </Button>
                        </div>
                      ))}
                  </section>
                )}
                {canManage && onEmail && <DocumentSendHistory companyId={companyId} documentId={doc.id} />}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">
                {canManage && (
                  <>
                    <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => setConfirm(true)} data-testid="button-remove-company-document">
                      <Archive className="h-4 w-4" />{t("companyDocuments.actions.remove")}
                    </Button>
                    <Button variant="outline" onClick={() => onEdit(doc)} data-testid="button-edit-company-document"><Pencil className="h-4 w-4" />{t("companyDocuments.actions.edit")}</Button>
                    <Button variant="outline" onClick={() => onReplace(doc)} data-testid="button-replace-company-document"><RefreshCw className="h-4 w-4" />{t("companyDocuments.actions.replace")}</Button>
                    {onEmail && <Button variant="outline" onClick={() => onEmail([doc.id])}>{t("companyDocuments.email.title")}</Button>}
                  </>
                )}
                <Button asChild>
                  <a href={doc.downloadUrl} data-testid="button-drawer-download-company-document"><Download className="h-4 w-4" />{t("companyDocuments.actions.download")}</a>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companyDocuments.remove.title", { name: doc?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("companyDocuments.remove.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>{t("companyDocuments.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void remove(); }} disabled={removing} data-testid="button-confirm-remove-company-document">
              {t("companyDocuments.actions.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
