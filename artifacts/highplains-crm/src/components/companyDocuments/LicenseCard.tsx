import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Link2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  companyDocumentErrorText, companyDocumentsUrl, companyRequest, formatDocDate,
  useInvalidateCompanyDocuments, type CompanyDocumentsResponse,
} from "./companyDocumentsApi";

interface Props {
  companyId: string;
  canManage: boolean;
  license: CompanyDocumentsResponse["license"];
  onUploadLicense: () => void;
  onOpenLicense: (id: string) => void;
}

export function LicenseCard({ companyId, canManage, license, onUploadLicense, onOpenLicense }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const invalidate = useInvalidateCompanyDocuments(companyId);
  const [number, setNumber] = useState(license.number ?? "");
  const [expires, setExpires] = useState(license.expiresOn ?? "");
  const [saving, setSaving] = useState<"number" | "expires" | null>(null);
  const editingNumber = useRef(false);

  // Follow server truth unless the user is mid-edit.
  useEffect(() => { if (!editingNumber.current) setNumber(license.number ?? ""); }, [license.number]);
  useEffect(() => { setExpires(license.expiresOn ?? ""); }, [license.expiresOn, license.documentId]);

  const { data: chemTemplates = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/chemical-notification-templates", companyId],
    queryFn: async () => (await companyRequest(companyId, "GET", "/api/chemical-notification-templates")).json(),
    enabled: canManage,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const templatesNeedLicense = canManage && !(license.number ?? "").trim() &&
    chemTemplates.length > 0;

  const fail = (err: unknown) => toast({ title: t("companyDocuments.errors.title"), description: companyDocumentErrorText(err, t), variant: "destructive" });

  const saveNumber = async () => {
    const next = number.trim();
    if (next === (license.number ?? "")) { editingNumber.current = false; return; }
    setSaving("number");
    try {
      await companyRequest(companyId, "PUT", companyDocumentsUrl.license, { number: next || null });
      editingNumber.current = false;
      await invalidate();
      toast({ title: t("companyDocuments.license.numberSaved") });
    } catch (err) { fail(err); } finally { setSaving(null); }
  };

  const saveExpires = async () => {
    if (!license.documentId || (expires || null) === license.expiresOn) return;
    setSaving("expires");
    try {
      await companyRequest(companyId, "PATCH", companyDocumentsUrl.doc(license.documentId), { expiresOn: expires || null });
      await invalidate();
      toast({ title: t("companyDocuments.license.expiresSaved") });
    } catch (err) { fail(err); setExpires(license.expiresOn ?? ""); } finally { setSaving(null); }
  };

  return (
    <Card className="lg:sticky lg:top-4" data-testid="card-company-licenses">
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px]">{t("companyDocuments.license.title")}</CardTitle>
        <CardDescription className="text-[12.5px]">{t("companyDocuments.license.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3.5">
        <div className="space-y-1">
          <Label htmlFor="cd-license-number" className="text-[12.5px] font-semibold">{t("companyDocuments.license.number")}</Label>
          {canManage ? (
            <div className="flex gap-2">
              <Input id="cd-license-number" value={number} maxLength={50} placeholder={t("companyDocuments.license.numberPlaceholder")}
                onChange={e => { editingNumber.current = true; setNumber(e.target.value); }}
                onKeyDown={e => { if (e.key === "Enter") void saveNumber(); }}
                data-testid="input-company-license-number" />
              <Button onClick={saveNumber} disabled={saving === "number" || number.trim() === (license.number ?? "")} data-testid="button-save-company-license-number">
                {saving === "number" ? t("companyDocuments.actions.saving") : t("companyDocuments.actions.save")}
              </Button>
            </div>
          ) : (
            <div className="text-base font-semibold tracking-wide" data-testid="text-company-license-number">
              {license.number || <span className="text-sm font-normal text-muted-foreground">{t("companyDocuments.license.notFilled")}</span>}
            </div>
          )}
          {templatesNeedLicense && (
            <div className="mt-1.5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300" data-testid="warning-company-license-templates">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{t("companyDocuments.license.templateWarning")}</span>
            </div>
          )}
        </div>

        {/* The expiration has one owner: the license document. Field roles never see it unless the API returns that document. */}
        {license.documentId ? (
          <div className="space-y-1">
            <Label htmlFor="cd-license-expires" className="text-[12.5px] font-semibold">{t("companyDocuments.license.expires")}</Label>
            {canManage ? (
              <Input id="cd-license-expires" type="date" value={expires} onChange={e => setExpires(e.target.value)} onBlur={saveExpires}
                disabled={saving === "expires"} data-testid="input-company-license-expires" />
            ) : (
              <div data-testid="text-company-license-expires">{formatDocDate(license.expiresOn, i18n.language) ?? t("companyDocuments.status.none")}</div>
            )}
            <p className="text-xs text-muted-foreground">{t("companyDocuments.license.expiresHint")}</p>
          </div>
        ) : canManage ? (
          <div className="space-y-2 rounded-lg border border-dashed p-3" data-testid="empty-company-license-document">
            <p className="text-[13px] text-muted-foreground">{t("companyDocuments.license.uploadToTrack")}</p>
            <Button size="sm" variant="outline" onClick={onUploadLicense} data-testid="button-upload-company-license">
              <Upload className="h-3.5 w-3.5" />{t("companyDocuments.license.uploadButton")}
            </Button>
          </div>
        ) : null}

        <div className="flex items-start gap-1.5 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          <Link2 className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <div>
            {t("companyDocuments.license.usedIn")}
            {license.documentId && (
              <>{" "}<button type="button" className="font-semibold text-[hsl(var(--rail-heading))] hover:underline" onClick={() => onOpenLicense(license.documentId!)} data-testid="link-open-company-license">
                {t("companyDocuments.license.openFile")}
              </button></>
            )}
          </div>
        </div>
        <p className="text-[12.5px] text-muted-foreground">{t("companyDocuments.license.footnote")}</p>
      </CardContent>
    </Card>
  );
}
