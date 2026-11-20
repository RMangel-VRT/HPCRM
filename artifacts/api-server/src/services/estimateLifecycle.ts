import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, desc } from "drizzle-orm";
import { estimates, estimateVersions, estimateSections, estimateLines, estimateVersionPhotos,
  sendEstimateSchema, acceptEstimateSchema, estimateReasonSchema, emptyEstimateActionSchema, reviseEstimateSchema,
  estimateLineNeedsPrice, type EstimateVersion, type EstimateRevisionIdMap } from "@workspace/db";
import { db } from "../db";
import { companyToday } from "../lib/companyDay";
import { EstimateError, requireEstimate } from "./estimateErrors";
import { estimatePayload, readEstimatePhotoRows } from "./estimateReads";
import { computeVersionTotals } from "./estimateMath";
import { canonicalEstimateUnit } from "./estimateUnit";

export type EstimateAction = "send" | "accept" | "decline" | "revise" | "discard" | "void";
const allowed: Record<EstimateAction, readonly EstimateVersion["status"][]> = {
  send: ["draft"], accept: ["sent"], decline: ["sent"],
  revise: ["sent", "accepted", "declined"], discard: ["draft"], void: [],
};
/** Exported pure transition gate; all state is read only after the parent lock. */
export function assertEstimateTransition(from: EstimateVersion["status"] | "void", action: EstimateAction, versionNumber?: number) {
  if (!allowed[action].includes(from) || (action === "discard" && versionNumber === 1))
    throw new EstimateError(409, "INVALID_TRANSITION", { from, action });
}
/** One transaction/parent lock shared by every lifecycle operation. No catalog
 * access: revisions copy commercial snapshots, send freezes the existing math. */
export async function transitionEstimate(companyId: string, userId: string | null, id: string,
  versionId: string | undefined, action: EstimateAction, body: unknown, auditTime?: Date) {
  // Validate even when called outside the router. Empty actions reject extra keys.
  const input = action === "send" ? sendEstimateSchema.parse(body)
    : action === "accept" ? acceptEstimateSchema.parse(body)
    : action === "decline" || action === "void" ? estimateReasonSchema.parse(body)
    : action === "revise" ? reviseEstimateSchema.parse(body)
    : emptyEstimateActionSchema.parse(body);
  return db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates)
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).for("update"))[0]);
    const now = auditTime ?? new Date();
    if (estimate.voidedAt) throw new EstimateError(409, "INVALID_TRANSITION", { from: "void", action });
    const scope = and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, id));
    const versions = await tx.select().from(estimateVersions).where(scope).orderBy(desc(estimateVersions.versionNumber));
    let currentVersionId = estimate.currentVersionId;
    let idMap: EstimateRevisionIdMap | undefined;
    if (action === "void") {
      if (versions.some(v => v.status === "accepted")) throw new EstimateError(409, "HAS_ACCEPTED_VERSION");
      const { reason } = estimateReasonSchema.parse(input);
      await tx.update(estimates).set({ voidedAt: now, voidReason: reason })
        .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)));
      await tx.update(estimateVersions).set({ status: "void", updatedAt: now })
        .where(and(scope, inArray(estimateVersions.status, ["draft", "sent"])));
    } else {
      const version = requireEstimate(versions.find(v => v.id === versionId));
      assertEstimateTransition(version.status, action, version.versionNumber);
      const versionScope = and(scope, eq(estimateVersions.id, version.id));
      if (action === "send") {
        const { method, confirmZeroPriced } = sendEstimateSchema.parse(input);
        const lines = await tx.select().from(estimateLines)
          .where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, version.id)));
        if (!lines.length) throw new EstimateError(409, "NO_LINES");
        const lineIds = lines.filter(estimateLineNeedsPrice).map(l => l.id);
        if (lineIds.length && !confirmZeroPriced) throw new EstimateError(409, "LINES_NEED_PRICE", { lineIds });
        const totals = computeVersionTotals(lines);
        await tx.update(estimateVersions).set({ status: "superseded", supersededAt: now, updatedAt: now })
          .where(and(scope, ne(estimateVersions.id, version.id), eq(estimateVersions.status, "sent")));
        await tx.update(estimateVersions).set({ status: "sent", sentAt: now, sentById: userId, sentMethod: method,
          frozenSubtotalCents: totals.subtotalCents, frozenCostKnownCents: totals.costKnownCents,
          frozenCostUnknownLines: totals.costUnknownLines, updatedAt: now }).where(versionScope);
      } else if (action === "accept") {
        const { method, poNumber, acceptedOn } = acceptEstimateSchema.parse(input);
        // Release the accepted partial unique before activating this version.
        await tx.update(estimateVersions).set({ status: "superseded", supersededAt: now, updatedAt: now })
          .where(and(scope, ne(estimateVersions.id, version.id), inArray(estimateVersions.status, ["sent", "accepted"])));
        await tx.update(estimateVersions).set({ status: "accepted", acceptedAt: now, acceptedById: userId,
          acceptedOn: acceptedOn ?? companyToday(now), acceptanceMethod: method, poNumber: poNumber || null, updatedAt: now }).where(versionScope);
      } else if (action === "decline") {
        await tx.update(estimateVersions).set({ status: "declined", declinedAt: now, declinedById: userId,
          declineReason: estimateReasonSchema.parse(input).reason, updatedAt: now }).where(versionScope);
      } else if (action === "revise") {
        const { firstEdit } = reviseEstimateSchema.parse(input);
        const invalidFirstEdit = () => new EstimateError(409, "INVALID_TRANSITION", { from: version.status, action });
        if (firstEdit && version.status !== "sent" && version.status !== "declined") throw invalidFirstEdit();
        const draft = versions.find(v => v.status === "draft");
        if (draft) throw new EstimateError(409, "DRAFT_EXISTS", {
          versionId: draft.id,
          ...(draft.createdFromVersionId === version.id && draft.revisionIdMap ? { idMap: draft.revisionIdMap } : {}),
        });
        if (firstEdit && currentVersionId !== version.id) throw invalidFirstEdit();
        const next = versions[0].versionNumber + 1;
        if (next > 2147483647) throw new RangeError("Version number overflow");
        const sections = await tx.select().from(estimateSections)
          .where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.versionId, version.id)));
        const lines = await tx.select().from(estimateLines)
          .where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, version.id)));
        // Assign IDs before bulk inserts; RETURNING row order is not a mapping contract.
        const sectionsToCopy = new Map(sections.map(section => [section.id, randomUUID()]));
        const linesToCopy = new Map(lines.map(line => [line.id, randomUUID()]));
        const photos = await readEstimatePhotoRows(tx, companyId, version.id);
        const photosToCopy = new Map(photos.map(photo => [photo.id, randomUUID()]));
        idMap = { sections: Object.fromEntries(sectionsToCopy), lines: Object.fromEntries(linesToCopy) };
        if (photos.length) idMap.photos = Object.fromEntries(photosToCopy);
        const [copy] = await tx.insert(estimateVersions).values({ companyId, estimateId: id, versionNumber: next,
          createdFromVersionId: version.id, scopeOfWork: version.scopeOfWork, includePlantTable: version.includePlantTable,
          createdById: userId, revisionIdMap: idMap }).returning();
        if (sections.length) await tx.insert(estimateSections).values(sections.map(section => ({
          id: sectionsToCopy.get(section.id)!, companyId, versionId: copy.id, name: section.name, sortOrder: section.sortOrder,
        })));
        if (lines.length) await tx.insert(estimateLines).values(lines.map(({ id: sourceId, createdAt: _created, updatedAt: _updated, ...snapshot }) => {
          const sectionId = sectionsToCopy.get(snapshot.sectionId);
          if (!sectionId) throw new EstimateError(409, "CONFLICT");
          return { ...snapshot, id: linesToCopy.get(sourceId)!, unit: canonicalEstimateUnit(snapshot.unit), versionId: copy.id, sectionId };
        }));
        if (photos.length) await tx.insert(estimateVersionPhotos).values(photos.map(({ id: sourceId, createdAt: _created, ...snapshot }) =>
          ({ ...snapshot, id: photosToCopy.get(sourceId)!, versionId: copy.id })));
        currentVersionId = copy.id;
      } else if (action === "discard") {
        await tx.delete(estimateVersions).where(versionScope); // owned rows cascade; shared photo objects are not deleted
        currentVersionId = versions.find(v => v.id !== version.id)!.id;
      }
    }
    // Current is always newest, not the version just accepted/declined.
    const [refreshed] = await tx.update(estimates).set({ currentVersionId, updatedAt: now })
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).returning();
    return { ...await estimatePayload(tx, companyId, refreshed), ...(idMap ? { idMap } : {}) };
  });
}
