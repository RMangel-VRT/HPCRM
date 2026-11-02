import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { scopeOf } from "@/lib/estimateSettings";
import { DOCUMENT_FIELDS, type DocumentSettings, type EstimateDetailDto, type EstimateListItemDto } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PdfPreviewDialog } from "@/components/estimates/PdfPreviewDialog";

const API = "/api/settings/documents";
export default function DocumentSettingsCard() {
  const { user } = useAuth();
  const scope = scopeOf(user);
  // Remount form and preview on identity/company/role changes; pending operations keep their captured company.
  return <ScopedDocumentSettings key={scope} companyId={user?.activeCompanyId ?? ""} scope={scope} />;
}
function ScopedDocumentSettings({ companyId, scope }: { companyId: string; scope: string }) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const key = [API, scope];
  const [form, setForm] = useState<DocumentSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<EstimateDetailDto | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const query = useQuery<DocumentSettings>({
    queryKey: key, enabled: !!companyId, staleTime: 0,
    queryFn: async ({ signal }) => (await apiRequest("GET", API, undefined, { headers: companyHeaders(companyId), signal })).json(),
  });
  useEffect(() => { if (query.data && !dirty) setForm(query.data); }, [query.data, dirty]);
  const save = useMutation({
    mutationFn: async (body: DocumentSettings) => (await apiRequest("PATCH", API, body, { headers: companyHeaders(companyId) })).json() as Promise<DocumentSettings>,
    onSuccess: data => { cache.setQueryData(key, data); setForm(data); setDirty(false); void cache.invalidateQueries({ queryKey: key }); },
  });
  async function showPreview() {
    setPreviewBusy(true); setPreviewError(false);
    try {
      const list: EstimateListItemDto[] = await (await apiRequest("GET", "/api/estimates", undefined, { headers: companyHeaders(companyId) })).json();
      if (!list.length) { setPreviewError(true); return; }
      const detail: EstimateDetailDto = await (await apiRequest("GET", `/api/estimates/${encodeURIComponent(list[0].id)}`, undefined, { headers: companyHeaders(companyId) })).json();
      setPreview(detail);
    } catch { setPreviewError(true); } finally { setPreviewBusy(false); }
  }
  return <Card><CardHeader><CardTitle>{t("documents.title")}</CardTitle></CardHeader><CardContent>
    <p className="text-sm text-muted-foreground mb-4">{t("documents.description")}</p>
    {query.isPending ? <p>{t("documents.loading")}</p> : query.isError ? <div role="alert">{t("documents.loadError")} <Button onClick={() => query.refetch()}>{t("documents.retry")}</Button></div> : form && <form onSubmit={event => { event.preventDefault(); save.mutate(form); }} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">{DOCUMENT_FIELDS.map(field => {
        const multiline = ["remitTo", "paymentInstructions", "estimateTerms", "warrantyText", "invoiceFooterNote"].includes(field);
        const props = { id: `document-${field}`, value: form[field], disabled: save.isPending, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setForm({ ...form, [field]: event.target.value }); setDirty(true); },
          maxLength: ["estimateTerms", "warrantyText", "paymentInstructions"].includes(field) ? 8000 : field === "remitTo" ? 4000 : field === "postalCode" ? 40 : field === "state" || field === "phone" ? 100 : field === "city" ? 200 : field === "email" ? 320 : 500 };
        return <div key={field} className={multiline ? "md:col-span-2 space-y-1" : "space-y-1"}><Label htmlFor={props.id}>{t(`documents.fields.${field}`)}</Label>{multiline ? <Textarea {...props} rows={3} /> : <Input {...props} />}</div>;
      })}</div>
      {save.isError && <p role="alert">{t("documents.saveError")}</p>}
      {save.isSuccess && !dirty && <p role="status">{t("documents.saved")}</p>}
      <div className="flex gap-3"><Button type="submit" disabled={!dirty || save.isPending}>{t(save.isPending ? "documents.saving" : "documents.save")}</Button>
        <Button type="button" variant="outline" disabled={dirty || previewBusy || save.isPending} onClick={showPreview}>{t("documents.preview")}</Button></div>
      {dirty && <p className="text-sm text-muted-foreground">{t("documents.saveFirst")}</p>}
      {previewError && <p role="alert">{t("documents.previewError")}</p>}
    </form>}
    {preview && <PdfPreviewDialog open onClose={() => setPreview(null)} companyId={companyId} estimateId={preview.id} versionId={preview.version.id} estimateNumber={preview.estimateNumber} versionNumber={preview.version.versionNumber} draft={preview.version.status === "draft"} />}
  </CardContent></Card>;
}
