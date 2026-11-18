import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { companies, companyDocuments, flags } from "@workspace/db";
import { db } from "../db";
import { reconcileCompanyDocumentExpiry } from "./companyDocumentExpiryFlags";

// Dedicated synthetic company; no existing company or flag is mutated.
const company = randomUUID(), document = randomUUID();
const today = "2026-11-18";
beforeAll(async () => {
  await db.insert(companies).values({ id: company, name: "Company document expiry test fixture", slug: `cd-expiry-${company}` });
  await db.insert(companyDocuments).values({ id: document, companyId: company, name: "Fixture COI", category: "insurance", expiresOn: "2027-01-17" });
});
afterAll(async () => { await db.delete(companies).where(eq(companies.id, company)); });
const ownFlags = () => db.select().from(flags).where(eq(flags.companyId, company));
it("serializes concurrent reconciles, suppresses closed history, hands stages off and resolves renewals/removal", async () => {
  await Promise.all(Array.from({ length: 5 }, () => reconcileCompanyDocumentExpiry(company, today)));
  expect(await ownFlags()).toHaveLength(1);
  const original = (await ownFlags())[0];
  expect(original.sourceKey).toBe(`company-doc:${document}:2027-01-17:60`);
  await db.update(flags).set({ status: "dismissed" }).where(eq(flags.id, original.id));
  await reconcileCompanyDocumentExpiry(company, today); expect(await ownFlags()).toHaveLength(1);
  await Promise.all([reconcileCompanyDocumentExpiry(company, "2027-01-03"), reconcileCompanyDocumentExpiry(company, "2027-01-03")]);
  expect(await ownFlags()).toHaveLength(2);
  const near = (await ownFlags()).find(f => f.sourceKey?.endsWith(":14"))!;
  await db.update(flags).set({ status: "in_progress", assignedToUserId: null }).where(eq(flags.id, near.id));
  await reconcileCompanyDocumentExpiry(company, "2027-01-04");
  expect((await ownFlags()).find(f => f.id === near.id)?.status).toBe("in_progress");
  await reconcileCompanyDocumentExpiry(company, "2027-01-18");
  expect((await ownFlags()).find(f => f.id === near.id)).toMatchObject({ status: "resolved", resolution: "Moved to the next reminder" });
  await db.insert(flags).values({ companyId: company, tag: "contract_question", note: "Untouched", sourceKey: "no-term:fixture", status: "new" });
  await db.update(companyDocuments).set({ expiresOn: "2028-01-17" }).where(eq(companyDocuments.id, document));
  await reconcileCompanyDocumentExpiry(company, "2027-01-18");
  expect((await ownFlags()).find(f => f.sourceKey?.endsWith(":expired"))).toMatchObject({ status: "resolved", resolution: "Renewed copy uploaded" });
  await db.update(companyDocuments).set({ expiresOn: "2027-02-18" }).where(eq(companyDocuments.id, document));
  await reconcileCompanyDocumentExpiry(company, "2027-01-18");
  await db.update(companyDocuments).set({ expiresOn: null }).where(eq(companyDocuments.id, document));
  await reconcileCompanyDocumentExpiry(company, "2027-01-18");
  expect((await ownFlags()).find(f => f.sourceKey?.includes("2027-02-18"))).toMatchObject({ status: "resolved", resolution: "Expiration removed" });
  await db.update(companyDocuments).set({ expiresOn: "2027-02-19" }).where(eq(companyDocuments.id, document));
  await reconcileCompanyDocumentExpiry(company, "2027-01-18");
  await db.update(companyDocuments).set({ archivedAt: new Date() }).where(eq(companyDocuments.id, document));
  await reconcileCompanyDocumentExpiry(company, "2027-01-18");
  expect((await ownFlags()).find(f => f.sourceKey?.includes("2027-02-19"))).toMatchObject({ status: "resolved", resolution: "Document removed" });
  expect((await ownFlags()).find(f => f.sourceKey === "no-term:fixture")).toMatchObject({ status: "new", note: "Untouched" });
  expect((await ownFlags()).filter(f => !["dismissed", "resolved"].includes(f.status))).toHaveLength(1);
});
