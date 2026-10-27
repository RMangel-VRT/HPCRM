import { and, eq, isNull, sql } from "drizzle-orm";
import { companies, crews, maintenanceCrews, campaignCrews } from "@workspace/db";
import { db } from "../db";

export type CrewTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class CrewLinkError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) { super(message); }
}
export class CrewPlacementError extends Error {
  constructor(public count: number) { super(`Move its ${count} placements first.`); }
}
export async function validateCampaignOwner(tx: CrewTransaction, companyId: string, campaignId: string, teamId: string, crewId: string | null) {
  await validateStandingCrew(tx, companyId, crewId);
  if (!crewId) return;
  const [owner] = await tx.select({ id: campaignCrews.id }).from(campaignCrews)
    .where(and(eq(campaignCrews.companyId, companyId), eq(campaignCrews.campaignId, campaignId), eq(campaignCrews.crewId, crewId)));
  if (owner && owner.id !== teamId) throw new CrewLinkError(409, "This campaign already has a team for this standing crew");
}

/** Serialize all link mutations and the backfill within a company. Held to COMMIT. */
export async function lockCrewCompany(tx: CrewTransaction, companyId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('crew-links'), hashtext(${companyId}))`);
}
/** Server-managed marker; preserve its timestamp on every subsequent choice. */
export async function recordCrewLinkChoice(tx: CrewTransaction, companyId: string) {
  await tx.update(companies).set({ crewLinksInitializedAt: new Date() })
    .where(and(eq(companies.id, companyId), isNull(companies.crewLinksInitializedAt)));
}
export async function validateStandingCrew(tx: CrewTransaction, companyId: string, crewId: string | null) {
  if (crewId === null) return;
  const [crew] = await tx.select({ id: crews.id }).from(crews).where(and(eq(crews.id, crewId), eq(crews.companyId, companyId)));
  if (!crew) throw new CrewLinkError(400, "Standing crew must belong to this company");
}
export async function replacePlannerLink(tx: CrewTransaction, companyId: string, crewId: string, plannerCrewId: string | null) {
  if (plannerCrewId !== null) {
    const [planner] = await tx.select().from(maintenanceCrews).where(and(eq(maintenanceCrews.id, plannerCrewId), eq(maintenanceCrews.companyId, companyId)));
    if (!planner) throw new CrewLinkError(400, "Planner crew must belong to this company");
    if (planner.crewId && planner.crewId !== crewId) throw new CrewLinkError(409, "Planner crew is already linked to another standing crew");
  }
  await recordCrewLinkChoice(tx, companyId);
  await tx.update(maintenanceCrews).set({ crewId: null }).where(and(eq(maintenanceCrews.companyId, companyId), eq(maintenanceCrews.crewId, crewId)));
  if (plannerCrewId !== null) await tx.update(maintenanceCrews).set({ crewId }).where(and(eq(maintenanceCrews.id, plannerCrewId), eq(maintenanceCrews.companyId, companyId)));
}
export async function validatePlannerOwner(tx: CrewTransaction, companyId: string, plannerId: string, crewId: string | null) {
  await validateStandingCrew(tx, companyId, crewId);
  if (crewId === null) return;
  const [owner] = await tx.select({ id: maintenanceCrews.id }).from(maintenanceCrews).where(and(eq(maintenanceCrews.companyId, companyId), eq(maintenanceCrews.crewId, crewId)));
  if (owner && owner.id !== plannerId) throw new CrewLinkError(409, "Standing crew is already linked to another planner crew");
}
