// Disposable development/test fixture only. Never imported by production startup.
import { randomUUID, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  companies, users, companyUsers, customers, crews, agreements, agreementTerms, termScopeLines,
  weeklyScheduleTemplates, maintenanceCrews, maintenanceVisitConfigs, scheduleBlocks, hashPassword,
} from "@workspace/db";
import { db } from "../db";

export async function createRouteFixture() {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixture only");
  const companyId = randomUUID(), userId = randomUUID(), email = `route-${userId}@example.invalid`;
  const password = randomBytes(20).toString("hex");
  await db.insert(companies).values({ id: companyId, name: "Disposable Routes", slug: `routes-${companyId}` });
  try {
    await db.insert(users).values({ id: userId, name: "Routes Verification", email, passwordHash: await hashPassword(password), defaultCompanyId: companyId });
    await db.insert(companyUsers).values({ companyId, userId, role: "admin" });
    const standing = [];
    for (let i = 0; i < 3; i++) {
      let supervisor: string = userId;
      if (i) {
        const [user] = await db.insert(users).values({ name: "Fixture Supervisor", passwordHash: "test-only-not-a-login" }).returning();
        supervisor = user.id;
      }
      const [crew] = await db.insert(crews).values({ companyId, name: `Route Crew ${i + 1}`, supervisorUserId: supervisor, isActive: i < 2, displayOrder: i }).returning();
      standing.push(crew);
    }
    const properties = await db.insert(customers).values(Array.from({ length: 9 }, (_, i) => ({
      companyId, name: `Route Property ${i + 1}`, street: "Fixture", city: "Denver", state: "CO", zip: "80000",
    }))).returning();
    const [agreement] = await db.insert(agreements).values({ companyId, customerId: properties[0].id }).returning();
    const [term] = await db.insert(agreementTerms).values({ companyId, agreementId: agreement.id,
      seasonLabel: "2026–27", startDate: "2026-01-01", endDate: "2027-12-31", status: "signed", line: "landscape", form: "theirs", billingType: "equal_monthly" }).returning();
    await db.insert(termScopeLines).values({ companyId, termId: term.id, serviceKey: "mowing", line: "landscape",
      included: true, quantity: 26, monthSpread: Array(12).fill(1) });
    await db.update(customers).set({ isParent: "true" }).where(eq(customers.id, properties[0].id));
    for (const property of properties.slice(1)) await db.update(customers).set({ parentCustomerId: properties[0].id }).where(eq(customers.id, property.id));
    const [template] = await db.insert(weeklyScheduleTemplates).values({ companyId, name: "Disposable Route Template" }).returning();
    const columns = await db.insert(maintenanceCrews).values(standing.map(c => ({ companyId, crewId: c.id, name: c.name }))).returning();
    const configs = await db.insert(maintenanceVisitConfigs).values(properties.slice(1, 7).map(p => ({
      companyId, customerId: p.id, estimatedDurationMinutes: 30, notes: "Planner snapshot",
    }))).returning();
    const blocks = await db.insert(scheduleBlocks).values(configs.map((config, i) => ({
      templateId: template.id, visitConfigId: config.id, crewId: columns[0].id,
      dayOfWeek: (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const)[i],
      sortOrder: i, startTime: `0${i + 1}:00`,
    }))).returning();
    return { companyId, userId, email, password, standing, properties, agreement, term, template, columns, configs, blocks };
  } catch (error) { await removeRouteFixture(companyId, userId); throw error; }
}
export async function removeRouteFixture(companyId: string, userId: string) {
  const supervisors = await db.select({ id: crews.supervisorUserId }).from(crews).where(eq(crews.companyId, companyId));
  await db.delete(companies).where(eq(companies.id, companyId));
  for (const id of new Set([userId, ...supervisors.map(s => s.id)])) await db.delete(users).where(eq(users.id, id));
}
