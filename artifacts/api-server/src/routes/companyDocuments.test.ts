import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import { accessRole, ROLE_VALUES } from "../../../../lib/db/src/accessRole";
import { companyDocumentStatus, companyDocumentPatch } from "../../../../lib/db/src/companyDocumentContracts";
import { signDocumentGrant } from "../services/customerDocumentGrants";
import { companyDocumentMissing } from "../services/companyDocuments";
import { registerCompanyDocuments } from "./companyDocuments";

let role = "office", company = "company", session = "session", authenticated = true;
let docs: Map<string, any>, files: Map<string, any>;
const bytes = Buffer.from("%PDF-1.7\nvalidated\n%%EOF");
const objects = { upload: vi.fn(async (p: string) => ({ uploadURL: "https://example.invalid/put", objectPath: `/objects/${p}` })),
  read: vi.fn(async () => bytes), save: vi.fn(async (p: string) => `/objects/${p}`), remove: vi.fn(async () => {}) };
const repo = {
  get: vi.fn(async (co: string, id: string, manage = true) => {
    const d = docs.get(id); if (!d || d.companyId !== co || d.archivedAt || (!manage && d.visibility !== "everyone")) throw companyDocumentMissing(); return d;
  }),
  file: vi.fn(async (co: string, id: string, fid: string) => {
    const f = files.get(fid); if (!f || f.companyId !== co || f.documentId !== id) throw companyDocumentMissing(); return f;
  }),
  list: vi.fn(async (co: string, manage: boolean) => {
    const documents = [...docs.values()].filter(d => d.companyId === co && !d.archivedAt && (manage || d.visibility === "everyone"))
      .map(({ filePath: _p, companyId: _c, ...d }) => d);
    const license = documents.find(d => d.role === "pesticide_license");
    return { documents, license: { number: "123", documentId: license?.id ?? null, expiresOn: license?.expiresOn ?? null } };
  }),
  history: vi.fn(async (co: string, id: string) => { await repo.get(co, id); return [...files.values()].filter(f => f.companyId === co && f.documentId === id).map(f => ({ id: f.id })); }),
  finalize: vi.fn(async (co: string, id: string, fid: string, _actor: string, metadata: any, replacing: boolean, build: any) => {
    if (files.has(fid)) return id;
    if (replacing) await repo.get(co, id);
    const f = await build(); files.set(fid, { ...f, id: fid, companyId: co, documentId: id });
    docs.set(id, { ...docs.get(id), id, companyId: co, ...metadata, currentFileId: fid }); return id;
  }),
  patch: vi.fn(async (co: string, id: string, _actor: string, changes: any) => {
    const d = await repo.get(co, id); Object.assign(d, changes);
  }),
  license: vi.fn(async () => {}),
};
const email = vi.fn(async () => ({ communicationId: "comm", deliveryStatus: "sent" }));
const sends = vi.fn(async () => []);
const emailOptions = vi.fn(async () => ({ companyName: "Fixture", phone: null }));
const reconcile = vi.fn(async () => {});
function app() {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated, sessionID: session,
      user: { id: "editor", name: "Editor", accessRole: accessRole(role), activeCompanyId: company } }); next();
  });
  registerCompanyDocuments(a, { repository: repo as any, objects: objects as any, email, sends, emailOptions, reconcile }); return request(a);
}
const root = "/api/company-documents";
const metadata = { name: "W9", category: "tax", visibility: "office", pinned: true };
async function upload(documentId?: string) { return (await app().post(`${root}/upload-url`).send({ fileName: "a.pdf", documentId }).expect(200)).body.uploadToken; }
beforeEach(() => {
  vi.clearAllMocks(); role = "office"; company = "company"; session = "session"; authenticated = true;
  docs = new Map(["office", "everyone"].map(visibility => [visibility, { id: visibility, companyId: "company", visibility,
    name: visibility, role: visibility === "office" ? "pesticide_license" : null, currentFileId: visibility }]));
  files = new Map(["office", "everyone", "old"].map(id => [id, { id, companyId: "company", documentId: id === "old" ? "everyone" : id,
    filePath: `/objects/company-documents/company/${id}/accepted/file`, fileName: "a.pdf", mimeType: "application/pdf" }]));
  objects.read.mockResolvedValue(bytes); objects.remove.mockResolvedValue();
});
it.each(ROLE_VALUES)("enforces canonical %s visibility and every route's role gate", async r => {
  role = r; const manage = ["admin", "office", "account_manager"].includes(r), c = app();
  const list = (await c.get(root).expect(200)).body;
  expect(list.documents).toHaveLength(manage ? 2 : 1);
  expect(list.license).toMatchObject({ number: "123", documentId: manage ? "office" : null });
  await c.get(`${root}/everyone/open`).expect(200);
  await c.get(`${root}/office/open`).expect(manage ? 200 : 404);
  await c.get(`${root}/everyone/files/old/open`).expect(manage ? 200 : 404);
  await c.get(`${root}/everyone/files/everyone/open`).expect(200);
  await c.get(`${root}/everyone/files`).expect(manage ? 200 : 403);
  await c.get(`${root}/everyone/sends`).expect(manage ? 200 : 403);
  await c.get(`${root}/email-options`).expect(manage ? 200 : 403);
  await c.post(`${root}/email`).send({}).expect(manage ? 201 : 403);
  await c.post(`${root}/upload-url`).send({ fileName: "a.pdf" }).expect(manage ? 200 : 403);
  await c.post(root).send({}).expect(manage ? 400 : 403);
  await c.post(`${root}/everyone/files`).send({}).expect(manage ? 400 : 403);
  await c.patch(`${root}/everyone`).send({ name: "updated" }).expect(manage ? 200 : 403);
  await c.put(`${root}/license-number`).send({ number: " 123 " }).expect(manage ? 200 : 403);
  await c.delete(`${root}/everyone`).expect(manage ? 204 : 403);
});
it("creates and replaces idempotently while retaining history and immutable accepted paths", async () => {
  const token = await upload(), c = app();
  const first = (await c.post(root).send({ ...metadata, uploadToken: token }).expect(201)).body;
  await c.post(root).send({ ...metadata, uploadToken: token }).expect(201);
  expect(objects.save).toHaveBeenCalledTimes(1);
  const replacement = await upload(first.id);
  await c.post(`${root}/${first.id}/files`).send({ uploadToken: replacement, expiresOn: "2027-11-18" }).expect(201);
  await c.post(`${root}/${first.id}/files`).send({ uploadToken: replacement }).expect(201);
  expect(objects.save).toHaveBeenCalledTimes(2);
  expect((await c.get(`${root}/${first.id}/files`).expect(200)).body).toHaveLength(2);
  expect(objects.save.mock.calls.every(call => call[0].includes("/accepted/") && !call[0].includes("/pending/"))).toBe(true);
  objects.remove.mockRejectedValueOnce(new Error("cleanup"));
  await c.post(`${root}/${first.id}/files`).send({ uploadToken: replacement }).expect(201);
});
it("rejects swapped company, session, replacement target, grant intent and arbitrary accepted identities", async () => {
  const token = await upload(), replace = await upload("everyone"), c = app();
  await c.get(root).set("X-Company-Id", "foreign").expect(409);
  await c.get(`${root}/everyone/open?companyId=foreign`).expect(409);
  await c.post(root).send({ ...metadata, uploadToken: replace }).expect(404);
  await c.post(`${root}/everyone/files`).send({ uploadToken: token }).expect(404);
  await c.post(`${root}/office/files`).send({ uploadToken: replace }).expect(404);
  session = "other"; await c.post(root).send({ ...metadata, uploadToken: token }).expect(404);
  session = "session"; company = "foreign";
  await c.get(`${root}/everyone/open`).expect(404); await c.get(`${root}/everyone/files`).expect(404);
  await c.patch(`${root}/everyone`).send({ name: "attack" }).expect(404);
  await c.delete(`${root}/everyone`).expect(404);
  await c.post(root).send({ ...metadata, uploadToken: token }).expect(404);
  expect(objects.read).not.toHaveBeenCalled();
});
it("rejects expired and customer-document grants", async () => {
  const c = app();
  const token = signDocumentGrant({ id: "501701e8-0774-4c02-945e-5fd287eaa2dd", companyId: "company", customerId: "everyone",
    userId: "editor", path: "/objects/map-documents/company/everyone/file", filename: "a.pdf", expires: 0 }, session);
  await c.post(root).send({ ...metadata, uploadToken: token }).expect(404);
});
it("validates actual bytes, strict PATCH, safe headers, license normalization and conflicts", async () => {
  const token = await upload(), c = app();
  objects.read.mockResolvedValueOnce(Buffer.from("MZ executable"));
  await c.post(root).send({ ...metadata, uploadToken: token }).expect(422);
  objects.read.mockResolvedValueOnce(Buffer.alloc(25 * 1024 * 1024 + 1));
  await c.post(root).send({ ...metadata, uploadToken: token }).expect(413);
  await c.post(`${root}/upload-url`).send({ fileName: "a.docx" }).expect(422);
  await c.post(`${root}/upload-url`).send({ fileName: "a.pdf", fileSize: 25 * 1024 * 1024 + 1 }).expect(413);
  expect(companyDocumentPatch.parse({ pinned: false })).toEqual({ pinned: false });
  for (const input of [{}, { category: "" }, { role: "fake" }, { expiresOn: "2026-02-30" }, { currentFileId: "bad" }])
    await c.patch(`${root}/everyone`).send(input).expect(400);
  await c.put(`${root}/license-number`).send({ number: "   " }).expect(200);
  expect(repo.license).toHaveBeenLastCalledWith("company", null);
  repo.patch.mockRejectedValueOnce(Object.assign(new Error(), { code: "23505", constraint: "company_documents_live_role_idx" }));
  await c.patch(`${root}/everyone`).send({ role: "pesticide_license" }).expect(409);
  const response = await c.get(`${root}/everyone/open?download=1`).expect(200);
  expect(response.headers).toMatchObject({ "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" });
  expect(response.headers["content-disposition"]).toContain("attachment");
  authenticated = false; await c.get(root).expect(401); await c.get(`${root}/everyone/open`).expect(401);
});
it.each([[null, "none", null], ["2026-11-17", "expired", -1], ["2026-11-18", "expiring", 0],
  ["2027-01-16", "expiring", 59], ["2027-01-17", "expiring", 60], ["2027-01-18", "current", 61]] as const)(
  "calculates Colorado calendar threshold %s", (date, status, days) => {
    expect(companyDocumentStatus(date, "2026-11-18")).toEqual({ status, daysUntilExpiry: days });
  });
