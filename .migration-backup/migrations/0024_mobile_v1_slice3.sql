-- Mobile v1 Slice 3: ticket photos + free-text ticket notes.
--
--   * ticket_photos — uploaded by mobile (or web admin) crew supervisors. Each
--     row references a single object stored under
--     `ticket-photos/{company_id}/{ticket_id}/{uuid}.{ext}` in the default
--     object-storage bucket. `client_id` is the idempotency key supplied by
--     the mobile upload queue so a retried upload doesn't create a duplicate
--     row.
--   * ticket_notes — free-text notes attached to a ticket from the mobile app.
--     Same `client_id` idempotency contract.

CREATE TABLE IF NOT EXISTS ticket_photos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id varchar NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  byte_size integer,
  width integer,
  height integer,
  captured_at timestamp NOT NULL DEFAULT now(),
  client_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_photos_ticket_idx
  ON ticket_photos(ticket_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_photos_client_id_uidx
  ON ticket_photos(ticket_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ticket_notes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id varchar NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  client_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_notes_ticket_idx
  ON ticket_notes(ticket_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_notes_client_id_uidx
  ON ticket_notes(ticket_id, client_id) WHERE client_id IS NOT NULL;
