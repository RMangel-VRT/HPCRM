import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole, ROLE_VALUES } from "../../../../lib/db/src/accessRole";
import { registerCustomerDocuments } from "./customerDocuments";
import { documentDto } from "../services/customerDocuments";

let role = "office", company = "company", authenticated = true;
let grants: Record<string, unknown> = {};
let rows: Map<string, any>;
const bytes = Buffer.from("%PDF-1.7\nreal validated bytes\n%%EOF");
const objects = { upload: vi.fn(async (p: string) => ({ uploadURL: "https://example.invalid/upload", objectPath: `/objects/${p}` })),
  read: vi.fn(async () => bytes), save: vi.fn(async (p: string) => `/objects/${p}`), remove: vi.fn(async () => {}) };
const contracts = vi.fn(async () => ({ projected: [{ id: "contract-file", filename: "signed.pdf", openUrl: "/safe" }], documents: [] }));
const scopeMatch = (r: any, s: any) => r.companyId === s.companyId && r.customerId === s.customerId;
const repo = {
  customer: vi.fn(async (s: any) => s.companyId === "company" && ["customer", "parent"].includes(s.customerId)),
  list: vi.fn(async (s: any, cat?: string) => [...rows.values()].filter(r => scopeMatch(r, s) && (!cat || r.category === cat)).map(r => documentDto(r))),
  get: vi.fn(async (s: any, id: string) => { const row = rows.get(id); return row && scopeMatch(row, s) ? row : undefined; }),
  patch: vi.fn(async (s: any, id: string, updates: any) => { const row = await repo.get(s, id); if (!row) throw Object.assign(new Error(), { status: 404 }); Object.assign(row, updates); return documentDto(row); }),
  finalize: vi.fn(async (s: any, id: string, build: any) => { if (rows.has(id)) return rows.get(id); const row = { ...await build(), id, createdAt: new Date(), updatedAt: new Date() }; rows.set(id, row); return row; }),
  remove: vi.fn(async (s: any, id: string, cleanup: any) => { const row = await repo.get(s, id); if (row) { await cleanup(row.filePath); rows.delete(id); } }),
};
function app() {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => authenticated,
    sessionID: "session", session: { customerDocumentUploads: grants, save: (cb: any) => { grants = (req.session as any).customerDocumentUploads; cb(); } },
    user: { id: "editor", name: "Editor", activeRole: role, accessRole: accessRole(role), activeCompanyId: company } }); next(); });
  registerCustomerDocuments(a, { repository: repo as any, objects: objects as any, contracts: contracts as any });
  return request(a);
}
const root = "/api/customers/customer/documents";
const metadata = { name: "Map", category: "map", note: "Shared note" };
async function upload(client = app(), base = root) {
  return (await client.post(`${base}/upload-url`).send({ fileName: "map.pdf", contentType: "bogus", fileSize: 1 }).expect(200)).body;
}
beforeEach(() => {
  vi.clearAllMocks(); role = "office"; company = "company"; authenticated = true; grants = {};
  rows = new Map([["old", { id: "old", companyId: "company", customerId: "customer", name: "Old", filePath: "/objects/map-documents/company/customer/old",
    fileType: "pdf", fileSize: null, category: "map", note: "Original", mimeType: null, uploadedBy: null, createdAt: new Date(), updatedAt: new Date() }]]);
  objects.read.mockResolvedValue(bytes); objects.remove.mockResolvedValue();
});
describe("CP5 canonical routes and one-release aliases", () => {
  it.each(ROLE_VALUES)("allows every customer viewer to list/open, restricts %s mutations via normalized AM1 accessRole", async r => {
    role = r; const client = app();
    const list = await client.get(root).expect(200);
    expect(list.body[0]).not.toHaveProperty("filePath"); expect(list.body[0].uploadedByName).toBeNull();
    await client.get(`${root}/old/open`).expect(200);
    await client.post(`${root}/upload-url`).send({ fileName: "a.pdf" }).expect(["admin", "account_manager", "office"].includes(r) ? 200 : 403);
    if (!["admin", "account_manager", "office"].includes(r)) {
      await client.patch(`${root}/old`).send({ name: "No" }).expect(403);
      await client.delete(`${root}/old`).expect(403);
    }
  });
  it("finalizes bytes/size/MIME server-side, aliases use same owner, retries never duplicate", async () => {
    const client = app(), alias = "/api/customers/customer/map-documents", grant = await upload(client, alias);
    const created = await client.post(alias).send({ ...metadata, filePath: grant.objectPath, fileType: "exe", fileSize: 1 }).expect(201);
    expect(created.body).toMatchObject({ ...metadata, mimeType: "application/pdf", fileSize: bytes.length });
    expect(objects.save.mock.calls[0][0]).not.toContain("pending");
    expect((await client.get(root).expect(200)).body).toHaveLength(2);
    await client.post(root).send({ ...metadata, uploadToken: grant.uploadToken }).expect(201);
    expect(rows.size).toBe(2); expect(objects.save).toHaveBeenCalledTimes(1);
    await client.patch(`${alias}/${created.body.id}`).send({ note: "" }).expect(200);
    expect(rows.get(created.body.id)).toMatchObject({ name: "Map", category: "map", note: "" });
    await client.delete(`${alias}/${created.body.id}`).expect(204);
    expect(objects.remove).toHaveBeenLastCalledWith(rows.get("old")!.filePath.replace("/old", `/${created.body.id}`), "company", "customer");
    await client.delete(`${root}/${created.body.id}`).expect(204);
  });
  it("rejects company changes, foreign customer/doc and arbitrary paths before reading", async () => {
    const client = app();
    await client.get(root).set("X-Company-Id", "other").expect(409);
    await client.get(`${root}/old/open?companyId=other`).expect(409);
    await client.get("/api/customers/foreign/documents").expect(404);
    await client.get("/api/customers/parent/documents/old/open").expect(404);
    await client.post(root).send({ ...metadata, filePath: "/objects/uploads/term" }).expect(404);
    company = "other"; await client.get(root).expect(404);
    expect(objects.read).not.toHaveBeenCalled(); expect(repo.finalize).not.toHaveBeenCalled();
  });
  it("invalid content and real oversize cannot become accepted rows; metadata is provided-field-only", async () => {
    const client = app(), grant = await upload(client);
    objects.read.mockResolvedValueOnce(Buffer.from("MZ exe renamed.pdf"));
    await client.post(root).send({ ...metadata, uploadToken: grant.uploadToken }).expect(422);
    expect(rows.size).toBe(1); expect(objects.save).not.toHaveBeenCalled();
    objects.read.mockResolvedValueOnce(Buffer.alloc(25 * 1024 * 1024 + 1));
    await client.post(root).send({ ...metadata, uploadToken: grant.uploadToken }).expect(413);
    for (const body of [{ note: "x".repeat(501) }, { category: "arbitrary" }, { uploadedBy: "attacker" }, { filePath: "other" }, {}])
      await client.patch(`${root}/old`).send(body).expect(400);
    await client.patch(`${root}/old`).send({ note: null }).expect(200);
    expect(rows.get("old")).toMatchObject({ name: "Old", category: "map", note: null });
  });
  it("keeps the row and returns failure on object cleanup failure, then permits retry", async () => {
    const client = app(); objects.remove.mockRejectedValueOnce(new Error("Storage failed"));
    await client.delete(`${root}/old`).expect(500); expect(rows.has("old")).toBe(true);
    await client.delete(`${root}/old`).expect(204); expect(rows.has("old")).toBe(false);
  });
  it("parent list stays parent-owned; field readers never trigger contract loading", async () => {
    const client = app(); expect((await client.get("/api/customers/parent/documents").expect(200)).body).toEqual([]);
    role = "field";
    await client.get(`${root}/from-contracts`).expect(403);
    await client.get(`${root}/from-contracts/contract-file/open`).expect(403);
    expect(contracts).not.toHaveBeenCalled();
    role = "account_manager"; expect((await client.get(`${root}/from-contracts`).expect(200)).body).toHaveLength(1);
  });
  it("download is attachment and signed-out users cannot list/read", async () => {
    const client = app();
    expect((await client.get(`${root}/old/open?download=1`).expect(200)).headers["content-disposition"]).toContain("attachment");
    authenticated = false; await client.get(root).expect(401); await client.get(`${root}/old/open`).expect(401);
  });
});
