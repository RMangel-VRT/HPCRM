import { and, eq } from "drizzle-orm";
import { crewWorksheets, crewWorksheetPhotos, estimates, estimateVersions, estimateHasMultipleVersions } from "@workspace/db";
import { db } from "../db";
import { companyToday } from "../lib/companyDay";
import { canonicalEstimateUnit } from "./estimateUnit";
import { EstimateError, requireEstimate } from "./estimateErrors";
import { estimatePayload, readEstimatePhotoRows } from "./estimateReads";
import { allocateCrewWorksheetNumber } from "./crewWorksheetNumber";

export async function generateEstimateCrewWorksheet(companyId: string, userId: string, estimateId: string, versionId: string) {
  return db.transaction(async tx => {
    // Take the same lock as an estimate edit or discard before capturing anything.
    const estimate = requireEstimate((await tx.select().from(estimates)
      .where(and(eq(estimates.id, estimateId), eq(estimates.companyId, companyId))).for("update"))[0]);
    const version = requireEstimate((await tx.select({ id: estimateVersions.id, status: estimateVersions.status }).from(estimateVersions)
      .where(and(eq(estimateVersions.id, versionId), eq(estimateVersions.companyId, companyId),
        eq(estimateVersions.estimateId, estimateId))))[0]);
    if (estimate.voidedAt || version.status === "void") throw new EstimateError(409, "VERSION_LOCKED");
    const payload = await estimatePayload(tx, companyId, estimate, undefined, version.id);
    const worksheetDate = companyToday(), year = Number(worksheetDate.slice(0, 4));
    const worksheetNumber = await allocateCrewWorksheetNumber(companyId, year, tx);
    const baseTitle = estimate.title.trim();
    const [worksheet] = await tx.insert(crewWorksheets).values({
      companyId, customerId: estimate.customerId, ticketId: estimate.ticketId, createdById: userId,
      sourceEstimateId: estimateId, sourceEstimateVersionId: versionId,
      sourceEstimateLabelSnapshot: `${estimate.estimateNumber}${estimateHasMultipleVersions(payload.versions.length) ? ` · v${payload.version.versionNumber}` : ""} — ${baseTitle}`,
      sourceEstimateVersionNumberSnapshot: payload.version.versionNumber,
      worksheetNumber,
      title: /\bcrew worksheet\b/i.test(baseTitle) ? baseTitle : `${baseTitle} — Crew Worksheet`,
      worksheetDate, scopeOfWork: payload.version.scopeOfWork ?? "",
      estimateLinesSnapshot: payload.version.sections.map(section => ({
        name: section.name, lines: section.lines.map(({ name, detail, quantity, unit }) =>
          ({ name, detail, quantity, unit: canonicalEstimateUnit(unit) })),
      })),
    }).returning();
    const photos = await readEstimatePhotoRows(tx, companyId, versionId);
    if (photos.length) await tx.insert(crewWorksheetPhotos).values(photos.map((photo, displayOrder) => ({
      crewWorksheetId: worksheet.id, companyId, displayOrder, filename: photo.filename, caption: photo.caption,
      storageObjectPath: photo.storageObjectPath, mimeType: photo.mimeType, fileSize: photo.fileSize,
    })));
    return { id: worksheet.id };
  });
}
