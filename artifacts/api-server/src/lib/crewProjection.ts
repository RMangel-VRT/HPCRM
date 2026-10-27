import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { crews, maintenanceCrews, campaignCrews } from "@workspace/db";

// Frozen compatibility fields are read ONLY for unlinked legacy columns/teams.
export const plannerProjection = {
  ...getTableColumns(maintenanceCrews),
  name: sql<string>`CASE WHEN ${crews.id} IS NOT NULL THEN ${crews.name} ELSE ${maintenanceCrews.name} END`,
  color: sql<string>`CASE WHEN ${crews.id} IS NOT NULL THEN COALESCE(${crews.color}, '#2563eb') ELSE ${maintenanceCrews.color} END`,
  defaultHoursPerDay: sql<number>`CASE WHEN ${crews.id} IS NOT NULL THEN COALESCE(${crews.defaultHoursPerDay}, 8) ELSE ${maintenanceCrews.defaultHoursPerDay} END`,
  isActive: sql<boolean>`CASE WHEN ${crews.id} IS NOT NULL THEN ${crews.isActive} ELSE ${maintenanceCrews.isActive} END`,
  displayOrder: crews.displayOrder,
  supervisorUserId: crews.supervisorUserId,
  linked: sql<boolean>`${crews.id} IS NOT NULL`,
  placementCount: sql<number>`(SELECT count(*)::int FROM schedule_blocks b WHERE b.crew_id = ${maintenanceCrews.id})`,
};
export const plannerJoin = and(eq(crews.id, maintenanceCrews.crewId), eq(crews.companyId, maintenanceCrews.companyId));
export const campaignProjection = {
  ...getTableColumns(campaignCrews),
  name: sql<string>`CASE WHEN ${crews.id} IS NOT NULL THEN ${crews.name} ELSE ${campaignCrews.name} END`,
  color: sql<string>`CASE WHEN ${crews.id} IS NOT NULL THEN COALESCE(${crews.color}, '#2563eb') ELSE ${campaignCrews.color} END`,
  linked: sql<boolean>`${crews.id} IS NOT NULL`,
};
export const campaignJoin = and(eq(crews.id, campaignCrews.crewId), eq(crews.companyId, campaignCrews.companyId));
