CREATE TABLE IF NOT EXISTS company_email_wording (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email_key text NOT NULL,
  subject text NOT NULL,
  preview text NOT NULL,
  eyebrow text NOT NULL,
  headline text NOT NULL,
  intro text NOT NULL,
  closing text NOT NULL,
  updated_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT company_email_wording_company_key_unique UNIQUE (company_id, email_key),
  CONSTRAINT company_email_wording_email_key_check CHECK (email_key IN (
    'estimate', 'estimate_revised', 'invoice_contract', 'invoice_project', 'reminder_friendly',
    'reminder_past_due', 'reminder_final', 'chemical_upcoming', 'chemical_completed',
    'work_completed', 'documents', 'general_message', 'contract_renewal', 'contract_welcome'
  ))
);
