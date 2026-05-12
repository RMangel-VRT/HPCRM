-- Snapshot the source proposal's number/title at CW creation so that when the
-- source proposal is later deleted (FK is ON DELETE SET NULL on
-- crew_worksheets.source_proposal_id), the CW can still display a degraded
-- "Generated from a proposal that has been deleted" banner instead of
-- silently dropping the source-proposal context entirely.

ALTER TABLE "crew_worksheets"
  ADD COLUMN IF NOT EXISTS "source_proposal_number_snapshot" varchar,
  ADD COLUMN IF NOT EXISTS "source_proposal_title_snapshot"  varchar;

-- Backfill snapshots for any existing CWs that still have a live source proposal.
UPDATE "crew_worksheets" cw
SET "source_proposal_number_snapshot" = p."proposal_number",
    "source_proposal_title_snapshot"  = p."title"
FROM "proposals" p
WHERE cw."source_proposal_id" = p."id"
  AND cw."source_proposal_number_snapshot" IS NULL;
