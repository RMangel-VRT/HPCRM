import type { AgreementTerm, AgreementLine, TermRate, TermScopeLine, RateCardItem } from "@workspace/db";
import { initialScope, type PackageCalendarEntry } from "@workspace/api-zod/contractScope";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { addCalendarDays } from "./companyDay";
import {
  applies, buildScope, cents, ContractCenterError, increasedPayments, paymentSummary, renewalCoverage, renewalDates,
  renewalRates, rateChanges, scaledPayments, snapshotRates, validateSnow, renewSchema, type Payments, scopeSchema,
} from "./contractCenterService";
import type { z } from "zod/v4";

export function renewalScope(old: Array<Omit<z.infer<typeof scopeSchema>[number], "details"> & { line?: string; details?: unknown; sortOrder?: number }>, oldLine: AgreementLine,
  line: AgreementLine, mode: "carry" | "standard", calendar: readonly PackageCalendarEntry[] = []) {
  const standard = initialScope(line, SCOPE_CATALOG, calendar).filter(s => s.included);
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
const total = (p: Payments) => p.filter(l => !l.fee).reduce((n, l) => n + l.months.reduce((s, m) => s + m.amountCents, 0), 0);
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
  oldRates: TermRate[], card: RateCardItem[], body: z.infer<typeof renewSchema>, calendar: readonly PackageCalendarEntry[] = []) {
  if (body.paymentFees) {
    const names = body.paymentFees.map(p => p.component);
    if (new Set(names).size !== names.length || names.some(name => !payments.some(p => p.component === name)))
      throw new ContractCenterError(400, "Renewal fee choices must identify unique source payment components");
    payments = payments.map(p => ({ ...p, fee: body.paymentFees!.find(f => f.component === p.component)?.fee ?? p.fee }));
  }
  const line = body.line ?? source.line, form = body.form ?? source.form;
  const coverage = renewalCoverage(source, line, payments);
  const carried = renewalRates(oldRates, card, line);
  const rates = Array.isArray(body.rates) ? snapshotRates(card, body.rates, line) : carried.rates;
  const changesToRates = Array.isArray(body.rates) ? rateChanges(oldRates, rates) : carried.changes;
  const scope = renewalScope(oldScope, source.line, line, body.scope, calendar);
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
    const dates = body.laterYearPcts.length || source.paymentSchedule === "explicit" ? twelveMonthDates(previousEnd) : renewalDates(source);
    const summary = paymentSummary(after, line, coverage.snowPricing);
    const fields = { ...dates, line, form, status: "draft" as const,
      renewalIncreasePct: equivalent === null ? null : equivalent.toFixed(2),
      legalName: source.legalName, managingAgentName: source.managingAgentName,
      projectContact: source.projectContact, contactPhone: source.contactPhone, contactEmail: source.contactEmail,
      projectAddress: source.projectAddress, snowTriggers: source.snowTriggers, po: source.po, notes: source.notes,
      snowPricing: coverage.snowPricing, snowFlatPriceCents: snow, paymentSchedule: "pattern" as const,
      annualPriceCents: summary.annualPriceCents, billingType: summary.billingType };
    validateSnow(line, fields);
    previous = after; previousEnd = dates.endDate;
    return { ...fields, before, after, payments: [...new Set([...before, ...after].map(p => p.component))].map(component => ({
      component, fee: !!after.find(p => p.component === component)?.fee,
      before: before.find(p => p.component === component)?.months ?? [], after: after.find(p => p.component === component)?.months ?? [],
    })), snowFlatPrice: { before: snowBefore, after: snow } };
  });
  return { ...years[0], agreementId: source.agreementId, renewedFromTermId: source.id,
    years, rateChanges: changesToRates, scopeChanges, changes, rates, scope, source: { line: source.line, form: source.form } };
}
