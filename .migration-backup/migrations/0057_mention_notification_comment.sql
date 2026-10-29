ALTER TABLE ticket_notifications ADD COLUMN IF NOT EXISTS comment_id varchar
  REFERENCES ticket_comments(id) ON DELETE SET NULL;
