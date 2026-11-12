import { useState } from "react";
import { useTranslation } from "react-i18next";
import { History, Plus, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SCOPE_CATALOG } from "@/shared/contractCatalog";
import { MONTH_LETTERS } from "./contractFormat";
import type { AgreementLine, TermScopeRow } from "./contractTypes";

export const DEFAULT_SNOW_TRIGGERS = "Two inches (2\u201D) on sidewalks and steps & Four inches (4\u201D) on streets and drives";

export interface ScopeRow {
  serviceKey: string; label: string; line: "landscape" | "irrigation" | "snow"; wordModule: string | null;
  included: boolean; quantity: number | null; unit: string | null; monthSpread: number[] | null;
  existed: boolean; details: Record<string, unknown>; priceCents: number | null; notes: string | null;
}

const linesFor = (line: AgreementLine): ScopeRow["line"][] =>
  line === "snow" ? ["snow"] : line === "landscape" ? ["landscape", "irrigation"] : ["landscape", "irrigation", "snow"];
const GROUP_LABEL: Record<ScopeRow["line"], string> = { landscape: "Landscape", irrigation: "Irrigation", snow: "Snow" };

export function buildScopeRows(server: TermScopeRow[], line: AgreementLine): ScopeRow[] {
  const allowed = linesFor(line);
  const byKey = new Map(server.map(r => [r.serviceKey, r]));
  const rows: ScopeRow[] = [];
  for (const c of SCOPE_CATALOG) {
    if (!allowed.includes(c.line)) continue;
    const s = byKey.get(c.key);
    rows.push({
      serviceKey: c.key, label: c.label, line: c.line, wordModule: c.wordModule, existed: !!s,
      included: s ? s.included : false, quantity: s ? s.quantity : c.defaultQuantity, unit: s ? s.unit : c.unit,
      monthSpread: s ? s.monthSpread : c.defaultMonthSpread, details: s?.details ?? {}, priceCents: s?.priceCents ?? null, notes: s?.notes ?? null,
    });
  }
  for (const s of server) {
    if (SCOPE_CATALOG.some(c => c.key === s.serviceKey)) continue;
    const label = typeof s.details?.label === "string" ? s.details.label : s.serviceKey;
    rows.push({
      serviceKey: s.serviceKey, label, line: (s.line as ScopeRow["line"]) ?? "landscape", wordModule: null, existed: true,
      included: s.included, quantity: s.quantity, unit: s.unit, monthSpread: s.monthSpread, details: s.details ?? {},
      priceCents: s.priceCents, notes: s.notes,
    });
  }
  return rows;
}

export const calendarTimed = (key: string) =>
  ["campaign", "checklist"].includes(SCOPE_CATALOG.find(c => c.key === key)?.scheduling ?? "");
export const spreadProblem = (r: ScopeRow): string | null => {
  // Calendar services use counts only. Preserve their stored months, even when
  // changing quantity; route and other existing spread validation stays intact.
  if (calendarTimed(r.serviceKey)) return null;
  // A null spread means no timing was chosen; an explicit spread must match quantity.
  if (!r.included || !r.monthSpread || r.quantity == null) return null;
  const sum = r.monthSpread.reduce((a, b) => a + b, 0);
  return sum === r.quantity ? null : `Months add up to ${sum}, quantity is ${r.quantity}`;
};
export const scopeProblems = (rows: ScopeRow[]) => rows.filter(r => spreadProblem(r)).map(r => `${r.label}: ${spreadProblem(r)}`);

/** PUT body: included rows plus any row already stored for the term (so switching off is recorded). */
export function scopePayload(rows: ScopeRow[]) {
  return rows.filter(r => r.included || r.existed).map(r => ({
    serviceKey: r.serviceKey, included: r.included, quantity: r.quantity, unit: r.unit, monthSpread: r.monthSpread,
    details: r.details, priceCents: r.priceCents, notes: r.notes,
  }));
}

/** Legacy services stay readable on seasons that already have them, but new lines can't add them. */
export const isLegacyService = (key: string) => SCOPE_CATALOG.find(c => c.key === key)?.scheduling === "legacy";
export const rowVisible = (r: ScopeRow, editing: boolean) =>
  editing ? (!isLegacyService(r.serviceKey) || r.existed || r.included) : r.included;

/**
 * Stage the fert/chem split in the draft only: chemical off, fertilization carries the old count,
 * broadleaf opens blank. Nothing persists until the user's explicit Save.
 */
export function splitChemical(rows: ScopeRow[]): ScopeRow[] {
  const chem = rows.find(r => r.serviceKey === "chemical");
  if (!chem || !chem.existed || !chem.included) return rows;
  return rows.map(r => {
    if (r.serviceKey === "chemical") return { ...r, included: false };
    if (r.serviceKey === "fertilization") return { ...r, included: true, quantity: chem.quantity, monthSpread: null };
    if (r.serviceKey === "broadleaf") return { ...r, included: true, quantity: null, monthSpread: null };
    return r;
  });
}

export function ScopeEditor(props: {
  line: AgreementLine; rows: ScopeRow[]; editing: boolean; onChange: (rows: ScopeRow[]) => void;
  snowTriggers: string | null; onSnowTriggers: (value: string) => void;
  /** Hide the snow-triggers field (edited from Contract details instead). */
  hideSnowTriggers?: boolean;
}) {
  const { t } = useTranslation();
  const { rows, editing, onChange } = props;
  const [custom, setCustom] = useState("");
  const [split, setSplit] = useState(false);
  const patch = (key: string, p: Partial<ScopeRow>) => onChange(rows.map(r => (r.serviceKey === key ? { ...r, ...p } : r)));
  const customLine: ScopeRow["line"] = props.line === "snow" ? "snow" : "landscape";

  function addCustom() {
    const label = custom.trim();
    if (!label) return;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "service";
    let key = `other:${slug}`, n = 2;
    while (rows.some(r => r.serviceKey === key)) key = `other:${slug}_${n++}`;
    onChange([...rows, { serviceKey: key, label, line: customLine, wordModule: null, included: true, quantity: null, unit: null,
      monthSpread: null, existed: false, details: { label }, priceCents: null, notes: null }]);
    setCustom("");
  }

  return (
    <div className="space-y-6" data-testid="editor-scope">
      {linesFor(props.line).map(group => {
        const groupRows = rows.filter(r => r.line === group && rowVisible(r, editing));
        return (
          <section key={group} data-testid={`scope-group-${group}`}>
            <h3 className="text-sm font-semibold mb-2">{GROUP_LABEL[group]}</h3>
            {group === "snow" && !props.hideSnowTriggers && (
              <div className="mb-3">
                <label className="text-xs text-muted-foreground" htmlFor="snow-triggers">Snow triggers</label>
                {editing ? (
                  <Input id="snow-triggers" data-testid="input-snow-triggers" value={props.snowTriggers ?? DEFAULT_SNOW_TRIGGERS}
                    onChange={e => props.onSnowTriggers(e.target.value)} />
                ) : (
                  <p className="text-sm" data-testid="text-snow-triggers">{props.snowTriggers || DEFAULT_SNOW_TRIGGERS}</p>
                )}
              </div>
            )}
            {!groupRows.length && <p className="text-sm text-muted-foreground">Nothing included.</p>}
            <div className="divide-y rounded-md border">
              {groupRows.map(r => {
                const problem = spreadProblem(r);
                const legacy = isLegacyService(r.serviceKey) && r.existed;
                const staged = split && (r.serviceKey === "fertilization" || r.serviceKey === "broadleaf") && r.included;
                return (
                  <div key={r.serviceKey} className="p-3 space-y-2" data-testid={`scope-row-${r.serviceKey}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      {editing && (
                        <Switch checked={r.included} onCheckedChange={v => patch(r.serviceKey, { included: v })}
                          aria-label={`Include ${r.label}`} data-testid={`switch-scope-${r.serviceKey}`} />
                      )}
                      <div className="flex-1 min-w-[10rem]">
                        <div className="text-sm font-medium">{r.label}</div>
                        {r.wordModule && <div className="text-xs text-muted-foreground">Word section: {r.wordModule}</div>}
                      </div>
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <Input type="number" min={0} step={1} className="w-20 h-8" value={r.quantity ?? ""}
                            aria-label={`${r.label} quantity`} data-testid={`input-qty-${r.serviceKey}`}
                            onChange={e => patch(r.serviceKey, { quantity: e.target.value === "" ? null : Math.max(0, Math.trunc(Number(e.target.value))) })} />
                          <Input className="w-24 h-8" value={r.unit ?? ""} placeholder="unit" aria-label={`${r.label} unit`}
                            onChange={e => patch(r.serviceKey, { unit: e.target.value || null })} />
                        </div>
                      ) : (
                        <span className="text-sm tabular-nums">{r.quantity ?? "\u2014"} {r.unit ?? ""}</span>
                      )}
                    </div>
                    {r.included && calendarTimed(r.serviceKey) && (
                      <p className="text-xs text-muted-foreground" data-testid={`note-calendar-timing-${r.serviceKey}`}>
                        {t("sc2.scopeTimingHint", { defaultValue: "The Service calendar supplies round timing. Stored months do not affect rounds and do not need to match the count." })}
                      </p>
                    )}
                    {editing && r.included ? (
                      <div className="grid grid-cols-12 gap-1">
                        {MONTH_LETTERS.map((m, i) => (
                          <div key={i} className="text-center">
                            <div className="text-[10px] text-muted-foreground">{m}</div>
                            <Input type="number" min={0} step={1} className="h-7 px-1 text-center text-xs"
                              aria-label={`${r.label} month ${i + 1}`} value={(r.monthSpread ?? [])[i] ?? 0}
                              onChange={e => {
                                const next = [...(r.monthSpread ?? Array(12).fill(0))];
                                next[i] = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                                patch(r.serviceKey, { monthSpread: next });
                              }} />
                          </div>
                        ))}
                      </div>
                    ) : r.included && r.monthSpread ? (
                      <MonthBar spread={r.monthSpread} />
                    ) : null}
                    {legacy && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--est-warn-bg))]/40 px-2.5 py-1.5 text-xs" data-testid={`note-legacy-${r.serviceKey}`}>
                        <History className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
                        <span className="flex-1">From before the split: replace with fertilization and broadleaf.</span>
                        {editing && r.included && (
                          <Button type="button" size="sm" variant="outline" className="h-7" data-testid={`button-split-${r.serviceKey}`}
                            onClick={() => { onChange(splitChemical(rows)); setSplit(true); }}>
                            <Split className="w-3.5 h-3.5 mr-1" />Split
                          </Button>
                        )}
                        {editing && split && !r.included && <span className="text-muted-foreground" data-testid="text-split-staged">Split staged. Save to keep it.</span>}
                      </div>
                    )}
                    {editing && staged && (
                      <p className="text-xs text-[hsl(var(--rail-heading))]" data-testid={`note-split-${r.serviceKey}`}>
                        {r.serviceKey === "fertilization" ? "From fert/chem: carries the old count. Confirm and save." : "From fert/chem: enter a count, or leave blank to use the standard. Confirm and save."}
                      </p>
                    )}
                    {editing && problem && <p className="text-xs text-destructive" data-testid={`warn-spread-${r.serviceKey}`}>{problem}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {editing && (
        <div className="flex gap-2 items-center" data-testid="form-custom-service">
          <Input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Custom service name" className="max-w-xs"
            data-testid="input-custom-service" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
          <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!custom.trim()} data-testid="button-add-custom-service">
            <Plus className="w-4 h-4 mr-1" />Add custom service
          </Button>
        </div>
      )}
    </div>
  );
}

function MonthBar({ spread }: { spread: number[] }) {
  const max = Math.max(1, ...spread);
  return (
    <div className="grid grid-cols-12 gap-1" aria-hidden>
      {spread.map((v, i) => (
        <div key={i} className="h-3 rounded-sm bg-muted overflow-hidden flex items-end" title={`${MONTH_LETTERS[i]}: ${v}`}>
          <div className="w-full bg-primary" style={{ height: `${(v / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}
