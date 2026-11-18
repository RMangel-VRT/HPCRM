import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { putWithProgress } from "@/components/customer/documents/useDocumentUploads";
import {
  CATEGORIES, companyDocumentErrorText, companyDocumentsUrl, companyRequest, oneYearFromToday, precheckCompanyFile,
  useInvalidateCompanyDocuments, type CompanyDocumentCategory, type CompanyDocumentDto,
} from "./companyDocumentsApi";

export interface UploadPreset { name?: string; category?: CompanyDocumentCategory; role?: "pesticide_license" | null }
export type FormMode =
  | { kind: "upload"; preset?: UploadPreset }
  | { kind: "edit"; doc: CompanyDocumentDto }
  | { kind: "replace"; doc: CompanyDocumentDto };

interface Props {
  mode: FormMode | null;
  companyId: string;
  /** A live license document already exists (and is not the one being edited). */
  licenseDocumentId: string | null;
  onClose: () => void;
}

export function DocumentFormDialog({ mode, companyId, licenseDocumentId, onClose }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const invalidate = useInvalidateCompanyDocuments(companyId);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CompanyDocumentCategory | "">("");
  const [expiresOn, setExpiresOn] = useState("");
  const [visibility, setVisibility] = useState<"office" | "everyone">("office");
  const [pinned, setPinned] = useState(true);
  const [isLicense, setIsLicense] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameTouched = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = !!mode;
  const modeKey = mode ? (mode.kind === "upload" ? `upload:${mode.preset?.name ?? ""}:${mode.preset?.category ?? ""}` : `${mode.kind}:${mode.doc.id}`) : "";
  useEffect(() => {
    if (!mode) return;
    setFile(null); setError(null); setBusy(false); setProgress(null); nameTouched.current = false;
    if (mode.kind === "upload") {
      setName(mode.preset?.name ?? ""); nameTouched.current = !!mode.preset?.name;
      setCategory(mode.preset?.category ?? ""); setExpiresOn(""); setVisibility(mode.preset?.role ? "everyone" : "office");
      setPinned(true); setIsLicense(mode.preset?.role === "pesticide_license");
    } else if (mode.kind === "edit") {
      const d = mode.doc;
      setName(d.name); setCategory(d.category); setExpiresOn(d.expiresOn ?? ""); setVisibility(d.visibility);
      setPinned(d.pinned); setIsLicense(d.role === "pesticide_license");
    } else {
      setExpiresOn(oneYearFromToday());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKey]);

  const editingDoc = mode && mode.kind !== "upload" ? mode.doc : null;
  const licenseOffered = category === "licenses" && (!licenseDocumentId || licenseDocumentId === editingDoc?.id);
  const needsFile = mode?.kind !== "edit";
  const canSubmit = !busy && (!needsFile || !!file) && (mode?.kind === "replace" || (name.trim() && category));

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const pre = precheckCompanyFile(f);
    if (pre) { setError(t(`companyDocuments.errors.${pre}`)); setFile(null); return; }
    setError(null); setFile(f);
    if (mode?.kind === "upload" && !nameTouched.current) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!mode || !canSubmit) return;
    setBusy(true); setError(null);
    try {
      if (mode.kind === "edit") {
        await companyRequest(companyId, "PATCH", companyDocumentsUrl.doc(mode.doc.id), {
          name: name.trim(), category, expiresOn: expiresOn || null, visibility, pinned,
          role: licenseOffered && isLicense ? "pesticide_license" : null,
        });
      } else {
        const f = file!;
        const urlRes = await companyRequest(companyId, "POST", companyDocumentsUrl.uploadUrl, {
          fileName: f.name, contentType: f.type || undefined, fileSize: f.size,
          ...(mode.kind === "replace" ? { documentId: mode.doc.id } : {}),
        });
        const { uploadURL, uploadToken } = await urlRes.json() as { uploadURL: string; uploadToken: string };
        setProgress(0);
        await putWithProgress(uploadURL, f, setProgress);
        if (mode.kind === "replace") {
          await companyRequest(companyId, "POST", companyDocumentsUrl.files(mode.doc.id), { uploadToken, expiresOn: expiresOn || null });
        } else {
          await companyRequest(companyId, "POST", companyDocumentsUrl.root, {
            uploadToken, name: name.trim(), category, expiresOn: expiresOn || null, visibility, pinned,
            role: licenseOffered && isLicense ? "pesticide_license" : null,
          });
        }
      }
      await invalidate();
      toast({ title: t(`companyDocuments.toast.${mode.kind}`) });
      onClose();
    } catch (err) {
      setError(companyDocumentErrorText(err, t));
      setBusy(false); setProgress(null);
    }
  };

  const title = mode ? t(`companyDocuments.form.title.${mode.kind}`) : "";
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]" data-testid={`dialog-company-document-${mode?.kind ?? "closed"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{editingDoc?.name ?? t("companyDocuments.preview.uploadHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsFile && (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
              className="rounded-[10px] border-[1.5px] border-dashed border-[hsl(var(--input))] bg-card p-5 text-center text-[13px] text-muted-foreground"
            >
              <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic" className="sr-only"
                onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} data-testid="input-company-document-file" />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-foreground" data-testid="text-company-document-picked">
                  <b>{file.name}</b>
                  <button type="button" onClick={() => setFile(null)} aria-label={t("companyDocuments.form.clearFile")} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <>
                  <FileUp className="mx-auto mb-1.5 h-5 w-5" />
                  <span>{t("companyDocuments.form.drop")} </span>
                  <button type="button" className="font-semibold text-[hsl(var(--rail-heading))] underline-offset-2 hover:underline" onClick={() => inputRef.current?.click()} data-testid="button-company-document-browse">
                    {t("companyDocuments.form.browse")}
                  </button>
                  <div className="mt-1 text-xs">{t("companyDocuments.form.fileHint")}</div>
                </>
              )}
              {progress !== null && <Progress value={progress} className="mt-3 h-1.5" />}
            </div>
          )}

          {mode?.kind === "replace" ? (
            <div className="space-y-1">
              <Label htmlFor="cd-replace-exp">{t("companyDocuments.form.newExpiration")}</Label>
              <Input id="cd-replace-exp" type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} data-testid="input-company-document-replace-expires" />
              <p className="text-xs text-muted-foreground" data-testid="hint-company-document-replace">{t("companyDocuments.form.checkCopy")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="cd-name">{t("companyDocuments.form.name")}</Label>
                <Input id="cd-name" value={name} maxLength={255} onChange={e => { nameTouched.current = true; setName(e.target.value); }} data-testid="input-company-document-name" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("companyDocuments.form.category")}</Label>
                  <Select value={category} onValueChange={v => setCategory(v as CompanyDocumentCategory)}>
                    <SelectTrigger data-testid="select-company-document-category"><SelectValue placeholder={t("companyDocuments.form.choose")} /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(`companyDocuments.categories.${c}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cd-exp">{t("companyDocuments.form.expires")}</Label>
                  <Input id="cd-exp" type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} data-testid="input-company-document-expires" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("companyDocuments.form.whoCanSee")}</Label>
                <RadioGroup value={visibility} onValueChange={v => setVisibility(v as "office" | "everyone")} className="gap-1.5">
                  {(["office", "everyone"] as const).map(v => (
                    <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px] ${visibility === v ? "border-primary bg-primary/5" : ""}`}>
                      <RadioGroupItem value={v} className="mt-0.5" data-testid={`radio-company-document-visibility-${v}`} />
                      <span><b className="font-medium">{t(`companyDocuments.visibility.${v}`)}</b><small className="block text-xs text-muted-foreground">{t(`companyDocuments.visibility.${v}Hint`)}</small></span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={pinned} onCheckedChange={v => setPinned(v === true)} data-testid="checkbox-company-document-pinned" />
                {t("companyDocuments.form.pin")}
              </label>
              {licenseOffered && (
                <label className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={isLicense} onCheckedChange={v => setIsLicense(v === true)} data-testid="checkbox-company-document-license" />
                  {t("companyDocuments.form.isLicense")}
                </label>
              )}
            </>
          )}

          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="error-company-document-form">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy} data-testid="button-company-document-cancel">{t("companyDocuments.actions.cancel")}</Button>
          <Button onClick={submit} disabled={!canSubmit} data-testid="button-company-document-submit">
            {busy ? t("companyDocuments.actions.saving") : t(`companyDocuments.form.submit.${mode?.kind ?? "upload"}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
