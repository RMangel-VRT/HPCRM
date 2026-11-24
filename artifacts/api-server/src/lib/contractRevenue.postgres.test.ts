import { sql } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { byCustomer, countInEffectSnowTm, loadContractRevenueRows, loadContractRevenueSeasons, monthlyTotals } from "./contractRevenue";
import { companyToday } from "./companyDay";

// Opt-in for a disposable local PostgreSQL database. Fixtures use temp tables.
describe.runIf(process.env.RUN_RV1_POSTGRES_TEST === "1")("contract revenue in PostgreSQL", () => {
  it("reads exact dated cents and counts through the scoped Contract Center joins", async () => {
    const { db, inTransaction, pool } = await import("../db");
    const { storage } = await import("../storage");
    const { registerRevenueRoutes } = await import("../routes/revenue");
    try {
      const identity = await db.execute(sql`select current_database() as name, host(inet_server_addr()) as host, current_user as role`);
      expect(identity.rows).toEqual([{ name: "rv1_contract_revenue_test", host: "127.0.0.1", role: "rv1_test" }]);
      await db.transaction(async tx => {
        await tx.execute(sql.raw(`
          create temp table customers (id varchar primary key, company_id varchar, name text, parent_customer_id varchar) on commit drop;
          create temp table agreements (id varchar primary key, company_id varchar, customer_id varchar) on commit drop;
          create temp table agreement_terms (id varchar primary key, company_id varchar, agreement_id varchar,
            status text, start_date date, end_date date, season_label text, line text, form text, non_renewal_on date, snow_pricing text) on commit drop;
          create temp table term_billing_months (company_id varchar, term_id varchar, month date,
            component text, is_fee boolean, amount_cents int) on commit drop;
          create temp table contracts (id varchar primary key, customer_id varchar, company_id varchar, status text,
            start_date timestamp, end_date timestamp) on commit drop;
          create temp table contract_monthly_amounts (contract_id varchar, company_id varchar, month int, amount int) on commit drop;

          insert into customers values ('parent','a','Parent',null), ('branch','a','Branch','parent'),
            ('extra','a','Other Customer',null), ('foreign','b','Foreign',null);
          insert into agreements values ('main','a','parent'), ('snow','a','branch'), ('second','a','parent'),
            ('tm','a','extra'), ('foreign','b','foreign'), ('bad-owner','a','foreign'), ('bad-agreement','b','extra');
          insert into agreement_terms values
            ('previous','a','main','renewed','2025-10-01','2026-09-30','Old','both','ours',null,'time_and_materials'),
            ('renewal','a','main','signed','2026-10-01','2027-09-30','New','both','ours',null,'time_and_materials'),
            ('flat','a','snow','active','2026-10-01','2026-12-31','Flat snow','snow','theirs','2026-10-05','flat_rate'),
            ('second','a','second','signed','2026-12-17','2027-12-16','Second','landscape','ours',null,null),
            ('tm','a','tm','active','2026-12-31','2027-03-31','T&M','snow','ours',null,'time_and_materials'),
            ('future-tm','a','tm','signed','2027-01-01','2027-03-31','Future','snow','ours',null,'time_and_materials'),
            ('foreign','b','foreign','active','2026-01-01','2027-01-01','Foreign','snow','ours',null,'time_and_materials'),
            ('bad-owner','a','bad-owner','active','2026-01-01','2027-01-01','Wrong owner','snow','ours',null,'time_and_materials'),
            ('bad-agreement','a','bad-agreement','active','2026-01-01','2027-01-01','Wrong agreement','snow','ours',null,'time_and_materials'),
            ('bad-term','b','main','active','2026-01-01','2027-01-01','Wrong term','snow','ours',null,'time_and_materials');
          insert into agreement_terms
            select status,'a','main',status,'2026-01-01','2026-12-31',status,'both','ours',null,'time_and_materials'
            from unnest(array['draft','sent','lost','cancelled','up_for_renewal']) as statuses(status);

          insert into term_billing_months values
            ('a','previous','2025-12-01','Base',false,12345),
            ('a','renewal','2027-01-01','Base',false,22000),
            ('a','renewal','2026-10-01','Fee',true,511),
            ('a','flat','2026-10-01','Snow',false,9000),
            ('a','flat','2026-12-01','Snow',false,9000),
            ('a','second','2026-11-01','Pre-start fee',true,312),
            ('b','renewal','2026-10-01','Wrong payment company',false,999999);
          insert into term_billing_months
            select 'a', case when n < 10 then 'previous' else 'renewal' end,
              make_date(2026,n,1), 'Base',false,case when n < 10 then 12345 else 15679 end
            from generate_series(1,12) as months(n);
          insert into term_billing_months
            select 'a',id,'2026-10-01','Excluded',false,999999 from agreement_terms
            where id in ('draft','sent','lost','cancelled','up_for_renewal','foreign','bad-owner','bad-agreement','bad-term');
          insert into contracts values
            ('legacy-parent','parent','a','active','2026-01-01','2026-12-31'),
            ('legacy-only','extra','a','active','2026-01-01','2026-12-31'),
            ('legacy-paused','branch','a','paused','2026-01-01','2026-12-31'),
            ('legacy-foreign','foreign','b','active','2026-01-01','2026-12-31');
          insert into contract_monthly_amounts values
            ('legacy-parent','a',10,98765), ('legacy-only','a',10,43210);
        `));

        const rows = await loadContractRevenueRows(tx, "a", "2026-01-01", "2026-12-01");
        expect(rows).toHaveLength(16);
        expect(rows.filter(row => row.stream === "snow").map(row => [row.customerId, row.notRenewing])).toEqual([
          ["branch", true], ["branch", true],
        ]);
        expect(rows.filter(row => row.agreementId === "main").every(row => row.customerId === "parent" && row.stream === "contract")).toBe(true);
        expect(monthlyTotals(rows, 2026)).toEqual([...Array(9).fill(12345), 25190, 15991, 24679]);
        const seasons = await loadContractRevenueSeasons(tx, "a", ["main", "snow", "second"], 2026);
        expect(seasons.map(row => row.termId).sort()).toEqual(["flat", "previous", "renewal", "second"]);
        expect(byCustomer(rows, 2026, seasons).find(row => row.agreementId === "main")?.seasonStarts)
          .toEqual([{ month: "2026-10-01", seasonLabel: "New" }]);

        const instant = new Date("2027-01-01T05:00:00Z");
        expect(companyToday(instant)).toBe("2026-12-31");
        expect(await countInEffectSnowTm(tx, "a", companyToday(instant))).toBe(2);
        const app = express();
        app.use((req, _res, next) => {
          Object.assign(req, { isAuthenticated: () => true, user: { activeCompanyId: "a", accessRole: "office" } });
          void inTransaction(tx, async () => next());
        });
        registerRevenueRoutes(app);
        const response = await request(app).get("/api/revenue/contracts/by-customer?year=2026").expect(200);
        expect(response.body).toMatchObject({
          year: 2026,
          monthTotals: [...Array(9).fill(12345), 25190, 15991, 24679],
          totalCents: 176965,
        });
        expect(response.body.customers.map((row: { agreementId: string; customerId: string }) => [row.agreementId, row.customerId]).sort())
          .toEqual([["main", "parent"], ["second", "parent"], ["snow", "branch"]]);
        await inTransaction(tx, async () => {
          expect(await storage.getDashboardStats("a", 10, 2026)).toEqual({
            customersCount: 3, activeContractsCount: 2, monthlyRevenue: 251.9, ytdRevenue: 1362.95,
          });
        });
      });
    } finally {
      await pool.end();
    }
  });
});
