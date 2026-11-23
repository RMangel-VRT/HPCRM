/** Disposable development-only data, never called by application routes. */
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { companies, users, companyUsers, customers, ticketTypes, ticketTypeStatuses, ticketTypeFields, tickets } from "@workspace/db";
import { db } from "../db";
import { ensureRFPRequestTicketType } from "./rfpWorkflowSeeder";

export async function createRfpFixture() {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixtures only");
  const companyId = randomUUID(), userId = randomUUID(), customerId = randomUUID();
  const email = `rfp-${userId}@example.invalid`, password = randomBytes(18).toString("hex"), salt = randomBytes(16).toString("hex");
  await db.insert(companies).values({ id: companyId, name: "Disposable RFP Lifecycle", slug: `rfp-${companyId}` });
  try {
    await db.insert(users).values({ id: userId, name: "RFP Verification", email, defaultCompanyId: companyId,
      passwordHash: `${scryptSync(password, salt, 64).toString("hex")}.${salt}` });
    await db.insert(companyUsers).values({ companyId, userId, role: "admin" });
    await db.insert(customers).values({ id: customerId, companyId, name: "Disposable RFP Property",
      status: "prospect", street: "1 Test Way", city: "Denver", state: "CO", zip: "80000" });
    const { typeId } = await ensureRFPRequestTicketType(companyId);
    const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, typeId));
    const [customFinal] = await db.insert(ticketTypeStatuses).values({
      ticketTypeId: typeId, name: "Custom Final", displayOrder: 10, isFinal: "true",
    }).returning();
    const statuses = await db.select().from(ticketTypeStatuses).where(eq(ticketTypeStatuses.ticketTypeId, typeId));
    const status = (key: string) => key === "custom_final" ? customFinal : statuses.find(s => s.statusKey === key)!;
    const fields = await db.select().from(ticketTypeFields).where(eq(ticketTypeFields.ticketTypeId, typeId));
    const createRfp = async (key = "proposal_draft") => {
      const [ticket] = await db.insert(tickets).values({ companyId, customerId, ticketTypeId: type.id, currentStatusId: status(key).id,
        title: `Disposable RFP ${randomUUID().slice(0, 8)}`, createdById: userId, workType: "admin", billingBehavior: "internal" }).returning();
      return ticket;
    };
    return { companyId, userId, customerId, email, password, type, statuses, fields, status, createRfp };
  } catch (error) { await removeRfpFixture(companyId, userId); throw error; }
}
export async function removeRfpFixture(companyId: string, userId: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixtures only");
  await db.delete(companies).where(eq(companies.id, companyId));
  await db.delete(users).where(eq(users.id, userId));
}
