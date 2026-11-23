import { revenuePlans, revenueTargets } from "@workspace/db";
import { REVENUE_STREAMS, type RevenueStream } from "@workspace/db/revenue-streams";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, type AppTransaction } from "../db";
import { billingMonth } from "../lib/contractRevenue";
import { planDefaults, type RevenuePlanPatch, type RevenueTargetStreams } from "../lib/revenuePlanning";

function planResult(year: number, row?: typeof revenuePlans.$inferSelect) {
  return row ? { ...row, saved: true } : { ...planDefaults(year), saved: false };
}

export async function loadRevenuePlan(companyId: string, year: number) {
  const [row] = await db.select().from(revenuePlans).where(and(
    eq(revenuePlans.companyId, companyId), eq(revenuePlans.year, year),
  ));
  return planResult(year, row);
}

export async function saveRevenuePlan(companyId: string, year: number, updatedBy: string, patch: RevenuePlanPatch) {
  const insert = db.insert(revenuePlans).values({ ...patch, companyId, year, updatedBy });
  const target = [revenuePlans.companyId, revenuePlans.year];
  // Let the DB supply defaults on first insert; conflict updates carry only
  // the requested fields, so concurrent edits to different fields compose.
  const [row] = await (Object.keys(patch).length
    ? insert.onConflictDoUpdate({ target, set: { ...patch, updatedBy, updatedAt: sql`now()` } })
    : insert.onConflictDoNothing({ target })
  ).returning();
  return row ? planResult(year, row) : loadRevenuePlan(companyId, year);
}

const byStream = <T>(value: (stream: RevenueStream) => T) =>
  Object.fromEntries(REVENUE_STREAMS.map(stream => [stream, value(stream)])) as Record<RevenueStream, T>;

export async function loadRevenueTargets(companyId: string, year: number, database: typeof db | AppTransaction = db) {
  const rows = await database.select({
    stream: revenueTargets.stream, month: revenueTargets.month, amountCents: revenueTargets.amountCents,
  }).from(revenueTargets).where(and(
    eq(revenueTargets.companyId, companyId),
    gte(revenueTargets.month, billingMonth(year, 1)),
    lt(revenueTargets.month, billingMonth(year + 1, 1)),
  ));
  const streams = byStream(() => Array<number>(12).fill(0));
  for (const { stream, month, amountCents } of rows) {
    streams[stream][Number(month.slice(5, 7)) - 1] = amountCents;
  }
  const annual = byStream(stream => streams[stream].reduce((sum, cents) => sum + cents, 0));
  return { year, streams, annual, saved: rows.length > 0 };
}

export async function saveRevenueTargets(companyId: string, year: number, updatedBy: string, streams: RevenueTargetStreams) {
  // Each supplied stream contains every month, including explicit zeroes.
  // Upserting the exact keys completely replaces those amounts without any
  // delete window or risk of touching a different company, year, or stream.
  const rows = REVENUE_STREAMS.flatMap(stream => (streams[stream] ?? []).map((amountCents, index) => ({
    companyId, stream, month: billingMonth(year, index + 1), amountCents, updatedBy,
  })));
  if (!rows.length) return loadRevenueTargets(companyId, year);

  return db.transaction(async tx => {
    await tx.insert(revenueTargets).values(rows).onConflictDoUpdate({
      target: [revenueTargets.companyId, revenueTargets.stream, revenueTargets.month],
      set: { amountCents: sql`excluded.amount_cents`, updatedBy, updatedAt: sql`now()` },
    });
    return loadRevenueTargets(companyId, year, tx);
  });
}
