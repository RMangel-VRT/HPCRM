import { randomUUID } from "node:crypto";
import { agreements, termBillingMonths, termDocuments, termLegacySources, termRates, termScopeLines } from "@workspace/db";
import { db } from "../db";
import { writeTerm } from "./contractCenterPersistence";
import { createNonRenewalFixture, removeNonRenewalFixture, resetNonRenewalFixture } from "./contractNonRenewalFixture";

/** Disposable development data only; no blobs, email, or real customer changes. */
export async function seedMergePair(companyId: string, userId: string, customerId: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixtures cannot run in production");
  return db.transaction(async tx => {
    const [target, source] = await tx.insert(agreements).values([
      { companyId, customerId, importRef: `keep-fixture-${randomUUID()}`, notes: "Original agreement notes" },
      { companyId, customerId, notes: "Separate agreement notes" },
    ]).returning();
    const predecessor = await writeTerm(tx, companyId, userId, null, {
      agreementId: target.id, line: "landscape", form: "ours", seasonLabel: "2026",
      startDate: "2026-04-01", endDate: "2026-10-31", status: "signed",
      billingType: "monthly_variable", annualPriceCents: 1800000, signedAt: new Date("2026-03-01T18:00:00Z"),
    }, "Disposable original signed season");
    const cancelled = await writeTerm(tx, companyId, userId, null, {
      agreementId: target.id, line: "landscape", form: "ours", seasonLabel: "Cancelled 2026–27",
      startDate: "2026-11-01", endDate: "2027-05-31", status: "cancelled",
      renewedFromTermId: predecessor.id, billingType: "monthly_variable",
    }, "Disposable cancelled renewal");
    const first = await writeTerm(tx, companyId, userId, null, {
      agreementId: source.id, line: "both", form: "theirs", seasonLabel: "2026–27",
      startDate: "2026-11-01", endDate: "2027-10-31", status: "signed",
      billingType: "equal_monthly", annualPriceCents: 2007600, snowPricing: "time_and_materials",
      signedAt: new Date("2026-10-15T18:00:00Z"),
    }, "Disposable separate signed renewal");
    for (const term of [predecessor, cancelled, first]) {
      await tx.insert(termScopeLines).values({ companyId, termId: term.id, serviceKey: "mowing", line: "landscape", included: true, quantity: 26 });
      await tx.insert(termRates).values({ companyId, termId: term.id, rateKey: "labor", line: "landscape", category: "Labor", label: "Labor", unit: "hour", priceCents: 5000 });
      await tx.insert(termBillingMonths).values(Array.from({ length: 12 }, (_, i) => ({
        companyId, termId: term.id, month: `${term === first && i < 10 ? "2027" : "2026"}-${String(i + 1).padStart(2, "0")}-01`,
        component: "Contract", amountCents: term === first ? 167300 : 150000,
      })));
      await tx.insert(termDocuments).values({ companyId, termId: term.id, kind: "signed", filename: "disposable-signed.pdf",
        storageObjectPath: `/objects/disposable-merge-no-blob-${term.id}`, mimeType: "application/pdf", fileSize: 123, uploadedBy: userId });
      await tx.insert(termLegacySources).values({ companyId, termId: term.id, legacyContractId: `disposable-${term.id}` });
    }
    return { target, source, predecessor, cancelled, first };
  });
}

export async function createMergeFixture() {
  const f = await createNonRenewalFixture();
  try {
    await resetNonRenewalFixture(f.companyId, f.customerId);
    return { ...f, ...await seedMergePair(f.companyId, f.userId, f.customerId) };
  } catch (e) { await removeNonRenewalFixture(f.companyId, f.userId); throw e; }
}
