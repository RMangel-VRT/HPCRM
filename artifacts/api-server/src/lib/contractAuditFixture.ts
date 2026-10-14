// Isolated development fixtures shared by the opt-in integration test and
// browser verification setup. Never used by application routes.
import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { companies, users, companyUsers, customers, contracts, contractDocuments, rateCardItems, propertyManagementCompanies } from "@workspace/db";
import { db } from "../db";
import { readAuditZip, parseAuditFiles } from "./contractAuditFiles";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";

export async function createAuditFixture() {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixtures cannot run in production");
  const companyId = randomUUID(), userId = randomUUID(), customerId = randomUUID();
  const email = `audit-${userId}@example.invalid`, password = randomBytes(18).toString("hex"), salt = randomBytes(16).toString("hex");
  const oldIds = Array.from({ length: 4 }, () => randomUUID()), docIds = [randomUUID(), randomUUID()];
  const managementId = randomUUID();
  await db.insert(companies).values({ id: companyId, name: "Disposable Contract Audit", slug: `audit-${companyId}` });
  try {
    await db.insert(users).values({ id: userId, name: "Audit Verification Admin", email, defaultCompanyId: companyId,
      passwordHash: `${scryptSync(password, salt, 64).toString("hex")}.${salt}` });
    await db.insert(companyUsers).values({ companyId, userId, role: "admin" });
    await db.insert(propertyManagementCompanies).values({ id: managementId, companyId, name: "Audit Management" });
    await db.insert(customers).values({ id: customerId, companyId, name: "College Hills", street: "1 Fixture Way",
      city: "Denver", state: "CO", zip: "80000", propertyManagementCompanyId: managementId });
    await db.insert(contracts).values(oldIds.map((id, i) => ({
      id, companyId, customerId, serviceType: (i === 2 ? "Chemical" : i === 3 ? "Snow" : "Maintenance") as "Maintenance" | "Chemical" | "Snow",
      billingPattern: "monthly" as const, startDate: new Date(i ? "2026-04-01T00:00:00Z" : "2025-07-14T00:00:00Z"),
      endDate: new Date(i ? "2027-09-30T00:00:00Z" : "2026-03-31T00:00:00Z"), status: i ? "active" as const : "ended" as const,
    })));
    await db.insert(contractDocuments).values(docIds.map((id, i) => ({
      id, companyId, contractId: oldIds[i], version: i + 1, filename: `fixture-signed-${i}.pdf`, mimeType: "application/pdf",
      fileSize: 123, uploadedBy: userId, uploadedAt: new Date("2026-01-01T00:00:00Z"),
      storageObjectPath: `/objects/disposable-audit-no-blob-${id}`,
    })));
    await db.insert(rateCardItems).values(RATE_CARD_DEFAULTS.map(({ key, ...rate }, sortOrder) => ({ ...rate, rateKey: key, companyId, sortOrder })));
    const entries = await readAuditZip(await readFile(new URL("../../../../attached_assets/contract-import-template_1791932139984.zip", import.meta.url)));
    const mapping: Record<string, string> = { "<College Hills customer_id>": customerId,
      "<old Maintenance id (the ended one)>": oldIds[0], "<new Maintenance id>": oldIds[1],
      "<Chemical id>": oldIds[2], "<Snow id>": oldIds[3] };
    const documentPlaceholders = [...new Set(entries.find(e => e.name.endsWith("documents.csv"))!.data.toString().match(/<[^>]+>/g))];
    documentPlaceholders.forEach((placeholder, i) => mapping[placeholder] = docIds[i]);
    const upload = entries.map(e => ({ ...e, data: Buffer.from(e.data.toString().replace(/<[^>]+>/g, p => mapping[p] ?? p)) }));
    const files = await parseAuditFiles(upload);
    return { companyId, userId, customerId, managementId, oldIds, docIds, email, password, files, upload };
  } catch (error) {
    await removeAuditFixture(companyId, userId);
    throw error;
  }
}
export async function removeAuditFixture(companyId: string, userId: string) {
  // Internal test cleanup deliberately bypasses user-facing cascade freeze;
  // it only targets the UUID-owned disposable company created by this helper.
  await db.delete(companies).where(eq(companies.id, companyId));
  await db.delete(users).where(eq(users.id, userId));
}
