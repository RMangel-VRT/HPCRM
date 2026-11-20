import { and, eq } from "drizzle-orm";
import { communicationAuditLog, companyEmailWording, users } from "@workspace/db";
import { db } from "../../db";
import { DEFAULT_WORDING, PLACEHOLDERS, selectWording, type EmailKey, type EmailWording } from "./wording";

const groups = {
  estimates: { estimate: "Estimate sent", estimate_revised: "Estimate revised" },
  invoices: { invoice_contract: "Monthly contract invoice", invoice_project: "Project invoice",
    reminder_friendly: "Friendly reminder", reminder_past_due: "Past due reminder", reminder_final: "Final notice" },
  chemical: { chemical_upcoming: "Upcoming application", chemical_completed: "Application completed" },
  work: { work_completed: "Work completed", documents: "Requested documents", general_message: "General message" },
  contracts: { contract_renewal: "Contract renewal", contract_welcome: "Contract welcome" },
} satisfies Record<string, Partial<Record<EmailKey, string>>>;

const catalog = Object.entries(groups).flatMap(([group, entries]) =>
  Object.entries(entries).map(([key, label]) => ({ key: key as EmailKey, label, group })));
type Override = typeof companyEmailWording.$inferSelect;

function entry(meta: (typeof catalog)[number], row?: Override, updatedBy?: string | null) {
  return {
    ...meta, placeholders: PLACEHOLDERS[meta.key],
    defaults: DEFAULT_WORDING[meta.key], wording: selectWording(row ?? DEFAULT_WORDING[meta.key]),
    isCustom: !!row, updatedAt: row?.updatedAt.toISOString() ?? null, updatedBy: updatedBy ?? null,
  };
}
const scope = (companyId: string, key: EmailKey) =>
  and(eq(companyEmailWording.companyId, companyId), eq(companyEmailWording.emailKey, key));

export async function listCompanyWording(companyId: string) {
  const rows = await db.select({ row: companyEmailWording, updatedBy: users.name }).from(companyEmailWording)
    .leftJoin(users, eq(companyEmailWording.updatedById, users.id)).where(eq(companyEmailWording.companyId, companyId));
  const byKey = new Map(rows.map(value => [value.row.emailKey, value]));
  return catalog.map(meta => {
    const saved = byKey.get(meta.key);
    return entry(meta, saved?.row, saved?.updatedBy);
  });
}

export async function saveCompanyWording(companyId: string, actor: { id: string; name: string }, key: EmailKey, wording: EmailWording) {
  return db.transaction(async tx => {
    // Explicitly pick the six fields. The body cannot supply company or audit metadata.
    const content = { ...selectWording(wording), updatedById: actor.id, updatedAt: new Date() };
    const [row] = await tx.insert(companyEmailWording).values({ ...content, companyId, emailKey: key })
      .onConflictDoUpdate({ target: [companyEmailWording.companyId, companyEmailWording.emailKey], set: content }).returning();
    await tx.insert(communicationAuditLog).values({
      companyId, actionByUserId: actor.id, actionType: "template_edited",
      actionDetails: { kind: "email_wording", emailKey: key, operation: "save" },
    });
    return entry(catalog.find(meta => meta.key === key)!, row, actor.name);
  });
}

export async function resetCompanyWording(companyId: string, actorId: string, key: EmailKey) {
  await db.transaction(async tx => {
    const [removed] = await tx.delete(companyEmailWording).where(scope(companyId, key)).returning({ id: companyEmailWording.id });
    if (removed) await tx.insert(communicationAuditLog).values({
      companyId, actionByUserId: actorId, actionType: "template_edited",
      actionDetails: { kind: "email_wording", emailKey: key, operation: "reset" },
    });
  });
}
