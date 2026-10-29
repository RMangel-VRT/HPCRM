import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TermDocument } from "./contractTypes";

export function DocumentViewDialog({ document, onClose }: { document: TermDocument | null; onClose: () => void }) {
  const { t } = useTranslation();
  const pdf = document?.mimeType === "application/pdf";
  const image = document?.mimeType.startsWith("image/");
  return <Dialog open={!!document} onOpenChange={open => { if (!open) onClose(); }}>
    {document && <DialogContent className="max-w-5xl h-[90vh] flex flex-col" data-testid="dialog-document-view">
      <DialogHeader>
        <DialogTitle className="break-all">{document.filename}</DialogTitle>
        <DialogDescription>{t("contractDocuments.preview")}</DialogDescription>
      </DialogHeader>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center">
        {pdf ? <iframe title={document.filename} src={document.storageObjectPath} className="w-full h-full border-0" />
          : image ? <img src={document.storageObjectPath} alt={document.filename} className="max-w-full max-h-full object-contain" />
          : <p data-testid="text-document-no-preview">{t("contractDocuments.noPreview")}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" asChild><a href={document.storageObjectPath} target="_blank" rel="noopener noreferrer">{t("contractDocuments.openNewTab")}</a></Button>
        <Button asChild><a href={document.storageObjectPath} download={document.filename}>{t("contractDocuments.download")}</a></Button>
      </DialogFooter>
    </DialogContent>}
  </Dialog>;
}
