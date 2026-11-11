import { useTranslation } from "react-i18next";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServiceCalendarUsage } from "../../../../../lib/db/src/serviceCalendarContracts";
import { newUid, type DraftRow, type ServiceApi } from "./helpers";
import { Card, IconBtn, MdPicker, SaveBar } from "./parts";

export function ChecklistCard({ serviceKey: svc, label, usage, api }: { serviceKey: string; label: string; usage: ServiceCalendarUsage | undefined; api: ServiceApi }) {
  const { t } = useTranslation();
  const row = api.rows(svc).find(r => r.kind === "checklist");
  const ro = !api.canWrite;
  const patch = (p: Partial<DraftRow>) => api.edit(svc, list => list.map(r => (r.kind === "checklist" ? { ...r, ...p } : r)));
  const add = () => api.edit(svc, list => [...list, { uid: newUid(), kind: "checklist", name: label, opensMd: "01-01", dueMd: "12-31", inStandard: false, pattern: null, includes: null }]);
  const id = `${svc}-checklist`;
  return (
    <Card svc={svc} api={api} testId={`card-checklist-${svc}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <ClipboardCheck className="h-4 w-4 text-[hsl(var(--rail-heading))]" />
        {row ? (
          <>
            {ro ? <span className="text-sm font-semibold" data-testid={`text-name-${id}`}>{row.name}</span> : (
              <input value={row.name} maxLength={80} onChange={e => patch({ name: e.target.value })}
                className="h-8 w-56 rounded-md border bg-background px-2 text-sm font-medium transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40"
                aria-label={label} data-testid={`input-name-${id}`} />
            )}
            <span className="inline-flex items-center gap-1.5 text-sm">
              <MdPicker value={row.opensMd} disabled={ro} label={`${label} opens`} testId={`opens-${id}`} onChange={v => patch({ opensMd: v })} />
              <span className="text-muted-foreground">–</span>
              <MdPicker value={row.dueMd} disabled={ro} label={`${label} deadline`} testId={`due-${id}`} onChange={v => patch({ dueMd: v })} />
            </span>
            {!ro && (
              <IconBtn label={t("serviceCalendar.remove")} danger onClick={() => api.edit(svc, list => list.filter(r => r.kind !== "checklist"))} testId={`button-remove-${id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums" data-testid={`text-seasons-${svc}`}>{t("serviceCalendar.seasons", { count: usage?.seasons ?? 0 })}</span>
        {!row && !ro && (
          <Button size="sm" variant="outline" className="h-7" onClick={add} data-testid={`button-add-checklist-${svc}`}><Plus className="h-3.5 w-3.5 mr-1" />{label}</Button>
        )}
      </div>
      {api.canWrite && <div className="border-t px-4 py-1.5"><SaveBar svc={svc} api={api} /></div>}
    </Card>
  );
}
