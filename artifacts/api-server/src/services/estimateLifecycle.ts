import { and, eq, inArray, ne, desc } from "drizzle-orm";
import { estimates, estimateVersions, estimateSections, estimateLines,
  sendEstimateSchema, acceptEstimateSchema, estimateReasonSchema, emptyEstimateActionSchema,
  type EstimateVersion } from "@workspace/db";
import { db } from "../db";
import { companyToday } from "../lib/companyDay";
import { EstimateError, requireEstimate } from "./estimateErrors";
import { estimatePayload } from "./estimateReads";
import { computeVersionTotals } from "./estimateMath";

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
    : emptyEstimateActionSchema.parse(body);
  return db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates)
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).for("update"))[0]);
    const now = auditTime ?? new Date();
    if (estimate.voidedAt) throw new EstimateError(409, "INVALID_TRANSITION", { from: "void", action });
    const scope = and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, id));
    const versions = await tx.select().from(estimateVersions).where(scope).orderBy(desc(estimateVersions.versionNumber));
    let currentVersionId = estimate.currentVersionId;
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
        const lineIds = lines.filter(l => l.unitPriceCents === 0 && l.priceSource !== "manual").map(l => l.id);
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
        const draft = versions.find(v => v.status === "draft");
        if (draft) throw new EstimateError(409, "DRAFT_EXISTS", { versionId: draft.id });
        const next = versions[0].versionNumber + 1;
        if (next > 2147483647) throw new RangeError("Version number overflow");
        const [copy] = await tx.insert(estimateVersions).values({ companyId, estimateId: id, versionNumber: next,
          createdFromVersionId: version.id, createdById: userId }).returning();
        const sections = await tx.select().from(estimateSections)
          .where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.versionId, version.id)));
        const lines = await tx.select().from(estimateLines)
          .where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, version.id)));
        const sectionIds = new Map<string, string>();
        for (const section of sections) {
          const [created] = await tx.insert(estimateSections).values({ companyId, versionId: copy.id,
            name: section.name, sortOrder: section.sortOrder }).returning();
          sectionIds.set(section.id, created.id);
        }
        if (lines.length) await tx.insert(estimateLines).values(lines.map(line => {
          const { id: _id, createdAt: _created, updatedAt: _updated, ...snapshot } = line;
          const sectionId = sectionIds.get(line.sectionId);
          if (!sectionId) throw new EstimateError(409, "CONFLICT");
          return { ...snapshot, versionId: copy.id, sectionId };
        }));
        currentVersionId = copy.id;
      } else if (action === "discard") {
        await tx.delete(estimateVersions).where(versionScope); // owned sections/lines cascade
        currentVersionId = versions.find(v => v.id !== version.id)!.id;
      }
    }
    // Current is always newest, not the version just accepted/declined.
    const [refreshed] = await tx.update(estimates).set({ currentVersionId, updatedAt: now })
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).returning();
    return estimatePayload(tx, companyId, refreshed);
  });
}
