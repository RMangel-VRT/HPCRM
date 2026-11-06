import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { pool as schemaPool, companies } from "@workspace/db";
import { companyToday } from "../src/lib/companyDay";
import { customerContractProjector, loadCustomerContractInputs } from "../src/lib/customerContractSummary";

// SELECT-only transaction; no repair, backfill or flag creation. Explicit company
// selection prevents an accidental cross-tenant export. Do not commit row output.
const companyId = process.argv.find(a => a.startsWith("--company="))?.slice(10);
const all = process.argv.includes("--all") && process.argv.includes("--counts-only");
if (!companyId && !all) throw new Error("Usage: compare-customer-snow.ts --company=<company-id> [--counts-only] OR --all --counts-only");
try {
  await db.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    const ids = companyId ? [companyId] : (await tx.select({ id: companies.id }).from(companies)).map(c => c.id);
    for (const id of ids) {
    const data = await loadCustomerContractInputs(tx, id, false);
    const today = companyToday(), project = customerContractProjector(data, today);
    const mismatches: unknown[] = [], missingTerms: unknown[] = [];
    for (const c of data.customers) {
      const summary = project(c.id)!;
      const coveringTerms = summary.current.map(t => ({
        agreementId: t.agreementId, termId: t.termId, label: t.label, line: t.line,
        startDate: t.startDate, endDate: t.endDate, parentCustomerId: t.parentCustomerId,
      }));
      if (c.snowEnabled !== summary.coverage.snow)
        mismatches.push({ id: c.id, name: c.name, manualSnow: c.snowEnabled, derivedSnow: summary.coverage.snow, coveringTerms });
      if (c.status === "active" && c.active === "true" && !summary.current.length)
        missingTerms.push({ id: c.id, name: c.name, parentCustomerId: c.parentCustomerId, coveringTerms });
    }
    console.log(JSON.stringify({ asOf: today, companyId: id, customerCount: data.customers.length, mismatchCount: mismatches.length, missingTermCount: missingTerms.length,
      ...(process.argv.includes("--counts-only") ? {} : { mismatches, missingTerms }) }, null, 2));
    }
  });
} finally { await pool.end(); await schemaPool.end(); }
