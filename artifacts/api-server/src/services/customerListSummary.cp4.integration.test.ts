import { drizzle } from "drizzle-orm/node-postgres";
import {
  customers, agreements, agreementTerms, termBillingMonths, propertyManagers, propertyManagementCompanies,
  qboCustomerReviews, contacts, tickets, ticketTypes, ticketTypeStatuses,
} from "@workspace/db";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { loadCustomerListMetadata, loadCustomerListSummary } from "./customerListSummary";
import { companyToday, addCalendarDays } from "../lib/companyDay";

describe.skipIf(process.env.NODE_ENV === "production")("CP4 real SQL list batch", () => {
  it("rolls up offpage branches, joins management/contact facts and scopes every owner", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Temp copies preserve the real columns/defaults but not application rows
      // or foreign keys. All fixture writes roll back on this one connection.
      for (const table of ["customers", "agreements", "agreement_terms", "term_billing_months", "term_rates", "term_scope_lines",
        "property_management_companies", "property_managers", "contacts", "qbo_customer_reviews", "tickets", "ticket_types", "ticket_type_statuses"]) {
        await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
      }
      const reader = drizzle(client);
      const address = { street: "Fixture", city: "Denver", state: "CO", zip: "80000" };
      await reader.insert(customers).values([
        { ...address, id: "parent", companyId: "company", name: "Parent", isParent: "true", branchBillingMode: "master",
          propertyManagementCompanyId: "pm", propertyManagerId: "manager" },
        { ...address, id: "branch-own", companyId: "company", name: "Own", parentCustomerId: "parent" },
        { ...address, id: "branch-inherit", companyId: "company", name: "Inherited", parentCustomerId: "parent" },
        { ...address, id: "no-term", companyId: "company", name: "No term", propertyManagementCompanyId: "foreign-pm", propertyManagerId: "foreign-manager" },
        { ...address, id: "foreign", companyId: "foreign-company", name: "Foreign", parentCustomerId: "parent" },
      ]);
      await reader.insert(propertyManagementCompanies).values([
        { id: "pm", companyId: "company", name: "Company directory" },
        { id: "foreign-pm", companyId: "foreign-company", name: "Private directory" },
      ]);
      await reader.insert(propertyManagers).values([
        { id: "manager", companyId: "company", propertyManagementCompanyId: "pm", name: "Live manager" },
        { id: "foreign-manager", companyId: "foreign-company", propertyManagementCompanyId: "foreign-pm", name: "Private manager" },
      ]);
      await reader.insert(contacts).values([
        { companyId: "company", customerId: "parent", name: "Current contact" },
        { companyId: "foreign-company", customerId: "parent", name: "Private contact" },
      ]);
      const today = companyToday();
      await reader.insert(agreements).values([
        { id: "a-parent", companyId: "company", customerId: "parent" },
        { id: "a-snow", companyId: "company", customerId: "parent" },
        { id: "a-branch", companyId: "company", customerId: "branch-own" },
        { id: "a-foreign", companyId: "foreign-company", customerId: "foreign" },
      ]);
      const term = { startDate: today, endDate: addCalendarDays(today, 364), seasonLabel: "Fixture season",
        status: "signed" as const, form: "ours" as const, line: "landscape" as const, billingType: "equal_monthly" as const };
      await reader.insert(agreementTerms).values([
        { ...term, id: "t-parent", agreementId: "a-parent", companyId: "company" },
        { ...term, id: "t-snow", agreementId: "a-snow", companyId: "company", line: "snow", snowPricing: "time_and_materials" },
        { ...term, id: "t-branch", agreementId: "a-branch", companyId: "company" },
        { ...term, id: "t-foreign", agreementId: "a-foreign", companyId: "foreign-company" },
      ]);
      await reader.insert(termBillingMonths).values([
        { companyId: "company", termId: "t-parent", month: `${today.slice(0, 7)}-01`, component: "Contract", amountCents: 100000 },
        { companyId: "company", termId: "t-branch", month: `${today.slice(0, 7)}-01`, component: "Contract", amountCents: 200000 },
        { companyId: "foreign-company", termId: "t-foreign", month: `${today.slice(0, 7)}-01`, component: "Contract", amountCents: 900000 },
      ]);
      await reader.insert(qboCustomerReviews).values([
        { companyId: "company", customerId: "parent", kind: "name_taken" },
        { companyId: "foreign-company", customerId: "no-term", kind: "name_taken" },
      ]);
      await reader.insert(ticketTypes).values({ id: "type", companyId: "company", name: "Task" });
      await reader.insert(ticketTypeStatuses).values([
        { id: "open", ticketTypeId: "type", name: "Open", displayOrder: 0 },
        { id: "done", ticketTypeId: "type", name: "Done", displayOrder: 1, isFinal: "true" },
      ]);
      await reader.insert(tickets).values([
        { companyId: "company", customerId: "branch-own", ticketTypeId: "type", currentStatusId: "open", title: "Offpage open", createdById: "author" },
        { companyId: "company", customerId: "branch-own", ticketTypeId: "type", currentStatusId: "done", title: "Offpage done", createdById: "author" },
        { companyId: "foreign-company", customerId: "branch-own", ticketTypeId: "type", currentStatusId: "open", title: "Foreign work", createdById: "author" },
      ]);
      const result = await loadCustomerListSummary(reader as any, "company", ["parent", "branch-inherit", "no-term", "foreign"]);
      expect(Object.keys(result.summaries)).toEqual(["parent", "branch-inherit", "no-term"]);
      expect(result.summaries.parent).toMatchObject({
        season: { annualCents: 300000, hasSnowTm: true, hasTerm: true },
        branchCount: 2, openTickets: 1, management: "Company directory",
        managerSearch: "Company directory Live manager Current contact", qboState: "collision",
      });
      expect(result.summaries["branch-inherit"]).toMatchObject({
        season: { annualCents: null, hasSnowTm: true, hasTerm: true }, qboState: "via_parent",
      });
      expect(result.summaries["no-term"]).toMatchObject({
        season: { annualCents: null, hasSnowTm: false, hasTerm: false }, management: null, managerSearch: "", qboState: "not_linked",
      });
      const metadata = await loadCustomerListMetadata(reader as any, "company",
        await reader.select().from(customers).then(rows => rows.filter(c => c.companyId === "company")));
      expect(metadata.get("parent")).toMatchObject({ qboState: "collision", management: "Company directory" });
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
