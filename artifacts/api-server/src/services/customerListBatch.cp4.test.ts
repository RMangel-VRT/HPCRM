import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { loadCustomerListSummary } from "./customerListSummary";

const dialect = new PgDialect();
function readerFor(size: number) {
  const calls: { table: string; params: unknown[]; sql: string }[] = [];
  const customerRows = Array.from({ length: size }, (_, i) => ({
    id: `c-${i}`, companyId: "company", name: `Customer ${i}`, isParent: i === 0 ? "true" : "false",
    parentCustomerId: i === size - 1 ? "c-0" : null, qboSyncState: "not_linked", qboCustomerId: null,
    propertyManagerId: "manager", propertyManagementCompanyId: "management", managementCompany: null,
  }));
  const rows = (table: string) => table === "customers" ? customerRows
    : table === "property_management_companies" ? [{ id: "management", name: "Actual management" }]
    : table === "property_managers" ? [{ id: "manager", name: "Directory manager" }]
    : table === "contacts" ? [{ customerId: "c-0", name: "Actual contact" }]
    : table === "qbo_customer_reviews" ? [{ customerId: "c-0" }]
    : table === "tickets" ? [{ customerId: `c-${size - 1}`, count: 7 }]
    : [];
  const reader = { select: () => {
    let table = "";
    const builder: any = {
      from: (t: any) => { table = getTableName(t); return builder; },
      where: (condition: any) => {
        const query = dialect.sqlToQuery(condition);
        calls.push({ table, params: query.params, sql: query.sql }); return builder;
      },
      leftJoin: () => builder,
      groupBy: () => builder,
      then: (resolve: any, reject: any) => Promise.resolve(rows(table)).then(resolve, reject),
    };
    return builder;
  } };
  return { reader, calls };
}
describe("CP4 fixed-count company-scoped batch reads", () => {
  it("query count does not grow with page rows; collapsed/off-page branch counts are included", async () => {
    for (const size of [12, 150]) {
      const { reader, calls } = readerFor(size);
      // Only the parent and a standalone row are in this response.
      const result = await loadCustomerListSummary(reader as any, "company", ["c-0", "c-1", "foreign"]);
      expect(Object.keys(result.summaries)).toEqual(["c-0", "c-1"]);
      expect(result.summaries["c-0"]).toMatchObject({
        branchCount: 1, openTickets: 7, qboState: "collision", management: "Actual management",
        managerSearch: "Actual management Directory manager Actual contact",
      });
      expect(result.summaries["c-1"].qboState).toBe("not_linked");
      expect(calls).toHaveLength(11); // Six CP1 owners, four metadata owners, one ticket count.
      expect(calls.filter(c => c.table === "agreement_terms")).toHaveLength(1);
      expect(calls.filter(c => c.table === "term_billing_months")).toHaveLength(1);
      for (const c of calls) {
        expect(c.params, `${c.table} must be company-scoped`).toContain("company");
        expect(c.sql).toContain("company_id");
      }
      const ticketRead = calls.find(c => c.table === "tickets")!;
      expect(ticketRead.params).toContain(`c-${size - 1}`);
      expect(calls.filter(c => c.table === "contacts")[0].params).not.toContain("foreign");
    }
  });
  it("an entirely foreign page produces no summaries or metadata reads", async () => {
    const { reader, calls } = readerFor(12);
    expect(await loadCustomerListSummary(reader as any, "company", ["foreign"])).toEqual({ summaries: {} });
    expect(calls).toHaveLength(6);
  });
});
