import { and, eq } from "drizzle-orm";
import { agreements, agreementTerms, companies, customers, termDocuments, type AgreementTerm } from "@workspace/db";
import { db } from "../db";
import { createNonRenewalFixture, removeNonRenewalFixture, resetNonRenewalFixture } from "./contractNonRenewalFixture";
import { addCalendarDays, companyToday } from "./companyDay";
import { writeTerm } from "./contractCenterPersistence";

/** Disposable development-only population for read/action/browser verification.
 * No uploads, external calls or production data. Caller must remove it in finally. */
export async function createAttentionFixture() {
  const f = await createNonRenewalFixture();
  try {
    await resetNonRenewalFixture(f.companyId, f.customerId);
    await db.update(companies).set({ name: "Disposable Contract Accounting" }).where(eq(companies.id, f.companyId));
    await db.update(customers).set({ name: "No contract fixture" }).where(and(eq(customers.id, f.customerId), eq(customers.companyId, f.companyId)));
    const today = companyToday(), day = (n: number) => addCalendarDays(today, n);
    const ids: Record<string, { agreementId: string; termId: string; customerId: string }> = {};
    async function add(key: string, name: string, fields: Partial<AgreementTerm>) {
      const [customer] = await db.insert(customers).values({ companyId: f.companyId, name,
        street: "1 Fixture Way", city: "Denver", state: "CO", zip: "80000" }).returning();
      const [agreement] = await db.insert(agreements).values({ companyId: f.companyId, customerId: customer.id }).returning();
      const term = await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, {
        agreementId: agreement.id, seasonLabel: "Fixture season", line: "both", form: "ours",
        startDate: day(-250), endDate: day(30), status: "signed", billingType: "equal_monthly",
        snowPricing: "time_and_materials", annualPriceCents: 2400000, signedAt: new Date(), ...fields,
      }, "Disposable CC-ATTN verification fixture"));
      ids[key] = { agreementId: agreement.id, termId: term.id, customerId: customer.id };
      return term;
    }
    await add("new_draft", "Aspen draft fixture", { status: "draft", startDate: day(30), endDate: day(395), signedAt: null });
    await add("closed", "Older closed fixture", { status: "lost", startDate: day(-500), endDate: day(-120) });
    await add("closed_recently", "Recently closed fixture", { status: "lost", endDate: day(-10) });
    await add("serving_not_renewing", "Baseline decision fixture", { nonRenewalOn: today, nonRenewalReason: "other", nonRenewalBy: f.userId });
    await add("working_unsigned", "College Hills unsigned fixture", { status: "sent", signedAt: null });
    await add("renewal_due", "Chestnut renewal fixture", { endDate: day(80), line: "landscape" });
    const source = await add("renewal_in_progress", "Autumn renewal fixture", { endDate: day(40) });
    await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, { ...source, id: undefined,
      status: "sent", signedAt: null, startDate: day(41), endDate: day(405), renewedFromTermId: source.id,
    }, "Disposable sent renewal fixture"));
    const good = await add("good", "Wellman signed fixture", { endDate: day(365) });
    // Metadata only: no object download is attempted during accounting verification.
    await db.insert(termDocuments).values({ companyId: f.companyId, termId: good.id,
      kind: "signed", version: 1, filename: "disposable-fixture.pdf", storageObjectPath: `/objects/cc-attn-fixture-${f.companyId}`,
      mimeType: "application/pdf", uploadedBy: f.userId });
    await add("ended_no_decision", "Third Villa ended fixture", { status: "renewed", endDate: day(-45) });
    return { ...f, ids };
  } catch (error) { await removeNonRenewalFixture(f.companyId, f.userId); throw error; }
}
