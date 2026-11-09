import { describe, expect, it } from "vitest";
import {
  expandPayments, increasedPayments, monthAt, monthIndex, paymentSummary, preparePayments,
  recoverPayments, scaledPayments, seasonPaymentSummary, validateExplicitWindow,
} from "./contractCenterService";
import { paymentCsvInput, prepareCsvPayments } from "./contractPaymentCsv";
import { currentCsvTables, auditCsvTables } from "./contractAuditExport";
import { parseAuditFiles, type CsvRow } from "./contractAuditFiles";
import type { AuditData } from "./contractAuditData";

export const feePattern = (annual: number) => [
  { component: "Grounds", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: annual / 12 })) },
  { component: "Mobilization", fee: true, months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 3995 })) },
];
export const collegeRows = () => [
  ...Array.from({ length: 18 }, (_, i) => {
    const month = monthAt(monthIndex("2026-04-01") + i), m = Number(month.slice(5, 7));
    return { component: "Grounds", month, amountCents: (m >= 4 && m <= 9 ? 3000 : m === 3 ? 1500 : 2100) * 100, fee: false };
  }),
  ...[2026, 2027].flatMap(y => Array.from({ length: 7 }, (_, i) => ({
    component: "Chemical", month: `${y}-${String(i + 3).padStart(2, "0")}-01`, amountCents: 164500, fee: false,
  }))),
];
const row = (values: Record<string, string>): CsvRow => ({ file: "payments.csv", row: 2, values });

describe("fees and exact dated payment obligations", () => {
  it.each([2224800, 2472000])("separates named example %i and annualizes fees over full short-term pattern", annual => {
    const p = feePattern(annual), prepared = preparePayments(p, "2026-04-01", "2026-09-30", "landscape");
    expect(prepared.annualPriceCents).toBe(annual);
    expect(prepared.billingType).toBe("equal_monthly");
    expect(prepared.rows.filter(r => r.isFee)).toHaveLength(12);
    expect(seasonPaymentSummary({ ...prepared, startDate: "2026-04-01", endDate: "2026-09-30", line: "landscape" }, prepared.rows))
      .toEqual({ feesAnnualCents: 47940, contractTotalCents: annual, durationMonths: 6 });
  });
  it("keeps fees with null annual value, including snow T&M, without allowing contract payments", () => {
    const fee = feePattern(0).slice(1);
    expect(paymentSummary(fee, "snow", "time_and_materials")).toMatchObject({ annualPriceCents: null, feesAnnualCents: 47940 });
    const rows = expandPayments(fee, "2026-01-01", "2026-12-31");
    for (const line of ["snow", "landscape"] as const)
      expect(seasonPaymentSummary({ startDate: "2026-01-01", endDate: "2026-12-31", annualPriceCents: null,
        line, snowPricing: line === "snow" ? "time_and_materials" : null }, rows).feesAnnualCents).toBe(47940);
    expect(() => preparePayments(feePattern(1200), "2026-01-01", "2026-12-31", "snow", "time_and_materials")).toThrow("cannot have payments");
  });
  it("raises only contract components by 3% and scales targets without changing any fee cents", () => {
    const p = feePattern(2224800);
    expect(increasedPayments(p, 3, "dollar").find(r => r.fee)).toEqual(p[1]);
    const scaled = scaledPayments(p, 2400000, "dollar");
    expect(scaled.find(r => r.fee)).toEqual(p[1]);
    expect(paymentSummary(scaled, "landscape").annualPriceCents).toBe(2400000);
  });
  it("stores 18 grounds plus 14 chemical obligations exactly, including authorized pre-start", () => {
    const rows = collegeRows(), input = { schedule: "explicit" as const, rows };
    expect(() => preparePayments(input, "2026-04-01", "2027-09-30", "landscape")).toThrow("Chemical 2026-03-01");
    const prepared = preparePayments({ ...input, allowPreStart: true }, "2026-04-01", "2027-09-30", "landscape");
    expect(prepared.rows).toEqual(rows.map(({ fee, ...r }) => ({ ...r, isFee: fee })));
    expect(prepared.rows).toHaveLength(32);
    expect(prepared.annualPriceCents).toBe(4151500);
    expect(seasonPaymentSummary({ ...prepared, startDate: "2026-04-01", endDate: "2027-09-30", line: "landscape" }, prepared.rows))
      .toEqual({ feesAnnualCents: 0, contractTotalCents: 7103000, durationMonths: 18 });
    expect(() => validateExplicitWindow(prepared.rows, "2026-04-01", "2027-09-30", true, "2026-04-01")).not.toThrow();
    expect(() => validateExplicitWindow(prepared.rows, "2026-05-01", "2027-09-30", true, "2026-04-01")).toThrow("Grounds 2026-04-01");
    expect(() => validateExplicitWindow(prepared.rows, "2026-04-01", "2027-08-31", true, "2026-04-01")).toThrow("2027-09-01");
  });
  it("uses the exact first-year fee window independently of null annual, excluding pre-start and later-year fees", () => {
    const feeRows = ["2026-03-01", "2026-04-01", "2027-03-01", "2027-04-01"].map(month =>
      ({ component: "Fee", month, amountCents: 3995, fee: true }));
    const p = preparePayments({ schedule: "explicit", rows: feeRows, allowPreStart: true }, "2026-04-01", "2027-09-30", "snow", "time_and_materials");
    expect(p.annualPriceCents).toBeNull();
    expect(seasonPaymentSummary({ ...p, startDate: "2026-04-01", endDate: "2027-09-30", line: "snow", snowPricing: "time_and_materials" }, p.rows).feesAnnualCents).toBe(7990);
  });
  it("rejects invalid dates, duplicates, flags, money, and pre-start beyond two months; retains intentional zero rows", () => {
    const r = { component: "A", month: "2026-04-01", amountCents: 0 };
    const prep = (rows: object[]) => preparePayments({ schedule: "explicit", rows, allowPreStart: true } as any, "2026-04-01", "2027-09-30", "landscape");
    expect(prep([r]).rows).toHaveLength(1);
    for (const month of ["2026-04-02", "2026-13-01", "2026-02-30", "2026-01-01", "2027-10-01"])
      expect(() => prep([{ ...r, month }])).toThrow();
    for (const amountCents of [-1, 0.5, 2147483648]) expect(() => prep([{ ...r, amountCents }])).toThrow();
    expect(() => prep([r, r])).toThrow("Duplicate");
    expect(() => prep([r, { ...r, month: "2026-05-01", fee: true }])).toThrow("Mixed fee");
    expect(() => recoverPayments([{ ...r, isFee: false }, { ...r, month: "2026-05-01", isFee: true }])).toThrow("Mixed fee");
  });
  it("supports numeric-month and wide pattern CSV and rejects mixed flags and mixed schedule formats", () => {
    expect(paymentCsvInput([row({ payment_line: "Fee", month: "3", amount: "39.95", fee: "yes" })]))
      .toEqual([{ component: "Fee", fee: true, months: [{ month: 3, amountCents: 3995 }] }]);
    expect(() => paymentCsvInput([row({ payment_line: "Fee", jan: "1", fee: "yes" }), row({ payment_line: "Fee", month: "2", amount: "1" })])).toThrow("Mixed fee");
    expect(() => paymentCsvInput([row({ payment_line: "Fee", month: "2026-04", amount: "1" }), row({ payment_line: "Fee", month: "5", amount: "1" })])).toThrow("YYYY-MM");
    expect(() => prepareCsvPayments([row({ payment_line: "Fee", month: "2026-03", amount: "1", fee: "yes" })],
      "2026-04-01", "2027-09-30", "landscape")).toThrow("authorization");
  });
  it("exports and reimports dated fees and preserves pattern fees in both exports", async () => {
    const prepared = preparePayments({ schedule: "explicit", allowPreStart: true, rows: [
      ...collegeRows(), { component: "Fee", month: "2026-03-01", amountCents: 3995, fee: true },
    ] }, "2026-04-01", "2027-09-30", "landscape");
    const data = { customers: [{ id: "c", name: "Fixture" }], agreements: [{ id: "a", customerId: "c" }],
      terms: [{ id: "t", agreementId: "a", startDate: "2026-04-01", endDate: "2027-09-30", paymentSchedule: "explicit", line: "landscape", form: "theirs", status: "draft" }],
      billing: prepared.rows.map(r => ({ ...r, termId: "t" })), rates: [], scope: [], card: [], termDocs: [], contracts: [], documents: [], contacts: [], amounts: [], sheets: [], services: [],
    } as unknown as AuditData;
    const exported = currentCsvTables(data);
    expect(exported["payments.csv"]).toContain("2026-03,39.95");
    const parsed = await parseAuditFiles(Object.entries(exported).map(([name, s]) => ({ name, data: Buffer.from(s) })));
    expect(parsed.errors).toEqual([]);
    expect(prepareCsvPayments(parsed.tables["payments.csv"], "2026-04-01", "2027-09-30", "landscape", undefined, "yes").rows).toEqual(prepared.rows);
    expect(auditCsvTables(data, ["c"]).tables["payments.csv"]).toBe(exported["payments.csv"]);
    data.terms[0].paymentSchedule = "pattern";
    data.billing = expandPayments(feePattern(2224800), "2026-04-01", "2027-09-30").map(r => ({ ...r, termId: "t" })) as any;
    const patternFiles = await parseAuditFiles(Object.entries(currentCsvTables(data)).map(([name, s]) => ({ name, data: Buffer.from(s) })));
    expect(patternFiles.errors).toEqual([]);
    expect(prepareCsvPayments(patternFiles.tables["payments.csv"], "2026-04-01", "2027-09-30", "landscape").rows).toEqual(data.billing.map(({ component, month, amountCents, isFee }) => ({ component, month, amountCents, isFee })));
  });
});
