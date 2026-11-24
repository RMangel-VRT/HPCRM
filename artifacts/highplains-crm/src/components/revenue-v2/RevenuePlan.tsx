import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetRevenueTargetsQueryKey, useGetRevenueTargets, useSaveRevenuePlan,
  type RevenuePlanPatch, type RevenuePlanProjection,
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { amount, ContractName, dash, dateLabel, RV, Stat, total, useCreateTarget } from "./RevenuePlanningShared";
import { changePct, money, pct, ratioPct, streamKeys } from "./revenueFormat";
import { revenuePrefix, revenueQuery, revenueRequest, type RevenueScope } from "./revenueQueries";

const P = `${RV}.planning`;
type PlanField = Exclude<keyof RevenuePlanPatch, "goalCents" | "snowYears">;
const rules: Record<PlanField, [number, number, number]> = {
  renewalIncreasePct: [-10, 20, .01], keptPct: [0, 100, 1],
  irrigationGrowthPct: [-50, 100, .01], projectsGrowthPct: [-50, 100, .01], extraGrowthPct: [-50, 100, .01],
};

function Assumption({ field, value, admin, pending, save }: {
  field: PlanField; value: number; admin: boolean; pending: boolean; save: (patch: RevenuePlanPatch) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [min, max, step] = rules[field];
  const label = t(`${P}.${field}`);
  async function commit(input: HTMLInputElement) {
    if (draft === undefined || pending) return;
    const parsed = input.valueAsNumber;
    if (!input.validity.valid || !Number.isFinite(parsed)) {
      input.reportValidity();
      setFailed(true);
      return;
    }
    if (parsed === value || await save({ [field]: parsed })) {
      setDraft(undefined);
      setFailed(false);
    } else setFailed(true);
  }
  return <label className="flex items-center justify-between gap-2 whitespace-nowrap text-xs">
    <span>{label}</span>
    {admin ? <Input aria-label={label} type="number" min={min} max={max} step={step} required
      aria-invalid={failed || undefined} className="h-8 w-[5.25rem] px-2" readOnly={pending}
      data-testid={`input-revenue-plan-${field}`} value={draft ?? value}
      onChange={e => { setDraft(e.target.value); setFailed(false); }}
      onBlur={e => void commit(e.currentTarget)}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void commit(e.currentTarget); } }} />
      : <strong>{pct(value, { digits: Number.isInteger(value) ? 0 : 2 })}</strong>}
  </label>;
}

export function RevenuePlan({ projection, scope, renewalsHref, onTargetSaved }: {
  projection: RevenuePlanProjection; scope: RevenueScope; renewalsHref: string; onTargetSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { plan, base, planned, bridge, renewalsPending, pipeline, baseQboMissing } = projection;
  const year = plan.year, previous = year - 1;
  const cache = useQueryClient();
  const { mutateAsync, isPending } = useSaveRevenuePlan({ request: revenueRequest(scope) });
  const create = useCreateTarget(scope, year, onTargetSaved);
  const targetKey = getGetRevenueTargetsQueryKey(year);
  const existingTargets = useGetRevenueTargets(year, revenueQuery(scope, targetKey, scope.admin));
  const writing = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [goal, setGoal] = useState<string>();
  const [confirmTarget, setConfirmTarget] = useState(false);
  const pending = isPending || refreshing || create.pending;
  const goalValue = plan.goalCents === null ? "" : String(Math.round(plan.goalCents / 100));
  const keys = streamKeys(planned);
  const planTotal = total(keys.map(key => planned[key]?.forecastCents ?? 0));
  const signed = total(keys.map(key => planned[key]?.signedCents ?? 0));
  const priorTotal = total(streamKeys(base).map(key => base[key]?.forecastCents ?? 0));
  const gap = plan.goalCents === null ? null : plan.goalCents - planTotal;
  const percent = (v: number | null) => pct(v, { signed: true, digits: 1 }) ?? dash;
  const rows = [
    { label: t(`${P}.bridgeThisYear`, { year: previous }), value: bridge.startCents, bold: true },
    { label: t(`${P}.bridgeLost`, { count: bridge.lost.length }), value: -bridge.lostCents },
    { label: t(`${P}.bridgeCarried`, { year }), value: bridge.carriedCents, bold: true },
    { label: t(`${P}.signedFor`, { year }), value: bridge.signedCents },
    { label: t(`${P}.bridgeExpected`, { kept: plan.keptPct, increase: pct(plan.renewalIncreasePct, {
      signed: true, digits: Number.isInteger(plan.renewalIncreasePct) ? 0 : 2,
    }) }), value: bridge.expectedCents },
    { label: t(`${P}.bridgeTotal`, { year }), value: bridge.totalCents, bold: true },
    { label: t(`${P}.bridgeNet`), value: bridge.totalCents - bridge.carriedCents, delta: true },
  ];
  const scale = Math.max(1, ...rows.map(row => Math.abs(row.value)));

  async function save(patch: RevenuePlanPatch) {
    if (!scope.admin || writing.current || create.pending) return false;
    writing.current = true;
    setRefreshing(true);
    try {
      await mutateAsync({ year, data: patch });
    } catch {
      toast({ variant: "destructive", title: t(`${P}.saveError`) });
      return false;
    } finally {
      // Keep submissions serialized through the refetch so that an older
      // projection cannot switch the inputs back while new writes are queued.
      try { await cache.invalidateQueries({ queryKey: revenuePrefix(scope) }); }
      finally { writing.current = false; setRefreshing(false); }
    }
    return true;
  }
  const saveGoal = async (e: FormEvent) => {
    e.preventDefault();
    if (goal === undefined || goal === goalValue) return;
    const cents = goal === "" ? null : Number(goal) * 100;
    if (cents !== null && (!Number.isSafeInteger(cents) || cents < 0)) return;
    if (await save({ goalCents: cents })) setGoal(undefined);
  };
  const assumption = (field: PlanField) =>
    <Assumption key={field} field={field} value={plan[field]} admin={scope.admin} pending={pending} save={save} />;
  const assumptions: Record<string, ReactNode> = {
    contract: <div className="space-y-1">{assumption("keptPct")}{assumption("renewalIncreasePct")}</div>,
    snow: scope.admin ? <label className="flex flex-wrap items-center gap-1 text-xs">
      <span>{t(`${P}.snowAverageLabel`)}</span>
      <select aria-label={t(`${P}.snowYears`)} className="h-8 rounded-md border bg-background px-1"
        value={plan.snowYears} disabled={pending} data-testid="select-revenue-plan-snow-years"
        onChange={e => void save({ snowYears: Number(e.target.value) })}>
        {(plan.snowYears === 5 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]).map(n => <option key={n}>{n}</option>)}
      </select>
      <span>{t(`${P}.winters`)}</span>
    </label> : t(`${P}.snowAverage`, { count: plan.snowYears }),
    irrigation: assumption("irrigationGrowthPct"), projects: assumption("projectsGrowthPct"), extra: assumption("extraGrowthPct"),
  };
  const saveAsTarget = () => {
    if (writing.current || !existingTargets.data) return;
    if (existingTargets.data.saved) setConfirmTarget(true);
    else void create.create();
  };

  return <div className="space-y-4" data-testid="revenue-plan">
    {scope.admin && <div className="flex flex-wrap items-center justify-end gap-2">
      {existingTargets.isError && <Button variant="outline" onClick={() => void existingTargets.refetch()}>{t(`${RV}.retry`)}</Button>}
      {!confirmTarget ? <Button onClick={saveAsTarget} disabled={pending || !existingTargets.data || existingTargets.isError}
        data-testid="button-revenue-save-as-target">{t(`${P}.saveTarget`, { year })}</Button>
        : <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={t(`${P}.replaceTarget`, { year })}>
          <span>{t(`${P}.replaceTarget`, { year })}</span>
          <Button variant="outline" disabled={pending} onClick={() => setConfirmTarget(false)}>{t(`${P}.cancel`)}</Button>
          <Button disabled={pending} onClick={() => { if (!writing.current) void create.create(); }} data-testid="button-revenue-confirm-target">{t(`${P}.confirmReplace`)}</Button>
        </div>}
    </div>}
    <div className="rv-kpis">
      {scope.admin ? <form onSubmit={saveGoal} className="rv-card rv-card-pad">
        <label className="rv-card-title" htmlFor="revenue-plan-goal">{t(`${P}.goal`)}</label>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span aria-hidden="true">$</span>
          <Input id="revenue-plan-goal" type="number" min={0} max={Math.floor(Number.MAX_SAFE_INTEGER / 100)} step={1}
            className="h-8 min-w-0 flex-1 basis-24 tabular-nums" value={goal ?? goalValue} onChange={e => setGoal(e.target.value)}
            readOnly={pending} data-testid="input-revenue-plan-goal" />
          <Button type="submit" size="sm" variant="outline" disabled={pending || goal === undefined || goal === goalValue}
            data-testid="button-revenue-save-goal">{t(`${RV}.targets.save`)}</Button>
        </div>
      </form> : <Stat label={t(`${P}.goal`)} value={amount(plan.goalCents)} />}
      <Stat label={t(`${P}.signedFor`, { year })} value={money(signed)}
        detail={plan.goalCents ? t(`${P}.goalShare`, { percent: pct(ratioPct(signed, plan.goalCents)) }) : t(`${P}.noGoal`)} />
      <Stat label={t(`${P}.planTotal`)} value={money(planTotal)} testId="text-revenue-plan-total"
        detail={baseQboMissing ? t(`${P}.partialBase`, { year: previous }) : t(`${P}.changeVs`, { year: previous, amount: money(planTotal - priorTotal, { signed: true }) })} />
      <Stat label={t(`${P}.${gap !== null && gap < 0 ? "aboveGoal" : "gap"}`)} value={gap === null ? dash : money(Math.abs(gap))}
        detail={gap !== null && gap > 0 ? t(`${P}.newContracts`, { count: Math.ceil(gap / 1_500_000) }) : undefined} />
    </div>
    {baseQboMissing && <p className="text-sm rv-muted">{t(`${P}.baseNote`, { year: previous })}</p>}
    <div className="rv-plan-grid" data-testid="revenue-plan-grid">
      <div className="min-w-0 space-y-4">
        <section className="rv-card">
          <h2 className="rv-card-title px-4 pt-4">{t(`${P}.bridge`)}</h2>
          <table className="rv-plan-table">
            <tbody>{rows.map(row => <tr key={row.label} className={row.value < 0 ? "text-destructive" : undefined}>
              <th scope="row" className={row.bold ? "font-semibold" : "font-normal"}>{row.label}</th>
              <td className="w-1/5"><div className="rv-bridge-meter" aria-hidden="true">
                <span data-negative={row.value < 0 || undefined} style={{ width: `${Math.abs(row.value) / scale * 100}%` }} />
              </div></td>
              <td className={`rv-plan-num ${row.bold ? "font-semibold" : ""}`}>{money(row.value, { signed: row.delta })}</td>
            </tr>)}</tbody>
          </table>
        </section>
        <section className="rv-card">
          <h2 className="rv-card-title px-4 pt-4">{t(`${P}.byStream`)}</h2>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t(`${P}.byStream`)}>
            <table className="rv-plan-table">
              <thead><tr>{[t(`${RV}.views.glance.colStream`), t(`${P}.forecastFor`, { year: previous }),
                t(`${P}.assumptions`), t(`${P}.planFor`, { year }), t(`${P}.change`), t(`${RV}.views.kinds.signed`)]
                .map((label, index) => <th scope="col" key={label} className={[1, 3, 4, 5].includes(index) ? "rv-plan-num" : undefined}>{label}</th>)}</tr></thead>
              <tbody>{keys.map(key => {
                const before = base[key]?.forecastCents, next = planned[key]?.forecastCents;
                return <tr key={key}>
                  <th scope="row" className="whitespace-nowrap">{t(`${RV}.views.streams.${key}`)}</th>
                  <td className="rv-plan-num">{amount(before ?? null)}</td>
                  <td>{assumptions[key] ?? dash}</td>
                  <td className="rv-plan-num font-semibold">{amount(next ?? null)}</td>
                  <td className="rv-plan-num">{baseQboMissing || next === undefined || before === undefined ? dash : percent(changePct(next, before))}</td>
                  <td className="rv-plan-num">{amount(planned[key]?.signedCents ?? null)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="min-w-0 space-y-4">
        <section className="rv-card rv-card-pad space-y-2">
          <h2 className="rv-card-title">{t(`${P}.decidingRenewals`, { year })}</h2>
          <ul className="divide-y text-sm">{renewalsPending.map(row => <li key={row.agreementId} className="py-2">
            <div className="flex flex-wrap justify-between gap-1"><ContractName agreementId={row.agreementId}>{row.customerName}</ContractName><strong>{money(row.annualCents)}</strong></div>
            <p className="rv-muted text-xs">{row.renewalDraft
              ? `${t(`${P}.draft.${row.renewalDraft.status}`)} · ${amount(row.renewalDraft.annualCents)}`
              : t(`${P}.draft.none`)}</p>
          </li>)}</ul>
          <p className="rv-muted text-xs">{t(`${P}.pendingSummary`, { amount: money(total(renewalsPending.map(row => row.annualCents))) })}
            {" · "}{t(`${P}.laterRenewals`, { count: projection.laterRenewalsCount, year })}</p>
          <Button asChild variant="outline" size="sm"><Link href={renewalsHref} data-testid="link-revenue-renewals">{t(`${RV}.tabs.renewals`)}</Link></Button>
        </section>
        <section className="rv-card rv-card-pad space-y-2">
          <h2 className="rv-card-title">{t(`${P}.pipeline`)}</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt>{t(`${P}.accepted`)}</dt><dd>{money(pipeline.acceptedLast12Cents)}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t(`${P}.waiting`)}</dt><dd>{money(pipeline.sentOpenCents)}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t(`${P}.winRate`)}</dt><dd>{pct(pipeline.winRatePct) ?? dash}</dd></div>
          </dl>
          <p className="rv-muted text-xs">{pipeline.winRatePct === null ? t(`${P}.unknownWinRate`)
            : t(`${P}.moreLikely`, { amount: money(Math.round(pipeline.sentOpenCents * pipeline.winRatePct / 100)) })}</p>
        </section>
        <section className="rv-card rv-card-pad space-y-2">
          <h2 className="rv-card-title">{t(`${P}.lostFor`, { year })}</h2>
          {bridge.lost.length ? <ul className="divide-y text-sm">{bridge.lost.map(row => <li key={row.agreementId} className="py-2">
            <div className="flex flex-wrap justify-between gap-1"><ContractName agreementId={row.agreementId}>{row.customerName}</ContractName>
              <strong className="text-destructive">{money(-row.cents)}</strong></div>
            <div className="rv-muted text-xs">{t(`${P}.lastBilled`)} {dateLabel(row.lastMonth, i18n.language, true)} · {row.reason
              ? t(`nonRenewal.reasons.${row.reason}`, { defaultValue: row.reason }) : dash}</div>
          </li>)}</ul> : <p className="rv-muted text-sm">{t(`${P}.noLosses`)}</p>}
        </section>
      </div>
    </div>
  </div>;
}
