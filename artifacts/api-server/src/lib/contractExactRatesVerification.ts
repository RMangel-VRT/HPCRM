/** Explicit disposable development browser setup; never imported by application code. */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { agreements, termRates } from "@workspace/db";
import { db, pool } from "../db";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { activeCard, replaceRows, writeTerm } from "./contractCenterPersistence";
import { snapshotRates } from "./contractCenterService";
import { logger } from "./logger";

const file = new URL("../../../../generated-artifacts/cc217/browser-fixture.json", import.meta.url);
if (process.env.NODE_ENV === "production") throw new Error("Development verification cannot run in production");
try {
  if (process.argv[2] === "cleanup") {
    const f = JSON.parse(await readFile(file, "utf8"));
    await removeAuditFixture(f.companyId, f.userId);
    await unlink(file);
    logger.info("Removed disposable exact-rates browser fixtures");
  } else {
    const f = await createAuditFixture();
    try {
      const [agreement] = await db.insert(agreements).values({ companyId: f.companyId, customerId: f.customerId }).returning();
      const term = await db.transaction(async tx => {
        const row = await writeTerm(tx, f.companyId, f.userId, null, { agreementId: agreement.id, line: "landscape", form: "theirs",
          seasonLabel: "2026–27", startDate: "2026-01-01", endDate: "2027-12-31", status: "signed",
          signedAt: new Date(), billingType: "monthly_variable", annualPriceCents: null }, "Disposable exact-rate verification");
        const rates = snapshotRates(await activeCard(tx, f.companyId), [
          { rateKey: "rate_general_labor", priceCents: 7500 }, { rateKey: "rate_irrigation_labor", priceCents: 8500 },
          { rateKey: "custom_mobilization", label: "Mobilization", unit: "visit", category: "Custom", line: "general", priceCents: 3995 },
        ], "landscape");
        await replaceRows(tx, f.companyId, row.id, termRates, rates);
        return row;
      });
      await mkdir(new URL(".", file), { recursive: true });
      await writeFile(file, JSON.stringify({ companyId: f.companyId, userId: f.userId, customerId: f.customerId,
        email: f.email, password: f.password, agreementId: agreement.id, termId: term.id }), { mode: 0o600 });
      logger.info("Prepared disposable exact-rate browser fixtures");
    } catch (error) { await removeAuditFixture(f.companyId, f.userId); throw error; }
  }
} finally { await pool.end(); }
