import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Download, Upload, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, companyHeaders, filenameFromDisposition, type HardscapeImportResult } from "@/lib/hardscapeCatalog";
import { QUICK_ITEMS_API, SERVICE_CATEGORIES_API, scopeOf } from "@/lib/estimateSettings";
import { Button } from "@/components/ui/button";
import { quickItemCsvMessage } from "@/lib/quickItemCsv";

type ImportResult = HardscapeImportResult & { categoriesCreated: string[] };

/** Kept inside the pages' scope-keyed content: a new identity gets fresh state. */
export function QuickItemCsvControls({ catalog }: { catalog: "services" | "equipment-fees" }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const scope = `${scopeOf(user)}|${catalog}`;
  const current = useRef(scope);
  // Immediately suppress responses during a switch, before effect cleanup.
  current.current = scope;
  const [companyId] = useState(() => user?.activeCompanyId ?? "");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    current.current = scope;
    return () => { current.current = ""; exportAbort.current?.abort(); };
  }, [scope]);
  const endpoint = `${QUICK_ITEMS_API}`;
  const summary = (r: ImportResult) => t("hardscapeCatalog.importSummary", { ...r, skipped: r.skipped.length });
  async function importFile(file: File) {
    const started = scope;
    setImporting(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error(t("hardscapeCatalog.fileTooLarge"));
      const body = new FormData();
      body.append("file", file);
      const res = await apiRequest("POST", `${endpoint}/import-csv?scope=${catalog}`, body, { headers: companyHeaders(companyId) });
      const data = await res.json() as ImportResult;
      // Old-scope imports may have committed: refresh only the initiating company's
      // lists/counts and affected searches, even when this component unmounted.
      for (const key of [QUICK_ITEMS_API, SERVICE_CATEGORIES_API, "estimate-picker", "estimate-catalog-matches"]) {
        void qc.invalidateQueries({ predicate: query => query.queryKey[0] === key && query.queryKey.includes(companyId) });
      }
      if (current.current !== started) return;
      setResult(data); setOpen(false);
      toast({ title: t("hardscapeCatalog.importDone"), description: summary(data) });
    } catch (error) {
      if (current.current === started) toast({ title: t("hardscapeCatalog.importFailed"), description: quickItemCsvMessage(apiErrorMessage(error), t), variant: "destructive" });
    } finally {
      if (current.current === started) {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    }
  }
  async function exportFile() {
    const started = scope;
    exportAbort.current?.abort();
    const ctrl = new AbortController();
    exportAbort.current = ctrl;
    setExporting(true);
    try {
      const res = await apiRequest("GET", `${endpoint}/export-csv?scope=${catalog}`, undefined,
        { headers: companyHeaders(companyId), signal: ctrl.signal });
      const blob = await res.blob();
      if (ctrl.signal.aborted || current.current !== started) return;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      try {
        a.href = href;
        a.download = filenameFromDisposition(res.headers.get("Content-Disposition"), `${catalog}-catalog.csv`);
        document.body.appendChild(a); a.click();
      } finally {
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 0);
      }
    } catch (error) {
      if (!ctrl.signal.aborted && current.current === started) toast({
        title: t("hardscapeCatalog.exportFailed"), description: quickItemCsvMessage(apiErrorMessage(error), t), variant: "destructive",
      });
    } finally {
      if (current.current === started) setExporting(false);
      if (exportAbort.current === ctrl) exportAbort.current = null;
    }
  }
  return <div className="mt-5">
    <div className="flex flex-wrap gap-2">
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" data-testid="input-csv-file"
        aria-label={t("hardscapeCatalog.importCsv")} onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
      <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()} data-testid="button-import-csv">
        <Upload className="mr-1.5 h-4 w-4" />{t(importing ? "hardscapeCatalog.importing" : "hardscapeCatalog.importCsv")}
      </Button>
      <Button variant="outline" disabled={exporting} onClick={() => void exportFile()} data-testid="button-export-csv">
        <Download className="mr-1.5 h-4 w-4" />{t(exporting ? "hardscapeCatalog.exporting" : "hardscapeCatalog.exportCsv")}
      </Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{t("quickItemCsv.hint")}</p>
    {result && <section className="mt-4 rounded-md border border-l-4 border-l-primary bg-card p-4" aria-live="polite" data-testid="panel-import-result">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t("hardscapeCatalog.importDone")}</p>
          <p className="text-sm text-muted-foreground" data-testid="text-import-summary">{summary(result)}</p>
        </div>
        <Button size="icon" variant="ghost" aria-label={t("hardscapeCatalog.dismiss")} onClick={() => setResult(null)} data-testid="button-dismiss-import"><X className="h-4 w-4" /></Button>
      </div>
      {result.categoriesCreated.length > 0 && <div className="mt-2 text-sm" data-testid="list-created-categories">
        <p className="font-medium">{t("quickItemCsv.categoriesCreated")}</p>
        <ul className="list-inside list-disc">{result.categoriesCreated.map(name => <li key={name}>{name}</li>)}</ul>
      </div>}
      {result.skipped.length > 0 && <div className="mt-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--est-warn))]" data-testid="button-toggle-skipped">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {open ? t("hardscapeCatalog.skippedHide") : t("hardscapeCatalog.skippedToggle", { count: result.skipped.length })}
        </button>
        {open && <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded bg-muted/50 p-2 text-sm" data-testid="list-skipped">
          {result.skipped.map((row, i) => <li key={`${row.line}-${i}`} className="flex gap-3">
            <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{t("hardscapeCatalog.skippedLine", { line: row.line })}</span>
            <span>{quickItemCsvMessage(row.reason, t)}</span>
          </li>)}
        </ul>}
      </div>}
    </section>}
  </div>;
}
