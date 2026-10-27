import { beforeEach, describe, expect, it, vi } from "vitest";
import { agreements, agreementTerms, customers, termBillingMonths, type AgreementTerm } from "@workspace/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
vi.mock("../db", () => ({ db: {} }));
import { loadContractList, loadRenewalsDue, contractsSection, type Reader } from "./contractCenterPersistence";
import { addCalendarDays, companyToday } from "./companyDay";

const today = "2026-10-27";
const dialect = new PgDialect();
let tables: Map<unknown, any[]>;
let predicates: ReturnType<PgDialect["sqlToQuery"]>[];
const select = vi.fn(() => ({ from: (table: unknown) => ({
  where: (predicate: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const query = dialect.sqlToQuery(predicate);
    predicates.push(query);
    return Promise.resolve((tables.get(table) ?? []).filter(row => row.companyId === query.params[0]));
  },
}) }));
const reader = { select } as unknown as Reader;
function seed(id: string, days: number, overrides: Partial<AgreementTerm> = {}, companyId = "company") {
  tables.get(customers)!.push({ id: `c-${id}`, companyId, name: `Customer ${id}`, isParent: "false" });
  tables.get(agreements)!.push({ id, companyId, customerId: `c-${id}` });
  const term = { id: `t-${id}`, companyId, agreementId: id, line: "landscape", form: "ours",
    seasonLabel: "2026", startDate: "2026-01-01", endDate: addCalendarDays(today, days),
    status: "signed", renewedFromTermId: null, createdAt: new Date("2025-12-01"), signedAt: new Date("2025-12-02"),
    ...overrides } as AgreementTerm;
  tables.get(agreementTerms)!.push(term);
  return term;
}
function renewal(source: AgreementTerm, status: AgreementTerm["status"]) {
  const term = { ...source, id: `${source.id}-${status}`, renewedFromTermId: source.id, status,
    startDate: addCalendarDays(source.endDate, 1), endDate: addCalendarDays(source.endDate, 365),
    signedAt: status === "draft" || status === "sent" ? null : new Date("2026-10-01") };
  tables.get(agreementTerms)!.push(term);
  return term;
}
beforeEach(() => {
  tables = new Map([customers, agreements, agreementTerms, termBillingMonths].map(t => [t, []]));
  predicates = []; select.mockClear();
});
describe("Contract Center renewal population and action clock", () => {
  it("includes 45, 30, 20, zero and minus-10 days, sorts and uses season-owned line", async () => {
    for (const days of [45, 30, 20, 0, -10]) seed(`${days}`, days, { line: "snow" });
    seed("too-soon", 61);
    const rows = await loadRenewalsDue(reader, "company", today);
    expect(rows.map(r => r.daysLeft)).toEqual([-10, 0, 20, 30, 45]);
    expect(rows[0]).toEqual({ agreementId: "-10", customerId: "c--10", customerName: "Customer -10",
      line: "snow", termId: "t--10", seasonLabel: "2026", endDate: "2026-10-17", daysLeft: -10, renewalDraftStatus: null });
    const result = await contractsSection(reader, "company", today);
    expect(result).toMatchObject({ count: 5, overdue: 4,
      mostOverdue: { agreementId: "-10", customerName: "Customer -10", endDate: "2026-10-17", daysLeft: -10 } });
    expect(Object.keys(result.mostOverdue!).sort()).toEqual(["agreementId", "customerName", "daysLeft", "endDate"]);
  });
  it("retains draft and sent rows but excludes them from unstarted work and most-overdue", async () => {
    renewal(seed("draft", -20), "draft");
    renewal(seed("sent", -15), "sent");
    seed("action", 20);
    const result = await contractsSection(reader, "company", today);
    expect(result.rows.map(r => r.renewalDraftStatus)).toEqual(["draft", "sent", null]);
    expect(result).toMatchObject({ count: 1, overdue: 1, mostOverdue: { agreementId: "action" } });
    tables.get(agreementTerms)!.pop();
    expect(await contractsSection(reader, "company", today)).toMatchObject({ count: 0, overdue: 0, mostOverdue: null });
  });
  it.each(["signed", "active", "renewed"] as const)("signed replacement (%s) suppresses source even before replacement starts", async status => {
    renewal(seed("source", 20), status);
    expect(await loadRenewalsDue(reader, "company", today)).toEqual([]);
  });
  it("does not generate year-one work for realistic renewed predecessors and signed final year", async () => {
    let previous = seed("chain", 35, { status: "renewed", endDate: "2026-12-01" });
    for (let year = 2027; year <= 2030; year++) {
      previous = renewal(previous, year === 2030 ? "signed" : "renewed");
      Object.assign(previous, { id: `year-${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    }
    expect(await loadRenewalsDue(reader, "company", "2026-11-15")).toEqual([]);
    expect(await loadRenewalsDue(reader, "company", "2028-11-15")).toEqual([]);
    expect(await loadRenewalsDue(reader, "company", "2030-11-15")).toMatchObject([{ termId: "year-2030", daysLeft: 46 }]);
  });
  it("returns empty safely and keeps every bounded query company scoped", async () => {
    seed("foreign", -10, {}, "other");
    expect(await loadRenewalsDue(reader, "company", today)).toEqual([]);
    expect(await contractsSection(reader, "company", today)).toMatchObject({ count: 0, overdue: 0, mostOverdue: null });
    expect(predicates.every(p => p.sql.includes('"company_id"') && p.params[0] === "company")).toBe(true);
    select.mockClear();
    for (let n = 0; n < 200; n++) seed(`${n}`, 20);
    expect(await loadRenewalsDue(reader, "company", today)).toHaveLength(200);
    expect(select).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["2026-03-08T06:30:00Z", "2026-03-08", 1],
    ["2026-03-09T05:30:00Z", "2026-03-09", 1],
    ["2026-11-01T05:30:00Z", "2026-11-01", 1],
    ["2026-11-02T06:30:00Z", "2026-11-02", 1],
    ["2026-11-02T07:00:00Z", "2026-11-01", -1],
  ])("uses Colorado today and date-only end at %s", async (instant, endDate, expected) => {
    seed("dst", 20, { endDate });
    expect((await loadRenewalsDue(reader, "company", companyToday(new Date(instant))))[0].daysLeft).toBe(expected);
  });
});
describe("extracted list preserves filters and response", () => {
  it("preserves case-insensitive search, season and pending-renewal line filters, direct-parent payments only", async () => {
    seed("parent", 20);
    seed("child", 40);
    seed("grandchild", 45);
    const [parent, child, grandchild] = tables.get(customers)!;
    Object.assign(parent, { name: "Bank", isParent: "true" });
    Object.assign(child, { name: "Branch", parentCustomerId: parent.id, customerNumber: "BR" });
    Object.assign(grandchild, { parentCustomerId: child.id });
    tables.get(termBillingMonths)!.push({ companyId: "company", termId: "t-parent", component: "Branch", month: "2026-01-01", amountCents: 12345 });
    const items = await loadContractList(reader, "company", { customerId: child.id, includeParent: "true" }, today);
    expect(items.map(i => i.id)).toEqual(["parent", "child"]);
    expect(items[0]).toMatchObject({ customerName: "Bank", locationCount: 1, viaParent: true, parentName: "Bank",
      branch: { name: "Branch", billingCode: "BR" },
      payments: [{ component: "Branch", months: [{ month: 1, amountCents: 12345 }] }],
      current: { id: "t-parent", line: "landscape" }, companyDay: today });
    expect(items[1]).not.toHaveProperty("viaParent");
    expect((await loadContractList(reader, "company", { q: "bAnK" }, today)).map(i => i.id)).toEqual(["parent"]);
    expect((await loadContractList(reader, "company", { customerId: child.id }, today)).map(i => i.id)).toEqual(["child"]);
    expect(await loadContractList(reader, "company", { line: "snow" }, today)).toEqual([]);
    renewal(tables.get(agreementTerms)![0], "draft").line = "both";
    expect((await loadContractList(reader, "company", { line: "snow" }, today)).map(i => i.id)).toEqual(["parent"]);
    await expect(loadContractList(reader, "other", { customerId: child.id }, today)).rejects.toMatchObject({ status: 404 });
  });
  it("has no retired renewal storage method or standalone endpoint", () => {
    const storage = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
    const routes = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
    expect(storage).not.toContain(["get", "Upcoming", "Renewals"].join(""));
    expect(routes).not.toContain("/api/dashboard/upcoming-" + "renewals");
  });
});
