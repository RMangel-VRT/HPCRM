-- Mobile v1 Slice 4: field flags + flag photos.
--
-- `flags` rows are short field reports posted from the mobile app
-- ("irrigation issue", "property damage", etc.) and triaged by the office
-- via the admin Flags inbox. `flag_photos` stores ≥1 photo per flag in the
-- same `ticket-photos` bucket layout used by Slice 3, but under a
-- `flag-photos/{companyId}/{flagId}/{uuid}.jpg` key prefix.

CREATE TABLE IF NOT EXISTS "flags" (
  "id"                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"           varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "created_by_user_id"   varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "crew_id"              varchar REFERENCES "crews"("id") ON DELETE SET NULL,
  "property_id"          varchar REFERENCES "customers"("id") ON DELETE SET NULL,
  "ticket_id"            varchar REFERENCES "tickets"("id") ON DELETE SET NULL,
  "tag"                  text NOT NULL,
  "note"                 text,
  "status"               text NOT NULL DEFAULT 'new',
  "assigned_to_user_id"  varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "resolution"           text,
  "resolved_at"          timestamp,
  "client_id"            varchar,
  "created_at"           timestamp NOT NULL DEFAULT now(),
  "updated_at"           timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flags_company_status_created_idx"
  ON "flags" ("company_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "flags_company_created_idx"
  ON "flags" ("company_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "flags_company_client_id_uq"
  ON "flags" ("company_id", "client_id")
  WHERE "client_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "flag_photos" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"            varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "flag_id"               varchar NOT NULL REFERENCES "flags"("id") ON DELETE CASCADE,
  "uploaded_by_user_id"   varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "storage_key"           text NOT NULL,
  "content_type"          text NOT NULL DEFAULT 'image/jpeg',
  "byte_size"             integer,
  "width"                 integer,
  "height"                integer,
  "captured_at"           timestamp NOT NULL DEFAULT now(),
  "client_id"             varchar,
  "created_at"            timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flag_photos_flag_idx"
  ON "flag_photos" ("flag_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "flag_photos_flag_client_id_uq"
  ON "flag_photos" ("flag_id", "client_id")
  WHERE "client_id" IS NOT NULL;
