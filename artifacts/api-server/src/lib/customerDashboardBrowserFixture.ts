/**
 * Adds CP3 observed work to the existing disposable customer-pages fixture.
 * Run customerPagesBrowserFixture.ts first; run this with cleanup before its cleanup.
 * This helper refuses every company except that helper's generated test company.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { companies, customers, ticketTypes, ticketTypeStatuses, tickets, campaigns, campaignItems, notes, contacts,
  communications, agreements, agreementTerms, termBillingMonths, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
const file = new URL("../../../../generated-artifacts/cp1/browser-fixture.json", import.meta.url);
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development-only fixture");
  const f = JSON.parse(readFileSync(file, "utf8"));
  const [company] = await db.select().from(companies).where(eq(companies.id, f.companyId));
  if (company?.slug !== `cp1-browser-${f.companyId}`) throw new Error("Not a disposable customer-pages company");
  if (process.argv[2] === "cleanup") {
    await db.delete(tickets).where(eq(tickets.companyId, f.companyId));
    await db.delete(ticketTypes).where(eq(ticketTypes.companyId, f.companyId));
    return;
  }
  const typeId = randomUUID(), statusId = randomUUID(), campaignId = randomUUID();
  const parentAgreement = randomUUID(), parentTerm = randomUUID();
  await db.transaction(async tx => {
    await tx.update(customers).set({ name: "18 at Ute Creek", includeInRoute: true, customerType: "hoa",
      locationLat: 40.159, locationLng: -105.058, gateCode: "TEST 1234", tags: ["Synthetic browser fixture"] })
      .where(eq(customers.id, f.ute));
    await tx.update(customers).set({ name: "1st Bank (synthetic)", billingName: "Synthetic master billing" })
      .where(eq(customers.id, f.parent));
    await tx.insert(ticketTypes).values({ id: typeId, companyId: f.companyId, name: "Synthetic task", category: "quick_task" });
    await tx.insert(ticketTypeStatuses).values({ id: statusId, ticketTypeId: typeId, name: "Open", displayOrder: 0 });
    await tx.insert(tickets).values([
      { companyId: f.companyId, customerId: f.ute, createdById: f.actor, ticketTypeId: typeId, currentStatusId: statusId, title: "Inspect irrigation controller", createdAt: new Date("2026-09-01T12:00:00Z") },
      { companyId: f.companyId, customerId: f.ute, createdById: f.actor, ticketTypeId: typeId, currentStatusId: statusId, title: "Review winter access" },
      { companyId: f.companyId, customerId: f.branch, createdById: f.actor, ticketTypeId: typeId, currentStatusId: statusId, title: "Synthetic branch review" },
    ]);
    await tx.insert(campaigns).values({ id: campaignId, companyId: f.companyId, title: "Synthetic observed service",
      windowStart: "2026-09-01", windowEnd: "2026-10-01", createdById: f.actor });
    await tx.insert(campaignItems).values(Array.from({ length: 13 }, (_, n) => ({
      companyId: f.companyId, campaignId, customerId: f.ute, customerName: "18 at Ute Creek",
      status: n < 10 ? "completed" as const : "pending" as const,
      completedAt: n < 10 ? new Date(`2026-10-${String(n + 1).padStart(2, "0")}T12:00:00Z`) : null,
    })));
    await tx.insert(notes).values({ companyId: f.companyId, customerId: f.ute, authorId: f.actor, body: "Synthetic note: winter gate access must stay clear." });
    await tx.insert(contacts).values({ companyId: f.companyId, customerId: f.ute, name: "Synthetic HOA contact", role: "HOA board",
      emails: ["contact@example.invalid"], phones: ["555-0100"], isPrimary: "true" });
    await tx.insert(communications).values({ companyId: f.companyId, customerId: f.ute, sentById: f.actor,
      type: "email", status: "sent", direction: "inbound", subject: "Synthetic winter access reply", body: "Verification only.",
      receivedAt: new Date(), fromName: "Synthetic HOA contact", fromAddress: "contact@example.invalid" });
    await tx.insert(agreements).values({ id: parentAgreement, companyId: f.companyId, customerId: f.parent });
    await tx.insert(agreementTerms).values({ id: parentTerm, agreementId: parentAgreement, companyId: f.companyId, line: "landscape",
      form: "theirs", seasonLabel: "2026–27", status: "active", startDate: "2026-10-01", endDate: "2027-09-30",
      legalName: "Synthetic master agreement", billingType: "equal_monthly" });
    await tx.insert(termBillingMonths).values(Array.from({ length: 12 }, (_, n) => ({
      companyId: f.companyId, termId: parentTerm, component: "Contract", month: `${n < 3 ? 2026 : 2027}-${String((n + 9) % 12 + 1).padStart(2, "0")}-01`, amountCents: 10000,
    })));
  });
  console.log("Disposable CP3 work and parent coverage ready.");
}
main().catch(err => { console.error(err.cause?.message ?? err.message); process.exitCode = 1; }).finally(async () => { await pool.end(); await schemaPool.end(); });
