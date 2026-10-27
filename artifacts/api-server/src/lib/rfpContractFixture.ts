/** Disposable development-only data, never called by application routes. */
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { companies, users, companyUsers, customers, ticketTypes, ticketTypeStatuses, ticketTypeFields, tickets } from "@workspace/db";
import { db } from "../db";

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
    const [type] = await db.insert(ticketTypes).values({ companyId, name: "RFP Request", typeKey: "rfp_request",
      requiresCustomer: "false", requiresScheduling: "false", terminalBehavior: "handoff" }).returning();
    const keys = ["new", "reviewing", "proposal_draft", "proposal_sent", "awaiting_response", "decision_received",
      "awarded", "contract_executed", "crm_setup", "closed_won", "closed_lost", "custom_final"];
    const names = ["Request Received", "Review Requirements", "Proposal Drafted", "Proposal Submitted", "Awaiting Response",
      "Decision Received", "Awarded", "Contract Executed", "CRM Setup Complete", "Closed – Won", "Closed – Lost", "Custom Final"];
    const statuses = await db.insert(ticketTypeStatuses).values(keys.map((statusKey, displayOrder) => ({
      ticketTypeId: type.id, statusKey, displayOrder, name: names[displayOrder],
      isFinal: (displayOrder >= 9 ? "true" : "false") as "true" | "false",
    }))).returning();
    const status = (key: string) => statuses.find(s => s.statusKey === key)!;
    const fields = await db.insert(ticketTypeFields).values([
      { ticketTypeId: type.id, statusId: status("new").id, displayOrder: 0, fieldKey: "service_request_type", fieldLabel: "Service Request", fieldType: "select" as const,
        options: ["Maintenance only", "Snow Removal Only", "Maintenance & Snow Removal", "Custom"] },
      { ticketTypeId: type.id, statusId: status("new").id, displayOrder: 1, fieldKey: "desired_start_date", fieldLabel: "Desired Start Date", fieldType: "date" as const },
      { ticketTypeId: type.id, statusId: status("decision_received").id, displayOrder: 0, fieldKey: "decision_outcome", fieldLabel: "Decision", fieldType: "select" as const, options: ["Won", "Lost"] },
    ]).returning();
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
