import { useTranslation } from "react-i18next";
import { CalendarRange, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STARTING_SERVICE_CALENDAR, type CalendarKind } from "../../../../../lib/db/src/serviceCalendarContracts";
import { KIND_ORDER, crossesYear, fmtMd, labelOf } from "./helpers";

export function EmptyPanel({ canWrite, loading, onLoad }: { canWrite: boolean; loading: boolean; onLoad: () => void }) {
  const { t } = useTranslation();
  const count = (k: CalendarKind) => STARTING_SERVICE_CALENDAR.filter(e => e.kind === k).length;
  const groups = KIND_ORDER.map(kind => ({ kind, rows: STARTING_SERVICE_CALENDAR.filter(e => e.kind === kind) }));
  return (
    <section className="rounded-lg border bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-300" data-testid="state-empty">
      <div className="flex flex-wrap items-start gap-4 border-b bg-[hsl(var(--rail))] px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-[hsl(var(--rail-heading))]">
          <CalendarRange className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[14rem] space-y-1">
          <h2 className="text-base font-semibold">{t("serviceCalendar.emptyTitle")}</h2>
          <p className="text-sm text-muted-foreground">{canWrite ? t("serviceCalendar.emptyBody") : t("serviceCalendar.emptyOffice")}</p>
          <p className="text-xs text-muted-foreground tabular-nums" data-testid="text-preview-count">
            {t("serviceCalendar.previewRows", { rounds: count("round"), checklists: count("checklist"), recurring: count("recurring") })}
          </p>
        </div>
        {canWrite && (
          <Button onClick={onLoad} disabled={loading} data-testid="button-load-starting">
            <Download className="h-4 w-4 mr-1.5" />{loading ? t("serviceCalendar.loading") : t("serviceCalendar.loadStarting")}
          </Button>
        )}
      </div>
      <div className="max-h-[28rem] overflow-y-auto px-5 py-3 space-y-4" data-testid="list-starting-preview">
        {groups.map(g => (
          <div key={g.kind}>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--rail-heading))]">
              {t(g.kind === "round" ? "serviceCalendar.rounds" : g.kind === "checklist" ? "serviceCalendar.checklists" : "serviceCalendar.recurring")}
            </h3>
            <ul className="divide-y divide-border/60 text-sm">
              {g.rows.map(e => (
                <li key={`${e.serviceKey}-${e.kind}-${e.position}`} className="flex flex-wrap items-baseline gap-x-3 py-1" data-testid={`preview-${e.serviceKey}-${e.kind}-${e.position}`}>
                  <span className="w-44 shrink-0 text-xs text-muted-foreground truncate">{labelOf(e.serviceKey)}</span>
                  <span className="font-medium">{e.name}</span>
                  <span className="ml-auto tabular-nums text-xs text-muted-foreground">
                    {fmtMd(e.opensMd, t)} – {fmtMd(e.dueMd, t)}{crossesYear(e) ? ` · ${t("serviceCalendar.crossesYear")}` : ""}
                  </span>
                  {e.pattern && <span className="basis-full pl-[11.75rem] text-xs text-muted-foreground">{e.pattern}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

