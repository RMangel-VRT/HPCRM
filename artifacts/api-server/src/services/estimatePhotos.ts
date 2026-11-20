import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { crewWorksheetPhotos, estimates, estimateVersionPhotos, estimateVersions } from "@workspace/db";
import { db } from "../db";
import { ESTIMATE_PHOTO_PREFIX } from "../objectStorage";
import { logger } from "../lib/logger";
import { EstimateError, requireEstimate } from "./estimateErrors";
import { readEstimatePhotoRows } from "./estimateReads";
import { mutateEstimate, withDraftEstimate } from "./estimates";
import {
  PrivateEstimatePhotoObjects, normalizeEstimatePhoto, removeEstimatePhotoStaging,
  readEstimatePhotoGrant, signEstimatePhotoGrant, type EstimatePhotoGrant,
} from "./estimatePhotoStorage";

type Scope = Pick<EstimatePhotoGrant, "companyId" | "estimateId" | "versionId" | "userId">;
type SessionScope = Scope & { sessionId: string };
const inVersion = (companyId: string, versionId: string) =>
  and(eq(estimateVersionPhotos.companyId, companyId), eq(estimateVersionPhotos.versionId, versionId));

export function startEstimatePhotoUpload(scope: SessionScope, input: Pick<EstimatePhotoGrant, "filename" | "mimeType" | "fileSize">,
  objects = new PrivateEstimatePhotoObjects()) {
  const { sessionId, ...owner } = scope;
  return withDraftEstimate(scope.companyId, scope.estimateId, scope.versionId, async () => {
    const grant = { ...input, ...owner, id: randomUUID(), expires: Date.now() + 15 * 60_000 };
    return { ...await objects.start(grant.id), uploadToken: signEstimatePhotoGrant(grant, sessionId) };
  });
}

export async function registerEstimatePhoto(scope: SessionScope, token: string, objects = new PrivateEstimatePhotoObjects()) {
  const { sessionId, ...owner } = scope;
  const { companyId, estimateId, versionId } = owner;
  const grant = readEstimatePhotoGrant(token, sessionId);
  const matches = grant && Object.entries(owner).every(([key, value]) => grant[key as keyof Scope] === value);
  let accepted: string | undefined;
  try {
    return await mutateEstimate(companyId, estimateId, versionId, async ({ tx }) => {
      if (!matches || grant.expires < Date.now()) throw new EstimateError(404, "PHOTO_UPLOAD_EXPIRED");
      const list = await readEstimatePhotoRows(tx, companyId, versionId);
      if (list.some(photo => photo.id === grant.id)) return; // Lost response retry, never a second write to accepted bytes.
      const image = await normalizeEstimatePhoto(await objects.readUpload(grant));
      accepted = `${ESTIMATE_PHOTO_PREFIX}accepted/${randomUUID()}.jpg`;
      await objects.save(accepted, image);
      await tx.insert(estimateVersionPhotos).values({
        id: grant.id, companyId, versionId, storageObjectPath: `/objects/${accepted}`, filename: grant.filename,
        mimeType: "image/jpeg", fileSize: image.length, displayOrder: (list.at(-1)?.displayOrder ?? -1) + 1,
      });
    });
  } catch (error) {
    if (accepted) {
      // A failed DB response can be ambiguous. Never remove bytes if any
      // version or worksheet committed a reference, including a concurrent copy.
      const path = `/objects/${accepted}`;
      await db.transaction(async tx => {
        const [versionRef] = await tx.select({ id: estimateVersionPhotos.id }).from(estimateVersionPhotos)
          .where(eq(estimateVersionPhotos.storageObjectPath, path)).limit(1);
        const [worksheetRef] = await tx.select({ id: crewWorksheetPhotos.id }).from(crewWorksheetPhotos)
          .where(eq(crewWorksheetPhotos.storageObjectPath, path)).limit(1);
        if (!versionRef && !worksheetRef) await objects.remove(accepted!);
      }, { isolationLevel: "repeatable read", accessMode: "read only" })
        .catch(() => logger.warn("Estimate photo rollback cleanup failed"));
    }
    throw error;
  } finally {
    if (matches) await removeEstimatePhotoStaging(objects, grant.id).catch(() => logger.warn("Estimate photo staging cleanup failed"));
  }
}

export async function readEstimatePhoto(companyId: string, estimateId: string, versionId: string, photoId: string) {
  return requireEstimate((await db.select({ photo: estimateVersionPhotos }).from(estimateVersionPhotos)
    .innerJoin(estimateVersions, and(eq(estimateVersions.id, estimateVersionPhotos.versionId),
      eq(estimateVersions.estimateId, estimateId), eq(estimateVersions.companyId, companyId)))
    .innerJoin(estimates, and(eq(estimates.id, estimateVersions.estimateId), eq(estimates.companyId, companyId)))
    .where(and(inVersion(companyId, versionId), eq(estimateVersionPhotos.id, photoId))))[0]?.photo);
}

export function patchEstimatePhoto(companyId: string, estimateId: string, versionId: string, photoId: string, caption: string | null) {
  return mutateEstimate(companyId, estimateId, versionId, async ({ tx }) => {
    requireEstimate((await tx.update(estimateVersionPhotos).set({ caption: caption?.trim() || null })
      .where(and(inVersion(companyId, versionId), eq(estimateVersionPhotos.id, photoId))).returning({ id: estimateVersionPhotos.id }))[0]);
  });
}
export function removeEstimatePhoto(companyId: string, estimateId: string, versionId: string, photoId: string) {
  return mutateEstimate(companyId, estimateId, versionId, async ({ tx }) => {
    // Metadata only. Other versions and worksheets may refer to this object.
    requireEstimate((await tx.delete(estimateVersionPhotos).where(and(inVersion(companyId, versionId), eq(estimateVersionPhotos.id, photoId)))
      .returning({ id: estimateVersionPhotos.id }))[0]);
  });
}
export function orderEstimatePhotos(companyId: string, estimateId: string, versionId: string, photoIds: string[]) {
  return mutateEstimate(companyId, estimateId, versionId, async ({ tx }) => {
    const rows = await readEstimatePhotoRows(tx, companyId, versionId);
    const expected = new Set(rows.map(row => row.id));
    if (photoIds.length !== expected.size || !photoIds.every(id => expected.delete(id)))
      throw new EstimateError(409, "INVALID_PHOTO_ORDER");
    for (const [displayOrder, id] of photoIds.entries()) {
      if (rows[displayOrder].id === id && rows[displayOrder].displayOrder === displayOrder) continue;
      await tx.update(estimateVersionPhotos).set({ displayOrder })
        .where(and(inVersion(companyId, versionId), eq(estimateVersionPhotos.id, id)));
    }
  });
}
