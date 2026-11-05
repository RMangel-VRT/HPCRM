import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { crews, campaignCrews } from "@workspace/db";

// Frozen compatibility fields are read only for unlinked campaign teams.
export const campaignProjection = {
  ...getTableColumns(campaignCrews),
  name: sql<string>`CASE WHEN ${crews.id} IS NOT NULL THEN ${crews.name} ELSE ${campaignCrews.name} END`,
  color: sql<string>`CASE WHEN ${crews.id} IS NOT NULL THEN COALESCE(${crews.color}, '#2563eb') ELSE ${campaignCrews.color} END`,
  linked: sql<boolean>`${crews.id} IS NOT NULL`,
};
export const campaignJoin = and(eq(crews.id, campaignCrews.crewId), eq(crews.companyId, campaignCrews.companyId));
