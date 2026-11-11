import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCOPE_CATALOG } from "@shared/contractCatalog";
import { serviceCalendarReplacementSchema, type UsageProblem } from "../../../../../lib/db/src/serviceCalendarContracts";
import { KIND_ORDER, MONTH_DAYS, fmtMd, rowProblem, toPayload, type ServiceApi } from "./helpers";

export function Section({ icon, title, hint, testId, children }: { icon: ReactNode; title: string; hint: string; testId: string; children: ReactNode }) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex items-baseline gap-2 border-b pb-1.5">
        <span className="text-[hsl(var(--rail-heading))] self-center">{icon}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--rail-heading))]">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function MdPicker({ value, onChange, disabled, label, testId }: {
  value: string; onChange: (v: string) => void; disabled: boolean; label: string; testId: string;
}) {
  const { t } = useTranslation();
  const [m, d] = value.split("-").map(Number);
  const days = MONTH_DAYS[(m || 1) - 1];
  const set = (mm: number, dd: number) => onChange(`${String(mm).padStart(2, "0")}-${String(Math.min(dd, MONTH_DAYS[mm - 1])).padStart(2, "0")}`);
  if (disabled) return <span className="text-sm tabular-nums" data-testid={`text-${testId}`}>{fmtMd(value, t)}</span>;
  const cls = "h-8 rounded-md border bg-background px-1.5 text-sm tabular-nums transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40";
  return (
    <span className="inline-flex items-center gap-1">
      <select className={cls} value={m} aria-label={`${label} month`} onChange={e => set(Number(e.target.value), d)} data-testid={`select-${testId}-month`}>
        {MONTH_DAYS.map((_, i) => <option key={i} value={i + 1}>{t(`serviceCalendar.months.m${i + 1}`)}</option>)}
      </select>
      <select className={cls} value={d} aria-label={`${label} day`} onChange={e => set(m, Number(e.target.value))} data-testid={`select-${testId}-day`}>
        {Array.from({ length: days }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
      </select>
    </span>
  );
}

export function SaveBar({ svc, api, note, place = "" }: { svc: string; api: ServiceApi; note?: string; place?: string }) {
  const { t } = useTranslation();
  const dirty = api.isDirty(svc);
  const list = api.rows(svc);
  const problems = list.map(rowProblem).filter(Boolean);
  const schemaOk = serviceCalendarReplacementSchema(SCOPE_CATALOG, svc).safeParse({ entries: toPayload(list), allowEmptyStandard: true }).success;
  const tooMany = KIND_ORDER.some(k => list.filter(r => r.kind === k).length > 24);
  const valid = problems.length === 0 && schemaOk && !tooMany;
  const flashAt = api.flash[svc];
  const [showFlash, setShowFlash] = useState(false);
  useEffect(() => {
    if (!flashAt) return;
    setShowFlash(true);
    const id = setTimeout(() => setShowFlash(false), 2200);
    return () => clearTimeout(id);
  }, [flashAt]);
  if (!api.canWrite) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 min-h-8">
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--success))] transition-all duration-300 ${showFlash && !dirty ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"}`}
        data-testid={`text-saved-${place}${svc}`} aria-live="polite"
      >
        <Check className="h-3.5 w-3.5" />{showFlash && !dirty ? t("serviceCalendar.savedFlash") : ""}
      </span>
      {dirty && !valid && (
        <span className="text-xs text-destructive" data-testid={`text-invalid-${place}${svc}`}>
          {tooMany ? t("serviceCalendar.errTooMany") : problems[0] ? t(`serviceCalendar.${problems[0]}`) : t("serviceCalendar.errName")}
        </span>
      )}
      {api.errors[svc] && <span className="text-xs text-destructive" data-testid={`error-${place}${svc}`}>{api.errors[svc]}</span>}
      {note && dirty && <span className="text-[11px] text-muted-foreground">{note}</span>}
      <div className={`ml-auto flex items-center gap-1.5 transition-opacity duration-200 ${dirty ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <Button size="sm" variant="ghost" className="h-7" disabled={!dirty || !!api.busy[svc]} onClick={() => api.discard(svc)} data-testid={`button-discard-${place}${svc}`}>
          {t("serviceCalendar.discard")}
        </Button>
        <Button size="sm" className="h-7 min-w-[4.5rem]" disabled={!dirty || !valid || !!api.busy[svc]} onClick={() => api.save(svc)} data-testid={`button-save-${place}${svc}`}>
          {api.busy[svc] ? t("serviceCalendar.saving") : t("serviceCalendar.save")}
        </Button>
      </div>
    </div>
  );
}

export function ProblemLinks({ problems, testId }: { problems: UsageProblem[]; testId: string }) {
  const { t } = useTranslation();
  if (!problems.length) return null;
  return (
    <details className="group mt-1" data-testid={testId}>
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
        {t("serviceCalendar.problemsList", { count: problems.length })}
      </summary>
      <ul className="mt-1.5 grid gap-0.5 text-xs sm:grid-cols-2">
        {problems.map(pr => (
          <li key={`${pr.termId}-${pr.reason}`} className="flex gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">{t(`serviceCalendar.reason.${pr.reason}`, { defaultValue: pr.reason })}</span>
            <Link href={`/dashboard/contracts/${pr.agreementId}#term-${pr.termId}`} className="text-primary hover:underline truncate"
              data-testid={`link-problem-${pr.termId}-${pr.reason}`}>
              {pr.customerName}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Card({ svc, api, children, testId }: { svc: string; api: ServiceApi; children: ReactNode; testId: string }) {
  const dirty = api.isDirty(svc);
  return (
    <section
      className={`rounded-lg border bg-card transition-[box-shadow,border-color] duration-200 ${dirty ? "border-primary/50 shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""}`}
      data-testid={testId} data-dirty={dirty || undefined}
    >
      <fieldset disabled={!!api.busy[svc]} aria-busy={!!api.busy[svc] || undefined} className="contents" data-testid={`${testId}-fields`}>
        {children}
      </fieldset>
    </section>
  );
}

export function IconBtn({ label, onClick, disabled, danger, testId, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; testId: string; children: ReactNode;
}) {
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${danger ? "hover:text-destructive" : "hover:text-foreground"}`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
