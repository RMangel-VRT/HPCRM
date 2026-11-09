import { MONTHS, dollarCents, type CsvRow } from "./contractAuditFiles";
import { ContractCenterError, preparePayments, type Payments, type PaymentInput } from "./contractCenterService";
import type { AgreementLine } from "@workspace/db";

/** Shared by audit and renewal preview/execution. Never infer pre-start consent. */
export function paymentCsvInput(rows: CsvRow[], allowPreStart = false): PaymentInput {
  const fee = (row: CsvRow) => {
    if (row.values.fee && row.values.fee !== "yes") throw new ContractCenterError(400, "fee must be yes or blank");
    return row.values.fee === "yes";
  };
  const dated = rows.some(r => /^\d{4}-/.test(r.values.month ?? ""));
  if (dated) {
    if (rows.some(r => !/^\d{4}-\d{2}$/.test(r.values.month ?? "") ||
      MONTHS.some(m => r.values[m] && dollarCents(r.values[m]) !== 0)))
      throw new ContractCenterError(400, "Dated schedules require YYYY-MM months on every row and no monthly pattern amounts");
    return { schedule: "explicit", allowPreStart, rows: rows.map(r => ({
      component: r.values.payment_line, month: `${r.values.month}-01`,
      amountCents: dollarCents(r.values.amount ?? ""), fee: fee(r),
    })) };
  }
  const patterns = new Map<string, Payments[number]>();
  for (const row of rows) {
    const v = row.values, flag = fee(row), existing = patterns.get(v.payment_line);
    if (existing && !!existing.fee !== flag) throw new ContractCenterError(400, `Mixed fee flags for payment component ${v.payment_line}`);
    if (v.month) {
      if (!/^(?:[1-9]|1[0-2])$/.test(v.month) || MONTHS.some(m => v[m]))
        throw new ContractCenterError(400, "Pattern month must be 1–12; do not mix row and wide month formats");
      const p = existing ?? { component: v.payment_line, fee: flag, months: [] };
      p.months.push({ month: Number(v.month), amountCents: dollarCents(v.amount ?? "") });
      patterns.set(v.payment_line, p);
    } else {
      if (existing) throw new ContractCenterError(400, "Duplicate payment component");
      patterns.set(v.payment_line, { component: v.payment_line, fee: flag, months: MONTHS.flatMap((m, i) =>
        v[m] ? [{ month: i + 1, amountCents: dollarCents(v[m]) }].filter(r => r.amountCents > 0) : []) });
    }
  }
  return [...patterns.values()];
}

export function prepareCsvPayments(rows: CsvRow[], start: string, end: string, line: AgreementLine,
  snowPricing?: string, consent?: string) {
  if (consent && consent !== "yes") throw new ContractCenterError(400, "allow_pre_start must be yes or blank");
  return preparePayments(paymentCsvInput(rows, consent === "yes"), start, end, line, snowPricing);
}
