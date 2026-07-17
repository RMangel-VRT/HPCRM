-- QBO Slice 1.2: Add QBO binding columns to customers table and create qbo_customer_cache table

-- Add QBO binding columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_customer_id VARCHAR;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_display_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMP;

-- Partial unique index: at most one CRM customer per QBO customer per company (NULLs excluded)
CREATE UNIQUE INDEX IF NOT EXISTS customers_qbo_customer_id_uniq
  ON customers (company_id, qbo_customer_id)
  WHERE qbo_customer_id IS NOT NULL;

-- QBO customer cache table
CREATE TABLE IF NOT EXISTS qbo_customer_cache (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  qbo_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  bill_addr_line1 TEXT,
  bill_addr_city TEXT,
  bill_addr_postal_code TEXT,
  bill_addr_country_sub_division_code TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
  seed_customer_id VARCHAR REFERENCES customers(id) ON DELETE SET NULL,
  seed_source TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Composite unique index on (company_id, qbo_id)
CREATE UNIQUE INDEX IF NOT EXISTS qbo_customer_cache_company_qbo_id_uniq
  ON qbo_customer_cache (company_id, qbo_id);

-- Company id index for fast lookups
CREATE INDEX IF NOT EXISTS qbo_customer_cache_company_id_idx
  ON qbo_customer_cache (company_id);

-- GIN trigram index on lower(display_name) for fast matching (requires pg_trgm)
CREATE INDEX IF NOT EXISTS qbo_customer_cache_display_name_trgm_idx
  ON qbo_customer_cache USING gin (lower(display_name) gin_trgm_ops);
