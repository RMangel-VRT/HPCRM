import type { ReactNode } from "react";
import { US_STATES, isStateCode } from "../wizardModel";
import type { MissingField, WizardDraft } from "../wizardModel";

export type TW = (k: string, o?: Record<string, unknown>) => string;
export type SetDraft = (f: (c: WizardDraft) => WizardDraft) => void;
export type PatchDraft = (p: Partial<WizardDraft>) => void;
export type SectionMode = "create" | "edit";

export const selectCls = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
export const choice = (on: boolean) => `rounded-md border p-3 text-left transition-colors ${on ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}`;

/** Required-for-activation fields the user should see marked inline, live. */
export type Needed = ReadonlySet<MissingField>;

export function Field({ label, hint, children, req, need, needId }: { label: string; hint?: ReactNode; children: ReactNode; req?: string; need?: string | false; needId?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        {need ? <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400" data-testid={needId ? `need-${needId}` : undefined}>{need}</span>
          : req && <span className="text-[10px] uppercase tracking-wider text-primary/80">{req}</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Section({ title, lead, children, testId, id, framed }: { title: string; lead?: string; children: ReactNode; testId: string; id?: string; framed?: boolean }) {
  return (
    <section id={id} className={`space-y-5 animate-in fade-in slide-in-from-bottom-1 duration-300 ${framed ? "scroll-mt-24 rounded-lg border bg-card p-5 shadow-sm md:p-6" : ""}`} data-testid={testId}>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {lead && <p className="text-sm text-muted-foreground">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

/** US state codes. A legacy value that isn't a code stays visible and selected, flagged for review; never silently replaced. */
export function StateSelect({ value, onChange, tw, testId, label }: { value: string; onChange: (v: string) => void; tw: TW; testId: string; label: string }) {
  const legacy = !!value.trim() && !isStateCode(value);
  return (
    <>
      <select className={`${selectCls} ${legacy ? "border-amber-500" : ""}`} aria-label={label} value={value} onChange={e => onChange(e.target.value)} data-testid={testId}>
        <option value="">{tw("property.stateNone")}</option>
        {legacy && <option value={value}>{value}</option>}
        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {legacy && <span className="block text-xs text-amber-700 dark:text-amber-400" data-testid={`${testId}-check`}>{tw("property.checkState")}</span>}
    </>
  );
}
