import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, customers, users, proposals, proposalFiles, proposalVersions, crewWorksheets,
  tickets, ticketTypes, ticketTypeStatuses, plantCatalogItems, plantEnrichment, estimateLines,
  estimateSections, plantPalettes, plantPaletteItems, pool as schemaPool } from "@workspace/db";
import { accessRole } from "../../../../lib/db/src/accessRole";
import { db, pool } from "../db";
import { estimateAccess } from "../lib/estimateAccess";
import { canReadCrewWorksheets } from "../lib/crewWorksheetAccess";
import { registerRetiredProposalWrites } from "../routes/retiredProposalWrites";
import { registerProposalPdfReads } from "../routes/proposalPdfReads";
import { createEstimate, createLine } from "./estimates";
import { loadProposalEstimateSummaries } from "./proposalEstimates";
import { loadProposalExhibits, loadPlantLinesForVersion, buildPlantScheduleModel } from "./proposalExhibits";
import { loadProposalDocumentModel, renderLinkedProposal } from "./proposalDocument";
import { closeDocumentBrowser } from "./documents/browser";
import { ObjectStorageService } from "../objectStorage";
import { storage } from "../storage";
import { PDFDocument } from "pdf-lib";
import { readEstimate } from "./estimateReads";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
const companyId = randomUUID(), otherCompany = randomUUID(), actor = randomUUID();
let customerId: string, ticketId: string;
let app: express.Express;
const stored = new Map<string, Buffer>();
const render = vi.fn(async (company: string, p: Parameters<typeof renderLinkedProposal>[1]) => {
  if (!p.estimateId) throw new Error("No synthetic legacy renderer supplied");
  return renderLinkedProposal(company, p, await loadProposalExhibits(company, p));
});
const proposal = async (estimateId: string | null = null, linkedTicket: string | null = null) => storage.createProposal({
  companyId, customerId, ticketId: linkedTicket, estimateId, title: "Disposable proposal", proposalDate: "2026-11-03", proposalNumber: randomUUID(),
});
async function draft(linkedTicketId?: string) {
  const d = await createEstimate(companyId, actor, { customerId, title: "Disposable estimate", ticketId: linkedTicketId });
  return createLine(companyId, d.id, d.version.id, { sectionId: d.version.sections[0].id, lineType: "custom",
    name: "Install", unit: "EA", quantity: "2", unitPriceCents: 1234, umbrellaKey: "landscape_labor" });
}
beforeAll(async () => {
  await db.insert(companies).values([{ id: companyId, name: "Disposable proposals", slug: companyId }, { id: otherCompany, name: "Disposable foreign", slug: otherCompany }]);
  await db.insert(users).values({ id: actor, name: "Disposable proposal actor", passwordHash: "not-a-login" });
  [{ id: customerId }] = await db.insert(customers).values({ companyId, name: "A", street: "Test", city: "Test", state: "CO", zip: "00000" }).returning();
  const [type] = await db.insert(ticketTypes).values({ companyId, name: "Estimate Request", typeKey: "estimate_request", color: "#000000" }).returning();
  const [status] = await db.insert(ticketTypeStatuses).values({ ticketTypeId: type.id, name: "New", displayOrder: 0 }).returning();
  [{ id: ticketId }] = await db.insert(tickets).values({ companyId, customerId, ticketTypeId: type.id, currentStatusId: status.id, title: "Disposable ticket", createdById: actor }).returning();

  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => req.get("X-Test-Auth") !== "no",
      user: { id: actor, activeCompanyId: req.get("X-Test-Company") ?? companyId, activeRole: req.get("X-Test-Role") ?? "office" } });
    next();
  });
  // Exercise the production route handlers without the unrelated startup jobs.
  const source = await readFile(new URL("../routes/routes.ts", import.meta.url), "utf8");
  const between = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  const links = between("  const canAccessProposals =", '  app.post("/api/convert-heic"');
  const worksheet = between('  app.get("/api/crew-worksheets/:id"', '  app.get("/api/customers/:customerId/crew-worksheets"');
  const { code } = await transform(`${links}\n${worksheet}`, { loader: "ts", target: "es2022" });
  const deps = { app, db, storage, sql, and, eq, proposals, estimateAccess, accessRole, canReadCrewWorksheets,
    registerRetiredProposalWrites, loadProposalEstimateSummaries, loadProposalExhibits };
  new Function(...Object.keys(deps), code)(...Object.values(deps));
  registerProposalPdfReads(app, {
    getProposal: storage.getProposalById.bind(storage), getVersion: storage.getProposalVersionById.bind(storage),
    loadStoredPdf: async path => {
      const bytes = stored.get(path);
      if (!bytes) throw new Error("Missing synthetic PDF");
      return bytes;
    },
    renderDraft: (p, company) => render(company, p),
  });
});

afterAll(async () => {
  await closeDocumentBrowser();
  await db.delete(tickets).where(eq(tickets.companyId, companyId));
  await db.delete(companies).where(inArray(companies.id, [companyId, otherCompany]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
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
  it("embeds only the selected version's own-company Plants images, keeping rows after enrichment removal", async () => {
    const { d } = await plantDraft(), p = await proposal(d.id);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=", "base64");
    const download = vi.spyOn(ObjectStorageService.prototype, "downloadByPath").mockResolvedValue(png);
    try {
      const full = (await storage.getProposalById(p.id, companyId))!;
      let exhibits = await loadProposalExhibits(companyId, { ...full, estimate: { number: "", currentVersion: { id: d.version.id, versionNumber: 1 } } });
      const model = await loadProposalDocumentModel(companyId, full, exhibits);
      expect(model.plants).toHaveLength(2);
      expect(model.plants?.map(r => r.quantity)).toEqual(["2.20", "1.10"]);
      expect(model.plants?.every(r => r.dataUri?.startsWith("data:image/jpeg;"))).toBe(true);
      expect(model.plants?.[0].typeLabel).toBe("Feature tree");
      expect(download).not.toHaveBeenCalledWith("/foreign-image");
      await db.delete(plantEnrichment).where(eq(plantEnrichment.companyId, companyId));
      download.mockClear();
      exhibits = await loadProposalExhibits(companyId, { ...full, estimate: { number: "", currentVersion: { id: d.version.id, versionNumber: 1 } } });
      const noOwnImage = await loadProposalDocumentModel(companyId, full, exhibits);
      expect(noOwnImage.plants).toHaveLength(2);
      expect(noOwnImage.plants?.every(r => r.dataUri === null)).toBe(true);
      expect(download).not.toHaveBeenCalled();
    } finally { download.mockRestore(); }
  });
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
  it("exposes scoped lightweight previews, explicit unlinked/missing/denied cases", async () => {
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
    const read = await storage.getProposalById(p.id, companyId);
    expect(read?.plantPalette?.items.map(item => item.nameSnapshot)).toEqual(["Own plant"]);
    expect(await storage.getProposalById(p.id, otherCompany)).toBeUndefined();
    await db.update(proposals).set({ plantPaletteId: foreign.id }).where(eq(proposals.id, p.id));
    expect((await storage.getProposalById(p.id, companyId))?.plantPalette).toBeNull();
    expect((await db.select().from(plantPalettes).where(eq(plantPalettes.id, own.id)))).toHaveLength(1);
    expect((await db.select().from(plantPaletteItems).where(eq(plantPaletteItems.paletteId, own.id)))).toHaveLength(2);
  });
});

describe("retired proposal routes", () => {
  it("rejects every former mutation for both linked and unlinked proposals without changing rows", async () => {
    const d = await draft(ticketId), linked = await proposal(d.id, ticketId), legacy = await proposal();
    const contract = { error: "PROPOSALS_RETIRED", estimateBuilderPath: "/dashboard/estimates/builder" };
    const verify = async (r: request.Test) => expect((await r.expect(409)).body).toMatchObject(contract);
    await verify(request(app).post("/api/proposals").send({ estimateId: d.id }));
    for (const p of [linked, legacy]) {
      const path = `/api/proposals/${p.id}`;
      const before = (await request(app).get(path).expect(200)).body;
      await verify(request(app).patch(path).send({ estimateId: null, coverSource: "none", title: "forbidden" }));
      for (const suffix of ["files/upload-url", "files", "files/reorder", "files/bulk-delete", "plant-items", "plant-items/reorder", "finalize", "crew-worksheets"]) {
        await verify(request(app).post(`${path}/${suffix}`).send({}));
      }
      for (const suffix of ["files/file-id", "plant-items/item-id"]) {
        await verify(request(app).patch(`${path}/${suffix}`).send({}));
        await verify(request(app).delete(`${path}/${suffix}`));
      }
      await verify(request(app).post(`/api/crew-worksheets/from-proposal/${p.id}`).set("X-Test-Role", "crew_supervisor"));
      expect((await request(app).get(path).expect(200)).body).toEqual(before);
    }
    expect((await readEstimate(companyId, d.id)).version.status).toBe("draft");
    expect(await db.select().from(crewWorksheets).where(eq(crewWorksheets.companyId, companyId))).toEqual([]);
    await request(app).patch(`/api/proposals/${linked.id}`).set("X-Test-Auth", "no").expect(401);
    await request(app).patch(`/api/proposals/${linked.id}`).set("X-Test-Role", "field").expect(403);
    const stale = await request(app).patch(`/api/proposals/${linked.id}`).set("X-Company-Id", otherCompany).expect(409);
    expect(stale.body.error).not.toBe("PROPOSALS_RETIRED");
  });

  it("lists historical drafts by company, customer, ticket and estimate, and renders a linked draft inline", async () => {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    const [fixtureTicket] = await db.insert(tickets).values({ companyId, customerId, title: "Preview ticket",
      ticketTypeId: ticket.ticketTypeId, currentStatusId: ticket.currentStatusId, createdById: actor }).returning();
    const d = await draft(fixtureTicket.id), p = await proposal(d.id, fixtureTicket.id), legacy = await proposal();
    const ids = (rows: { id: string }[]) => rows.map(row => row.id);
    for (const route of ["/api/proposals", `/api/customers/${customerId}/proposals`]) {
      expect(ids((await request(app).get(route).expect(200)).body)).toEqual(expect.arrayContaining([p.id, legacy.id]));
      await request(app).get(route).set("X-Test-Company", otherCompany).expect(200, []);
    }
    expect(ids((await request(app).get(`/api/tickets/${fixtureTicket.id}/proposals`).expect(200)).body)).toEqual([p.id]);
    expect(ids((await request(app).get(`/api/proposals?estimateId=${d.id}`).expect(200)).body)).toEqual([p.id]);
    const preview = await request(app).get(`/api/proposals/${p.id}/pdf?inline=1`).expect(200).expect("Content-Type", /application\/pdf/).expect("Content-Disposition", /^inline/);
    expect((await PDFDocument.load(preview.body)).getPageCount()).toBeGreaterThan(0);
    expect((await readEstimate(companyId, d.id)).version.status).toBe("draft");
    await request(app).get(`/api/proposals/${p.id}/pdf`).set("X-Test-Company", otherCompany).expect(404);
    await request(app).get(`/api/proposals/${p.id}/pdf`).set("X-Test-Role", "field_manager").expect(403);
    await request(app).get(`/api/proposals/${legacy.id}/pdf`).expect(404);
    // A legacy draft with a surviving estimate attachment still uses the draft renderer, not storage for finalized bytes.
    await db.insert(proposalFiles).values({ companyId, proposalId: legacy.id, fileType: "estimate_pdf", filename: "original.pdf", mimeType: "application/pdf", fileSize: 42, storageObjectPath: "/fixture/original" });
    const legacyBytes = Buffer.from("%PDF-1.4 synthetic legacy draft");
    render.mockResolvedValueOnce(legacyBytes);
    // Linked and legacy production renderers are distinct (the latter is covered by pdfBrand tests).
    const response = await request(app).get(`/api/proposals/${legacy.id}/pdf`).expect(200).expect("Content-Disposition", /^attachment/);
    expect(response.body).toEqual(legacyBytes);
  });

  it("serves existing stored bytes without regenerating and keeps worksheet snapshots after authorized deletion", async () => {
    const p = await proposal(), other = await proposal();
    // Legacy finalize used to leave the container as draft.
    const v = await storage.createProposalVersion({ companyId, proposalId: p.id, versionNumber: 3,
      title: p.title, proposalDate: p.proposalDate, pdfStoragePath: randomUUID() });
    const bytes = Buffer.from("%PDF-1.4 retained legacy bytes");
    stored.set(v.pdfStoragePath, bytes);
    const path = `/api/proposals/${p.id}`;
    render.mockClear();
    expect((await request(app).get(`${path}/pdf`).expect(200)).body).toEqual(bytes);
    await db.update(proposals).set({ status: "finalized" }).where(eq(proposals.id, p.id));
    expect((await request(app).get(`${path}/pdf?inline=1`).expect(200).expect("Content-Disposition", /^inline/)).body).toEqual(bytes);
    expect((await request(app).get(`${path}/versions/${v.id}/download`).expect(200)).body).toEqual(bytes);
    expect(render).not.toHaveBeenCalled();
    await request(app).get(`/api/proposals/${other.id}/versions/${v.id}/download`).expect(404);
    await request(app).get(`${path}/versions/${v.id}/download`).set("X-Test-Company", otherCompany).expect(404);
    await request(app).get(`${path}/versions/${v.id}/download`).set("X-Test-Role", "field_manager").expect(403);
    const [worksheet] = await db.insert(crewWorksheets).values({ companyId, customerId, createdById: actor,
      sourceProposalId: p.id, sourceProposalNumberSnapshot: p.proposalNumber, sourceProposalTitleSnapshot: p.title,
      worksheetNumber: randomUUID(), worksheetDate: p.proposalDate, scopeOfWork: "Crew snapshot" }).returning();
    await request(app).delete(path).set("X-Test-Company", otherCompany).expect(404);
    await request(app).delete(path).set("X-Test-Role", "field_manager").expect(403);
    await request(app).delete(path).set("X-Test-Auth", "no").expect(401);
    await request(app).delete(path).expect(200, { success: true });
    await request(app).get(path).expect(404);
    const read = await request(app).get(`/api/crew-worksheets/${worksheet.id}`).expect(200);
    expect(read.body).toMatchObject({ sourceProposalId: null, sourceProposalTitle: p.title, scopeOfWork: "Crew snapshot" });
    expect(stored.get(v.pdfStoragePath)).toEqual(bytes);
  });
});
