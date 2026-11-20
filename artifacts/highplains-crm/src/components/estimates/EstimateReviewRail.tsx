import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, FileText, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UMBRELLAS, formatDate, type EstimateDetailDto } from "@/lib/estimateBuilder";
import { formatCents } from "@/lib/hardscapeCatalog";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { estimateApproximatePages } from "../../../../../lib/db/src/estimateContracts";

type VersionSummary = EstimateDetailDto["versions"][number];

function RailCard({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <section className="rounded-lg border bg-card p-4" data-testid={testId}>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function PdfItem({ included = true, children }: { included?: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  const Icon = included ? CheckCircle2 : Circle;
  return (
    <li className={cn("flex items-start gap-2", !included && "text-muted-foreground")}>
      <Icon aria-hidden className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", included && "text-[hsl(var(--rail-active-icon))]")} />
      <span><span className="sr-only">{t(included ? "estimateBuilder.rail.included" : "estimateBuilder.rail.notIncluded")} </span>{children}</span>
    </li>
  );
}

function PdfChecklist({ version, canEditPlants, onPlantsChange }: {
  version: EstimateDetailDto["version"]; canEditPlants: boolean; onPlantsChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { sections } = version;
  const lines = sections.flatMap(s => s.lines);
  const scope = version.scopeOfWork?.trim() ?? "";
  const hasPlants = lines.some(l => l.umbrellaKey === "plants");
  const plants = lines.filter(line => line.lineType === "plant");
  const included = plants.filter(line => line.includeInPalette).length;
  const photos = version.photos?.length ?? 0;
  const includePlantTable = version.includePlantTable ?? true;
  const pages = estimateApproximatePages(version);
  return (
    <RailCard title={t("estimateBuilder.rail.onPdf")} testId="card-on-pdf">
      <ul className="space-y-1.5 text-sm">
        <PdfItem included={!!scope}>{t("estimateBuilder.scope.title")}</PdfItem>
        <PdfItem included={lines.length > 0}>
          {t("estimateBuilder.rail.pdfLineSections", {
            lines: t("estimateBuilder.rail.pdfLines", { count: lines.length }),
            sections: t("estimateBuilder.rail.pdfSections", { count: sections.length }),
          })}
        </PdfItem>
        <li className="flex items-center justify-between gap-2" data-testid="row-pdf-plant-table">
          <label htmlFor="switch-estimate-plant-table" className="min-w-0">
            <span className="block">{t("estimateBuilder.exhibits.plantsWithPictures")}</span>
            <span className="block text-xs text-muted-foreground">{t("estimateBuilder.exhibits.plantCount", { count: includePlantTable ? included : 0, total: plants.length })}</span>
          </label>
          <Switch id="switch-estimate-plant-table" checked={includePlantTable} disabled={!canEditPlants} onCheckedChange={onPlantsChange}
            aria-label={t("estimateBuilder.exhibits.plantsWithPictures")} data-testid="switch-estimate-plant-table" />
        </li>
        <PdfItem>{t(hasPlants ? "estimateBuilder.rail.pdfPlantTerms" : "estimateBuilder.rail.pdfTerms")}</PdfItem>
        <PdfItem>{t("estimateBuilder.rail.pdfSignature")}</PdfItem>
        <PdfItem included={photos > 0}><span data-testid="text-pdf-photo-count">{t("estimateBuilder.exhibits.photoCount", { count: photos })}</span></PdfItem>
      </ul>
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground" data-testid="text-pdf-page-estimate">
        {t(version.issuedAttachment ? "estimateBuilder.email.pages" : "estimateBuilder.rail.pdfPages", { count: pages })}
      </p>
    </RailCard>
  );
}

function VersionsCard({ data, lang, onView, onPdf }: {
  data: EstimateDetailDto; lang: string; onView: (version: VersionSummary) => void; onPdf: (version: VersionSummary) => void;
}) {
  const { t } = useTranslation();
  const accepted = data.versions.some(s => s.status === "accepted");
  return (
    <RailCard title={t("estimateBuilder.versions")} testId="card-versions">
      <ul className="divide-y" data-testid="list-estimate-versions">
        {data.versions.map(s => {
          const viewing = s.id === data.version.id;
          const current = s.id === data.currentVersionId;
          const version = viewing ? data.version : s;
          const status = s.status === "draft" && current
            ? t("estimateBuilder.rail.draftEditing")
            : s.status === "superseded" && version.sentAt
              ? [t(version.acceptedAt ? "estimateBuilder.status.accepted" : "estimateBuilder.status.sent"), t("estimateBuilder.status.superseded")].join(" · ")
              : t(`estimateBuilder.status.${s.status}`);
          const revision = s.status === "draft" && s.createdFromVersionId
            ? t(accepted ? "estimateBuilder.life.changeOrderTag" : "estimateBuilder.life.revisionTag") : null;
          return (
            <li key={s.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0" data-testid={`row-estimate-version-${s.versionNumber}`}>
              <History aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <button type="button" aria-pressed={viewing} aria-label={t("estimateBuilder.viewVersion", { n: s.versionNumber })}
                  className={cn("rounded-sm text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", viewing && "font-semibold")}
                  onClick={() => { if (!viewing) onView(s); }} data-testid={`chip-version-${s.versionNumber}`} data-current={current}>
                  {t("estimateBuilder.rail.versionRow", { n: s.versionNumber, status })}{revision && ` (${revision})`}
                </button>
                {version.sentAt && (
                  <p className="text-xs text-muted-foreground" data-testid={`text-version-sent-${s.versionNumber}`}>
                    {formatDate(version.sentAt, lang)}
                    {version.sentMethod && ` · ${t(`estimateBuilder.life.sentMethod.${version.sentMethod}`)}`}
                    {!!version.emailedTo?.length && ` · ${version.emailedTo.join(", ")}`}
                    {version.frozenSubtotalCents != null && ` · ${formatCents(version.frozenSubtotalCents, lang)}`}
                  </p>
                )}
                {version.sentAt && <p className="text-xs text-muted-foreground">{t(version.issuedAttachment ? "estimateBuilder.email.originalPdf" : "estimateBuilder.rail.regeneratedPdf")}</p>}
              </div>
              <button type="button" className="rounded-sm text-xs font-medium text-muted-foreground underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onPdf(s)} aria-label={t("estimateBuilder.rail.versionPdf", { n: s.versionNumber })}
                data-testid={`button-version-pdf-${s.versionNumber}`}>{t("estimateBuilder.rail.pdfLink")}</button>
            </li>
          );
        })}
      </ul>
      {data.versions.length === 1 && <p className="mt-2 text-xs text-muted-foreground" data-testid="text-single-version-pdf">{t("estimateBuilder.rail.singleVersion")}</p>}
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground" data-testid="text-next-step">
        {data.voidedAt ? t("estimateBuilder.life.next.void") : t(`estimateBuilder.life.next.${data.version.status}`)}
      </p>
    </RailCard>
  );
}

export function EstimateReviewRail({ data, lang, onViewVersion, onVersionPdf, canEditPlants, onPlantsChange }: {
  data: EstimateDetailDto; lang: string;
  onViewVersion: (version: VersionSummary) => void; onVersionPdf: (version: VersionSummary) => void;
  canEditPlants: boolean; onPlantsChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const v = data.version;
  const tot = v.totals;
  const buckets = UMBRELLAS.filter((u) => (tot.byUmbrella[u] ?? 0) !== 0);
  const missing = v.status === "draft" && !data.voidedAt
    ? v.sections.reduce((n, s) => n + s.lines.filter(l => l.needsPrice).length, 0)
    : 0;
  return (
    <aside className="min-w-0 space-y-3" data-testid="rail-totals">
      <RailCard title={t("estimateBuilder.rail.totals")} testId="card-totals">
        <ul className="space-y-1 text-sm">
          {v.sections.map(s => (
            <li key={s.id} className="flex justify-between gap-3"><span className="min-w-0 break-words text-muted-foreground">{s.name}</span>
              <span className="shrink-0 tabular-nums" data-testid={`text-rail-section-${s.id}`}>{formatCents(tot.bySection[s.id] ?? 0, lang)}</span></li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-2">
          <span className="font-semibold">{t("estimateBuilder.rail.total")}</span>
          <span className="text-xl font-bold tabular-nums" data-testid="text-estimate-total">{formatCents(tot.subtotalCents, lang)}</span>
        </div>
        {missing > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-[hsl(var(--est-warn))]" data-testid="text-lines-need-price">
          <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />{t("estimateBuilder.rail.missingPrice", { count: missing })}
        </p>}
      </RailCard>
      <PdfChecklist version={v} canEditPlants={canEditPlants} onPlantsChange={onPlantsChange} />
      <section className="rounded-lg border border-[hsl(var(--est-warn))]/35 bg-[hsl(var(--est-warn-bg))]/60 p-4 text-sm" data-testid="card-internal-margin">
        <h2 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--est-warn))]">{t("estimateBuilder.rail.internal")}</h2>
        <div className="flex justify-between gap-2"><span>{t("estimateBuilder.rail.knownCost")}</span><span className="tabular-nums" data-testid="text-known-cost">{formatCents(tot.costKnownCents, lang)}</span></div>
        <div className="flex justify-between gap-2"><span>{t("estimateBuilder.rail.margin")}</span>
          <span className="font-semibold tabular-nums" data-testid="text-margin">{tot.materialMarginPct == null ? t("estimateBuilder.rail.marginNone") : `${tot.materialMarginPct.toLocaleString(lang === "es" ? "es-US" : "en-US", { maximumFractionDigits: 1 })}%`}</span></div>
        {tot.costUnknownLines > 0 && <p className="mt-2 text-xs text-[hsl(var(--est-warn))]" data-testid="text-unknown-cost">{t("estimateBuilder.rail.unknown", { count: tot.costUnknownLines })}</p>}
        <details className="group mt-2 border-t border-[hsl(var(--est-warn))]/20 pt-2" data-testid="card-qbo">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden" data-testid="button-toggle-qbo">
            {t("estimateBuilder.rail.qbo")}<ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 group-open:rotate-180" />
          </summary>
          {buckets.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("estimateBuilder.rail.qboEmpty")}</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {buckets.map(u => (
                <li key={u} className="flex justify-between gap-3" data-testid={`row-umbrella-${u}`}><span>{t(`qboSetup.umbrella.${u}`)}</span>
                  <span className="tabular-nums">{formatCents(tot.byUmbrella[u], lang)}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><FileText aria-hidden className="h-3 w-3 shrink-0" />{t("estimateBuilder.rail.qboNote")}</p>
        </details>
      </section>
      <VersionsCard data={data} lang={lang} onView={onViewVersion} onPdf={onVersionPdf} />
    </aside>
  );
}
