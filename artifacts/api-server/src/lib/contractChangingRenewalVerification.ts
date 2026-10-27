/** Explicit development-only browser verification fixtures. Never imported by the app. */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { agreementTerms, termBillingMonths, termRates, termScopeLines } from "@workspace/db";
import { db, pool } from "../db";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { seedRenewalSource } from "./contractRenewalFixture";
import { activeCard, replaceRows } from "./contractCenterPersistence";
import { buildScope, expandPayments, snapshotRates } from "./contractCenterService";
import { initialScope } from "@workspace/api-zod/contractScope";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { logger } from "./logger";

const file = new URL("../../../../generated-artifacts/cc29/browser-fixture.json", import.meta.url);
if (process.env.NODE_ENV === "production" || process.env.CONTRACT_RENEWAL_VERIFY !== "1")
  throw new Error("Requires explicit development verification mode");
try {
  if (process.argv.includes("--cleanup")) {
    const f = JSON.parse(await readFile(file, "utf8")) as { companyId: string; userId: string };
    await removeAuditFixture(f.companyId, f.userId); await unlink(file);
    logger.info("Removed disposable renewal verification company and user");
  } else {
    const f = await createAuditFixture();
    try {
      const landscape = await seedRenewalSource(f.companyId, f.userId, f.customerId);
      const both = await seedRenewalSource(f.companyId, f.userId, f.customerId);
      for (const [index, s] of [landscape, both].entries()) await db.transaction(async tx => {
        const line = index ? "both" as const : "landscape" as const;
        await tx.update(agreementTerms).set({ line, form: "theirs", annualPriceCents: index ? 3600000 : 3000000,
          snowPricing: index ? "flat_rate" : null, snowFlatPriceCents: index ? 600000 : null }).where(eq(agreementTerms.id, s.source.id));
        await replaceRows(tx, f.companyId, s.source.id, termScopeLines, buildScope(initialScope(line, SCOPE_CATALOG).filter(s => s.included), line));
        await replaceRows(tx, f.companyId, s.source.id, termRates, snapshotRates(await activeCard(tx, f.companyId), [], line));
        await replaceRows(tx, f.companyId, s.source.id, termBillingMonths, expandPayments([
          { component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 250000 })) },
          ...(index ? [{ component: "Snow", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 50000 })) }] : []),
        ], s.source.startDate, s.source.endDate));
      });
      await mkdir(new URL(".", file), { recursive: true });
      await writeFile(file, JSON.stringify({ companyId: f.companyId, userId: f.userId, email: f.email, password: f.password,
        landscapeAgreementId: landscape.agreement.id, bothAgreementId: both.agreement.id }, null, 2), { mode: 0o600 });
      logger.info("Prepared disposable renewal browser fixture in ignored generated-artifacts/cc29/browser-fixture.json");
    } catch (error) { await removeAuditFixture(f.companyId, f.userId); throw error; }
  }
} finally { await pool.end(); }
