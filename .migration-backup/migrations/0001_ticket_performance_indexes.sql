CREATE INDEX IF NOT EXISTS ticket_field_values_ticket_id_idx ON ticket_field_values (ticket_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_status_history_ticket_id_idx ON ticket_status_history (ticket_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_id_idx ON ticket_comments (ticket_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_links_source_ticket_id_idx ON ticket_links (source_ticket_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_links_target_ticket_id_idx ON ticket_links (target_ticket_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_type_statuses_ticket_type_id_idx ON ticket_type_statuses (ticket_type_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_type_fields_status_id_idx ON ticket_type_fields (status_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_notifications_recipient_company_idx ON ticket_notifications (recipient_id, company_id);
