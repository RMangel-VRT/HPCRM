-- Mobile v1 Slice 5: Properties directory + recent-views tracking.
--   recent_property_views records the last time a mobile user opened a
--   property profile, so the Properties tab can show a "Recent" section
--   ahead of the search results.
CREATE TABLE IF NOT EXISTS recent_property_views (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  viewed_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recent_property_views_user_customer_unique
  ON recent_property_views(user_id, customer_id);
CREATE INDEX IF NOT EXISTS recent_property_views_user_viewed_at_idx
  ON recent_property_views(user_id, viewed_at);
