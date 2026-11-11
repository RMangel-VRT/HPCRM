import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crossesYear, newUid, recurringServices, type DraftRow, type ServiceApi } from "./helpers";
import { Card, IconBtn, MdPicker, SaveBar } from "./parts";

export function RecurringTable({ api }: { api: ServiceApi }) {
  const { t } = useTranslation();
  const ro = !api.canWrite;
  const services = recurringServices();
  const shown = services.filter(s => api.rows(s.key).some(r => r.kind === "recurring") || api.isDirty(s.key));
  const addable = services.filter(s => !shown.includes(s));
  const [addKey, setAddKey] = useState("");
  const add = (svc: string) => api.edit(svc, list => [...list, {
    uid: newUid(), kind: "recurring", name: "", opensMd: "04-01", dueMd: "10-31", inStandard: false, pattern: "", includes: "",
  }]);
  const inputCls = "h-8 w-full rounded-md border bg-background px-2 text-sm transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40";

  return (
    <div className="space-y-3">
      {shown.length === 0 && <p className="text-xs text-muted-foreground" data-testid="empty-recurring">{t("serviceCalendar.noRecurring")}</p>}
      {shown.map(svc => {
        const all = api.rows(svc.key);
        const rec = all.filter(r => r.kind === "recurring");
        const patch = (uid: string, p: Partial<DraftRow>) => api.edit(svc.key, list => list.map(r => (r.uid === uid ? { ...r, ...p } : r)));
        const move = (uid: string, dir: -1 | 1) => api.edit(svc.key, list => {
          const idx = list.map((r, i) => (r.kind === "recurring" ? i : -1)).filter(i => i >= 0);
          const at = idx.findIndex(i => list[i].uid === uid); const to = at + dir;
          if (at < 0 || to < 0 || to >= idx.length) return list;
          const next = [...list]; [next[idx[at]], next[idx[to]]] = [next[idx[to]], next[idx[at]]]; return next;
        });
        return (
          <Card key={svc.key} svc={svc.key} api={api} testId={`card-recurring-${svc.key}`}>
            <div className="flex items-baseline justify-between border-b px-4 py-2">
              <h3 className="text-sm font-semibold">{svc.label}</h3>
              {all.some(r => r.kind === "round") && <span className="text-[11px] text-muted-foreground">{t("serviceCalendar.rounds")}: {all.filter(r => r.kind === "round").length}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-1.5 text-left font-medium">{t("serviceCalendar.colVisit")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("serviceCalendar.colSeason")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("serviceCalendar.colPattern")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("serviceCalendar.colIncludes")}</th>
                    {!ro && <th className="w-24" />}
                  </tr>
                </thead>
                <tbody>
                  {rec.map((r, i) => {
                    const id = `${svc.key}-recurring-${i}`;
                    return (
                      <tr key={r.uid} className="group border-t border-border/60 align-top transition-colors hover:bg-muted/40 animate-in fade-in duration-200" data-testid={`row-${id}`}>
                        <td className="px-4 py-1.5 min-w-[10rem]">
                          {ro ? <span className="font-medium" data-testid={`text-name-${id}`}>{r.name}</span>
                            : <input value={r.name} maxLength={80} placeholder={t("serviceCalendar.newVisit")} onChange={e => patch(r.uid, { name: e.target.value })} className={inputCls} data-testid={`input-name-${id}`} />}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className="inline-flex flex-wrap items-center gap-1">
                            <MdPicker value={r.opensMd} disabled={ro} label={`${r.name} opens`} testId={`opens-${id}`} onChange={v => patch(r.uid, { opensMd: v })} />
                            <span className="text-muted-foreground">–</span>
                            <MdPicker value={r.dueMd} disabled={ro} label={`${r.name} ends`} testId={`due-${id}`} onChange={v => patch(r.uid, { dueMd: v })} />
                          </span>
                          {crossesYear(r) && <div className="text-[10px] font-medium" style={{ color: "var(--svc-winter)" }}>{t("serviceCalendar.crossesYear")}</div>}
                        </td>
                        <td className="px-2 py-1.5 min-w-[12rem]">
                          {ro ? <span className="text-muted-foreground" data-testid={`text-pattern-${id}`}>{r.pattern}</span>
                            : <textarea rows={2} value={r.pattern ?? ""} onChange={e => patch(r.uid, { pattern: e.target.value })} className={`${inputCls} h-auto py-1 resize-y`} aria-label={t("serviceCalendar.colPattern")} data-testid={`input-pattern-${id}`} />}
                        </td>
                        <td className="px-2 py-1.5 min-w-[12rem]">
                          {ro ? <span className="text-muted-foreground" data-testid={`text-includes-${id}`}>{r.includes}</span>
                            : <textarea rows={2} value={r.includes ?? ""} onChange={e => patch(r.uid, { includes: e.target.value })} className={`${inputCls} h-auto py-1 resize-y`} aria-label={t("serviceCalendar.colIncludes")} data-testid={`input-includes-${id}`} />}
                        </td>
                        {!ro && (
                          <td className="px-2 py-1.5">
                            <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                              <IconBtn label={t("serviceCalendar.moveUp")} disabled={i === 0} onClick={() => move(r.uid, -1)} testId={`button-up-${id}`}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                              <IconBtn label={t("serviceCalendar.moveDown")} disabled={i === rec.length - 1} onClick={() => move(r.uid, 1)} testId={`button-down-${id}`}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                              <IconBtn label={t("serviceCalendar.remove")} danger onClick={() => api.edit(svc.key, list => list.filter(x => x.uid !== r.uid))} testId={`button-remove-${id}`}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!ro && (
              <div className="flex items-center gap-2 border-t bg-[hsl(var(--rail))] px-4 py-1.5">
                <Button size="sm" variant="ghost" className="h-7 -ml-2 text-[hsl(var(--rail-heading))]" onClick={() => add(svc.key)} disabled={rec.length >= 24} data-testid={`button-add-visit-${svc.key}`}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{t("serviceCalendar.addVisit")}
                </Button>
                <div className="flex-1"><SaveBar place="recurring-" svc={svc.key} api={api} note={all.some(r => r.kind === "round") ? t("serviceCalendar.savesTogether") : undefined} /></div>
              </div>
            )}
          </Card>
        );
      })}
      {!ro && addable.length > 0 && (
        <div className="flex items-center gap-2">
          <select value={addKey} onChange={e => setAddKey(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label={t("serviceCalendar.addVisit")} data-testid="select-add-recurring-service">
            <option value="">{t("serviceCalendar.addVisit")}…</option>
            {addable.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <Button size="sm" variant="outline" className="h-8" disabled={!addKey} onClick={() => { add(addKey); setAddKey(""); }} data-testid="button-add-recurring-service">
            <Plus className="h-3.5 w-3.5 mr-1" />{t("serviceCalendar.addVisit")}
          </Button>
        </div>
      )}
    </div>
  );
}
