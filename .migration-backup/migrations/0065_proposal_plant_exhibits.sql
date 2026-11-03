-- Presentation only. Estimate lines remain the owner of plant selections.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS include_plant_schedule boolean NOT NULL DEFAULT true;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS include_plant_palette boolean NOT NULL DEFAULT true;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS palette_intro_text text;
