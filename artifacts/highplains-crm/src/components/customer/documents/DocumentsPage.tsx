import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Search, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardListSkeleton, PageEmptyState } from "@/components/customer/page";
import { cn } from "@/lib/utils";
import { DocumentRow } from "./DocumentRow";
import { DocumentDeleteDialog, DocumentEditDialog, type EditMode } from "./DocumentEditDialog";
import { DocumentLightbox } from "./DocumentLightbox";
import { DocumentMetadataSheet } from "./DocumentMetadataSheet";
import { ContractDocumentsSection } from "./ContractDocumentsSection";
import { UploadProgressList } from "./UploadProgressList";
import { useContractDocuments, useCustomerDocuments } from "./useCustomerDocuments";
import { useDocumentUploads } from "./useDocumentUploads";
import {
  ACCEPT_ATTR, DOCUMENT_FILTERS, documentKind, matchesSearch, sortDocuments,
  type CustomerDocumentDto, type DocumentFilter,
} from "./documentModel";

interface Props {
  customerId: string;
  /** admin/office from normalized accessRole (account managers resolve to their access role). */
  privileged: boolean;
  /** Increments when the SectionTitle Upload action is pressed. */
  uploadSignal?: number;
}

export default function DocumentsPage({ customerId, privileged, uploadSignal = 0 }: Props) {
  const { t } = useTranslation();
  const docsQ = useCustomerDocuments(customerId);
  const contractsQ = useContractDocuments(customerId, privileged);
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<{ docs: CustomerDocumentDto[]; started: string } | null>(null);
  const [editing, setEditing] = useState<{ doc: CustomerDocumentDto; mode: EditMode } | null>(null);
  const [deleting, setDeleting] = useState<CustomerDocumentDto | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploads = useDocumentUploads(customerId, (docs, started) => setSheet({ docs, started }));

  // Customer switch: drop transient UI.
  useEffect(() => { setFilter("all"); setQ(""); setSheet(null); setEditing(null); setDeleting(null); setLightbox(null); }, [customerId]);
  const lastSignal = useRef(uploadSignal);
  useEffect(() => {
    if (uploadSignal !== lastSignal.current) { lastSignal.current = uploadSignal; if (privileged) inputRef.current?.click(); }
  }, [uploadSignal, privileged]);

  const all = docsQ.data ?? [];
  const contractDocs = privileged ? contractsQ.data ?? [] : [];
  const visible = useMemo(() => {
    if (filter === "contracts") return [];
    const base = filter === "all" ? all : all.filter(d => d.category === filter);
    return sortDocuments(base.filter(d => matchesSearch(q, d.name, d.note)), filter);
  }, [all, filter, q]);
  const visibleContracts = useMemo(() => contractDocs.filter(d => matchesSearch(q, d.filename, d.seasonLabel)), [contractDocs, q]);
  const images = useMemo(() => visible.filter(d => documentKind(d) === "image"), [visible]);

  const open = (d: CustomerDocumentDto) => {
    const kind = documentKind(d);
    if (kind === "image") { setLightbox(Math.max(0, images.findIndex(x => x.id === d.id))); return; }
    window.open(kind === "pdf" ? d.openUrl : d.downloadUrl, "_blank", "noopener,noreferrer");
  };

  const takeFiles = (list: FileList | null | undefined) => {
    const files = list ? Array.from(list) : [];
    if (files.length && privileged) void uploads.start(files);
  };
  const dropProps = privileged ? {
    onDragEnter: (e: React.DragEvent) => { if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); takeFiles(e.dataTransfer?.files); },
  } : {};

  const filters = DOCUMENT_FILTERS.filter(f => f !== "contracts" || privileged);
  const count = (f: DocumentFilter) => f === "all" ? all.length : f === "contracts" ? contractDocs.length : all.filter(d => d.category === f).length;
  const showContracts = privileged && (filter === "all" || filter === "contracts");
  const nothingAtAll = !docsQ.isLoading && !docsQ.error && all.length === 0;

  return (
    <div className="relative space-y-4 min-h-[320px]" data-testid="documents-page" {...dropProps}>
      {privileged && (
        <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden="true"
          data-testid="input-document-files" onChange={e => { takeFiles(e.target.files); e.target.value = ""; }} />
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[12px] border-2 border-dashed border-primary bg-primary/5" data-testid="overlay-document-drop">
          <div className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-medium shadow-sm">
            <UploadCloud className="h-4 w-4 text-primary" aria-hidden="true" />{t("cp5.documents.dropHere")}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label={t("cp5.documents.filterLabel")} className="flex flex-wrap gap-1.5" data-testid="chips-document-filter">
          {filters.map(f => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={cn("h-7 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
              data-testid={`chip-filter-${f}`}>
              {t(`cp5.documents.filters.${f}`)}
              <span className="ml-1 tabular-nums opacity-70">{count(f)}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t("cp5.documents.search")}
            aria-label={t("cp5.documents.search")} className="h-8 pl-8 text-sm" data-testid="input-document-search" />
        </div>
      </div>

      <UploadProgressList items={uploads.items} onDismiss={uploads.dismiss} />

      {filter !== "contracts" && (
        docsQ.isLoading ? <CardListSkeleton /> : docsQ.error ? (
          <div className="flex items-center gap-3 rounded-[10px] border px-3 py-3 text-sm" role="alert" data-testid="error-documents">
            <span className="text-muted-foreground">{t("cp5.documents.loadError")}</span>
            <Button size="sm" variant="outline" onClick={() => void docsQ.refetch()} data-testid="button-retry-documents">{t("cp5.documents.retry")}</Button>
          </div>
        ) : nothingAtAll ? (
          <PageEmptyState icon={FolderOpen} testId="documents-empty"
            message={privileged ? `${t("cp5.documents.empty")} ${t("cp5.documents.emptyHint")}` : t("cp5.documents.empty")} />
        ) : visible.length === 0 ? (
          <p className="rounded-[10px] border border-dashed px-3 py-6 text-center text-sm text-muted-foreground" data-testid="documents-no-match">{t("cp5.documents.noMatch")}</p>
        ) : (
          <ul role="table" aria-label={t("customerPages.pages.documents")} className="rounded-[10px] border bg-card" data-testid="list-documents">
            {visible.map(d => (
              <DocumentRow key={d.id} doc={d} privileged={privileged} onOpen={open}
                onEdit={(doc, mode) => setEditing({ doc, mode })} onDelete={setDeleting} />
            ))}
          </ul>
        )
      )}

      {showContracts && (
        <ContractDocumentsSection docs={visibleContracts} isLoading={contractsQ.isLoading} error={contractsQ.error} onRetry={() => void contractsQ.refetch()} />
      )}

      <DocumentLightbox images={images} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
      {privileged && (
        <>
          <DocumentMetadataSheet customerId={customerId} docs={sheet?.docs ?? []} started={sheet?.started ?? null} onClose={() => setSheet(null)} />
          <DocumentEditDialog customerId={customerId} doc={editing?.doc ?? null} mode={editing?.mode ?? "rename"} onClose={() => setEditing(null)} />
          <DocumentDeleteDialog customerId={customerId} doc={deleting} onClose={() => setDeleting(null)} />
        </>
      )}
    </div>
  );
}
