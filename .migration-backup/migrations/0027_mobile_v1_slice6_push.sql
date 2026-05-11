-- Mobile v1 Slice 6: per-user push subscriptions + notification preferences.
--
-- `push_subscriptions_json` stores Expo push tokens registered by the mobile
-- app for the user (one entry per device). `notification_prefs_json` stores
-- the user's per-event opt-in toggles surfaced on the Me → Notifications
-- screen. Both default to safe values so existing rows remain valid.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "push_subscriptions_json" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "notification_prefs_json" jsonb NOT NULL DEFAULT
    '{"newTicketAssignment":true,"ticketReassignment":true,"flagResponse":true}'::jsonb;
