import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { dateTime, errorText } from "./contractFormat";
import { DocumentViewDialog } from "./DocumentViewDialog";
import type { DetailTerm, TermDocument } from "./contractTypes";

const KIND_LABEL: Record<string, string> = { signed: "Signed copy", their_form: "Their form", other: "Other", review: "Review", clean: "Clean", clarifications: "Clarifications" };

/** Contract Center itself is restricted to admin/office (including super admins). */
export function SeasonDocuments({ term, terms, selectTerm, refresh }: {
  term: DetailTerm; terms: DetailTerm[]; selectTerm: (id: string) => void; refresh: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<TermDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = [...term.documents, ...(term.coveredBy ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
  async function coverage(document: TermDocument, value: string) {
    setBusy(document.id); setError(null);
    try {
      await apiRequest("PATCH", `/api/contract-center/documents/${document.id}/coverage`, { coversThroughTermId: value || null });
      await refresh();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(null); }
  }
  return <>
    {error && <p role="alert" className="text-sm text-destructive" data-testid="error-document-coverage">{error}</p>}
    {!rows.length ? <p className="text-sm text-muted-foreground" data-testid="empty-documents">No files for this season.</p> :
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Kind</th><th>Version</th><th>File</th><th>Date</th><th>Uploaded by</th><th /></tr></thead>
        <tbody>{rows.map(d => <tr key={d.id} className="border-t" data-testid={`row-document-${d.id}`}>
          <td className="p-2">{KIND_LABEL[d.kind] ?? d.kind}</td><td>v{d.version}</td>
          <td className="py-2">{d.filename}
            {d.fromTermId ? <Button size="sm" variant="link" onClick={() => selectTerm(d.fromTermId!)} data-testid={`link-source-season-${d.id}`}>
              {t("contractDocuments.from", { season: d.fromSeasonLabel })}
            </Button> : <label className="block text-xs text-muted-foreground">
              {t("contractDocuments.covers")}{" "}
              <select aria-label={t("contractDocuments.coverageFor", { filename: d.filename })} className="rounded border bg-background p-1"
                data-testid={`select-coverage-${d.id}`} value={d.coversThroughTermId ?? ""} disabled={busy !== null}
                onChange={e => coverage(d, e.target.value)}>
                <option value="">{t("contractDocuments.thisSeason")}</option>
                {terms.filter(target => target.startDate > term.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate)).map(target =>
                  <option key={target.id} value={target.id}>{term.seasonLabel} → {target.seasonLabel}</option>)}
              </select>
              {busy === d.id && <span role="status">{t("contractDocuments.saving")}</span>}
            </label>}
          </td>
          <td>{dateTime(d.createdAt)}</td><td>{d.uploadedByName ?? "\u2014"}</td>
          <td className="whitespace-nowrap">
            <Button size="sm" variant="ghost" onClick={() => setView(d)} data-testid={`button-view-${d.id}`}>{t("contractDocuments.view")}</Button>
            <Button size="sm" variant="ghost" asChild><a href={d.storageObjectPath} download={d.filename} data-testid={`link-download-${d.id}`}>{t("contractDocuments.download")}</a></Button>
          </td>
        </tr>)}</tbody>
      </table></div>}
    <DocumentViewDialog document={view} onClose={() => setView(null)} />
  </>;
}
