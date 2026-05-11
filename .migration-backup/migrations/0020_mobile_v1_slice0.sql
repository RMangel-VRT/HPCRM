-- Mobile v1 Slice 0: crews + mobile_auth_tokens.
-- Adds the crew (supervisor-owned field crew) and mobile bearer-token tables.
-- Idempotent so it can be applied to dev DBs that may already be partially migrated.

CREATE TABLE IF NOT EXISTS crews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  supervisor_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crews_company_name_unique') THEN
    ALTER TABLE crews ADD CONSTRAINT crews_company_name_unique UNIQUE (company_id, name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crews_company_supervisor_idx ON crews (company_id, supervisor_user_id);

CREATE TABLE IF NOT EXISTS mobile_auth_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  device_label text,
  last_used_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_auth_tokens_token_hash_idx ON mobile_auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS mobile_auth_tokens_user_idx ON mobile_auth_tokens (user_id);
