import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { companies, customers, users, estimates, estimateVersions, proposals, proposalVersions,
  tickets, ticketTypes, ticketTypeStatuses, hardscapeCatalogItems, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { createEstimate, createLine } from "./estimates";
import { readEstimate } from "./estimateReads";
import { transitionEstimate } from "./estimateLifecycle";
import { readTicketEstimate } from "./ticketEstimates";
import { assertProposalEstimateLink, validateProposalEstimate, loadProposalEstimateSummaries, prepareProposalEstimate } from "./proposalEstimates";
import { EstimateError } from "./estimateErrors";
import { estimateAccess } from "../lib/estimateAccess";
import { loadProposalExhibits, loadPlantLinesForVersion, buildPlantScheduleModel } from "./proposalExhibits";
import { proposalExhibitSettingsSchema, type ProposalExhibits } from "../../../../lib/db/src/plantExhibitContracts";
import { plantCatalogItems, plantEnrichment, estimateLines, estimateSections } from "@workspace/db";
import { plantPalettes, plantPaletteItems } from "@workspace/db";
import { storage as proposalStorage } from "../storage";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
const companyId = randomUUID(), otherCompany = randomUUID(), actor = randomUUID();
let customerId: string, otherCustomer: string, foreignCustomer: string, ticketId: string;
let app: express.Express;
const stored = new Map<string, Buffer>();
const render = vi.fn(async (_p: unknown, _c: string, versionId?: string, _exhibits?: ProposalExhibits) => Buffer.from(`PDF:${versionId ?? "uploaded"}`));
let failStore = false;
let recordConflicts = 0;
const legacyUploads = new Set<string>();
const storage = {
  getCustomerById: async (id: string, company: string) => (await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.companyId, company))))[0],
  getTicketById: async (id: string, company: string) => (await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.companyId, company))))[0],
  createProposal: proposalStorage.createProposal.bind(proposalStorage),
  updateProposal: proposalStorage.updateProposal.bind(proposalStorage),
  getProposalById: async (id: string, company: string) => {
    const p = (await db.select().from(proposals).where(and(eq(proposals.id, id), eq(proposals.companyId, company))))[0];
    return p ? { ...p, files: legacyUploads.has(id) ? [{ fileType: "estimate_pdf" }] : [], plantItems: [], versions: [], customerName: "Disposable",
      estimate: p.estimateId ? (await loadProposalEstimateSummaries(company, [p.estimateId])).get(p.estimateId) : null } : undefined;
  },
  getNextVersionNumber: async (id: string, company: string) => {
    const rows = await db.select().from(proposalVersions).where(and(eq(proposalVersions.proposalId, id), eq(proposalVersions.companyId, company)));
    return Math.max(0, ...rows.map(r => r.versionNumber)) + 1;
  },
  createProposalVersion: async (data: typeof proposalVersions.$inferInsert) => {
    if (recordConflicts-- > 0) throw Object.assign(new Error("conflict"), { code: "23505" });
    return (await db.insert(proposalVersions).values(data).returning())[0];
  },
  getProposalVersionById: async (id: string, company: string) =>
    (await db.select().from(proposalVersions).where(and(eq(proposalVersions.id, id), eq(proposalVersions.companyId, company))))[0],
};
const proposal = async (estimateId: string | null = null, linkedTicket: string | null = null) => storage.createProposal({
  companyId, customerId, ticketId: linkedTicket, estimateId, title: "Disposable proposal", proposalDate: "2026-11-03", proposalNumber: randomUUID(),
});
async function draft() {
  const d = await createEstimate(companyId, actor, { customerId, title: "Disposable estimate" });
  return createLine(companyId, d.id, d.version.id, { sectionId: d.version.sections[0].id, lineType: "custom",
    name: "Install", unit: "ea", quantity: "2", unitPriceCents: 1234, umbrellaKey: "landscape_labor" });
}
beforeAll(async () => {
  const migration = await readFile(new URL("../../../../.migration-backup/migrations/0064_proposal_estimates.sql", import.meta.url), "utf8");
  await db.execute(sql.raw(migration)); await db.execute(sql.raw(migration));
  const exhibitsMigration = await readFile(new URL("../../../../.migration-backup/migrations/0065_proposal_plant_exhibits.sql", import.meta.url), "utf8");
  await db.execute(sql.raw(exhibitsMigration)); await db.execute(sql.raw(exhibitsMigration));
  await db.insert(companies).values([{ id: companyId, name: "Disposable proposals", slug: companyId }, { id: otherCompany, name: "Disposable foreign", slug: otherCompany }]);
  await db.insert(users).values({ id: actor, name: "Disposable proposal actor", passwordHash: "not-a-login" });
  [customerId, otherCustomer, foreignCustomer] = (await db.insert(customers).values([
    { companyId, name: "A", street: "Test", city: "Test", state: "CO", zip: "00000" },
    { companyId, name: "B", street: "Test", city: "Test", state: "CO", zip: "00000" },
    { companyId: otherCompany, name: "Foreign", street: "Test", city: "Test", state: "CO", zip: "00000" },
  ]).returning()).map(c => c.id);
  const [type] = await db.insert(ticketTypes).values({ companyId, name: "Estimate Request", typeKey: "estimate_request", color: "#000000" }).returning();
  const [status] = await db.insert(ticketTypeStatuses).values({ ticketTypeId: type.id, name: "New", displayOrder: 0 }).returning();
  [ticketId] = (await db.insert(tickets).values({ companyId, customerId, ticketTypeId: type.id, currentStatusId: status.id, title: "Disposable ticket", createdById: actor }).returning()).map(t => t.id);
  // Exercise the actual route handlers while isolating external storage/rendering.
  const source = await readFile(new URL("../routes/routes.ts", import.meta.url), "utf8");
  const links = source.slice(source.indexOf("  const canAccessProposals ="), source.indexOf('  app.post("/api/convert-heic"'));
  const finalize = source.slice(source.indexOf('  app.post("/api/proposals/:id/finalize"'), source.indexOf("  // ---- List finalized versions"));
  const { code } = await transform(`${links}\n${finalize}`, { loader: "ts", target: "es2022" });
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => req.get("X-Test-Auth") !== "no",
      user: { id: actor, activeCompanyId: req.get("X-Test-Company") ?? companyId, activeRole: req.get("X-Test-Role") ?? "office" } });
    next();
  });
  class ObjectStorageService {
    async saveBufferToPrivatePath(path: string, bytes: Buffer) {
      if (failStore) throw new Error("simulated storage failure");
      if (stored.has(path)) throw new Error("immutable path overwritten");
      stored.set(path, bytes);
      return path;
    }
  }
  const deps = { app, db, storage, sql, and, eq, express, proposalZ: z, estimateAccess,
    loadProposalEstimateSummaries, readTicketEstimate, validateProposalEstimate, prepareProposalEstimate,
    loadProposalExhibits, proposalExhibitSettingsSchema,
    EstimateError, randomUUID, ObjectStorageService, generateProposalPdf: render,
    assertNotParentCustomer: async () => false };
  new Function(...Object.keys(deps), code)(...Object.values(deps));
});
async function plantDraft() {
  const d = await createEstimate(companyId, actor, { customerId, title: "Plant fixture" });
  const varietyKey = randomUUID();
  const items = await db.insert(plantCatalogItems).values(["5 gal", "10 gal"].map((sizeLabel, i) => ({
    companyId, productCode: `${varietyKey}-${i}`, category: "tree" as const, varietyKey, rawDescription: "Pine",
    commonName: "Fixture Pine", botanicalName: "Pinus fixture", sizeLabel,
  }))).returning();
  await db.insert(plantEnrichment).values([
    { companyId: otherCompany, varietyKey, imageStoragePath: "/foreign-image", foliageType: "Foreign value" },
    { companyId, varietyKey, imageStoragePath: "/own-image", foliageType: "Evergreen" },
  ]);
  const [second] = await db.insert(estimateSections).values({ companyId, versionId: d.version.id, name: "Second", sortOrder: 1 }).returning();
  const common = { companyId, versionId: d.version.id, lineType: "plant" as const, priceSource: "catalog" as const,
    name: "Snapshot Pine 5 gal", detail: "Snapshot size", unit: "ea", quantity: "1.10", unitPriceCents: 100, extendedCents: 110,
    umbrellaKey: "plants" as const, includeInPalette: true };
  await db.insert(estimateLines).values([
    { ...common, sectionId: second.id, plantCatalogItemId: items[0].id, sortOrder: -5 },
    { ...common, sectionId: d.version.sections[0].id, plantCatalogItemId: items[1].id, sortOrder: 1 },
    { ...common, sectionId: d.version.sections[0].id, plantCatalogItemId: items[0].id, sortOrder: 0, paletteTypeLabel: "Feature tree" },
  ]);
  return { d, items };
}
describe("estimate-derived proposal exhibits", () => {
  it("loads one ordered price-free query, isolates enrichment and preserves deleted catalog snapshots", async () => {
    const { d, items } = await plantDraft();
    const spy = vi.spyOn(pool, "query");
    const lines = await loadPlantLinesForVersion(companyId, d.version.id);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(lines.map(l => l.plantCatalogItemId)).toEqual([items[0].id, items[1].id, items[0].id]);
    expect(lines.every(l => l.imagePath === "/own-image")).toBe(true);
    expect(JSON.stringify(lines)).not.toMatch(/price|cost|Cents|foreign/i);
    expect(await loadPlantLinesForVersion(otherCompany, d.version.id)).toEqual([]);
    await db.delete(plantEnrichment).where(eq(plantEnrichment.companyId, companyId));
    expect((await loadPlantLinesForVersion(companyId, d.version.id)).every(l => l.imagePath === null)).toBe(true);
    await db.delete(plantCatalogItems).where(eq(plantCatalogItems.id, items[0].id));
    const rows = buildPlantScheduleModel(await loadPlantLinesForVersion(companyId, d.version.id));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ name: "Snapshot Pine 5 gal", size: "Snapshot size", botanicalName: null, imagePath: null });
  });
  it("exposes scoped lightweight previews, explicit unlinked/missing/denied cases, and omitted-setting preservation", async () => {
    const { d } = await plantDraft(), p = await proposal(d.id), legacy = await proposal();
    render.mockClear();
    const preview = await request(app).get(`/api/proposals/${p.id}/exhibits`).expect(200);
    expect(preview.body.provenance).toMatchObject({ estimateId: d.id, versionId: d.version.id, versionNumber: 1 });
    expect(preview.body.schedule).toHaveLength(2);
    expect(preview.body.palette.groups[0].cards[0].typeLabel).toBe("Feature tree");
    expect(render).not.toHaveBeenCalled();
    await request(app).get(`/api/proposals/${legacy.id}/exhibits`).expect(422);
    await request(app).get("/api/proposals/missing/exhibits").expect(404);
    await request(app).get(`/api/proposals/${p.id}/exhibits`).set("X-Test-Company", otherCompany).expect(404);
    await request(app).get(`/api/proposals/${p.id}/exhibits`).set("X-Company-Id", otherCompany).expect(409);
    await request(app).get(`/api/proposals/${p.id}/exhibits`).set("X-Test-Role", "field_manager").expect(403);
    await request(app).get(`/api/proposals/${p.id}/exhibits`).set("X-Test-Auth", "no").expect(401);
    await request(app).patch(`/api/proposals/${p.id}`).send({ includePlantSchedule: false, includePlantPalette: false, paletteIntroText: "" }).expect(200);
    await request(app).patch(`/api/proposals/${p.id}`).send({ title: "Only title" }).expect(200);
    expect(await storage.getProposalById(p.id, companyId)).toMatchObject({ includePlantSchedule: false, includePlantPalette: false, paletteIntroText: "" });
    expect((await request(app).get(`/api/proposals/${p.id}/exhibits`)).body.palette.introText).toBe("");
    await request(app).patch(`/api/proposals/${p.id}`).send({ includePlantPalette: "false" }).expect(400);
    await request(app).patch(`/api/proposals/${p.id}`).send({ paletteIntroText: null }).expect(200);
    expect((await request(app).get(`/api/proposals/${p.id}/exhibits`)).body.palette.introText).toContain("Colorado-hardy");
  });
  it("reuses the exact pinned schedule for the PDF and snapshot despite a concurrent revision", async () => {
    const { d } = await plantDraft(), p = await proposal(d.id);
    const expected = buildPlantScheduleModel(await loadPlantLinesForVersion(companyId, d.version.id));
    render.mockImplementationOnce(async (_proposal, _company, versionId) => {
      await transitionEstimate(companyId, actor, d.id, d.version.id, "revise", {});
      return Buffer.from(`PDF:${versionId}`);
    });
    const result = await request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod: "email" }).expect(201);
    expect(result.body).toMatchObject({ estimateVersionId: d.version.id, plantItemsSnapshot: expected });
    expect(render.mock.lastCall?.[3]).toMatchObject({ schedule: expected, provenance: { versionId: d.version.id } });
    expect((await readEstimate(companyId, d.id)).version.id).not.toBe(d.version.id);
  });
});
afterAll(async () => {
  await db.delete(tickets).where(eq(tickets.companyId, companyId));
  await db.delete(companies).where(inArray(companies.id, [companyId, otherCompany]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
});
describe("proposal relationships and scoped HTTP contracts", () => {
  it("retires attachments on every write, preserves omission, and clears null or estimate links atomically", async () => {
    const [palette] = await db.insert(plantPalettes).values({ companyId, title: "Read-only legacy" }).returning();
    const p = await proposal();
    // Historical fixtures must bypass the retired application write paths.
    await db.update(proposals).set({ plantPaletteId: palette.id }).where(eq(proposals.id, p.id));
    for (const value of [palette.id, "foreign", "", false, 0, [], {}]) {
      await request(app).patch(`/api/proposals/${p.id}`).send({ plantPaletteId: value }).expect(400);
      await request(app).post("/api/proposals").send({ customerId, plantPaletteId: value }).expect(400);
    }
    await request(app).patch(`/api/proposals/${p.id}`).send({ title: "Unrelated edit" }).expect(200);
    expect((await storage.getProposalById(p.id, companyId))?.plantPaletteId).toBe(palette.id);
    await request(app).patch(`/api/proposals/${p.id}`).set("X-Test-Company", otherCompany).send({ plantPaletteId: null }).expect(404);
    await request(app).patch(`/api/proposals/${p.id}`).set("X-Test-Role", "field").send({ plantPaletteId: null }).expect(403);
    await request(app).patch(`/api/proposals/${p.id}`).set("X-Company-Id", otherCompany).send({ plantPaletteId: null }).expect(409);
    await request(app).patch(`/api/proposals/${p.id}`).send({ plantPaletteId: null }).expect(200);
    expect((await storage.getProposalById(p.id, companyId))?.plantPaletteId).toBeNull();
    await db.update(proposals).set({ plantPaletteId: palette.id }).where(eq(proposals.id, p.id));
    const d = await draft();
    const linked = await request(app).patch(`/api/proposals/${p.id}`).send({ estimateId: d.id }).expect(200);
    expect(linked.body).toMatchObject({ estimateId: d.id, plantPaletteId: null });
    await expect(proposalStorage.updateProposal(p.id, companyId, { plantPaletteId: palette.id })).rejects.toThrow("PLANT_PALETTES_RETIRED");
    await expect(proposalStorage.createProposal({ companyId, customerId, proposalDate: "2026-11-03", plantPaletteId: palette.id })).rejects.toThrow("PLANT_PALETTES_RETIRED");
    // The internal link boundary also clears in the same SQL UPDATE.
    await db.update(proposals).set({ plantPaletteId: palette.id, estimateId: null }).where(eq(proposals.id, p.id));
    expect(await proposalStorage.updateProposal(p.id, companyId, { estimateId: d.id })).toMatchObject({ estimateId: d.id, plantPaletteId: null });
  });

  it("keeps legacy palette reads proposal-owned and company scoped without deleting any legacy rows", async () => {
    const [own, foreign] = await db.insert(plantPalettes).values([
      { companyId, title: "Own" }, { companyId: otherCompany, title: "Foreign" },
    ]).returning();
    await db.insert(plantPaletteItems).values([
      { paletteId: own.id, companyId, nameSnapshot: "Own plant", typeLabel: "Tree", category: "tree" },
      { paletteId: own.id, companyId: otherCompany, nameSnapshot: "Foreign plant", typeLabel: "Tree", category: "tree" },
    ]);
    const p = await proposal();
    await db.update(proposals).set({ plantPaletteId: own.id }).where(eq(proposals.id, p.id));
    const read = await proposalStorage.getProposalById(p.id, companyId);
    expect(read?.plantPalette?.items.map(item => item.nameSnapshot)).toEqual(["Own plant"]);
    expect(await proposalStorage.getProposalById(p.id, otherCompany)).toBeUndefined();
    await db.update(proposals).set({ plantPaletteId: foreign.id }).where(eq(proposals.id, p.id));
    expect((await proposalStorage.getProposalById(p.id, companyId))?.plantPalette).toBeNull();
    await proposalStorage.updateProposal(p.id, companyId, { plantPaletteId: null });
    expect((await proposalStorage.getProposalById(p.id, companyId))?.plantPalette).toBeNull();
    expect((await db.select().from(plantPalettes).where(eq(plantPalettes.id, own.id)))).toHaveLength(1);
    expect((await db.select().from(plantPaletteItems).where(eq(plantPaletteItems.paletteId, own.id)))).toHaveLength(2);
  });
  it("guards invalid company, customer, ticket and void links and mirrors the number", async () => {
    const d = await draft(), p = await proposal();
    expect((await request(app).patch(`/api/proposals/${p.id}`).send({ estimateId: d.id })).status).toBe(200);
    expect((await storage.getProposalById(p.id, companyId))?.estimateNumber).toBe(d.estimateNumber);
    await storage.updateProposal(p.id, companyId, { scopeOfWork: "keep", photoLayout: "grid" });
    await request(app).patch(`/api/proposals/${p.id}`).send({ estimateId: null }).expect(200);
    const unlinked = await storage.getProposalById(p.id, companyId);
    expect(unlinked).toMatchObject({ estimateId: null, scopeOfWork: "keep", photoLayout: "grid" });
    const foreign = await createEstimate(otherCompany, actor, { customerId: foreignCustomer, title: "Foreign" });
    for (const [id, error] of [[foreign.id, "ESTIMATE_NOT_FOUND"], [(await createEstimate(companyId, actor, { customerId: otherCustomer, title: "Wrong customer" })).id, "ESTIMATE_CUSTOMER_MISMATCH"]]) {
      const res = await request(app).patch(`/api/proposals/${p.id}`).send({ estimateId: id });
      expect(res.status).toBe(422); expect(res.body.error).toBe(error);
    }
    expect(() => assertProposalEstimateLink({ customerId, ticketId }, d)).toThrow("ESTIMATE_TICKET_MISMATCH");
    await transitionEstimate(companyId, actor, d.id, undefined, "void", { reason: "Test" });
    await request(app).patch(`/api/proposals/${p.id}`).send({ estimateId: d.id }).expect(422);
    await request(app).get(`/api/proposals/${p.id}`).set("X-Test-Company", otherCompany).expect(404);
    await request(app).patch(`/api/proposals/${p.id}`).set("X-Company-Id", otherCompany).send({ title: "No" }).expect(409);
    await request(app).patch(`/api/proposals/${p.id}`).set("X-Test-Role", "field_manager").send({ title: "No" }).expect(403);
    await request(app).get(`/api/proposals/${p.id}`).set("X-Test-Auth", "no").expect(401);
  });
  it("auto-links only the ticket's scoped live estimate on create", async () => {
    const d = await createEstimate(companyId, actor, { customerId, ticketId, title: "Ticket estimate" });
    const res = await request(app).post("/api/proposals").send({ customerId, ticketId, title: "Auto" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estimateId: d.id, estimateNumber: d.estimateNumber, ticketId, plantPaletteId: null });
    const summary = (await request(app).get(`/api/proposals/${res.body.id}`)).body.estimate;
    expect(summary).toMatchObject({ id: d.id, subtotalCents: 0, currentVersion: { id: d.version.id, status: "draft" } });
    expect((await loadProposalEstimateSummaries(otherCompany, [d.id])).size).toBe(0);
  });
  it("guarded migration is rerunnable and both foreign keys set null on deletion", async () => {
    const d = await draft(), p = await proposal(d.id);
    const v = await storage.createProposalVersion({ proposalId: p.id, companyId, versionNumber: 1, title: p.title,
      proposalDate: p.proposalDate, pdfStoragePath: "test", estimateVersionId: d.version.id });
    await db.delete(estimateVersions).where(eq(estimateVersions.id, d.version.id));
    expect((await storage.getProposalVersionById(v.id, companyId))?.estimateVersionId).toBeNull();
    await db.delete(estimates).where(eq(estimates.id, d.id));
    expect((await storage.getProposalById(p.id, companyId))?.estimateId).toBeNull();
  });
});
describe("finalize sends first and pins exactly what was rendered", () => {
  it("requires a method, sends once, pins the frozen version and preserves earlier stored PDFs", async () => {
    const d = await draft(), p = await proposal(d.id);
    const missing = await request(app).post(`/api/proposals/${p.id}/finalize`).send({});
    expect(missing.status).toBe(400); expect(missing.body).toEqual({ error: "ESTIMATE_SEND_METHOD_REQUIRED" });
    const first = await request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod: "email" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ estimateVersionId: d.version.id, estimateTransition: { sent: true, versionId: d.version.id, method: "email" } });
    expect(stored.get(first.body.pdfStoragePath)?.toString()).toBe(`PDF:${d.version.id}`);
    expect((await readEstimate(companyId, d.id)).version.frozenSubtotalCents).toBe(2468);
    const second = await request(app).post(`/api/proposals/${p.id}/finalize`).send({});
    expect(second.status).toBe(201); expect(second.body.estimateTransition.sent).toBe(false);
    expect(second.body.estimateTransition.sentOn).toBe(first.body.estimateTransition.sentOn);
    const revised = await transitionEstimate(companyId, actor, d.id, d.version.id, "revise", {});
    const stale = await request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod: "portal", expectedEstimateVersionId: d.version.id });
    expect(stale.status).toBe(409); expect(stale.body.error).toBe("ESTIMATE_VERSION_CHANGED");
    const third = await request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod: "portal", expectedEstimateVersionId: revised.version.id });
    expect(third.status).toBe(201); expect(third.body.estimateVersionId).toBe(revised.version.id);
    expect(stored.get(first.body.pdfStoragePath)?.toString()).toBe(`PDF:${d.version.id}`);
    expect(third.body.pdfStoragePath).not.toBe(first.body.pdfStoragePath);
  });
  it("reports post-send storage and render failures without undoing send; retry does not send again", async () => {
    const d = await draft(), p = await proposal(d.id);
    failStore = true;
    const failed = await request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod: "hard_copy" });
    failStore = false;
    expect(failed.status).toBe(500); expect(failed.body).toMatchObject({ error: "PROPOSAL_FINALIZE_FAILED", estimateTransition: { sent: true, versionId: d.version.id } });
    const sent = await readEstimate(companyId, d.id);
    expect(sent.version.status).toBe("sent");
    render.mockRejectedValueOnce(new Error("simulated render failure"));
    const renderFail = await request(app).post(`/api/proposals/${p.id}/finalize`).send({});
    expect(renderFail.status).toBe(500); expect(renderFail.body.estimateTransition.sent).toBe(false);
    const retry = await request(app).post(`/api/proposals/${p.id}/finalize`).send({});
    expect(retry.status).toBe(201); expect(retry.body.estimateTransition.sent).toBe(false);
    expect(retry.body.estimateTransition.sentOn).toBe(new Date(sent.version.sentAt!).toISOString());
  });
  it("zero-price confirmation returns lineIds and supports confirmed retry", async () => {
    const d = await draft();
    const [item] = await db.insert(hardscapeCatalogItems).values({ companyId, name: "Unpriced", category: "Stone", sku: randomUUID(), unit: "ea", retailPriceCents: null }).returning();
    const changed = await createLine(companyId, d.id, d.version.id, { sectionId: d.version.sections[0].id, lineType: "hardscape", hardscapeCatalogItemId: item.id, quantity: "1" });
    const lineId = changed.version.sections.flatMap(s => s.lines).find(l => l.lineType === "hardscape")!.id;
    const p = await proposal(d.id);
    const fail = await request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod: "other" });
    expect(fail.status).toBe(409); expect(fail.body).toEqual({ error: "LINES_NEED_PRICE", lineIds: [lineId] });
    const yes = await request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod: "other", confirmZeroPriced: true });
    expect(yes.status).toBe(201);
  });
  it("accepted uses the frozen version without send; void/declined fail and unlinked requires uploads", async () => {
    const d = await draft(), p = await proposal(d.id);
    await transitionEstimate(companyId, actor, d.id, d.version.id, "send", { method: "email" });
    await transitionEstimate(companyId, actor, d.id, d.version.id, "accept", { method: "phone" });
    const accepted = await request(app).post(`/api/proposals/${p.id}/finalize`).send({});
    expect(accepted.status).toBe(201); expect(accepted.body.estimateTransition.sent).toBe(false);
    const declined = await draft(), dp = await proposal(declined.id);
    await transitionEstimate(companyId, actor, declined.id, declined.version.id, "send", { method: "email" });
    await transitionEstimate(companyId, actor, declined.id, declined.version.id, "decline", { reason: "Test" });
    await request(app).post(`/api/proposals/${dp.id}/finalize`).send({}).expect(409);
    await transitionEstimate(companyId, actor, declined.id, undefined, "void", { reason: "Test" });
    const voided = await request(app).post(`/api/proposals/${dp.id}/finalize`).send({});
    expect(voided.status).toBe(409); expect(voided.body.error).toBe("ESTIMATE_VOID");
    const unlinked = await proposal();
    await request(app).post(`/api/proposals/${unlinked.id}/finalize`).send({}).expect(400);
    legacyUploads.add(unlinked.id);
    const legacy = await request(app).post(`/api/proposals/${unlinked.id}/finalize`).send({});
    expect(legacy.status).toBe(201);
    expect(legacy.body).toMatchObject({ estimateVersionId: null, estimateTransition: null, versionNumber: 1 });
    expect(stored.get(legacy.body.pdfStoragePath)?.toString()).toBe("PDF:uploaded");
    await request(app).post(`/api/proposals/${p.id}/finalize`).set("X-Company-Id", otherCompany).send({}).expect(409);
    await request(app).post(`/api/proposals/${p.id}/finalize`).set("X-Test-Role", "crew_supervisor").send({}).expect(403);
  });
  it("record conflicts retry with unique immutable paths, and a concurrent revision cannot replace the selected pin", async () => {
    const d = await draft(), p = await proposal(d.id);
    await transitionEstimate(companyId, actor, d.id, d.version.id, "send", { method: "email" });
    recordConflicts = 1;
    render.mockImplementationOnce(async (_p, _c, versionId) => {
      await transitionEstimate(companyId, actor, d.id, d.version.id, "revise", {});
      return Buffer.from(`PDF:${versionId}`);
    });
    const res = await request(app).post(`/api/proposals/${p.id}/finalize`).send({});
    expect(res.status).toBe(201); expect(res.body.estimateVersionId).toBe(d.version.id);
    expect(stored.get(res.body.pdfStoragePath)?.toString()).toBe(`PDF:${d.version.id}`);
    // Multiple requests selecting an already-sent version may both complete,
    // but no storage key can be reused even if the DB version number collides.
    const sent = await draft(), pp = await proposal(sent.id);
    await transitionEstimate(companyId, actor, sent.id, sent.version.id, "send", { method: "email" });
    const results = await Promise.all([request(app).post(`/api/proposals/${pp.id}/finalize`).send({}), request(app).post(`/api/proposals/${pp.id}/finalize`).send({})]);
    expect(results.every(r => r.status === 201 || r.status === 409)).toBe(true);
    for (const r of results.filter(r => r.status === 201)) expect(stored.get(r.body.pdfStoragePath)?.toString()).toBe(`PDF:${sent.version.id}`);
  });
  it("concurrent draft finalization sends at most once and never substitutes another version", async () => {
    const d = await draft(), p = await proposal(d.id);
    const results = await Promise.all(["email", "portal"].map(estimateSendMethod =>
      request(app).post(`/api/proposals/${p.id}/finalize`).send({ estimateSendMethod, expectedEstimateVersionId: d.version.id })));
    expect(results.some(r => r.status === 201)).toBe(true);
    expect(results.every(r => r.status === 201 || r.status === 409)).toBe(true);
    expect(results.filter(r => r.body.estimateTransition?.sent === true)).toHaveLength(1);
    for (const r of results.filter(r => r.status === 201)) {
      expect(r.body.estimateVersionId).toBe(d.version.id);
      expect(stored.get(r.body.pdfStoragePath)?.toString()).toBe(`PDF:${d.version.id}`);
    }
  });
});
