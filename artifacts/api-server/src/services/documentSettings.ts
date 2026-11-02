import { eq } from "drizzle-orm";
import { companyDocumentSettings } from "@workspace/db";
import { documentSettingsModel, type DocumentSettings } from "@workspace/db/document-contracts";
import { db, type AppTransaction } from "../db";

export async function readDocumentSettings(companyId: string, tx: typeof db | AppTransaction = db): Promise<DocumentSettings> {
  const [row] = await tx.select().from(companyDocumentSettings).where(eq(companyDocumentSettings.companyId, companyId));
  return documentSettingsModel(row);
}
export async function updateDocumentSettings(companyId: string, actorId: string, patch: Partial<DocumentSettings>) {
  const [row] = await db.insert(companyDocumentSettings).values({ companyId, ...patch, updatedById: actorId })
    .onConflictDoUpdate({ target: companyDocumentSettings.companyId, set: { ...patch, updatedById: actorId, updatedAt: new Date() } }).returning();
  return documentSettingsModel(row);
}
