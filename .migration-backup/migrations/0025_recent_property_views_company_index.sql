CREATE INDEX IF NOT EXISTS "recent_property_views_company_user_viewed_at_idx"
  ON "recent_property_views" ("company_id", "user_id", "viewed_at");
