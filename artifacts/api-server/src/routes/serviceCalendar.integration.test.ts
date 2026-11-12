import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, users, customers, agreements, agreementTerms, termScopeLines, serviceCalendar, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { registerServiceCalendarRoutes } from "./serviceCalendar";
import { listServiceCalendar, loadStartingServiceCalendar, replaceServiceCalendar } from "../services/serviceCalendar";
import { STARTING_SERVICE_CALENDAR } from "../../../../lib/db/src/serviceCalendarContracts";
import { serviceCalendarCheckSql } from "../../../../lib/db/src/serviceCalendarSql";
import { loadServiceFulfillmentInputs } from "../lib/customerServiceFulfillmentLoader";
import { customerServiceFulfillment } from "../lib/customerServiceFulfillment";
import { reconcileCampaigns } from "../lib/campaignReconcile";

let a: string, b: string, uid: string;
const row = { kind: "round", position: 1, name: "Spring", opensMd: "03-01", dueMd: "05-31", inStandard: true };
function app(role = "admin", companyId: string | null = a, authenticated = true, superAdmin = false, accessRole = role) {
  const instance = express(); instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated,
      user: { id: uid, accessRole, activeRole: role, activeCompanyId: companyId, isSuperAdminBool: superAdmin } }); next();
  });
  registerServiceCalendarRoutes(instance); return instance;
}
const api = () => request(app());
const editable = (entries: Awaited<ReturnType<typeof listServiceCalendar>>["entries"]) =>
  entries.map(({ serviceKey: _, updatedAt: __, ...e }) => e);
describe("SC1 calendar on disposable development companies", () => {
  beforeEach(async () => {
    a = `sc1-${randomUUID()}`; b = `sc1-${randomUUID()}`; uid = randomUUID();
    await db.insert(companies).values([{ id: a, slug: a, name: "SC1 disposable A" }, { id: b, slug: b, name: "SC1 disposable B" }]);
    await db.insert(users).values({ id: uid, name: "SC1 fixture", passwordHash: "unused-fixture" });
  });
  afterEach(async () => {
    await db.delete(companies).where(inArray(companies.id, [a, b]));
    await db.delete(users).where(eq(users.id, uid));
  });
  afterAll(async () => { await Promise.all([pool.end(), schemaPool.end()]); });

  it("keeps authentication, company-header, effective-role and server-owned field guards", async () => {
    expect((await request(app("admin", a, false)).get("/api/service-calendar")).status).toBe(401);
    expect((await request(app("admin", null)).get("/api/service-calendar")).status).toBe(403);
    expect((await api().get("/api/service-calendar").set("X-Company-Id", b)).status).toBe(409);
    for (const role of ["office", "account_manager", "field", "field_manager", "crew_supervisor"]) {
      expect((await request(app(role)).put("/api/service-calendar/aeration").send({ entries: [row] })).status).toBe(403);
      expect((await request(app(role)).post("/api/service-calendar/load-starting").send({})).status).toBe(403);
    }
    expect((await request(app("office")).get("/api/service-calendar")).status).toBe(200);
    expect((await request(app("field")).get("/api/service-calendar")).status).toBe(403);
    expect((await request(app("field", a, true, true)).put("/api/service-calendar/aeration").send({ entries: [row] })).status).toBe(200);
    expect((await request(app("account_manager", a, true, false, "admin")).get("/api/service-calendar")).status).toBe(200);
    for (const payload of [{ entries: [row], companyId: b }, { entries: [{ ...row, updatedById: "foreign" }] }, { entries: [{ ...row, serviceKey: "mowing" }] }])
      expect((await api().put("/api/service-calendar/aeration").send(payload)).status).toBe(400);
    const r = await api().get("/api/service-calendar");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect((await request(app("admin", b)).get("/api/service-calendar")).body.entries).toEqual([]);
    const stored = await db.select().from(serviceCalendar).where(eq(serviceCalendar.companyId, a));
    expect(stored[0].updatedById).toBe(uid);
    expect(r.body.entries[0]).not.toHaveProperty("updatedById");
  });
  it("loads exactly the typed starting rows once, atomically and company-isolated", async () => {
    const responses = await Promise.all([api().post("/api/service-calendar/load-starting").send({}), api().post("/api/service-calendar/load-starting").send({})]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const loaded = (await listServiceCalendar(a)).entries;
    expect(loaded).toHaveLength(23);
    expect(loaded.map(({ id: _, updatedAt: __, pattern, includes, ...e }) =>
      ({ ...e, ...(pattern === null ? {} : { pattern }), ...(includes === null ? {} : { includes }) }))
      .sort((a, b) => `${a.serviceKey}${a.kind}${a.position}`.localeCompare(`${b.serviceKey}${b.kind}${b.position}`)))
      .toEqual([...STARTING_SERVICE_CALENDAR].sort((a, b) => `${a.serviceKey}${a.kind}${a.position}`.localeCompare(`${b.serviceKey}${b.kind}${b.position}`)));
    expect((await listServiceCalendar(b)).entries).toEqual([]);
    expect((await api().post("/api/service-calendar/load-starting").send({ companyId: b })).status).toBe(400);
  });
  it("preserves mixed native identities, independently repeated positions, edits and in-place swaps", async () => {
    await loadStartingServiceCalendar(a, uid);
    const old = editable((await listServiceCalendar(a)).entries.filter(e => e.serviceKey === "native_areas"));
    expect(old.map(e => [e.kind, e.position])).toEqual([["recurring", 1], ["round", 1], ["round", 2]]);
    const changed = old.map(e => ({ ...e, position: e.kind === "round" ? 3 - e.position : 1, name: e.kind === "recurring" ? "Edited beauty bands" : e.name }));
    const result = await api().put("/api/service-calendar/native_areas").send({ entries: changed });
    expect(result.status).toBe(200);
    const native = result.body.entries.filter((e: any) => e.serviceKey === "native_areas");
    expect(native.map((e: any) => e.id).sort()).toEqual(old.map(e => e.id).sort());
    for (const e of native) expect(e.position).toBe(changed.find(c => c.id === e.id)!.position);
    expect(native.find((e: any) => e.kind === "recurring").name).toBe("Edited beauty bands");
    const invalid = changed.map(e => e.kind === "recurring" ? { ...e, kind: "checklist" } : e);
    expect((await api().put("/api/service-calendar/native_areas").send({ entries: invalid })).status).toBe(400);
    expect((await listServiceCalendar(a)).entries.filter(e => e.serviceKey === "native_areas")).toEqual(native);
  });
  it("rejects foreign, wrong-service, stale and changed-kind IDs without partial writes", async () => {
    await loadStartingServiceCalendar(a, uid); await loadStartingServiceCalendar(b, uid);
    const before = await listServiceCalendar(a);
    const foreign = (await listServiceCalendar(b)).entries.find(e => e.serviceKey === "aeration")!;
    const own = before.entries.find(e => e.serviceKey === "aeration")!;
    const other = before.entries.find(e => e.serviceKey === "cleanups")!;
    for (const id of [foreign.id, other.id, "stale-id"]) {
      const r = await api().put("/api/service-calendar/aeration").send({ entries: [{ ...row, id, name: "Unauthorized" }] });
      expect(r.status).toBe(409);
      expect((await listServiceCalendar(a)).entries).toEqual(before.entries);
    }
    const recurring = before.entries.find(e => e.serviceKey === "native_areas" && e.kind === "recurring")!;
    expect((await api().put("/api/service-calendar/native_areas").send({ entries: [{ ...row, id: recurring.id }] })).status).toBe(409);
    const replacement = await api().put("/api/service-calendar/aeration").send({ entries: [{ ...row, id: own.id, name: "Edited" }, { ...row, position: 2, name: "New" }] });
    expect(replacement.status).toBe(200);
    const next = replacement.body.entries.filter((e: any) => e.serviceKey === "aeration");
    expect(next[0].id).toBe(own.id); expect(next[1].id).not.toBe(own.id);
    await replaceServiceCalendar(a, uid, "aeration", { entries: [{ ...editable(next)[1], position: 1 }] });
    expect((await listServiceCalendar(a)).entries.filter(e => e.serviceKey === "aeration").map(e => e.id)).toEqual([next[1].id]);
  });
  it("requires explicit standard removal even when deleting all rounds, then returns the warning usage", async () => {
    await loadStartingServiceCalendar(a, uid);
    expect((await api().put("/api/service-calendar/aeration").send({ entries: [] })).status).toBe(409);
    expect((await api().put("/api/service-calendar/aeration").send({ entries: [], allowEmptyStandard: true })).status).toBe(200);
    expect((await listServiceCalendar(a)).entries.some(e => e.serviceKey === "aeration")).toBe(false);
  });
  it("serializes concurrent same-service replacements without duplicates or lost identities", async () => {
    const base = await replaceServiceCalendar(a, uid, "aeration", { entries: [row] });
    const [saved] = editable(base.entries);
    await Promise.all(["First", "Second"].map(name => replaceServiceCalendar(a, uid, "aeration", { entries: [{ ...saved, name }] })));
    const result = await listServiceCalendar(a);
    expect(result.entries).toHaveLength(1); expect(result.entries[0].id).toBe(saved.id);
    expect(["First", "Second"]).toContain(result.entries[0].name);
  });
  it("serializes starting load against replacement and rolls back deletes on a later write failure", async () => {
    const outcomes = await Promise.allSettled([
      loadStartingServiceCalendar(a, uid),
      replaceServiceCalendar(a, uid, "aeration", { entries: [{ ...row, name: "Concurrent aeration" }] }),
    ]);
    expect(outcomes[1].status).toBe("fulfilled");
    const after = await listServiceCalendar(a);
    expect([1,23]).toContain(after.entries.length);
    expect(after.entries.filter(e => e.serviceKey === "aeration").map(e => e.name)).toEqual(["Concurrent aeration"]);
    const saved = await replaceServiceCalendar(a, uid, "aeration", { entries: [row, { ...row, position: 2, name: "Second" }] });
    const before = saved.entries.filter(e => e.serviceKey === "aeration");
    // The omitted second row is deleted before the surviving row's updater FK fails.
    await expect(replaceServiceCalendar(a, "missing-updater", "aeration", { entries: [editable(before)[0]] })).rejects.toBeDefined();
    expect((await listServiceCalendar(a)).entries.filter(e => e.serviceKey === "aeration")).toEqual(before);
  });
  it("counts only eligible, included, same-company, not-ended seasons with distinct contract links", async () => {
    const p = randomUUID(), agreement = randomUUID();
    await db.insert(customers).values({ id: p, companyId: a, name: "SC1 fixture property", street: "Test", city: "Test", state: "CO", zip: "00000" });
    await db.insert(agreements).values({ id: agreement, companyId: a, customerId: p });
    for (const [index, status] of ["signed","active","up_for_renewal","renewed","sent","draft","lost","cancelled","signed","signed"].entries()) {
      const termId = randomUUID();
      await db.insert(agreementTerms).values({ id: termId, companyId: a, agreementId: agreement, line: "landscape", form: "ours",
        seasonLabel: `Fixture ${index}`, startDate: "2026-01-01", endDate: index === 8 ? "2026-01-02" : "2099-12-31", status: status as any, billingType: "seasonal" });
      await db.insert(termScopeLines).values({ companyId: a, termId, serviceKey: "cleanups", line: "landscape", included: index !== 9, quantity: 2 });
    }
    await loadStartingServiceCalendar(a, uid);
    const usage = (await listServiceCalendar(a)).usage.find(e => e.serviceKey === "cleanups")!;
    expect(usage).toMatchObject({ seasons: 5, byCount: [{ rounds: 2, seasons: 5 }] });
    expect(usage.needsRounds).toHaveLength(0);
    await db.update(termScopeLines).set({quantity: 4}).where(eq(termScopeLines.companyId, a));
    const over = (await listServiceCalendar(a)).usage.find(e => e.serviceKey === "cleanups")!;
    expect(over.needsRounds).toHaveLength(5);
    expect(over.needsRounds.every(link => link.agreementId === agreement && link.customerId === p)).toBe(true);
    expect((await listServiceCalendar(b)).usage.every(u => u.seasons === 0)).toBe(true);
  });
  it("uses calendar timing consistently in preview, reconcile and fulfillment", async () => {
    const property = randomUUID(), agreement = randomUUID(), term = randomUUID();
    await db.insert(customers).values({ id: property, companyId: a, name: "Transition fixture", street: "Test", city: "Test", state: "CO", zip: "00000" });
    await db.insert(agreements).values({ id: agreement, companyId: a, customerId: property });
    await db.insert(agreementTerms).values({ id: term, companyId: a, agreementId: agreement, line: "landscape", form: "ours",
      seasonLabel: "Transition", startDate: "2027-01-01", endDate: "2027-12-31", status: "signed", billingType: "seasonal" });
    await db.insert(termScopeLines).values([
      { companyId: a, termId: term, serviceKey: "cleanups", line: "landscape", included: true, quantity: 2 },
      { companyId: a, termId: term, serviceKey: "aeration", line: "landscape", included: true, quantity: null },
    ]);
    await loadStartingServiceCalendar(a, uid);
    const loaded = await loadServiceFulfillmentInputs(db, a);
    expect(loaded.calendar.length).toBeGreaterThan(0);
    const fulfillment = customerServiceFulfillment(loaded, property, term, "2026-11-11")!;
    expect(fulfillment.rows.find(r => r.serviceKey === "cleanups")!).toMatchObject({owed: 2, issues: ["missing_item"]});
    expect(fulfillment.rows.find(r => r.serviceKey === "aeration")!.owed).toBe(1);
    for (const dryRun of [true, false]) {
      const report = await db.transaction(tx => reconcileCampaigns(tx, a, 2027, { dryRun, today: "2026-11-11" }));
      expect(report.rounds).toHaveLength(3);
      expect(report.gaps).toEqual([]);
    }
    // Stored contract months never place rounds or get rewritten.
    const stated = [0,0,1,0,0,0,0,0,0,0,1,0];
    await db.update(termScopeLines).set({ monthSpread: stated }).where(and(eq(termScopeLines.companyId, a), eq(termScopeLines.termId, term), eq(termScopeLines.serviceKey, "cleanups")));
    const report = await db.transaction(tx => reconcileCampaigns(tx, a, 2027, { dryRun: true, today: "2026-11-11" }));
    expect(report.rounds.filter(r => r.serviceKey === "cleanups").map(r => r.windowEnd)).toEqual(["2027-04-15", "2027-11-30"]);
    expect((await loadServiceFulfillmentInputs(db, a)).scope!.find(s => s.serviceKey === "cleanups")!.monthSpread).toEqual(stated);
  });
  it("enforces every SQL check and mirrors the shared SQL expression", async () => {
    const bad = [
      { opensMd: "02-29" }, { opensMd: "04-31" }, { opensMd: "13-01" }, { dueMd: "03-01" },
      { position: 0 }, { position: 25 }, { name: "" }, { name: "x".repeat(81) }, { name: " untrimmed" },
      { kind: "unknown" }, { serviceKey: "mowing" }, { kind: "checklist", serviceKey: "backflow", inStandard: false, position: 2 },
      { kind: "checklist", serviceKey: "backflow", inStandard: true },
      { kind: "recurring", serviceKey: "mowing" }, { pattern: "bad" }, { includes: "bad" },
    ];
    for (const change of bad) await expect(db.insert(serviceCalendar).values({ ...row, companyId: a, serviceKey: "aeration", ...change })).rejects.toBeDefined();
    await db.insert(serviceCalendar).values({ ...row, companyId: a, serviceKey: "aeration", opensMd: "12-01", dueMd: "01-30" });
    await expect(db.insert(serviceCalendar).values({ ...row, companyId: a, serviceKey: "aeration" })).rejects.toBeDefined();
    const check = { ...row, companyId: a, serviceKey: "backflow", kind: "checklist", inStandard: false };
    await db.insert(serviceCalendar).values(check);
    await expect(db.insert(serviceCalendar).values(check)).rejects.toBeDefined();
    // Evaluate Drizzle's shared expression with the same real-column context.
    await db.execute(sql.raw(`ALTER TABLE service_calendar ADD CONSTRAINT sc1_test_mirror CHECK (${serviceCalendarCheckSql})`));
    await db.execute(sql`ALTER TABLE service_calendar DROP CONSTRAINT sc1_test_mirror`);
    await expect(db.insert(serviceCalendar).values({ ...row, companyId: "missing", serviceKey: "aeration" })).rejects.toBeDefined();
    await expect(db.insert(serviceCalendar).values({ ...row, companyId: a, serviceKey: "cleanups", updatedById: "missing" })).rejects.toBeDefined();
  });
  it("refuses populated old timing atomically, without deleting or converting it", async () => {
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0080_service_calendar.sql", import.meta.url), "utf8");
    const guard = migration.slice(migration.indexOf("DO $$"), migration.indexOf("END $$;") + "END $$;".length);
    // Exact migration guard against a transaction-local old-table fixture, never real app data.
    await db.transaction(async tx => {
      await tx.execute(sql`CREATE TEMP TABLE service_programs (id integer) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO service_programs VALUES (1)`);
      let message = "";
      try {
        await tx.transaction(async nested => {
          await nested.execute(sql.raw(guard.replace("'public.service_programs'", "'pg_temp.service_programs'")));
        });
      } catch (err) {
        message = String((err as { cause?: { message?: string } }).cause?.message ?? (err as Error).message);
      }
      expect(message).toContain("SC1 refuses to retire populated service_programs");
      expect((await tx.execute(sql`SELECT count(*)::integer AS n FROM service_programs`)).rows[0].n).toBe(1);
    });
    expect((await db.execute(sql`SELECT to_regclass('public.service_programs') AS retired`)).rows[0].retired).toBeNull();
    expect((await listServiceCalendar(a)).entries).toEqual([]);
  });
});
