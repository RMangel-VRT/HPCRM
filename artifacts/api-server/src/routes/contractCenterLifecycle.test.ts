import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, getTableColumns } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { registerContractCenterRoutes } from "./contractCenter";

const mock = vi.hoisted(() => ({ db: {} as any, parent: vi.fn(), upload: vi.fn(), file: vi.fn(), acl: vi.fn() }));
vi.mock("../db", () => ({ db: mock.db }));
vi.mock("../utils/parentGuard", () => ({ assertNotParentCustomer: mock.parent }));
vi.mock("../objectAcl", () => ({ ObjectAccessGroupType: { COMPANY_MEMBER: "company_member" }, ObjectPermission: { READ: "read" } }));
vi.mock("../objectStorage", () => ({ ObjectStorageService: class {
  getObjectEntityUploadURL = mock.upload;
  getObjectEntityFile = mock.file;
  trySetObjectEntityAclPolicy = mock.acl;
  normalizeObjectEntityPath(path: string) { return path.replace("https://storage.googleapis.com/private/", "/objects/").split("?")[0]; }
} }));

let tables: Record<string, any[]>, sequence: number, writes: number, failTable: string | null;
const dialect = new PgDialect();
function rows(name: string) { return tables[name] ??= []; }
function predicate(expression: any, table: any) {
  if (!expression) return () => true;
  const query = dialect.sqlToQuery(expression);
  const columns = getTableColumns(table);
  const fields = new Map(Object.entries(columns).map(([key, value]: any) => [value.name, key]));
  const conditions = [...query.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
  return (row: any) => conditions.every(m => row[fields.get(m[1])!] === query.params[Number(m[2]) - 1]);
}
function query(table: any, mode = "select", selection?: any) {
  const name = getTableName(table), state = { expression: undefined as any, values: undefined as any };
  const run = async () => {
    const matches = predicate(state.expression, table);
    if (mode === "select") return rows(name).filter(matches).map(r => selection
      ? Object.fromEntries(Object.entries(selection).map(([key, col]: any) => [key, r[Object.entries(getTableColumns(table)).find(([, c]) => c === col)?.[0] ?? key]]))
      : structuredClone(r));
    writes++;
    if (name === failTable) throw new Error("Injected write failure");
    if (mode === "delete") { tables[name] = rows(name).filter(r => !matches(r)); return []; }
    if (mode === "update") {
      return rows(name).filter(matches).map(r => Object.assign(r, state.values));
    }
    const inserted = (Array.isArray(state.values) ? state.values : [state.values]).map((value: any) => ({
      id: `id-${++sequence}`, createdAt: new Date(), updatedAt: new Date(),
      snowPricing: null, snowFlatPriceCents: null, renewedFromTermId: null,
      legalName: null, managingAgentName: null, projectContact: null, contactPhone: null, contactEmail: null,
      projectAddress: null, snowTriggers: null, po: null, notes: null, needsReview: false, ...value,
    }));
    rows(name).push(...inserted); return inserted;
  };
  const builder: any = {
    where: (expression: any) => { state.expression = expression; return builder; },
    values: (values: any) => { state.values = values; return builder; },
    set: (values: any) => { state.values = values; return builder; },
    for: vi.fn(() => builder), orderBy: () => builder, returning: () => builder,
    then: (resolve: any, reject: any) => run().then(resolve, reject),
  };
  return builder;
}
function app(role = "office", company = "company", superAdmin = false) {
  const instance = express(), session: any = {};
  instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => true, user: { id: "actor", activeCompanyId: company, activeRole: role, isSuperAdminBool: superAdmin }, session });
    next();
  });
  registerContractCenterRoutes(instance); return instance;
}
const payments = [
  { component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: [11,12,1,2].includes(i + 1) ? 58750 : 117500 })) },
  { component: "Fertilization", months: Array.from({ length: 7 }, (_, i) => ({ month: i + 3, amountCents: i === 6 ? 34284 : 34286 })) },
];
const body = { customerId: "customer", line: "landscape", form: "theirs",
  term: { seasonLabel: "2025–26", startDate: "2025-10-01", endDate: "2026-09-30", legalName: "Pavilion Villas" },
  scope: [{ serviceKey: "mowing", included: true }], rates: [], payments };
const base = "/api/contract-center";
async function create(agent: ReturnType<typeof request>) {
  const response = await agent.post(`${base}/contracts`).send(body);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return { agreementId: response.body.id, termId: response.body.terms[0].id };
}
beforeEach(() => {
  tables = { customers: [{ id: "customer", companyId: "company", name: "Pavilion Villas", street: "1 Main", city: "Denver", state: "CO", zip: "80000", propertyManagementCompanyId: null }] };
  sequence = 0; writes = 0; failTable = null; vi.clearAllMocks();
  mock.parent.mockResolvedValue(false); mock.upload.mockResolvedValue("https://storage.googleapis.com/private/uploads/object?signature=test");
  mock.file.mockResolvedValue({}); mock.acl.mockResolvedValue("/objects/uploads/object");
  Object.assign(mock.db, {
    select: vi.fn((selection?: any) => ({ from: (table: any) => query(table, "select", selection) })),
    insert: vi.fn((table: any) => query(table, "insert")),
    update: vi.fn((table: any) => query(table, "update")),
    delete: vi.fn((table: any) => query(table, "delete")),
  });
  let tail = Promise.resolve();
  mock.db.transaction = vi.fn((fn: any) => {
    const task = tail.then(async () => {
      const snapshot = structuredClone(tables);
      try { return await fn(mock.db); } catch (error) { tables = snapshot; throw error; }
    });
    tail = task.then(() => undefined, () => undefined); return task;
  });
});
describe("Contract Center lifecycle routes", () => {
  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor"])("denies %s every lifecycle endpoint", async role => {
    const agent = request(app(role));
    for (const [method, path] of [
      ["get", "/contracts"], ["get", "/contracts/id"], ["get", "/contracts/by-legacy/id"],
      ["post", "/contracts"], ["patch", "/terms/id"], ["put", "/terms/id/scope"],
      ["put", "/terms/id/rates"], ["put", "/terms/id/payments"], ["post", "/terms/id/status"],
      ["post", "/contracts/id/renew"], ["post", "/terms/id/documents/upload-url"], ["post", "/terms/id/documents"],
    ]) expect((await (agent as any)[method](`${base}${path}`).send({})).status).toBe(403);
    expect(mock.db.select).not.toHaveBeenCalled(); expect(mock.db.transaction).not.toHaveBeenCalled();
  });
  it.each(["office", "admin", "superadmin"])("allows %s creation, sorted detail and attributable initial history", async role => {
    const agent = request(app(role, "company", role === "superadmin"));
    const { agreementId, termId } = await create(agent);
    const detail = await agent.get(`${base}/contracts/${agreementId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.terms[0]).toMatchObject({ annualPriceCents: 1415000, billingType: "monthly_variable", status: "draft" });
    expect(rows("term_billing_months").filter(r => r.termId === termId)).toHaveLength(19);
    expect(rows("term_status_history")[0]).toMatchObject({ oldStatus: null, newStatus: "draft", changedBy: "actor", note: "Created in the Contract Center" });
  });
  it("returns 404 for foreign terms, agreements, customers and management companies", async () => {
    const agent = request(app());
    tables.agreement_terms = [{ id: "foreign", companyId: "other" }];
    tables.agreements = [{ id: "foreign", companyId: "other" }];
    expect((await agent.patch(`${base}/terms/foreign`).send({ notes: "X" })).status).toBe(404);
    expect((await agent.get(`${base}/contracts/foreign`)).status).toBe(404);
    expect((await agent.post(`${base}/contracts`).send({ ...body, customerId: "foreign" })).status).toBe(404);
    expect((await agent.post(`${base}/contracts`).send({ ...body, propertyManagementCompanyId: "foreign" })).status).toBe(404);
    expect(writes).toBe(0);
  });
  it("rejects parent customers using the shared guard", async () => {
    mock.parent.mockImplementation(async (_id, _company, res) => { res.status(400).json({ error: "PARENT_CUSTOMER_NOT_ALLOWED" }); return true; });
    const response = await request(app()).post(`${base}/contracts`).send(body);
    expect(response.status).toBe(400); expect(writes).toBe(0);
  });
  it.each([{}, { status: "signed" }, { id: "injected", companyId: "other", annualPriceCents: 1 }])("rejects empty/server-owned PATCH %j", async update => {
    expect((await request(app()).patch(`${base}/terms/id`).send(update)).status).toBe(400);
    expect(writes).toBe(0);
  });
  it("preserves omitted fields, ignores status injection, re-expands date edits and audits signed edits", async () => {
    const agent = request(app()), { termId } = await create(agent);
    await agent.post(`${base}/terms/${termId}/status`).send({ to: "sent" });
    await agent.post(`${base}/terms/${termId}/status`).send({ to: "signed" });
    const response = await agent.patch(`${base}/terms/${termId}`).send({ notes: "new", endDate: "2027-09-30", status: "lost", createdBy: "foreign" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ notes: "new", status: "signed", legalName: "Pavilion Villas", annualPriceCents: 1415000 });
    expect(rows("term_billing_months")).toHaveLength(38);
    expect(rows("term_status_history").at(-1)).toMatchObject({ oldStatus: "signed", newStatus: "signed", changedBy: "actor", note: "Edited after signing: endDate, notes" });
  });
  it("validates date guards in create and PATCH without changing records", async () => {
    const agent = request(app());
    expect((await agent.post(`${base}/contracts`).send({ ...body, term: { ...body.term, startDate: "0205-11-01" } })).status).toBe(400);
    const { termId } = await create(agent), before = structuredClone(tables), oldWrites = writes;
    expect((await agent.patch(`${base}/terms/${termId}`).send({ endDate: "2031-09-30" })).status).toBe(400);
    expect(tables).toEqual(before); expect(writes).toBe(oldWrites);
  });
  it("atomically replaces multi-component payments, scope and full rate snapshots", async () => {
    const agent = request(app()), { termId } = await create(agent);
    expect((await agent.put(`${base}/terms/${termId}/payments`).send({ payments: [payments[1]] })).body.annualPriceCents).toBe(240000);
    expect(rows("term_billing_months")).toHaveLength(7);
    expect((await agent.put(`${base}/terms/${termId}/scope`).send([{ serviceKey: "other:site", included: true, details: { label: "Site work" } }])).status).toBe(200);
    expect(rows("term_scope_lines")[0].serviceKey).toBe("other:site");
    expect((await agent.put(`${base}/terms/${termId}/rates`).send([{ rateKey: "custom", label: "Site rate", line: "landscape", unit: "hour", category: "Labor", priceCents: 5 }])).status).toBe(200);
    expect(rows("term_rates")[0]).toMatchObject({ rateKey: "custom", cardPriceCents: null });
  });
  it("rolls back create and replacement failures", async () => {
    const agent = request(app()); failTable = "term_scope_lines";
    expect((await agent.post(`${base}/contracts`).send(body)).status).toBe(500);
    expect(rows("agreements")).toHaveLength(0); expect(rows("agreement_terms")).toHaveLength(0); expect(rows("term_status_history")).toHaveLength(0);
    failTable = null; const { termId } = await create(agent), before = structuredClone(tables);
    failTable = "agreement_terms";
    expect((await agent.put(`${base}/terms/${termId}/payments`).send([])).status).toBe(500);
    expect(tables).toEqual(before);
  });
  it("returns allowed status moves, preserves old season, dry-runs without writes, and signs renewal with both histories", async () => {
    const agent = request(app()), { termId, agreementId } = await create(agent);
    const invalid = await agent.post(`${base}/terms/${termId}/status`).send({ to: "signed" });
    expect(invalid.status).toBe(409); expect(invalid.body.allowed).toEqual(["sent", "cancelled"]);
    await agent.post(`${base}/terms/${termId}/status`).send({ to: "sent" });
    await agent.post(`${base}/terms/${termId}/status`).send({ to: "signed" });
    const old = structuredClone(rows("agreement_terms")[0]), before = structuredClone(tables), oldWrites = writes;
    const preview = await agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar", dryRun: true });
    expect(preview.status).toBe(200); expect(preview.body.startDate).toBe("2026-10-01"); expect(preview.body.annualPriceCents).toBe(1457500);
    expect(tables).toEqual(before); expect(writes).toBe(oldWrites);
    const committed = await agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    expect(committed.status).toBe(201); const renewal = committed.body.terms.find((t: any) => t.id !== termId);
    expect(rows("agreement_terms").find(t => t.id === termId)).toEqual(old);
    expect((await agent.post(`${base}/contracts/${agreementId}/renew`).send({ roundTo: "dollar" })).status).toBe(409);
    await agent.post(`${base}/terms/${renewal.id}/status`).send({ to: "sent" });
    expect((await agent.post(`${base}/terms/${renewal.id}/status`).send({ to: "signed" })).status).toBe(200);
    expect(rows("agreement_terms").find(t => t.id === termId).status).toBe("renewed");
    expect(rows("term_status_history").filter(h => h.termId === termId).at(-1)).toMatchObject({ newStatus: "renewed", changedBy: "actor", note: "Renewed by 2026–27" });
    expect(rows("term_status_history").filter(h => h.termId === renewal.id)).toHaveLength(3);
  });
  it("serializes concurrent renewals and refuses terminal edits", async () => {
    const agent = request(app()), { termId, agreementId } = await create(agent);
    rows("agreement_terms")[0].status = "active";
    const responses = await Promise.all([1,2].map(() => agent.post(`${base}/contracts/${agreementId}/renew`).send({ roundTo: "twelve" })));
    expect(responses.map(r => r.status).sort()).toEqual([201,409]);
    rows("agreement_terms").find(t => t.id === termId).status = "renewed";
    expect((await agent.patch(`${base}/terms/${termId}`).send({ notes: "X" })).status).toBe(409);
    expect((await agent.put(`${base}/terms/${termId}/payments`).send([])).status).toBe(409);
  });
  it("logs losing a renewal on its source without changing source status", async () => {
    const agent = request(app()), { termId, agreementId } = await create(agent);
    rows("agreement_terms")[0].status = "active";
    const response = await agent.post(`${base}/contracts/${agreementId}/renew`).send({ roundTo: "dollar" });
    const renewal = response.body.terms.find((t: any) => t.id !== termId);
    expect((await agent.post(`${base}/terms/${renewal.id}/status`).send({ to: "lost" })).status).toBe(200);
    expect(rows("term_status_history").at(-1)).toMatchObject({ termId, oldStatus: "active", newStatus: "active", note: "Renewal lost" });
  });
  it("authorizes ownership before storage and versions documents independently without status/history changes", async () => {
    const agent = request(app()), { termId } = await create(agent);
    expect((await agent.post(`${base}/terms/foreign/documents/upload-url`)).status).toBe(404);
    expect(mock.upload).not.toHaveBeenCalled();
    const oldHistory = rows("term_status_history").length;
    const upload = await agent.post(`${base}/terms/${termId}/documents/upload-url`);
    const doc = { uploadURL: upload.body.uploadURL, filename: "signed.pdf", fileSize: 100, mimeType: "application/pdf", kind: "signed" };
    expect((await agent.post(`${base}/terms/${termId}/documents`).send({ ...doc, kind: "review" })).status).toBe(400);
    expect((await agent.post(`${base}/terms/${termId}/documents`).send(doc)).body.version).toBe(1);
    await agent.post(`${base}/terms/${termId}/documents/upload-url`);
    expect((await agent.post(`${base}/terms/${termId}/documents`).send(doc)).body.version).toBe(2);
    await agent.post(`${base}/terms/${termId}/documents/upload-url`);
    expect((await agent.post(`${base}/terms/${termId}/documents`).send({ ...doc, kind: "other" })).body.version).toBe(1);
    expect(rows("term_status_history")).toHaveLength(oldHistory); expect(rows("agreement_terms")[0].status).toBe("draft");
    expect(mock.acl).toHaveBeenCalledWith(doc.uploadURL, { owner: "actor", visibility: "private", aclRules: [{ group: { type: "company_member", id: "company" }, permission: "read" }] });
  });
  it("refuses attaching an object not issued for the term/company", async () => {
    const agent = request(app()), { termId } = await create(agent);
    const response = await agent.post(`${base}/terms/${termId}/documents`).send({ uploadURL: "/objects/foreign", filename: "x", fileSize: 1, mimeType: "text/plain", kind: "other" });
    expect(response.status).toBe(404); expect(mock.file).not.toHaveBeenCalled(); expect(mock.acl).not.toHaveBeenCalled();
  });
  it("creates flat snow, previews its increase, and preserves all metadata on renew", async () => {
    const agent = request(app());
    const created = await agent.post(`${base}/contracts`).send({ ...body, line: "snow",
      term: { ...body.term, snowPricing: "flat_rate", snowFlatPriceCents: 50000, projectContact: "Site contact", snowTriggers: "2 inches" },
      scope: [{ serviceKey: "snow_walks", included: true }],
      payments: [{ component: "Snow", months: [12,1,2,3,4].map(month => ({ month, amountCents: 10000 })) }] });
    expect(created.status).toBe(201);
    const termId = created.body.terms[0].id;
    rows("agreement_terms")[0].status = "active";
    const preview = await agent.post(`${base}/contracts/${created.body.id}/renew`).send({ roundTo: "dollar", increasePct: 3, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ projectContact: "Site contact", snowTriggers: "2 inches", snowFlatPriceCents: 51500,
      annualPriceCents: 51500, snowFlatPrice: { before: 50000, after: 51500 } });
    expect((await agent.patch(`${base}/terms/${termId}`).send({ snowPricing: "time_and_materials", snowFlatPriceCents: null })).status).toBe(400);
    expect((await agent.put(`${base}/terms/${termId}/payments`).send([])).status).toBe(200);
    expect((await agent.patch(`${base}/terms/${termId}`).send({ snowPricing: "time_and_materials", snowFlatPriceCents: null })).body).toMatchObject({ annualPriceCents: null, billingType: "time_and_materials" });
  });
  it("allocates separate successive per-kind document versions under concurrent requests", async () => {
    const agent = request(app()), { termId } = await create(agent);
    mock.upload.mockResolvedValueOnce("https://storage.googleapis.com/private/uploads/one")
      .mockResolvedValueOnce("https://storage.googleapis.com/private/uploads/two");
    const first = await agent.post(`${base}/terms/${termId}/documents/upload-url`);
    const second = await agent.post(`${base}/terms/${termId}/documents/upload-url`);
    const results = await Promise.all([first,second].map(upload => agent.post(`${base}/terms/${termId}/documents`).send({
      uploadURL: upload.body.uploadURL, filename: "signed.pdf", fileSize: 5, mimeType: "application/pdf", kind: "signed",
    })));
    expect(results.map(r => r.status)).toEqual([201,201]);
    expect(results.map(r => r.body.version).sort()).toEqual([1,2]);
    expect(mock.db.transaction).toHaveBeenCalled();
  });
});
