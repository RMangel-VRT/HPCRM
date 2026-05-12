-- Crew Worksheet numbers (CW-YYYY-NNNN) are scoped per company per year.
-- The original migration declared `worksheet_number` globally UNIQUE which
-- prevents two companies from each having CW-2026-0001. Replace it with a
-- composite UNIQUE on (company_id, worksheet_number).

ALTER TABLE "crew_worksheets" DROP CONSTRAINT IF EXISTS "crew_worksheets_worksheet_number_key";
ALTER TABLE "crew_worksheets" DROP CONSTRAINT IF EXISTS "crew_worksheets_worksheet_number_unique";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crew_worksheets_company_id_worksheet_number_key'
  ) THEN
    ALTER TABLE "crew_worksheets"
      ADD CONSTRAINT "crew_worksheets_company_id_worksheet_number_key"
      UNIQUE ("company_id", "worksheet_number");
  END IF;
END $$;
