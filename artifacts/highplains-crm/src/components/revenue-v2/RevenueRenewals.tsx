import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RevenuePlanProjection } from "@workspace/api-client-react";
import { amount, ContractName, dash, dateLabel, RV, total } from "./RevenuePlanningShared";
import { changePct, money, pct } from "./revenueFormat";

const R = `${RV}.renewals`;
const P = `${RV}.planning`;
const kinds = ["inEffect", "signed", "atRisk", "notRenewing"] as const;
type Kind = typeof kinds[number];
type Row = RevenuePlanProjection["renewals"][Kind][number];

export function RevenueRenewals({ projection }: { projection: RevenuePlanProjection }) {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<Kind>("atRisk");
  const data = projection.renewals;
  const date = (day: string | null, monthOnly = false) => dateLabel(day, i18n.language, monthOnly);
  const percentage = (now: number | null, was: number | null) =>
    now === null || was === null ? dash : pct(changePct(now, was), { signed: true, digits: 1 }) ?? dash;
  const comparable = data.signed.filter(row => row.annualCents !== null && row.previousAnnualCents !== null);
  const signedDelta = comparable.length ? percentage(total(comparable.map(r => r.annualCents ?? 0)),
    total(comparable.map(r => r.previousAnnualCents ?? 0))) : dash;
  const titles = {
    inEffect: ["customer", "season", "runs", "pattern", "annual"],
    signed: ["customer", "nextSeason", "starts", "was", "now", "change"],
    atRisk: ["customer", "season", "ends", "annual", "draft"],
    notRenewing: ["customer", "season", "lastBilled", "annualLost", "reason"],
  };
  const rows: Row[] = data[kind];

  return <div className="space-y-4" data-testid="revenue-renewals">
    <div className="rv-kpis" role="group" aria-label={t(`${R}.groups`)}>
      {kinds.map(key => {
        const rows = data[key];
        const known = rows.flatMap(row => row.annualCents === null ? [] : [row.annualCents]);
        return <button type="button" key={key} aria-pressed={kind === key} aria-controls="revenue-renewal-drilldown"
          data-testid={`button-revenue-renewals-${key}`}
          className={`rv-card rv-card-pad text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${kind === key ? "ring-2 ring-primary" : "hover:bg-muted/30"}`}
          onClick={() => setKind(key)}>
          <div className="rv-card-title">{t(`${R}.cards.${key}`)}</div>
          <div className="rv-plan-stat">{rows.length && !known.length ? dash : money(total(known))}</div>
          <div className="rv-muted text-xs">{t(`${R}.count`, { count: rows.length })}
            {key === "signed" && ` · ${t(`${R}.signedComparison`, { value: signedDelta })}`}
            {key === "atRisk" && ` · ${t(`${R}.within`, { count: data.windowDays })}`}</div>
          {known.length !== rows.length && <div className="rv-muted text-xs">{t(`${R}.unknownValue`)}</div>}
        </button>;
      })}
    </div>
    <section className="rv-card" id="revenue-renewal-drilldown">
      <h2 className="rv-card-title px-4 py-3">{t(`${R}.cards.${kind}`)}</h2>
      {!rows.length ? <p className="rv-muted px-4 pb-4 text-sm">{t(`${R}.empty`)}</p> :
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t(`${R}.cards.${kind}`)}>
          <table className="rv-plan-table">
            <thead><tr>{titles[kind].map(key =>
              <th scope="col" key={key} className={["annual", "annualLost", "was", "now", "change"].includes(key) ? "rv-plan-num" : undefined}>
                {t(`${R}.columns.${key}`)}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.agreementId} data-testid={`row-revenue-renewal-${row.agreementId}`}>
              <th scope="row"><ContractName agreementId={row.agreementId}>{row.customerName}</ContractName></th>
              <td>{row.seasonLabel}</td>
              {"billingType" in row && <>
                <td className="whitespace-nowrap">{date(row.startDate)} – {date(row.endDate)}</td>
                <td>{row.billingType ? t(`${R}.patterns.${row.billingType}`) : dash}</td>
                <td className="rv-plan-num">{amount(row.annualCents)}</td>
              </>}
              {"previousAnnualCents" in row && <>
                <td className="whitespace-nowrap">{date(row.startDate)}</td>
                <td className="rv-plan-num">{amount(row.previousAnnualCents)}</td>
                <td className="rv-plan-num">{amount(row.annualCents)}</td>
                <td className="rv-plan-num">{percentage(row.annualCents, row.previousAnnualCents)}</td>
              </>}
              {"daysLeft" in row && <>
                <td className="whitespace-nowrap">{date(row.endDate)}{" "}
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">{t(`${R}.days`, { count: row.daysLeft })}</span></td>
                <td className="rv-plan-num">{amount(row.annualCents)}</td>
                <td>{t(`${P}.draft.${row.draftStatus ?? "none"}`)}</td>
              </>}
              {"lastMonth" in row && <>
                <td className="whitespace-nowrap">{date(row.lastMonth, true)}</td>
                <td className="rv-plan-num text-destructive">{amount(row.annualCents)}</td>
                <td>{row.reason ? t(`nonRenewal.reasons.${row.reason}`, { defaultValue: row.reason }) : dash}</td>
              </>}
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  </div>;
}
