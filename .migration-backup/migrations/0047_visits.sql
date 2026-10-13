CREATE TABLE IF NOT EXISTS visits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crew_id varchar REFERENCES crews(id) ON DELETE SET NULL,
  visit_date date NOT NULL,
  source_type text NOT NULL DEFAULT 'ticket',
  ticket_id varchar REFERENCES tickets(id) ON DELETE CASCADE,
  customer_id varchar REFERENCES customers(id) ON DELETE SET NULL,
  title text,
  route_order integer,
  start_time text,
  estimated_hours real,
  status text NOT NULL DEFAULT 'planned',
  actual_start_at timestamp,
  actual_end_at timestamp,
  notes text,
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_company_date_crew_idx ON visits (company_id, visit_date, crew_id);
CREATE INDEX IF NOT EXISTS visits_ticket_idx ON visits (ticket_id);
CREATE INDEX IF NOT EXISTS visits_company_customer_date_idx ON visits (company_id, customer_id, visit_date);
