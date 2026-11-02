-- Document-specific contact/boilerplate owner. No commercial values or duplicated company name.
CREATE TABLE IF NOT EXISTS company_document_settings (
  company_id varchar PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  address_line1 text NOT NULL DEFAULT '', address_line2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '', postal_code text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '',
  remit_to text NOT NULL DEFAULT '',
  payment_instructions text NOT NULL DEFAULT 'Please remit by check payable to {company name}. Reference the invoice number.',
  estimate_terms text NOT NULL DEFAULT '', warranty_text text NOT NULL DEFAULT '', invoice_footer_note text NOT NULL DEFAULT '',
  updated_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
INSERT INTO company_document_settings (company_id) SELECT id FROM companies ON CONFLICT DO NOTHING;
