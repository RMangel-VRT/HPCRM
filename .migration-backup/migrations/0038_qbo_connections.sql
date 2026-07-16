CREATE TABLE IF NOT EXISTS qbo_connections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  refresh_token_expires_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'connected',
  company_name TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  last_error_message TEXT,
  connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qbo_connections_company_id_idx ON qbo_connections(company_id);
