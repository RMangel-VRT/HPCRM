import type { AgreementTerm, AgreementLine, TermRate, TermScopeLine, RateCardItem } from "@workspace/db";
import { initialScope } from "@workspace/api-zod/contractScope";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { addCalendarDays } from "./companyDay";
import {
  applies, buildScope, cents, ContractCenterError, increasedPayments, paymentSummary, renewalCoverage, renewalDates,
  renewalRates, scaledPayments, snapshotRates, validateSnow, renewSchema, type Payments, scopeSchema,
} from "./contractCenterService";
import type { z } from "zod/v4";

export function renewalScope(old: Array<Omit<z.infer<typeof scopeSchema>[number], "details"> & { line?: string; details?: unknown; sortOrder?: number }>, oldLine: AgreementLine,
  line: AgreementLine, mode: "carry" | "standard") {
  const standard = initialScope(line, SCOPE_CATALOG).filter(s => s.included);
  if (mode === "standard") return buildScope(standard, line);
  const retained = old.filter(s => applies(line, SCOPE_CATALOG.find(c => c.key === s.serviceKey)?.line ?? s.line ?? (oldLine === "snow" ? "snow" : "landscape")));
  const added = standard.filter(s => !applies(oldLine, s.line) && !retained.some(r => r.serviceKey === s.serviceKey));
  return buildScope([...retained.map(s => ({ ...s, details: zRecord(s.details) })), ...added], line)
    .map(s => {
      const previous = retained.find(r => r.serviceKey === s.serviceKey);
      // buildScope assigns new custom rows to the destination's default line;
      // carried custom rows already have their own seasonal coverage.
      if (previous?.line && s.serviceKey.startsWith("other:")) {
        if (!["landscape", "irrigation", "snow"].includes(previous.line))
          throw new ContractCenterError(400, "Invalid retained custom scope coverage");
        return { ...s, line: previous.line as typeof s.line, sortOrder: previous.sortOrder ?? s.sortOrder };
      }
      return { ...s, sortOrder: previous?.sortOrder ?? s.sortOrder };
    });
}
function zRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const total = (p: Payments) => p.reduce((n, l) => n + l.months.reduce((s, m) => s + m.amountCents, 0), 0);
export function twelveMonthDates(end: string) {
  const startDate = addCalendarDays(end, 1);
  const d = new Date(`${startDate}T00:00:00Z`), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  const endDate = addCalendarDays(d.toISOString().slice(0, 10), -1);
  const sy = startDate.slice(0, 4), ey = endDate.slice(0, 4);
  return { startDate, endDate, seasonLabel: sy === ey ? sy : `${sy}–${ey.slice(-2)}` };
}
export function planChangingRenewal(source: AgreementTerm, payments: Payments, oldScope: TermScopeLine[],
  oldRates: TermRate[], card: RateCardItem[], body: z.infer<typeof renewSchema>) {
  const line = body.line ?? source.line, form = body.form ?? source.form;
  const coverage = renewalCoverage(source, line, payments);
  const mode = body.rates ?? (form === "ours" && source.form !== form ? "card" : "carry");
  const carried = renewalRates(oldRates, card, line);
  const rates = mode === "card" ? snapshotRates(card, [], line) : carried.rates;
  const rateChanges = mode === "carry" ? carried.changes : [
    ...oldRates.filter(r => !rates.some(n => n.rateKey === r.rateKey)).map(r => ({
      rateKey: r.rateKey, label: r.label, old: { priceCents: r.priceCents, priceText: r.priceText },
      new: { priceCents: null, priceText: null }, reason: "removed",
    })),
    ...rates.map(r => {
      const old = oldRates.find(o => o.rateKey === r.rateKey);
      return { rateKey: r.rateKey, label: r.label, old: { priceCents: old?.priceCents ?? null, priceText: old?.priceText ?? null },
        new: { priceCents: r.priceCents, priceText: r.priceText }, reason: old ? "card changed" : "added" };
    }),
  ];
  const scope = renewalScope(oldScope, source.line, line, body.scope);
  const scopeChanges = {
    added: scope.filter(s => s.included && !oldScope.some(o => o.serviceKey === s.serviceKey && o.included)).map(s => s.serviceKey),
    removed: oldScope.filter(o => o.included && !scope.some(s => s.serviceKey === o.serviceKey && s.included)).map(s => s.serviceKey),
  };
  const changes = { ...(line !== source.line ? { line: [source.line, line] } : {}),
    ...(form !== source.form ? { form: [source.form, form] } : {}) };
  let previous = coverage.payments, previousEnd = source.endDate, snow = coverage.snowFlatPriceCents;
  const years = [body.increasePct, ...body.laterYearPcts].map((pct, i) => {
    const before = i === 0 ? payments : previous;
    const oldTotal = total(previous);
    const after = i === 0 && body.targetAnnualCents !== undefined
      ? scaledPayments(previous, body.targetAnnualCents, body.roundTo)
      : increasedPayments(previous, pct!, body.roundTo);
    const factor = i === 0 && body.targetAnnualCents !== undefined ? (oldTotal ? body.targetAnnualCents / oldTotal : null) : (100 + pct!) / 100;
    const equivalent = i === 0 && body.targetAnnualCents !== undefined
      ? (factor === null ? null : (factor - 1) * 100) : pct!;
    if (equivalent !== null && (!Number.isFinite(equivalent) || Math.abs(equivalent) > 999.99))
      throw new ContractCenterError(400, "Equivalent renewal percentage exceeds the supported range");
    const snowBefore = i === 0 ? source.snowFlatPriceCents : snow;
    snow = snow === null ? null : cents.parse(Math.round(snow * (factor ?? 1)));
    const dates = body.laterYearPcts.length ? twelveMonthDates(previousEnd) : renewalDates(source);
    const fields = { ...dates, line, form, status: "draft" as const,
      renewalIncreasePct: equivalent === null ? null : equivalent.toFixed(2),
      legalName: source.legalName, managingAgentName: source.managingAgentName,
      projectContact: source.projectContact, contactPhone: source.contactPhone, contactEmail: source.contactEmail,
      projectAddress: source.projectAddress, snowTriggers: source.snowTriggers, po: source.po, notes: source.notes,
      snowPricing: coverage.snowPricing, snowFlatPriceCents: snow, ...paymentSummary(after, line, coverage.snowPricing) };
    validateSnow(line, fields);
    previous = after; previousEnd = dates.endDate;
    return { ...fields, before, after, payments: [...new Set([...before, ...after].map(p => p.component))].map(component => ({
      component, before: before.find(p => p.component === component)?.months ?? [], after: after.find(p => p.component === component)?.months ?? [],
    })), snowFlatPrice: { before: snowBefore, after: snow } };
  });
  return { ...years[0], agreementId: source.agreementId, renewedFromTermId: source.id,
    years, rateChanges, scopeChanges, changes, rates, scope, source: { line: source.line, form: source.form } };
}
