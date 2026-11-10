import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CategorySelect } from "./CategorySelect";
import { NAME_MAX, NOTE_MAX, documentErrorText, type CustomerDocumentCategory, type CustomerDocumentDto } from "./documentModel";
import { useDocumentMutations } from "./useCustomerDocuments";

export type EditMode = "rename" | "category" | "note";

export function DocumentEditDialog({ customerId, doc, mode, onClose }: {
  customerId: string; doc: CustomerDocumentDto | null; mode: EditMode; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { patch } = useDocumentMutations(customerId);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CustomerDocumentCategory>("map");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    setName(doc.name); setCategory(doc.category); setNote(doc.note ?? ""); setError(null);
  }, [doc, mode]);

  const submit = () => {
    if (!doc) return;
    const data = mode === "rename" ? { name: name.trim() } : mode === "category" ? { category } : { note: note.trim() ? note.trim() : null };
    patch.mutate({ id: doc.id, data }, {
      onSuccess: () => { toast({ title: t("cp5.documents.toast.updated") }); onClose(); },
      onError: err => setError(documentErrorText(err, t)),
    });
  };
  const invalid = mode === "rename" ? !name.trim() : mode === "note" ? note.length > NOTE_MAX : false;

  return (
    <Dialog open={!!doc} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid={`dialog-document-${mode}`}>
        <DialogHeader>
          <DialogTitle>{t(`cp5.documents.edit.${mode}Title`)}</DialogTitle>
          <DialogDescription className="truncate">{doc?.name}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!invalid) submit(); }}>
          {mode === "rename" && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-edit-name">{t("cp5.documents.fields.name")}</Label>
              <Input id="doc-edit-name" autoFocus value={name} maxLength={NAME_MAX} onChange={e => setName(e.target.value)} data-testid="input-edit-doc-name" />
            </div>
          )}
          {mode === "category" && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-edit-category">{t("cp5.documents.fields.category")}</Label>
              <CategorySelect id="doc-edit-category" value={category} onChange={setCategory} testId="select-edit-doc-category" />
            </div>
          )}
          {mode === "note" && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-edit-note">{t("cp5.documents.fields.note")}</Label>
              <Textarea id="doc-edit-note" rows={3} value={note} maxLength={NOTE_MAX} onChange={e => setNote(e.target.value)} data-testid="input-edit-doc-note" />
              <p className="text-right text-[11px] tabular-nums text-muted-foreground">{note.length}/{NOTE_MAX}</p>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-destructive" data-testid="text-edit-doc-error">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-edit-doc">{t("common.cancel")}</Button>
            <Button type="submit" disabled={invalid || patch.isPending} data-testid="button-save-edit-doc">
              {patch.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentDeleteDialog({ customerId, doc, onClose }: { customerId: string; doc: CustomerDocumentDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { remove } = useDocumentMutations(customerId);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [doc]);
  return (
    <AlertDialog open={!!doc} onOpenChange={o => { if (!o && !remove.isPending) onClose(); }}>
      <AlertDialogContent data-testid="dialog-delete-document">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cp5.documents.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("cp5.documents.delete.body", { name: doc?.name ?? "" })}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive" data-testid="text-delete-doc-error">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending} data-testid="button-cancel-delete-doc">{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={remove.isPending}
            data-testid="button-confirm-delete-doc"
            onClick={e => {
              e.preventDefault();
              if (!doc) return;
              remove.mutate(doc.id, {
                onSuccess: () => { toast({ title: t("cp5.documents.toast.deleted") }); onClose(); },
                onError: err => setError(documentErrorText(err, t)),
              });
            }}>
            {remove.isPending ? t("cp5.documents.delete.deleting") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
