import { ArrowDown, ArrowUp, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { capacityTone, fmtDay, fmtHours, isOpenVisit, statusLabel, type BoardCrew, type EnrichedVisit, type VisitDaySummary } from "@/lib/scheduling";

export const TONE_CLASS = {
  ok: "text-muted-foreground",
  amber: "text-amber-700 dark:text-amber-400 font-semibold",
  red: "text-red-700 dark:text-red-400 font-semibold",
} as const;

export function addressLine(c: EnrichedVisit["customer"]): string {
  if (!c) return "";
  const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [c.street, cityLine].filter(Boolean).join(", ");
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crew: BoardCrew | null;
  date: string | null;
  visits: EnrichedVisit[]; // ordered, non-cancelled: open first then closed
  summary?: VisitDaySummary;
  onReorder: (openIds: string[]) => void;
  busy?: boolean;
}

export function printCrewDay() {
  document.body.classList.add("print-crew-day");
  const done = () => {
    document.body.classList.remove("print-crew-day");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

export function CrewDaySheet({ open, onOpenChange, crew, date, visits, summary, onReorder, busy }: Props) {
  const { t } = useTranslation();
  const openIds = visits.filter(isOpenVisit).map(v => v.id);
  const hours = summary?.plannedHours ?? 0;
  const cap = summary?.capacityHours ?? crew?.defaultHoursPerDay ?? 8;
  const stops = summary?.visitCount ?? openIds.length;

  const shift = (id: string, dir: -1 | 1) => {
    const i = openIds.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= openIds.length) return;
    const next = openIds.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-crew-day-print="" data-testid="sheet-crew-day">
        <SheetHeader className="text-left">
          <SheetTitle>{crew?.name} · {date ? fmtDay(date) : ""}</SheetTitle>
          <SheetDescription>
            {crew?.supervisorName ? `${crew.supervisorName} · ` : ""}
            <span className={TONE_CLASS[capacityTone(hours, cap)]} data-testid="text-crew-day-total">
              {stops} {t("scheduling.stops", "stops")} · {fmtHours(hours)} / {fmtHours(cap)} h
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="my-3 flex gap-2" data-print-hide>
          <Button size="sm" variant="outline" onClick={printCrewDay} data-testid="button-print-crew-day">
            <Printer className="mr-1.5 h-3.5 w-3.5" />{t("scheduling.print", "Print")}
          </Button>
        </div>
        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-crew-day-empty">{t("scheduling.emptyDay", "Nothing scheduled for this crew today.")}</p>
        ) : (
          <ol className="space-y-2" data-testid="list-crew-day-stops">
            {visits.map((v, idx) => {
              const open = isOpenVisit(v);
              const oi = openIds.indexOf(v.id);
              return (
                <li key={v.id} className={`rounded-md border p-2.5 text-sm ${open ? "" : "bg-muted/50 text-muted-foreground"}`} data-testid={`stop-crew-day-${v.id}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold tabular-nums">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{v.customer?.name ?? v.title ?? t("scheduling.untitled", "Untitled visit")}</div>
                      <div className="text-xs">{v.ticket?.title ?? v.title}</div>
                      {addressLine(v.customer) && <div className="text-xs">{addressLine(v.customer)}</div>}
                      <div className="mt-0.5 text-xs">
                        {v.startTime ? `${v.startTime} · ` : ""}{v.estimatedHours != null ? `${fmtHours(v.estimatedHours)} h` : t("scheduling.noHours", "No hours")}
                        {!open ? ` · ${statusLabel(v.status, t)}` : ""}
                      </div>
                      {v.notes && <div className="mt-1 whitespace-pre-wrap text-xs">{v.notes}</div>}
                    </div>
                    {open && (
                      <div className="flex shrink-0 flex-col" data-print-hide>
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy || oi <= 0} onClick={() => shift(v.id, -1)} aria-label={t("scheduling.moveUp", "Move up")} data-testid={`button-stop-up-${v.id}`}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy || oi < 0 || oi >= openIds.length - 1} onClick={() => shift(v.id, 1)} aria-label={t("scheduling.moveDown", "Move down")} data-testid={`button-stop-down-${v.id}`}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  );
}
