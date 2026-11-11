import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServiceCalendarUsage } from "../../../../../lib/db/src/serviceCalendarContracts";
import { crossesYear, newUid, rowProblem, type DraftRow, type ServiceApi } from "./helpers";
import { Card, IconBtn, MdPicker, ProblemLinks, SaveBar } from "./parts";

export function RoundCard({ serviceKey: svc, label, usage, api }: { serviceKey: string; label: string; usage: ServiceCalendarUsage | undefined; api: ServiceApi }) {
  const { t } = useTranslation();
  const all = api.rows(svc);
  const rounds = all.filter(r => r.kind === "round");
  const std = rounds.filter(r => r.inStandard);
  const ro = !api.canWrite;
  const patchRound = (uid: string, p: Partial<DraftRow>) => api.edit(svc, list => list.map(r => (r.uid === uid ? { ...r, ...p } : r)));
  const move = (uid: string, dir: -1 | 1) => api.edit(svc, list => {
    const kindIdx = list.map((r, i) => (r.kind === "round" ? i : -1)).filter(i => i >= 0);
    const at = kindIdx.findIndex(i => list[i].uid === uid);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= kindIdx.length) return list;
    const next = [...list];
    [next[kindIdx[at]], next[kindIdx[to]]] = [next[kindIdx[to]], next[kindIdx[at]]];
    return next;
  });
  const add = () => api.edit(svc, list => {
    const lastRound = list.map(r => r.kind).lastIndexOf("round");
    const row: DraftRow = { uid: newUid(), kind: "round", name: "", opensMd: "03-01", dueMd: "04-30", inStandard: true, pattern: null, includes: null };
    const next = [...list];
    next.splice(lastRound + 1, 0, row);
    return next;
  });
  const remove = (uid: string) => api.edit(svc, list => list.filter(r => r.uid !== uid));
  const flagged = (["zero", "invalid", "duplicate"] as const).filter(k => (usage?.[k] ?? 0) > 0);
  const hasRecurring = all.some(r => r.kind === "recurring");

  return (
    <Card svc={svc} api={api} testId={`card-service-${svc}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums" data-testid={`text-seasons-${svc}`}>
          {t("serviceCalendar.seasons", { count: usage?.seasons ?? 0 })}
        </span>
      </div>

      {rounds.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground" data-testid={`empty-${svc}`}>{t("serviceCalendar.noRounds")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-12 px-4 py-1.5 text-left font-medium">{t("serviceCalendar.colStd")}</th>
                <th className="px-2 py-1.5 text-left font-medium">{t("serviceCalendar.colName")}</th>
                <th className="px-2 py-1.5 text-left font-medium">{t("serviceCalendar.colOpens")}</th>
                <th className="px-2 py-1.5 text-left font-medium">{t("serviceCalendar.colDue")}</th>
                {!ro && <th className="w-24" />}
              </tr>
            </thead>
            <tbody>
              {rounds.map((r, i) => {
                const id = `${svc}-round-${i}`;
                const bad = rowProblem(r);
                return (
                  <tr key={r.uid} className="group border-t border-border/60 transition-colors hover:bg-muted/40 animate-in fade-in duration-200" data-testid={`row-${id}`}>
                    <td className="px-4 py-1.5">
                      <input
                        type="checkbox" checked={r.inStandard} disabled={ro}
                        onChange={e => patchRound(r.uid, { inStandard: e.target.checked })}
                        className="h-4 w-4 accent-[hsl(var(--primary))] cursor-pointer disabled:cursor-default"
                        aria-label={`${t("serviceCalendar.colStd")} ${r.name}`} data-testid={`checkbox-std-${id}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {ro ? <span data-testid={`text-name-${id}`}>{r.name}</span> : (
                        <input
                          value={r.name} maxLength={80} placeholder={t("serviceCalendar.newRound")}
                          onChange={e => patchRound(r.uid, { name: e.target.value })}
                          aria-invalid={bad === "errName" || undefined}
                          className={`h-8 w-full min-w-[11rem] rounded-md border bg-background px-2 text-sm transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40 ${bad === "errName" ? "border-destructive" : ""}`}
                          data-testid={`input-name-${id}`}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <MdPicker value={r.opensMd} disabled={ro} label={`${r.name} opens`} testId={`opens-${id}`} onChange={v => patchRound(r.uid, { opensMd: v })} />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <MdPicker value={r.dueMd} disabled={ro} label={`${r.name} deadline`} testId={`due-${id}`} onChange={v => patchRound(r.uid, { dueMd: v })} />
                        {crossesYear(r) && <span className="rounded border border-current/30 px-1.5 text-[10px] font-medium" style={{ color: "var(--svc-winter)" }} data-testid={`badge-crosses-${id}`}>{t("serviceCalendar.crossesYear")}</span>}
                        {bad === "errSame" && <span className="text-[11px] text-destructive">{t("serviceCalendar.errSame")}</span>}
                      </span>
                    </td>
                    {!ro && (
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <IconBtn label={t("serviceCalendar.moveUp")} disabled={i === 0} onClick={() => move(r.uid, -1)} testId={`button-up-${id}`}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label={t("serviceCalendar.moveDown")} disabled={i === rounds.length - 1} onClick={() => move(r.uid, 1)} testId={`button-down-${id}`}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label={t("serviceCalendar.remove")} danger onClick={() => remove(r.uid)} testId={`button-remove-${id}`}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2 border-t bg-[hsl(var(--rail))] px-4 py-2.5">
        {!ro && (
          <Button size="sm" variant="ghost" className="h-7 -ml-2 text-[hsl(var(--rail-heading))]" onClick={add} disabled={rounds.length >= 24} data-testid={`button-add-round-${svc}`}>
            <Plus className="h-3.5 w-3.5 mr-1" />{t("serviceCalendar.addRound")}
          </Button>
        )}
        <p className={`text-xs ${std.length ? "text-foreground" : rounds.length ? "text-[hsl(var(--warning))] font-medium" : "text-muted-foreground"}`} data-testid={`text-standard-${svc}`}>
          {std.length
            ? t("serviceCalendar.standardSummary", { count: std.length, names: std.map(r => r.name.trim() || "?").join(", ") })
            : t("serviceCalendar.standardNone")}
        </p>
        {(usage?.noCount ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground" data-testid={`text-nocount-${svc}`}>{t("serviceCalendar.noCount", { count: usage?.noCount ?? 0 })}</p>
        )}
        {(usage?.needsRounds.length ?? 0) > 0 && (
          <div className="text-xs" data-testid={`flag-needs-rounds-${svc}`}>
            <p className="flex items-start gap-1.5 text-[hsl(var(--warning))] font-medium">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />{t("serviceCalendar.needsRounds", { count: usage?.needsRounds.length ?? 0 })}
            </p>
            <ProblemLinks problems={usage?.needsRounds ?? []} testId={`links-needs-rounds-${svc}`} />
          </div>
        )}
        {svc === "fertilization" && (usage?.legacyChemical.length ?? 0) > 0 && (
          <div className="text-xs" data-testid="flag-legacy-chemical">
            <p className="flex items-start gap-1.5 text-[hsl(var(--warning))] font-medium">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />{t("serviceCalendar.legacyChemical", { count: usage?.legacyChemical.length ?? 0 })}
            </p>
            <ProblemLinks problems={usage?.legacyChemical ?? []} testId="links-legacy-chemical" />
          </div>
        )}
        {svc === "broadleaf" && (usage?.seasons ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground italic" data-testid="text-broadleaf-none">{t("serviceCalendar.broadleafNone")}</p>
        )}
        {flagged.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid={`problems-${svc}`}>
            {flagged.map(k => (
              <span key={k} className="inline-flex items-center gap-1 rounded border border-[hsl(var(--warning))]/40 px-1.5 py-0.5 text-[11px] font-medium text-[hsl(var(--warning))]" data-testid={`chip-${k}-${svc}`}>
                <AlertTriangle className="h-3 w-3" />{t(`serviceCalendar.flag.${k}`, { count: usage?.[k] ?? 0 })}
              </span>
            ))}
          </div>
        )}
        <ProblemLinks problems={usage?.problems ?? []} testId={`links-problems-${svc}`} />
        <SaveBar svc={svc} api={api} note={hasRecurring ? t("serviceCalendar.savesTogether") : undefined} />
      </div>
    </Card>
  );
}
