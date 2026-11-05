import { sql } from "drizzle-orm";
import { db } from "../db";

/** SELECT-only readiness guard: never install schema from a running server. */
export async function routeSchemaReady(reader: Pick<typeof db, "execute"> = db) {
  const result = await reader.execute(sql`SELECT
    to_regclass('public.route_stops') IS NOT NULL
    AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='route_stops'
      AND column_name IN ('id','company_id','customer_id','service_key','crew_id','weekday','every_weeks','anchor_date',
      'sort_order','minutes','season_start','season_end','paused_until','is_active','notes',
      'created_by_id','created_at','updated_at')) = 18
    AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND
      ((table_name='visits' AND column_name IN ('route_stop_id','route_occurrence_date')) OR
       (table_name='companies' AND column_name = 'routes_last_filled_on'))) = 3
    AND (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN
      ('visits_route_occurrence_unique','route_stops_unique_active')) = 2
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.route_stops') AND conname='route_stops_active_customer_check')
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.customers') AND tgname='routes_customer_retirement')
    AS ready`);
  return result.rows[0]?.ready === true;
}
