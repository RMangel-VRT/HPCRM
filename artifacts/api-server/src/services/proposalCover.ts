import { z } from "zod/v4";

/** No defaults on PATCH: omitted fields must preserve stored presentation. */
export const proposalCoverPatch = z.object({
  coverSource: z.enum(["none", "photo", "visual_scope"]).optional(),
  coverPhotoFileId: z.string().min(1).max(200).nullable().optional(),
  visualScopeSheetId: z.string().max(200).nullable().optional(),
});
export function coverSelectionError(
  patch: z.infer<typeof proposalCoverPatch>,
  existing: { id: string; companyId: string; coverSource?: string; coverPhotoFileId?: string | null; visualScopeSheetId: string | null },
  effectiveScopeId: string | null,
  photos: readonly { id: string; proposalId: string; companyId: string; fileType: string; mimeType: string }[],
): string | null {
  // An unrelated edit must still work after a selected source has been deleted.
  if (patch.coverSource === undefined && patch.coverPhotoFileId === undefined) return null;
  const source = patch.coverSource ?? existing.coverSource ?? "none";
  const photoId = patch.coverPhotoFileId === undefined ? existing.coverPhotoFileId : patch.coverPhotoFileId;
  if ((source === "photo" || patch.coverPhotoFileId != null) && !photos.some(p => p.id === photoId && p.proposalId === existing.id &&
      p.companyId === existing.companyId && p.fileType === "image" && p.mimeType.startsWith("image/"))) return "INVALID_COVER_PHOTO";
  if (source === "visual_scope" && !effectiveScopeId) return "COVER_VISUAL_SCOPE_REQUIRED";
  return null;
}
