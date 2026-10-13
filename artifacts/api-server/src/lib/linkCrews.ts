import { and, eq, isNull, sql } from "drizzle-orm";
import { crews, maintenanceCrews, campaignCrews, companies } from "@workspace/db";
import { db } from "../db";
import { proposeCrewLinks } from "./crewMatching";
import { lockCrewCompany, recordCrewLinkChoice } from "./crewLinks";

export async function linkCrewsByName(companyId?: string) {
  // DML only: older deployments can boot before Publish adds the schema.
  const guard = await db.execute(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema='public' AND
      ((table_name='crews' AND column_name IN ('color','default_hours_per_day','display_order'))
       OR (table_name IN ('maintenance_crews','campaign_crews') AND column_name='crew_id')
       OR (table_name='companies' AND column_name='crew_links_initialized_at'))`);
  const indexes = await db.execute(sql`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname IN ('maintenance_crews_crew_id_unique','campaign_crews_crew_id_idx')`);
  if (guard.rows[0]?.n !== 6 || indexes.rows[0]?.n !== 2) {
    console.log("[linkCrews] skipped: crew-link schema not installed");
    return;
  }
  const companyRows = await db.select({ id: companies.id }).from(companies).where(companyId ? eq(companies.id, companyId) : undefined);
  for (const company of companyRows) {
    await db.transaction(async tx => {
      await lockCrewCompany(tx, company.id);
      const [state] = await tx.select({ initializedAt: companies.crewLinksInitializedAt }).from(companies).where(eq(companies.id, company.id));
      if (!state || state.initializedAt !== null) {
        console.log(`[linkCrews] company=${company.id} planner linked=0 ambiguous=0 unmatched=0 campaign linked=0 unmatched=0`);
        return;
      }
      const [standing, planner, teams] = await Promise.all([
        tx.select().from(crews).where(eq(crews.companyId, company.id)),
        tx.select().from(maintenanceCrews).where(eq(maintenanceCrews.companyId, company.id)),
        tx.select().from(campaignCrews).where(eq(campaignCrews.companyId, company.id)),
      ]);
      const proposal = proposeCrewLinks(standing, planner, teams);
      const plannerById = new Map(planner.map(p => [p.id, p]));
      for (const link of proposal.plannerLinks) {
        const source = plannerById.get(link.id)!;
        await tx.update(maintenanceCrews).set({ crewId: link.crewId }).where(and(eq(maintenanceCrews.id, link.id), eq(maintenanceCrews.companyId, company.id), isNull(maintenanceCrews.crewId)));
        await tx.update(crews).set({
          color: sql`COALESCE(${crews.color}, ${source.color})`,
          defaultHoursPerDay: sql`COALESCE(${crews.defaultHoursPerDay}, ${source.defaultHoursPerDay})`,
        }).where(and(eq(crews.id, link.crewId), eq(crews.companyId, company.id)));
      }
      for (const link of proposal.campaignLinks) {
        await tx.update(campaignCrews).set({ crewId: link.crewId }).where(and(eq(campaignCrews.id, link.id), eq(campaignCrews.companyId, company.id), isNull(campaignCrews.crewId)));
      }
      await recordCrewLinkChoice(tx, company.id);
      const c = proposal.counters.get(company.id) ?? { plannerLinked: 0, ambiguous: 0, unmatched: 0, campaignLinked: 0, campaignUnmatched: 0 };
      console.log(`[linkCrews] company=${company.id} planner linked=${c.plannerLinked} ambiguous=${c.ambiguous} unmatched=${c.unmatched} campaign linked=${c.campaignLinked} unmatched=${c.campaignUnmatched}`);
    });
  }
}
