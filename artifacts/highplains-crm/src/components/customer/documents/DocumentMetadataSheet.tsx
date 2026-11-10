import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategorySelect } from "./CategorySelect";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import {
  NAME_MAX, NOTE_MAX, documentErrorText, writeCategoryPref,
  type CustomerDocumentCategory, type CustomerDocumentDto,
} from "./documentModel";
import { useDocumentMutations, type DocumentPatch } from "./useCustomerDocuments";

interface Entry { name: string; category: CustomerDocumentCategory; note: string; error?: string; saved?: boolean }

/** Small post-upload confirmation: name (default filename), category, optional note per uploaded file. */
export function DocumentMetadataSheet({ customerId, docs, started, onClose }: {
  customerId: string; docs: CustomerDocumentDto[]; started: string | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { patch, scope } = useDocumentMutations(customerId);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEntries(Object.fromEntries(docs.map(d => [d.id, { name: d.name, category: d.category, note: d.note ?? "" }])));
  }, [docs]);

  const set = (id: string, p: Partial<Entry>) => setEntries(prev => ({ ...prev, [id]: { ...prev[id], ...p, error: undefined } }));
  const invalid = docs.some(d => { const e = entries[d.id]; return !e || !e.name.trim() || e.note.length > NOTE_MAX; });

  const save = async () => {
    if (!started) return;
    setSaving(true);
    let failed = false;
    for (const d of docs) {
      const e = entries[d.id];
      if (!e || e.saved) continue;
      const data: DocumentPatch = {};
      if (e.name.trim() !== d.name) data.name = e.name.trim();
      if (e.category !== d.category) data.category = e.category;
      const note = e.note.trim() ? e.note.trim() : null;
      if (note !== (d.note ?? null)) data.note = note;
      if (!Object.keys(data).length) { setEntries(p => ({ ...p, [d.id]: { ...p[d.id], saved: true } })); continue; }
      try {
        await patch.mutateAsync({ id: d.id, data, started });
        setEntries(p => ({ ...p, [d.id]: { ...p[d.id], saved: true } }));
      } catch (err) {
        failed = true;
        setEntries(p => ({ ...p, [d.id]: { ...p[d.id], error: documentErrorText(err, t) } }));
      }
    }
    const last = docs.length ? entries[docs[docs.length - 1].id]?.category : undefined;
    if (last && scope.snapshot() === started) writeCategoryPref(scope.companyId, scope.userId, last);
    setSaving(false);
    if (!failed) onClose();
  };

  return (
    <Sheet open={docs.length > 0} onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col" data-testid="sheet-document-metadata">
        <SheetHeader>
          <SheetTitle>{t("cp5.documents.sheet.title", { count: docs.length })}</SheetTitle>
          <SheetDescription>{t("cp5.documents.sheet.description")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-5 py-4 pr-1">
          {docs.map((d, idx) => {
            const e = entries[d.id];
            if (!e) return null;
            return (
              <fieldset key={d.id} className="space-y-3 rounded-[10px] border p-3" data-testid={`metadata-entry-${d.id}`} disabled={saving || e.saved}>
                <legend className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <DocumentTypeIcon doc={d} className="h-3.5 w-3.5" />{t("cp5.documents.sheet.fileN", { n: idx + 1 })}
                </legend>
                <div className="space-y-1.5">
                  <Label htmlFor={`doc-name-${d.id}`}>{t("cp5.documents.fields.name")}</Label>
                  <Input id={`doc-name-${d.id}`} value={e.name} maxLength={NAME_MAX} onChange={ev => set(d.id, { name: ev.target.value })} data-testid={`input-doc-name-${d.id}`} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`doc-cat-${d.id}`}>{t("cp5.documents.fields.category")}</Label>
                  <CategorySelect id={`doc-cat-${d.id}`} value={e.category} onChange={c => set(d.id, { category: c })} testId={`select-doc-category-${d.id}`} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`doc-note-${d.id}`}>{t("cp5.documents.fields.noteOptional")}</Label>
                  <Textarea id={`doc-note-${d.id}`} rows={2} value={e.note} maxLength={NOTE_MAX} onChange={ev => set(d.id, { note: ev.target.value })} data-testid={`input-doc-note-${d.id}`} />
                </div>
                {e.error && <p role="alert" className="text-xs text-destructive" data-testid={`text-metadata-error-${d.id}`}>{e.error}</p>}
              </fieldset>
            );
          })}
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} data-testid="button-metadata-skip">{t("cp5.documents.sheet.keep")}</Button>
          <Button onClick={() => void save()} disabled={saving || invalid} data-testid="button-metadata-save">
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
