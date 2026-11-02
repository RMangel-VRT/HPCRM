import { eq, sql } from "drizzle-orm";
import { companies } from "@workspace/db";
import { db } from "../db";
import { COMPANY_TIME_ZONE, companyToday } from "./companyDay";
import { fillRouteVisitsInTransaction } from "./routeFill";
import { lockVisitCompany } from "./visitSync";
import { routeSchemaReady } from "./routeSchema";
import { logger } from "./logger";

const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: COMPANY_TIME_ZONE, hour: "2-digit", hourCycle: "h23" });
export function routeNightDue(now: Date) {
  // Spring-forward has no 02:00: run on first tick at/after 03:00 instead.
  return Number(hourFormatter.format(now)) >= 2;
}
export async function runRouteNight(now = new Date(), companyId?: string) {
  if (!routeNightDue(now) || !await routeSchemaReady()) return { ran: 0 };
  const today = companyToday(now);
  return db.transaction(async tx => {
    // Transaction advisory lock stays held throughout every company's actual fill.
    const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('routes-nightly'), 1) AS acquired`);
    if (!lock.rows[0]?.acquired) return { ran: 0 };
    const rows = await tx.select({ id: companies.id, last: companies.routesLastFilledOn }).from(companies)
      .where(companyId ? eq(companies.id, companyId) : undefined);
    let ran = 0;
    for (const company of rows.sort((a, b) => a.id.localeCompare(b.id))) {
      if (company.last && company.last >= today) continue;
      await lockVisitCompany(tx, company.id);
      await fillRouteVisitsInTransaction(tx, company.id, { today });
      await tx.update(companies).set({ routesLastFilledOn: today }).where(eq(companies.id, company.id));
      ran++;
    }
    return { ran };
  });
}
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
export function startRouteScheduler() {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runRouteNight(); } catch (err) { logger.error({ err }, "Nightly route fill failed"); }
    finally { running = false; }
  };
  timer = setInterval(() => { void tick(); }, 60_000);
  timer.unref();
  void tick();
}
export function stopRouteScheduler() { if (timer) clearInterval(timer); timer = undefined; }
