import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download } from "lucide-react";
import type { CrewWorksheetWithDetails } from "@shared/schema";

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return d; }
}

export default function CrewWorksheetPrint() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  const { data: ws, isLoading } = useQuery<CrewWorksheetWithDetails>({
    queryKey: ["/api/crew-worksheets", id],
    enabled: !!id,
  });

  useEffect(() => {
    if (ws?.title) {
      const prev = document.title;
      document.title = `${ws.worksheetNumber} - ${ws.title}`;
      return () => { document.title = prev; };
    }
    return undefined;
  }, [ws?.title, ws?.worksheetNumber]);

  if (isLoading || !ws) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="text-print-loading">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  const eq = (ws.equipmentChecklist ?? []) as { id: string; label: string; checked: boolean }[];
  const mats = (ws.materialsChecklist ?? []) as { id: string; label: string; quantity: string; checked: boolean }[];
  const photos = [...ws.photos].sort((a, b) => a.displayOrder - b.displayOrder);
  const scopeLines = (ws.scopeOfWork ?? "").split("\n");

  return (
    <>
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { padding: 0 !important; max-width: none !important; box-shadow: none !important; }
          .photo-page { page-break-before: always; }
          .page-break { page-break-after: always; }
          .avoid-break { page-break-inside: avoid; }
        }
        .print-page {
          font-family: Helvetica, Arial, sans-serif;
          color: #222;
          background: white;
          max-width: 7.5in;
          margin: 0 auto;
          padding: 0.5in;
          line-height: 1.4;
        }
        .print-page h1 { color: #1a4d1a; font-size: 22px; margin: 0 0 4px 0; }
        .print-page h2 { color: #1a4d1a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #1a4d1a; padding-bottom: 4px; margin: 18px 0 8px 0; }
        .print-page .meta-row { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; font-size: 11px; }
        .print-page .meta-row dt { font-weight: bold; color: #333; }
        .print-page .meta-row dd { margin: 0; color: #333; }
        .print-page ul.checklist { list-style: none; padding-left: 0; margin: 4px 0; font-size: 11px; }
        .print-page ul.checklist li { padding: 2px 0; }
        .print-page .scope { white-space: pre-wrap; font-size: 11px; }
        .print-page .signoff { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
        .print-page .sigline { border-bottom: 1px solid #444; height: 32px; }
        .print-page .siglabel { font-size: 9px; color: #666; margin-top: 4px; }
        .print-page .photo-page { margin-top: 16px; text-align: center; }
        .print-page .photo-page img { max-width: 100%; max-height: 8in; object-fit: contain; }
        .print-page .photo-caption { font-size: 10px; color: #666; margin-top: 6px; }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex items-center gap-2 justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/dashboard/tools/crew-worksheets/${id}`)} data-testid="button-back-to-draft">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("crewWorksheets.backToDraft", { defaultValue: "Back to draft" })}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { window.location.href = `/api/crew-worksheets/${id}/pdf`; }} data-testid="button-download-pdf">
            <Download className="w-4 h-4 mr-2" />
            {t("crewWorksheets.downloadPdf", { defaultValue: "Download PDF" })}
          </Button>
          <Button variant="default" size="sm" onClick={() => window.print()} data-testid="button-print-now">
            <Printer className="w-4 h-4 mr-2" />
            {t("common.print", { defaultValue: "Print" })}
          </Button>
        </div>
      </div>

      <div className="print-page" data-testid="print-page">
        <header style={{ textAlign: "center", borderBottom: "1px solid #1a4d1a", paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ color: "#1a4d1a", fontWeight: "bold", fontSize: 12 }}>{t("crewWorksheets.print.brandName")}</div>
          <h1>{t("crewWorksheets.print.headerTitle")} — {ws.worksheetNumber}</h1>
          <div style={{ color: "#444", fontSize: 13 }}>{ws.title}</div>
        </header>

        <section className="avoid-break">
          <dl className="meta-row">
            <dt>{t("crewWorksheets.print.customerLabel")}</dt><dd data-testid="text-customer">{ws.customerName}</dd>
            {(ws.customerStreet || ws.customerCity) && (
              <>
                <dt>{t("crewWorksheets.print.addressLabel")}</dt>
                <dd>{[ws.customerStreet, [ws.customerCity, ws.customerState].filter(Boolean).join(", ")].filter(Boolean).join("  ·  ")}</dd>
              </>
            )}
            <dt>{t("crewWorksheets.print.worksheetDateLabel")}</dt><dd>{fmtDate(ws.worksheetDate)}</dd>
            {ws.scheduledDate && (<><dt>{t("crewWorksheets.print.scheduledLabel")}</dt><dd>{fmtDate(ws.scheduledDate)}{ws.scheduledStartTime ? `  ·  ${ws.scheduledStartTime}` : ""}</dd></>)}
            {ws.crewLabel && (<><dt>{t("crewWorksheets.print.crewLabel")}</dt><dd>{ws.crewLabel}</dd></>)}
            {ws.assignedCrewLeadName && (<><dt>{t("crewWorksheets.print.crewLeadLabel")}</dt><dd>{ws.assignedCrewLeadName}</dd></>)}
            {ws.estimatedHours && (<><dt>{t("crewWorksheets.print.estHoursLabel")}</dt><dd>{ws.estimatedHours}</dd></>)}
            {ws.sourceProposalNumber && (<><dt>{t("crewWorksheets.print.sourceProposalLabel")}</dt><dd>{ws.sourceProposalNumber}{ws.sourceProposalTitle ? ` — ${ws.sourceProposalTitle}` : ""}</dd></>)}
          </dl>
        </section>

        <section>
          <h2>{t("crewWorksheets.print.scopeOfWork")}</h2>
          <div className="scope">
            {scopeLines.map((line, i) => {
              if (line.trim() === "[PAGE BREAK]") return <div key={i} className="page-break" />;
              return <div key={i}>{line || "\u00A0"}</div>;
            })}
          </div>
        </section>

        {eq.length > 0 && (
          <section className="avoid-break">
            <h2>{t("crewWorksheets.print.equipment")}</h2>
            <ul className="checklist" data-testid="list-equipment">
              {eq.map(e => <li key={e.id}>{e.checked ? "☑" : "☐"} {e.label}</li>)}
            </ul>
          </section>
        )}

        {mats.length > 0 && (
          <section className="avoid-break">
            <h2>{t("crewWorksheets.print.materials")}</h2>
            <ul className="checklist" data-testid="list-materials">
              {mats.map(m => <li key={m.id}>{m.checked ? "☑" : "☐"} {m.label}{m.quantity ? `  —  ${m.quantity}` : ""}</li>)}
            </ul>
          </section>
        )}

        {ws.visualScopeSheetId && (
          <section className="avoid-break" data-testid="section-site-map">
            <h2>{t("crewWorksheets.print.siteMap")}</h2>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <img
                src={`/api/crew-worksheets/${id}/visual-scope.png`}
                alt={t("crewWorksheets.print.siteMapAlt")}
                style={{ maxWidth: "100%", maxHeight: "6.5in", objectFit: "contain", border: "1px solid #ddd" }}
                data-testid="img-site-map"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
              />
            </div>
          </section>
        )}

        {(ws.crewNotes ?? "").trim() && (
          <section className="avoid-break">
            <h2>{t("crewWorksheets.print.crewNotes")}</h2>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{ws.crewNotes}</div>
          </section>
        )}

        <section className="avoid-break">
          <h2>{t("crewWorksheets.print.signOff")}</h2>
          <div className="signoff">
            <div>
              <div className="sigline" />
              <div className="siglabel">{t("crewWorksheets.print.crewLeadSignature")}</div>
            </div>
            <div>
              <div className="sigline" />
              <div className="siglabel">{t("crewWorksheets.print.dateLabel")}</div>
            </div>
            <div>
              <div className="sigline" />
              <div className="siglabel">{t("crewWorksheets.print.customerSignature")}</div>
            </div>
            <div>
              <div className="sigline" />
              <div className="siglabel">{t("crewWorksheets.print.dateLabel")}</div>
            </div>
          </div>
        </section>

        {photos.length > 0 && photos.map((p, i) => (
          <div key={p.id} className={i === 0 ? "photo-page" : "photo-page"} style={i === 0 ? { pageBreakBefore: "always" } : undefined}>
            <img src={`/objects/${p.storageObjectPath.replace(/^\//, "")}`} alt={p.caption ?? p.filename} data-testid={`img-print-${p.id}`} />
            {p.caption?.trim() && <div className="photo-caption">{p.caption}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
