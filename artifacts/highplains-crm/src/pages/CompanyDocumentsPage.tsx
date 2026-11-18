import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileText, Info, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyDocumentAccess } from "@/components/companyDocuments/bits";
import { DocumentsTable, PinnedTiles } from "@/components/companyDocuments/DocumentsTable";
import { DocumentDrawer } from "@/components/companyDocuments/DocumentDrawer";
import { DocumentFormDialog, type FormMode, type UploadPreset } from "@/components/companyDocuments/DocumentFormDialog";
import { LicenseCard } from "@/components/companyDocuments/LicenseCard";
import { EmailDocumentsDialog } from "@/components/companyDocuments/EmailDocumentsDialog";
import {
  companyDocumentErrorText, formatDocDate, soonestAttention, useCompanyDocuments,
} from "@/components/companyDocuments/companyDocumentsApi";

const STARTERS: { key: string; preset: UploadPreset }[] = [
  { key: "w9", preset: { category: "tax" } },
  { key: "license", preset: { category: "licenses", role: "pesticide_license" } },
  { key: "gl", preset: { category: "insurance" } },
  { key: "wc", preset: { category: "insurance" } },
  { key: "auto", preset: { category: "insurance" } },
];

export default function CompanyDocumentsPage() {
  const { t, i18n } = useTranslation();
  const { canManage, companyId } = useCompanyDocumentAccess();
  const query = useCompanyDocuments(companyId);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<FormMode | null>(null);
  const [emailIds, setEmailIds] = useState<string[] | null>(null);
  useEffect(() => { setSearch(""); setOpenId(null); setForm(null); setEmailIds(null); }, [companyId]);

  const docs = query.data?.documents ?? [];
  const license = query.data?.license ?? { number: null, documentId: null, expiresOn: null };
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? docs.filter(d => d.name.toLowerCase().includes(q)) : docs;
  }, [docs, search]);
  const pinned = docs.filter(d => d.pinned);
  const soonest = canManage ? soonestAttention(docs) : null;
  const openDoc = docs.find(d => d.id === openId) ?? null;
  const upload = (preset?: UploadPreset) => setForm({ kind: "upload", preset });

  return (
    <div className="mx-auto max-w-[1180px]" data-testid="page-company-documents">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{t("companyDocuments.title")}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t("companyDocuments.subtitle")}</p>
        </div>
        <div className="flex-1" />
        {canManage && (
          <div className="flex gap-2" data-testid="actions-company-documents">
            <Button variant="outline" onClick={() => setEmailIds([])}>{t("companyDocuments.email.title")}</Button>
            <Button onClick={() => upload()} data-testid="button-upload-company-document"><Upload className="h-4 w-4" />{t("companyDocuments.actions.upload")}</Button>
          </div>
        )}
      </div>

      {soonest && (
        <div className="mb-3.5 flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.07)] px-3 py-2.5 text-[12.5px] text-[hsl(var(--warning))]" role="status" data-testid="banner-company-documents-expiry">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <div>
            <b>{soonest.name}</b>{" "}
            {(soonest.daysUntilExpiry ?? 0) < 0
              ? t("companyDocuments.banner.expired", { date: formatDocDate(soonest.expiresOn, i18n.language), count: -(soonest.daysUntilExpiry ?? 0) })
              : t("companyDocuments.banner.expiring", { date: formatDocDate(soonest.expiresOn, i18n.language), count: soonest.daysUntilExpiry ?? 0 })}{" "}
            {t("companyDocuments.banner.renew")}
          </div>
        </div>
      )}
      {!canManage && (
        <div className="mb-3.5 flex items-start gap-2 rounded-lg border bg-muted/60 px-3 py-2.5 text-[12.5px] text-muted-foreground" data-testid="notice-company-documents-field">
          <Info className="mt-0.5 h-4 w-4 flex-none" />
          <div>{t("companyDocuments.fieldNotice")}</div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 min-[1040px]:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          {query.isLoading ? (
            <div className="space-y-3" data-testid="loading-company-documents">
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[104px] rounded-[10px]" />)}</div>
              <Skeleton className="h-9 w-56" /><Skeleton className="h-64 w-full rounded-[10px]" />
            </div>
          ) : query.isError ? (
            <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-5 text-sm" role="alert" data-testid="error-company-documents">
              <p className="mb-3 text-destructive">{companyDocumentErrorText(query.error, t)}</p>
              <Button variant="outline" size="sm" onClick={() => query.refetch()} data-testid="button-retry-company-documents">{t("companyDocuments.actions.retry")}</Button>
            </div>
          ) : docs.length === 0 ? (
            <div className="rounded-[10px] border border-dashed bg-card px-6 py-8" data-testid="empty-company-documents">
              <FileText className="mb-2 h-6 w-6 text-[hsl(var(--rail-heading))]" />
              <h2 className="text-[15px] font-semibold">{t("companyDocuments.empty.title")}</h2>
              <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{t(canManage ? "companyDocuments.empty.manage" : "companyDocuments.empty.field")}</p>
              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {STARTERS.map(s => (
                    <Button key={s.key} variant="outline" size="sm" onClick={() => upload({ ...s.preset, name: t(`companyDocuments.starters.${s.key}`) })} data-testid={`button-starter-${s.key}`}>
                      <Upload className="h-3.5 w-3.5" />{t(`companyDocuments.starters.${s.key}`)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <PinnedTiles docs={pinned} onOpen={setOpenId} />
              <div className="mb-2.5 mt-1 flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t("companyDocuments.search")}
                    aria-label={t("companyDocuments.search")} className="h-8 w-[240px] pl-8 text-[13px]" data-testid="input-search-company-documents" />
                </div>
                <span className="text-[12.5px] text-muted-foreground" data-testid="text-company-documents-count">{t("companyDocuments.count", { count: filtered.length })}</span>
              </div>
              {filtered.length ? <DocumentsTable docs={filtered} onOpen={setOpenId} onEmail={canManage ? setEmailIds : undefined} />
                : <p className="rounded-[10px] border bg-card px-4 py-6 text-center text-sm text-muted-foreground" data-testid="empty-company-documents-search">{t("companyDocuments.noMatches", { query: search.trim() })}</p>}
            </>
          )}
        </div>

        {companyId && !query.isError && (
          query.isLoading ? <Skeleton className="h-80 rounded-xl" /> :
          <LicenseCard companyId={companyId} canManage={canManage} license={license}
            onUploadLicense={() => upload({ category: "licenses", role: "pesticide_license", name: t("companyDocuments.starters.license") })}
            onOpenLicense={id => setOpenId(id)} />
        )}
      </div>

      {companyId && (
        <>
          <DocumentDrawer doc={openDoc} companyId={companyId} canManage={canManage} onClose={() => setOpenId(null)}
            onEdit={d => setForm({ kind: "edit", doc: d })} onReplace={d => setForm({ kind: "replace", doc: d })}
            onEmail={canManage ? ids => { setOpenId(null); setEmailIds(ids); } : undefined} />
          {canManage && <DocumentFormDialog mode={form} companyId={companyId} licenseDocumentId={license.documentId} onClose={() => setForm(null)} />}
          {canManage && emailIds !== null && <EmailDocumentsDialog key={companyId} companyId={companyId} documents={docs} initialIds={emailIds} onClose={() => setEmailIds(null)} />}
        </>
      )}
    </div>
  );
}
