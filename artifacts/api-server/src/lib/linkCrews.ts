import { and, eq, isNull, sql } from "drizzle-orm";
import { crews, campaignCrews, companies } from "@workspace/db";
import { db } from "../db";
import { proposeCrewLinks } from "./crewMatching";
import { lockCrewCompany, recordCrewLinkChoice } from "./crewLinks";
import { logger } from "./logger";

export async function linkCrewsByName(companyId?: string) {
  const guard = await db.execute(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema='public' AND
      ((table_name='crews' AND column_name IN ('color','default_hours_per_day','display_order'))
       OR (table_name='campaign_crews' AND column_name='crew_id')
       OR (table_name='companies' AND column_name='crew_links_initialized_at'))`);
  const indexes = await db.execute(sql`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='campaign_crews_crew_id_idx'`);
  if (guard.rows[0]?.n !== 5 || indexes.rows[0]?.n !== 1) {
    logger.info("[linkCrews] skipped: crew-link schema not installed");
    return;
  }
  const companyRows = await db.select({ id: companies.id }).from(companies).where(companyId ? eq(companies.id, companyId) : undefined);
  for (const company of companyRows) {
    await db.transaction(async tx => {
      await lockCrewCompany(tx, company.id);
      const [state] = await tx.select({ initializedAt: companies.crewLinksInitializedAt }).from(companies).where(eq(companies.id, company.id));
      // Persist deliberate None choices. Initialization never re-runs on restart.
      if (!state || state.initializedAt !== null) return;
      const [standing, teams] = await Promise.all([
        tx.select().from(crews).where(eq(crews.companyId, company.id)),
        tx.select().from(campaignCrews).where(eq(campaignCrews.companyId, company.id)),
      ]);
      const proposal = proposeCrewLinks(standing, teams);
      for (const link of proposal.campaignLinks) {
        await tx.update(campaignCrews).set({ crewId: link.crewId }).where(and(eq(campaignCrews.id, link.id), eq(campaignCrews.companyId, company.id), isNull(campaignCrews.crewId)));
      }
      await recordCrewLinkChoice(tx, company.id);
    });
  }
}
