import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useCustomerContractSummary, type ContractSummaryTerm } from "@/hooks/useCustomerContractSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";

export const contractTermHref = (t: ContractSummaryTerm) =>
  `/dashboard/contracts/${t.agreementId}#term-${t.termId}`;
export function CoverageLabel({ landscape, snow }: { landscape: boolean; snow: boolean }) {
  const { t } = useTranslation();
  return <>{t(`cp1.${landscape ? snow ? "both" : "landscape" : snow ? "snow" : "noContract"}`)}</>;
}
export function CustomerContractValue({ customerId }: { customerId: string }) {
  const { data, isLoading, error } = useCustomerContractSummary(customerId);
  const { t, i18n } = useTranslation();
  const current = data?.current ?? [];
  const own = current.filter(t => !t.parentCustomerId);
  const priced = own.filter(t => t.annualCents != null);
  const amount = priced.length ? priced.reduce((n, t) => n + t.annualCents!, 0) : null;
  const tm = own.some(t => t.snowPricing === "time_and_materials");
  return <Card data-testid="card-annual-contract-value">
    <CardHeader><CardTitle>{t("cp1.annualValue")}</CardTitle></CardHeader>
    <CardContent>
      <p className="text-2xl font-semibold" data-testid="text-annual-value">{isLoading ? "…" : formatCurrency(amount, true, i18n.language)}</p>
      {error ? <p role="alert">{t("cp1.loadFailed")}</p> : <p>{t("cp1.activeAgreements", { count: current.length })}</p>}
      {tm && <p>{t("cp1.timeAndMaterials")}</p>}
      {current.some(t => t.parentCustomerId) && <p>{t("cp1.parentValue")}</p>}
    </CardContent>
  </Card>;
}
export function CustomerActiveAgreements({ customerId }: { customerId: string }) {
  const { data, error } = useCustomerContractSummary(customerId);
  const { t } = useTranslation();
  return <Card data-testid="card-active-contracts">
    <CardHeader><CardTitle>{t("cp1.activeContracts")}</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      {error ? <p role="alert">{t("cp1.loadFailed")}</p> : !data?.current.length && <p>{t("cp1.noContract")}</p>}
      {data?.current.map((term, i) => <div key={term.termId ?? i} className="flex justify-between gap-2">
        {term.termId ? <Link href={contractTermHref(term)} className="underline">{term.label} · {t(`cp1.${term.line}`)}</Link>
          : <span>{term.label} · {t(`cp1.${term.line}`)}</span>}
        <span>{term.startDate} – {term.endDate}</span>
      </div>)}
    </CardContent>
  </Card>;
}

/** Independent billing/rate panels share selection semantics, not editable data.
 * Default is only current. Historical/future terms require explicit selection.
 */
export function CustomerContractPanel({ customerId, kind }: { customerId: string; kind: "revenue" | "monthly" | "rates" }) {
  const { data, isLoading, error } = useCustomerContractSummary(customerId);
  const { t, i18n } = useTranslation();
  const [selection, setSelection] = useState("");
  const rows = [...(data?.current ?? []).map(term => ({ term, period: "current" })),
    ...(data?.upcoming ?? []).map(term => ({ term, period: "upcoming" })),
    ...(data?.previous ?? []).map(term => ({ term, period: "previous" }))];
  const term = selection ? rows.find(r => r.term.termId === selection)?.term : data?.current[0];
  const money = (value: number | null | undefined) => formatCurrency(value, false, i18n.language);
  return <Card data-testid={`cp1-${kind}`}>
    <CardHeader><CardTitle>{t(`cp1.${kind}`)}</CardTitle><p>{t(`cp1.${kind}Desc`)}</p></CardHeader>
    <CardContent className="space-y-4">
      {isLoading ? <p>{t("common.loading")}</p> : error ? <p role="alert">{t("cp1.loadFailed")}</p> : <>
        <label className="flex gap-2 items-center">{t("cp1.term")}
          <select value={selection} onChange={e => setSelection(e.target.value)} className="border rounded p-2 bg-background" aria-label={t("cp1.term")}>
            <option value="">{t("cp1.current")}</option>
            {rows.map(({ term: row, period }) => <option key={`${period}:${row.termId}`} value={row.termId}>
              {t(`cp1.${period}`)} · {row.label} · {t(`cp1.${row.line}`)}
            </option>)}
          </select>
        </label>
        {!term ? <p>{t("cp1.noContract")}</p> : <>
          <p>{term.label} · {term.startDate} – {term.endDate}</p>
          {term.parentCustomerId && <p>{t("cp1.parentValue")}</p>}
          {term.termId && <Link className="text-primary underline" href={contractTermHref(term)}>{t("cp1.editOnContract")}</Link>}
          {kind === "rates" ? <table className="w-full text-sm"><thead><tr><th className="text-left">{t("cp1.rate")}</th><th>{t("cp1.unit")}</th><th>{t("cp1.amount")}</th></tr></thead>
            <tbody>{term.rates?.map(r => <tr key={r.rateKey} className="border-b">
              <td className="py-2">{r.label}</td><td className="text-center">{t(`cp1.units.${r.unit}`, { defaultValue: r.unit })}</td>
              <td className="text-right">{r.priceCents == null ? r.priceText ?? "—" : money(r.priceCents)}</td>
            </tr>)}</tbody></table> : <>
            <p className="text-xl font-semibold" data-testid="cp1-annual">{money(term.annualCents)}</p>
            {term.snowPricing === "time_and_materials" && <p>{t("cp1.timeAndMaterials")}</p>}
            <table className="w-full text-sm"><thead><tr><th className="text-left">{t("cp1.month")}</th><th>{t("cp1.component")}</th><th>{t("cp1.amount")}</th></tr></thead>
              <tbody>{term.billingMonths?.map((m, i) => <tr key={`${m.month}:${m.component}:${i}`} className="border-b">
                <td className="py-2">{m.month}</td><td className="text-center">{m.component}</td><td className="text-right">{money(m.amountCents)}</td>
              </tr>)}</tbody></table>
          </>}
          {(term.line === "snow" || term.line === "both") && <p className={!term.snowTriggers?.trim() ? "text-amber-700" : ""}>
            {t("cp1.snowTriggers")}: {term.snowTriggers?.trim() || t("cp1.notStated")}
          </p>}
        </>}
      </>}
    </CardContent>
  </Card>;
}
