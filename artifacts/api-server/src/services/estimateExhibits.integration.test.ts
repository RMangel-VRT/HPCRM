import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { companies, crewWorksheetPhotos, crewWorksheets, customers, plantCatalogItems, users, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { ObjectNotFoundError, ObjectStorageService } from "../objectStorage";
import { registerEstimateRoutes } from "../routes/estimates";
import { PrivateEstimatePhotoObjects, readEstimatePhotoGrant } from "./estimatePhotoStorage";
import { loadEstimateDocumentModel } from "./estimatePdf";
import { readEstimatePhotoRows } from "./estimateReads";

const company = `estimate-exhibits-${randomUUID()}`, foreign = `estimate-exhibits-${randomUUID()}`, actor = randomUUID();
const session = "estimate-exhibit-session";
const pending = new Map<string, Buffer>();
const accepted = new Map<string, Buffer>();
let customerId: string;
let fallbackImage: Buffer;
function appFor(activeCompanyId = company, activeRole = "office", sessionId = session) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: actor, activeCompanyId, activeRole } as Express.User;
    req.sessionID = sessionId;
    next();
  });
  registerEstimateRoutes(app);
  return request(app);
}
const api = appFor();
const base = "/api/estimates";
beforeAll(async () => {
  vi.stubEnv("SESSION_SECRET", "estimate-exhibit-test-secret");
  await db.insert(companies).values([company, foreign].map(id => ({ id, name: id, slug: id })));
  await db.insert(users).values({ id: actor, name: "Disposable estimate fixture", passwordHash: "not-a-login" });
  const [customer] = await db.insert(customers).values({ companyId: company, name: "Disposable exhibits test", street: "Test", city: "Test", state: "CO", zip: "00000" }).returning();
  customerId = customer.id;
  fallbackImage = await sharp({ create: { width: 80, height: 70, channels: 3, background: "green" } }).png().toBuffer();
  vi.spyOn(PrivateEstimatePhotoObjects.prototype, "start").mockImplementation(async id => ({ uploadUrl: `https://example.test/${id}` }));
  vi.spyOn(PrivateEstimatePhotoObjects.prototype, "readUpload").mockImplementation(async grant => {
    const bytes = pending.get(grant.id);
    if (!bytes) throw new ObjectNotFoundError();
    return Buffer.from(bytes);
  });
  vi.spyOn(PrivateEstimatePhotoObjects.prototype, "save").mockImplementation(async (path, bytes) => { accepted.set(`/objects/${path}`, bytes); });
  vi.spyOn(PrivateEstimatePhotoObjects.prototype, "remove").mockImplementation(async path => {
    pending.delete(path.split("/").at(-1)!);
    accepted.delete(`/objects/${path}`);
  });
  vi.spyOn(ObjectStorageService.prototype, "getObjectEntityFile").mockImplementation(async (path, options) => {
    const bytes = accepted.get(path);
    if (!bytes || !options?.allowEstimatePhoto) throw new ObjectNotFoundError();
    return { download: async () => [bytes] } as Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>>;
  });
}, 30_000);
afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await db.delete(companies).where(inArray(companies.id, [company, foreign]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
}, 30_000);

it("isolates the whole exhibit lifecycle and captures an attributable worksheet from the selected version", async () => {
  const created = await api.post(base).send({ customerId, title: "Selected estimate" }).expect(201);
  const { id, version } = created.body, root = `${base}/${id}/versions/${version.id}`;
  const sectionId = version.sections[0].id;
  await api.patch(root).send({ scopeOfWork: "Original landscaping scope" }).expect(200);
  expect(version.includePlantTable).toBe(true);
  const plantRows = await db.insert(plantCatalogItems).values(["Display Birch", "Hidden Pine"].map((commonName, i) => ({
    companyId: company, productCode: `${randomUUID()}-${i}`, varietyKey: `test-${i}`, commonName, rawDescription: commonName,
    botanicalName: `Botanical ${i}`, sizeLabel: "5 gallon", category: "tree" as const, salePrice: "40.00",
  }))).returning();
  for (const plant of [plantRows[0], plantRows[0], plantRows[1]]) {
    await api.post(`${root}/lines`).send({ sectionId, lineType: "plant", plantCatalogItemId: plant.id, quantity: 1 }).expect(201);
  }
  const priced = await api.get(`${base}/${id}`).expect(200);
  const hiddenLine = priced.body.version.sections[0].lines[2];
  const hidden = await api.patch(`${root}/lines/${hiddenLine.id}`).send({ includeInPalette: false }).expect(200);
  expect(hidden.body.version.totals).toEqual(priced.body.version.totals);

  const grants = await Promise.all([1, 2, 3].map(n => api.post(`${root}/photos/upload-url`)
    .send({ filename: `photo-${n}.png`, mimeType: "image/png", fileSize: fallbackImage.length }).expect(200)));
  const tokens = grants.map(res => res.body.uploadToken as string);
  tokens.forEach(token => pending.set(readEstimatePhotoGrant(token, session)!.id, fallbackImage));
  const [invalid, late] = await Promise.all(["invalid.png", "late.png"].map(filename =>
    api.post(`${root}/photos/upload-url`).send({ filename, mimeType: "image/png", fileSize: fallbackImage.length }).expect(200)));
  const invalidId = readEstimatePhotoGrant(invalid.body.uploadToken, session)!.id;
  pending.set(invalidId, Buffer.from("not a raster"));
  await api.post(`${root}/photos`).send({ uploadToken: invalid.body.uploadToken }).expect(422);
  expect(pending.has(invalidId)).toBe(false);
  expect(accepted.size).toBe(0);
  await appFor(company, "office", "another-session").post(`${root}/photos`).send({ uploadToken: tokens[0] }).expect(404);
  await appFor(foreign).post(`${root}/photos`).send({ uploadToken: tokens[0] }).expect(404);
  await api.post(`${root}/photos`).send({ storageObjectPath: "/objects/foreign" }).expect(400);
  for (const uploadToken of tokens) await api.post(`${root}/photos`).send({ uploadToken }).expect(201);
  const retry = await api.post(`${root}/photos`).send({ uploadToken: tokens[1] }).expect(201);
  expect(retry.body.version.photos).toHaveLength(3);
  expect(accepted.size).toBe(3);
  expect(pending.size).toBe(0);
  expect(retry.body.version.photos[0]).not.toHaveProperty("storageObjectPath");
  const photoIds: string[] = retry.body.version.photos.map((p: { id: string }) => p.id);
  await api.put(`${root}/photos/order`).send({ photoIds: [photoIds[0], photoIds[0], photoIds[2]] }).expect(409);
  const ordered = [photoIds[2], photoIds[0], photoIds[1]];
  await api.put(`${root}/photos/order`).send({ photoIds: ordered }).expect(200);
  await api.patch(`${root}/photos/${ordered[0]}`).send({ caption: "  North entrance  " }).expect(200);
  const read = await api.get(`${root}/photos/${ordered[0]}`).expect(200).expect("Content-Type", /image\/jpeg/);
  expect(read.headers["cache-control"]).toBe("no-store");
  await appFor(foreign).get(`${root}/photos/${ordered[0]}`).expect(404);
  await appFor(company, "field").get(`${root}/photos/${ordered[0]}`).expect(403);
  await api.get(`${root}/photos/${ordered[0]}?company=${foreign}`).expect(404);
  const original = await loadEstimateDocumentModel(company, id, version.id, true);
  expect(original.exhibits?.plants).toMatchObject([{ name: "Display Birch", quantity: "2.00", size: "5 gallon" }]);
  expect(original.exhibits?.plants).toHaveLength(1);
  expect(JSON.stringify(original.sections)).toContain("Hidden Pine");
  expect(original.exhibits?.photos.map(photo => photo.caption)).toEqual(["North entrance", null, null]);
  const off = await api.patch(root).send({ includePlantTable: false }).expect(200);
  expect(off.body.version.scopeOfWork).toBe("Original landscaping scope");
  expect((await loadEstimateDocumentModel(company, id, version.id, true)).exhibits?.plants).toEqual([]);
  await api.post(`${root}/send`).send({ method: "hard_copy", confirmZeroPriced: true }).expect(200);
  const lateId = readEstimatePhotoGrant(late.body.uploadToken, session)!.id;
  pending.set(lateId, fallbackImage);
  const lockedChecks = [
    api.post(`${root}/photos/upload-url`).send({ filename: "x.jpg", mimeType: "image/jpeg", fileSize: 50 }),
    api.post(`${root}/photos`).send({ uploadToken: tokens[0] }),
    api.post(`${root}/photos`).send({ uploadToken: late.body.uploadToken }),
    api.patch(`${root}/photos/${ordered[0]}`).send({ caption: "Denied" }),
    api.put(`${root}/photos/order`).send({ photoIds: ordered }),
    api.delete(`${root}/photos/${ordered[0]}`),
    api.patch(root).send({ includePlantTable: true }),
  ];
  for (const check of lockedChecks) expect((await check.expect(409)).body.error).toBe("VERSION_LOCKED");
  expect(pending.has(lateId)).toBe(false);

  const revised = await api.post(`${root}/revise`).send({ firstEdit: true }).expect(200);
  const draft = revised.body.version, draftRoot = `${base}/${id}/versions/${draft.id}`;
  expect(draft.includePlantTable).toBe(false);
  expect(draft.photos.map((p: { id: string }) => p.id)).toEqual(ordered.map(photoId => revised.body.idMap.photos[photoId]));
  expect(draft.photos[0].caption).toBe("North entrance");
  await api.patch(`${draftRoot}/photos/${draft.photos[0].id}`).send({ caption: "Draft only" }).expect(200);
  await api.delete(`${draftRoot}/photos/${draft.photos[0].id}`).expect(200);
  await api.patch(draftRoot).send({ scopeOfWork: "New scope" }).expect(200);

  // Generate while v2 is current; the selected URL still points at v1.
  await appFor(foreign).post(`${root}/crew-worksheet`).send({}).expect(404);
  const generated = await api.post(`${root}/crew-worksheet`).send({}).expect(201);
  const [sheet] = await db.select().from(crewWorksheets)
    .where(and(eq(crewWorksheets.id, generated.body.id), eq(crewWorksheets.companyId, company)));
  expect(sheet).toMatchObject({
    scopeOfWork: "Original landscaping scope", sourceEstimateId: id, sourceEstimateVersionId: version.id,
    sourceEstimateVersionNumberSnapshot: 1, sourceProposalId: null, createdById: actor,
  });
  expect(sheet.worksheetNumber).toMatch(/^CW-\d{4}-\d{4}$/);
  expect(sheet.estimateLinesSnapshot?.[0].lines.map(line => line.name)).toEqual(["Display Birch 5 gallon", "Display Birch 5 gallon", "Hidden Pine 5 gallon"]);
  const photos = await db.select().from(crewWorksheetPhotos).where(eq(crewWorksheetPhotos.crewWorksheetId, sheet.id)).orderBy(crewWorksheetPhotos.displayOrder);
  expect(photos.map(p => p.caption)).toEqual(["North entrance", null, null]);
  const sourcePhotos = await readEstimatePhotoRows(db, company, version.id);
  expect(photos.map(p => p.storageObjectPath)).toEqual(sourcePhotos.map(p => p.storageObjectPath));
  const draftWorksheet = await api.post(`${draftRoot}/crew-worksheet`).send({}).expect(201);
  await api.delete(draftRoot).expect(200);
  expect(await readEstimatePhotoRows(db, company, version.id)).toEqual(sourcePhotos);
  expect(await readEstimatePhotoRows(db, company, draft.id)).toEqual([]);
  expect(accepted.size).toBe(3);
  const [discardedSource] = await db.select().from(crewWorksheets).where(eq(crewWorksheets.id, draftWorksheet.body.id));
  expect(discardedSource).toMatchObject({ sourceEstimateVersionId: null, sourceEstimateVersionNumberSnapshot: 2, scopeOfWork: "New scope" });
  expect(discardedSource.sourceEstimateLabelSnapshot).toContain("v2");
  expect((await loadEstimateDocumentModel(company, id, version.id, true)).exhibits?.photos).toEqual(original.exhibits?.photos);
}, 60_000);
