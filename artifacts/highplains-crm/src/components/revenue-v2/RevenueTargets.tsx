import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetRevenueIncomeQueryKey, getGetRevenueTargetsQueryKey, useGetRevenueIncome, useGetRevenueTargets,
  useSaveRevenueTargets, type RevenueTargetUpdate, type RevenueTargets as Targets,
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { money, monthLabels, monthTotal, REVENUE_STREAMS } from "./revenueFormat";
import { dash, RevenueLoadState, RV, total, useCreateTarget } from "./RevenuePlanningShared";
import { revenueKey, revenuePrefix, revenueQuery, revenueRequest, type RevenueScope } from "./revenueQueries";
import { spreadTarget, TARGET_DOLLARS_MAX, wholeDollars } from "./revenueTargetSpread";

const T = `${RV}.targets`;
type Stream = typeof REVENUE_STREAMS[number];
type Edit = { annual?: string; months: Partial<Record<number, string>>; force?: boolean };
type Edits = Partial<Record<Stream, Edit>>;
const dollars = (cents: number) => String(Math.round(cents / 100));

function TargetGrid({ scope, data, nextYear }: { scope: RevenueScope; data: Targets; nextYear: number }) {
  const { t, i18n } = useTranslation();
  const [edits, setEdits] = useState<Edits>({});
  const [spreadError, setSpreadError] = useState<Stream>();
  const cache = useQueryClient();
  const saving = useRef(false);
  const { year } = data;
  const priorParams = { year: year - 1 };
  const prior = useGetRevenueIncome(priorParams, revenueQuery(scope, getGetRevenueIncomeQueryKey(priorParams), scope.admin && year > 2015));
  const create = useCreateTarget(scope, year);
  const update = useSaveRevenueTargets({ request: revenueRequest(scope) });
  const pending = update.isPending || create.pending;
  const labels = monthLabels(i18n.language);
  const grid = REVENUE_STREAMS.map(stream => {
    const edit = edits[stream];
    const cells = data.streams[stream].map((cents, i) => {
      const entered = edit?.months[i];
      const parsed = entered === undefined ? undefined : wholeDollars(entered, TARGET_DOLLARS_MAX);
      return { value: entered ?? dollars(cents), cents: entered === undefined ? cents : parsed === undefined ? null : parsed * 100 };
    });
    const sum = cells.some(cell => cell.cents === null) ? null : total(cells.map(cell => cell.cents ?? 0));
    return { stream, edit, cells, sum };
  });
  const streamName = (stream: Stream) => t(`${RV}.views.streams.${stream}`);
  const hasMonths = grid.some(({ edit }) => edit?.force || Object.keys(edit?.months ?? {}).length > 0);
  const dirty = grid.some(({ edit }) => edit && (edit.annual !== undefined || Object.keys(edit.months).length || edit.force));
  const blocked = grid.some(({ edit, sum }) => edit?.annual !== undefined || sum === null);
  const change = (stream: Stream, fn: (edit: Edit) => Edit) =>
    setEdits(prev => ({ ...prev, [stream]: fn(prev[stream] ?? { months: {} }) }));
  const spread = (stream: Stream, annual: string) => {
    if (!prior.data) return;
    const value = wholeDollars(annual, 12 * TARGET_DOLLARS_MAX);
    if (value === undefined) { setSpreadError(stream); return; }
    const split = spreadTarget(value, prior.data.streams[stream].months.map(monthTotal));
    if (split.some(n => n > TARGET_DOLLARS_MAX)) { setSpreadError(stream); return; }
    setSpreadError(undefined);
    change(stream, () => ({ months: Object.fromEntries(split.map((n, i) => [i, String(n)])), force: true }));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!scope.admin || blocked || !hasMonths || saving.current || pending) return;
    const streams: RevenueTargetUpdate["streams"] = {};
    for (const { stream, edit, cells } of grid) {
      const cents = cells.map(cell => cell.cents);
      if (cents.some(c => c === null)) return;
      if (edit?.force || cells.some((cell, i) => cell.cents !== data.streams[stream][i]))
        streams[stream] = cents as number[];
    }
    if (!Object.keys(streams).length) return;
    saving.current = true;
    try {
      const saved = await update.mutateAsync({ year, data: { streams } });
      cache.setQueryData(revenueKey(scope, getGetRevenueTargetsQueryKey(year)), saved);
      setEdits({});
      void cache.invalidateQueries({ queryKey: revenuePrefix(scope) });
      toast({ title: t(`${T}.saved`, { year }) });
    } catch {
      toast({ variant: "destructive", title: t(`${T}.saveError`) });
    } finally { saving.current = false; }
  };
  const sumCells = (select: (row: typeof grid[number]) => number | null) => {
    const values = grid.map(select);
    return values.some(value => value === null) ? dash : money(total(values.map(value => value ?? 0)));
  };
  const show = (cents: number) => data.saved ? money(cents) : dash;

  return <form onSubmit={save} className="space-y-3" data-testid="revenue-targets">
    {!data.saved && <div className="rv-card rv-card-pad flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm">{t(`${T}.empty`, { year })}</p>
      {scope.admin && year === nextYear && <Button type="button" variant="outline" onClick={() => void create.create()}
        disabled={pending || dirty} data-testid="button-revenue-create-target">{t(`${T}.create`, { year })}</Button>}
    </div>}
    {scope.admin && <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="rv-muted text-sm">{t(`${T}.spreadHint`)}
        {prior.data?.qboMissing && <div>{t(`${T}.priorPartial`, { year: year - 1 })}</div>}
        {prior.isError && <Button type="button" size="sm" variant="ghost" onClick={() => void prior.refetch()}>{t(`${T}.priorError`)}</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {dirty && <Button type="button" variant="outline" disabled={pending}
          data-testid="button-revenue-reset-targets" onClick={() => { setEdits({}); setSpreadError(undefined); }}>{t(`${T}.reset`)}</Button>}
        <Button type="submit" disabled={pending || !hasMonths || blocked} data-testid="button-revenue-save-targets">{t(`${T}.save`)}</Button>
      </div>
    </div>}
    <div className="rv-card overflow-x-auto" tabIndex={0} role="region" aria-label={t(`${T}.grid`, { year })}>
      <table className="rv-plan-table">
        <thead><tr><th scope="col" className="rv-target-stream">{t(`${RV}.views.glance.colStream`)}</th>
          <th scope="col" className="rv-plan-num">{t(`${T}.annual`)}</th>
          {labels.map(label => <th key={label} scope="col" className="rv-plan-num">{label}</th>)}
        </tr></thead>
        <tbody>{grid.map(({ stream, edit, cells, sum }) => {
          const annual = edit?.annual ?? (sum === null ? "" : dollars(sum));
          return <tr key={stream}>
            <th scope="row" className="rv-target-stream min-w-40">{streamName(stream)}</th>
            <td className="rv-plan-num">
              {scope.admin ? <div className="flex items-center justify-end gap-1">
                <Input type="number" min={0} max={12 * TARGET_DOLLARS_MAX} step={1} disabled={pending}
                  aria-label={t(`${T}.forStream`, { month: t(`${T}.annual`), stream: streamName(stream) })}
                  aria-invalid={spreadError === stream || undefined} className="h-8 w-24 px-1.5 text-right"
                  data-testid={`input-revenue-target-${stream}-annual`} value={annual}
                  onChange={e => { const value = e.target.value; setSpreadError(undefined); change(stream, old =>
                    ({ ...old, annual: sum !== null && value === dollars(sum) ? undefined : value })); }} />
                <Button size="sm" type="button" variant="outline" disabled={pending || !prior.data || sum === null && edit?.annual === undefined}
                  data-testid={`button-revenue-spread-${stream}`} aria-label={t(`${T}.spreadFor`, { stream: streamName(stream) })}
                  onClick={() => spread(stream, annual)}>{t(`${T}.spread`)}</Button>
              </div> : show(data.annual[stream])}
              {spreadError === stream && <div role="alert" className="text-xs text-destructive">{t(`${T}.spreadError`)}</div>}
            </td>
            {cells.map((cell, i) => <td key={i} className="rv-plan-num">
              {scope.admin ? <Input type="number" min={0} max={TARGET_DOLLARS_MAX} step={1} required disabled={pending}
                aria-label={t(`${T}.forStream`, { month: labels[i], stream: streamName(stream) })}
                aria-invalid={cell.cents === null || undefined} className="h-8 w-[5.25rem] px-1.5 text-right"
                data-testid={`input-revenue-target-${stream}-${i + 1}`} value={cell.value}
                onChange={e => {
                  const value = e.target.value;
                  change(stream, old => {
                    const months = { ...old.months };
                    if (!old.force && value === dollars(data.streams[stream][i])) delete months[i];
                    else months[i] = value;
                    return { ...old, months };
                  });
                }} /> : show(cell.cents ?? 0)}
            </td>)}
          </tr>;
        })}</tbody>
        <tfoot><tr>
          <th scope="row" className="rv-target-stream">{t(`${T}.total`)}</th>
          <td className="rv-plan-num" data-testid="text-revenue-target-annual">{data.saved || scope.admin ? sumCells(row => row.sum) : dash}</td>
          {labels.map((label, i) => <td className="rv-plan-num" key={label}>{data.saved || scope.admin ? sumCells(row => row.cells[i].cents) : dash}</td>)}
        </tr></tfoot>
      </table>
    </div>
    {scope.admin && blocked && <p className="rv-muted text-sm" role="status">{t(`${T}.resolveDraft`)}</p>}
  </form>;
}

export function RevenueTargets({ scope, year, currentYear, onYearChange }: {
  scope: RevenueScope; year: number; currentYear: number; onYearChange: (year: number) => void;
}) {
  const { t } = useTranslation();
  const query = useGetRevenueTargets(year, revenueQuery(scope, getGetRevenueTargetsQueryKey(year)));
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1" role="group" aria-label={t(`${RV}.year`)}>
      {[currentYear, currentYear + 1].map(n => <Button key={n} size="sm" variant={year === n ? "secondary" : "outline"}
        aria-pressed={year === n} onClick={() => onYearChange(n)} data-testid={`button-revenue-target-year-${n}`}>{n}</Button>)}
    </div>
    {(!query.data || query.isError) && <RevenueLoadState error={query.isError} retry={() => void query.refetch()} />}
    {query.data && <TargetGrid key={year} scope={scope} data={query.data} nextYear={currentYear + 1} />}
  </div>;
}
