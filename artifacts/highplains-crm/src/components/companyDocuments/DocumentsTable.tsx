import { useTranslation } from "react-i18next";
import { Download, Star, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileTile, StatusChip } from "./bits";
import { CATEGORIES, formatDocDate, shortName, type CompanyDocumentDto } from "./companyDocumentsApi";

export function DocumentsTable({ docs, onOpen, onEmail }: { docs: CompanyDocumentDto[]; onOpen: (id: string) => void; onEmail?: (ids: string[]) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div className="overflow-auto rounded-[10px] border border-[hsl(var(--table-border))] bg-background">
      <Table data-testid="table-company-documents">
        <TableHeader>
          <TableRow className="bg-[hsl(var(--table-header))] hover:bg-[hsl(var(--table-header))]">
            <TableHead>{t("companyDocuments.table.document")}</TableHead>
            <TableHead>{t("companyDocuments.table.status")}</TableHead>
            <TableHead>{t("companyDocuments.table.expires")}</TableHead>
            <TableHead>{t("companyDocuments.table.updated")}</TableHead>
            <TableHead className="text-right"><span className="sr-only">{t("companyDocuments.table.actions")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {CATEGORIES.map(cat => {
            const rows = docs.filter(d => d.category === cat);
            if (!rows.length) return null;
            return [
              <TableRow key={`g-${cat}`} className="hover:bg-transparent" data-testid={`group-company-documents-${cat}`}>
                <TableCell colSpan={5} className="bg-card py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[hsl(var(--rail-heading))]">
                  {t(`companyDocuments.categories.${cat}`)}
                </TableCell>
              </TableRow>,
              ...rows.map(d => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => onOpen(d.id)} data-testid={`row-company-document-${d.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-semibold">
                      {d.pinned && <Star className="h-3.5 w-3.5 flex-none fill-amber-500 text-amber-500" aria-label={t("companyDocuments.pinned")} />}
                      <span data-testid={`text-company-document-name-${d.id}`}>{d.name}</span>
                    </div>
                    <div className="mt-px text-xs text-muted-foreground">
                      {d.currentFile?.fileName ?? t("companyDocuments.noFile")}
                      {d.visibility === "everyone" && <> · {t("companyDocuments.visibility.everyoneShort")}</>}
                    </div>
                  </TableCell>
                  <TableCell><StatusChip doc={d} /></TableCell>
                  <TableCell className="whitespace-nowrap">{formatDocDate(d.expiresOn, lang) ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDocDate(d.currentFile?.uploadedAt ?? d.updatedAt, lang)}
                    {d.currentFile?.uploadedByName && <div className="text-xs text-muted-foreground">{d.currentFile.uploadedByName}</div>}
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8" title={t("companyDocuments.actions.download")}>
                      <a href={d.downloadUrl} aria-label={t("companyDocuments.actions.downloadNamed", { name: d.name })} data-testid={`button-download-company-document-${d.id}`}>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {onEmail && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEmail([d.id])}
                      aria-label={t("companyDocuments.email.title")}><Mail className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>
              )),
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function PinnedTiles({ docs, onOpen }: { docs: CompanyDocumentDto[]; onOpen: (id: string) => void }) {
  if (!docs.length) return null;
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4" data-testid="pinned-company-documents">
      {docs.map(d => <PinnedTile key={d.id} doc={d} onOpen={onOpen} />)}
    </div>
  );
}

function PinnedTile({ doc, onOpen }: { doc: CompanyDocumentDto; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(doc.id)} data-testid={`tile-company-document-${doc.id}`}
      className="flex min-h-[104px] flex-col gap-1.5 rounded-[10px] border bg-background p-3 text-left transition-shadow hover:border-[hsl(var(--input))] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-center gap-2">
        <FileTile fileName={doc.currentFile?.fileName} fileType={doc.currentFile?.fileType} />
        <b className="text-[13.5px] leading-tight">{shortName(doc.name)}</b>
      </div>
      <div className="mt-auto"><StatusChip doc={doc} /></div>
    </button>
  );
}
