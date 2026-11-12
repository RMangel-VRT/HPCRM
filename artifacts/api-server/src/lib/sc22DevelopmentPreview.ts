/** Manual development-only evidence collector. Never called by application startup. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { companies, serviceCalendar } from "@workspace/db";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { runCampaignGeneration } from "./campaignReconcile";

async function main() {
  const output = process.argv[2];
  const evidenceDir = fileURLToPath(new URL("../../../../generated-artifacts/", import.meta.url));
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1" ||
    !output || !resolve(output).startsWith(`${evidenceDir}SC2.2-`)) throw new Error("Development evidence output required");
  const results = [];
  for (const company of await db.select({ id: companies.id }).from(companies)) {
    const calendar = await db.select().from(serviceCalendar).where(eq(serviceCalendar.companyId, company.id));
    if (!calendar.length) continue;
    const report = await runCampaignGeneration(company.id, 2027, { dryRun: true, today: "2026-11-12" });
    results.push({ companyId: company.id, report, calendar });
  }
  writeFileSync(output, JSON.stringify(results, null, 2));
}
main().finally(() => pool.end());
