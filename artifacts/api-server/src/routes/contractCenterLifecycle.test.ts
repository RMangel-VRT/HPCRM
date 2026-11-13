import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as companyDay from "../lib/companyDay";
import { getTableName, getTableColumns } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { registerContractCenterRoutes } from "./contractCenter";
import * as rfpContracts from "../lib/rfpContracts";

const mock = vi.hoisted(() => ({ db: {} as any, parent: vi.fn(), upload: vi.fn(), file: vi.fn(), acl: vi.fn(), customer: vi.fn(), pm: vi.fn() }));
vi.mock("../db", () => ({ db: mock.db, inTransaction: (_tx: unknown, fn: () => unknown) => fn() }));
vi.mock("../storage", () => ({ storage: { getCustomerById: mock.customer, getPropertyManagementCompanyById: mock.pm } }));
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
    Object.assign(req, { isAuthenticated: () => true, user: { id: "actor", activeCompanyId: company, accessRole: role, activeRole: role, isSuperAdminBool: superAdmin }, session });
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
  tables = { service_calendar: [], customers: [{ id: "customer", companyId: "company", name: "Pavilion Villas", street: "1 Main", city: "Denver", state: "CO", zip: "80000", propertyManagementCompanyId: null }] };
  sequence = 0; writes = 0; failTable = null; vi.clearAllMocks();
  mock.customer.mockImplementation(async (id: string, companyId: string) => rows("customers").find(c => c.id === id && c.companyId === companyId));
  mock.parent.mockResolvedValue(false); mock.upload.mockResolvedValue("https://storage.googleapis.com/private/uploads/object?signature=test");
  mock.file.mockResolvedValue({}); mock.acl.mockResolvedValue("/objects/uploads/object");
  Object.assign(mock.db, {
    execute: vi.fn(async () => []),
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
afterEach(() => vi.restoreAllMocks());
describe("CC-ATTN serialized attention accounting", () => {
  const today = "2026-11-12";
  function seed(state: string, status: string, startDate: string, endDate: string, extra = {}, companyId = "company") {
    const id = state, customerId = `customer-${id}`;
    rows("customers").push({ id: customerId, companyId, name: `Fixture ${id}`, status: "active",
      parentCustomerId: null, street: "", city: "", state: "", zip: "" });
    rows("agreements").push({ id, companyId, customerId });
    const term = { id: `t-${id}`, agreementId: id, companyId, seasonLabel: state, line: "both", form: "ours",
      status, startDate, endDate, renewedFromTermId: null, createdAt: new Date("2026-01-01"),
      signedAt: null, nonRenewalOn: null, ...extra };
    rows("agreement_terms").push(term);
    return term;
  }
  function population() {
    vi.spyOn(companyDay, "companyToday").mockReturnValue(today);
    seed("new_draft", "draft", "2027-01-01", "2027-12-31");
    seed("closed", "lost", "2025-01-01", "2025-12-31");
    seed("closed_recently", "lost", "2026-01-01", "2026-10-31");
    seed("serving_not_renewing", "signed", "2026-01-01", "2026-12-31", { nonRenewalOn: "2026-11-01" });
    seed("working_unsigned", "sent", "2026-01-01", "2026-12-31");
    seed("renewal_due", "signed", "2026-01-01", "2027-01-31");
    const source = seed("renewal_in_progress", "signed", "2026-01-01", "2026-12-31");
    rows("agreement_terms").push({ ...source, id: "pending", renewedFromTermId: source.id, status: "sent",
      startDate: "2027-01-01", endDate: "2027-12-31" });
    seed("good", "signed", "2026-01-01", "2027-12-31");
    seed("ended_no_decision", "renewed", "2025-01-01", "2026-09-30");
    seed("unclassified", "signed", "2026-01-01", "2027-12-31");
    tables.customers = rows("customers").filter(c => c.id !== "customer-unclassified");
    rows("customers").push({ id: "uncovered", companyId: "company", name: "Uncovered fixture", status: "active", parentCustomerId: null });
    seed("foreign", "signed", "2026-01-01", "2026-12-31", {}, "other");
  }
  it("reconciles every company agreement, all ten states, both lines and separate customer flags with bounded reads", async () => {
    population();
    const response = await request(app()).get(`${base}/attention`).expect(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    const a = response.body;
    expect(a.total).toBe(10);
    expect(Object.keys(a.counts)).toHaveLength(10);
    expect(Object.values(a.counts)).toEqual(Array(10).fill(1));
    expect(Object.values(a.counts).reduce((n: number, count: any) => n + count, 0)).toBe(a.total);
    expect(a.lines.landscape).toMatchObject({ total: 10, actionNeeded: 6 });
    expect(a.lines.snow).toEqual(a.lines.landscape);
    expect(a.flagged.active_no_contract).toBe(1);
    expect(a.items.working_unsigned[0]).toMatchObject({ state: "working_unsigned", stateSince: "2026-01-01",
      allowedActions: ["open", "mark_signed"], actionTermId: "t-working_unsigned" });
    expect(a.items.renewal_due[0].allowedActions).toEqual(["open", "renew", "not_renewing"]);
    expect(a.items.unclassified[0]).toMatchObject({ customerName: "Customer unavailable", allowedActions: ["open"] });
    expect(JSON.stringify(a)).not.toContain("foreign");
    expect(mock.db.select).toHaveBeenCalledTimes(4);
    const list = await request(app()).get(`${base}/contracts`).expect(200);
    expect(list.body).toHaveLength(10);
    const due = list.body.find((row: any) => row.id === "renewal_due");
    for (const key of ["state", "stateSince", "stateReason", "flags", "allowedActions", "actionTermId"])
      expect(due[key]).toEqual(a.items.renewal_due[0][key]);
    const detail = await request(app()).get(`${base}/contracts/renewal_due`).expect(200);
    for (const key of ["state", "stateSince", "stateReason", "flags", "allowedActions", "actionTermId"])
      expect(detail.body[key]).toEqual(a.items.renewal_due[0][key]);
  });
  it("preserves PDF coverage semantics without replacing state and surfaces malformed histories", async () => {
    population();
    rows("term_documents").push({ id: "doc", companyId: "company", termId: "t-good", coversThroughTermId: null });
    const broken = seed("malformed", "signed", "not-a-day", "2027-12-31");
    const list = (await request(app()).get(`${base}/contracts`).expect(200)).body;
    expect(list.find((row: any) => row.id === "good")).toMatchObject({ state: "good", flags: [] });
    expect(list.find((row: any) => row.id === "renewal_due")).toMatchObject({ state: "renewal_due", flags: ["missing_document"] });
    expect(list.find((row: any) => row.id === broken.agreementId)).toMatchObject({ state: "unclassified", allowedActions: ["open"] });
    const a = (await request(app()).get(`${base}/attention`).expect(200)).body;
    expect(a.total).toBe(11); expect(a.counts.unclassified).toBe(2);
  });
  it("keeps attention behind existing tenant and role boundaries", async () => {
    population();
    for (const role of ["field", "field_manager", "crew_supervisor", "shop_manager"])
      await request(app(role)).get(`${base}/attention`).expect(403);
    await request(app()).get(`${base}/attention`).set("X-Company-Id", "other").expect(409);
    const anonymous = express(); registerContractCenterRoutes(anonymous);
    await request(anonymous).get(`${base}/attention`).expect(401);
    const other = (await request(app("office", "other")).get(`${base}/attention`).expect(200)).body;
    expect(other.total).toBe(1);
    expect(other.counts.renewal_due).toBe(1);
    await request(app()).get(`${base}/contracts/foreign`).expect(404);
  });
});
describe("Contract Center lifecycle routes", () => {
  it("keeps a retired rate carried by renewal while changing another rate, with one detailed event", async () => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-06-01");
    tables.rate_card_items = [
      { rateKey: "former_labor", line: "landscape", category: "Labor", label: "Former labor", unit: "hour",
        minimum: "  two hours  ", priceCents: 7000, priceText: "  labor only  ", active: true, companyId: "company" },
      { rateKey: "current_labor", line: "landscape", category: "Labor", label: "Current labor", unit: "hour",
        minimum: null, priceCents: 8000, priceText: null, active: true, companyId: "company" },
      { rateKey: "never_stated", line: "landscape", category: "Labor", label: "Never stated", unit: "hour",
        minimum: null, priceCents: 9000, priceText: null, active: false, companyId: "company" },
    ];
    const agent = request(app());
    const created = await agent.post(`${base}/contracts`).send({ ...body, rates: [
      { rateKey: "former_labor", priceCents: 7500 }, { rateKey: "current_labor", priceCents: 8500 },
    ] });
    expect(created.status).toBe(201);
    const sourceId = created.body.terms[0].id;
    rows("agreement_terms").find(t => t.id === sourceId).status = "signed";
    tables.rate_card_items[0].active = false;
    tables.rate_card_items[0].priceCents = 9900;
    const renewed = await agent.post(`${base}/contracts/${created.body.id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    expect(renewed.status).toBe(201);
    const next = renewed.body.terms.find((t: any) => t.id !== sourceId);
    rows("agreement_terms").find(t => t.id === next.id).status = "signed";
    const oldRates = structuredClone(rows("term_rates").filter(r => r.termId === next.id));
    const eventCount = rows("term_status_history").length;
    const payload = [{ ...next.rates[1], priceCents: 8700 }, next.rates[0]];
    expect((await agent.put(`${base}/terms/${next.id}/rates`).send(payload)).status).toBe(200);
    const saved = rows("term_rates").filter(r => r.termId === next.id);
    expect(saved.map(r => [r.rateKey, r.priceCents, r.priceText, r.minimum, r.sortOrder])).toEqual([
      ["current_labor", 8700, null, null, 0], ["former_labor", 7500, "  labor only  ", "  two hours  ", 1],
    ]);
    expect(rows("term_rates").find(r => r.termId === sourceId && r.rateKey === "former_labor").priceCents).toBe(7500);
    expect(rows("term_status_history")).toHaveLength(eventCount + 1);
    const note = rows("term_status_history").at(-1).note;
    expect(note).toMatch(/^Rates updated:/);
    expect(JSON.parse(note.slice("Rates updated: ".length))).toEqual(expect.arrayContaining([
      expect.objectContaining({ rateKey: "current_labor", reason: "changed",
        fields: expect.arrayContaining([expect.objectContaining({ field: "priceCents", old: 8500, new: 8700 })]) }),
    ]));
    for (const invalid of [
      [...payload, { rateKey: "never_stated" }],
      [payload[0], { ...payload[1], priceCents: 7600 }],
      [payload[0], { ...payload[1], minimum: null }],
      [payload[0], { ...payload[1], priceText: "labor only" }],
      [payload[0], { ...payload[1], line: "general" }],
    ]) expect((await agent.put(`${base}/terms/${next.id}/rates`).send(invalid)).status).toBe(400);
    expect(rows("term_status_history")).toHaveLength(eventCount + 1);
    expect(rows("term_rates").filter(r => r.termId === next.id)).toEqual(saved);
    expect(oldRates[0].priceCents).toBe(7500);
    expect((await agent.put(`${base}/terms/${next.id}/rates`).send([{ rateKey: "current_labor" }])).status).toBe(200);
    expect(rows("term_rates").filter(r => r.termId === next.id).map(r => r.rateKey)).toEqual(["current_labor"]);
    // Removal is explicit; the retired key cannot be reintroduced afterward.
    expect((await agent.put(`${base}/terms/${next.id}/rates`).send(payload)).status).toBe(400);
  });
  it("stores the development three-rate example, renews exact prices, replaces and clears with one detailed event per PUT", async () => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-06-01");
    tables.rate_card_items = [
      { rateKey: "rate_general_labor", line: "landscape", category: "Labor", label: "General labor",
        unit: "hour", minimum: "1 hour", priceCents: 7000, priceText: null, active: true, companyId: "company" },
      { rateKey: "rate_irrigation_labor", line: "irrigation", category: "Labor", label: "Irrigation labor",
        unit: "hour", minimum: null, priceCents: 8000, priceText: null, active: true, companyId: "company" },
      { rateKey: "rate_skid_loader", line: "landscape", category: "Equipment", label: "Skid loader",
        unit: "hour", minimum: null, priceCents: 24500, priceText: null, active: true, companyId: "company" },
      { rateKey: "retired", line: "landscape", category: "Labor", label: "Retired",
        unit: "hour", minimum: null, priceCents: 10, priceText: null, active: false, companyId: "company" },
    ];
    const supplied = [{ rateKey: "rate_general_labor", priceCents: 7500 },
      { rateKey: "rate_irrigation_labor", priceCents: 8500 },
      { rateKey: "custom_mobilization", label: "Mobilization", unit: "visit", category: "Custom", line: "general", priceCents: 3995 }];
    const agent = request(app());
    const response = await agent.post(`${base}/contracts`).send({ ...body, rates: supplied });
    expect(response.status).toBe(201);
    const agreementId = response.body.id, termId = response.body.terms[0].id;
    expect(rows("term_rates").map(r => [r.rateKey, r.priceCents, r.sortOrder])).toEqual(supplied.map((r, i) => [r.rateKey, r.priceCents, i]));
    rows("agreement_terms")[0].status = "signed";
    const before = structuredClone(rows("term_rates"));
    tables.rate_card_items[0].priceCents = 9900;
    const renewal = await agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    expect(renewal.status).toBe(201);
    const next = renewal.body.terms.find((t: any) => t.id !== termId);
    expect(next.rates.map((r: any) => [r.rateKey, r.priceCents])).toEqual(supplied.map(r => [r.rateKey, r.priceCents]));
    expect(rows("term_rates").filter(r => r.termId === termId)).toEqual(before);
    const priorHistory = rows("term_status_history").length;
    const replace = await agent.put(`${base}/terms/${next.id}/rates`).send([
      { ...supplied[2], minimum: "One visit" }, supplied[1], { rateKey: "rate_skid_loader" },
    ]);
    expect(replace.status).toBe(200);
    expect(rows("term_status_history")).toHaveLength(priorHistory + 1);
    const event = rows("term_status_history").at(-1);
    expect(event.note).toMatch(/^Rates updated:/);
    const changes = JSON.parse(event.note.slice("Rates updated: ".length));
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ rateKey: "rate_general_labor", reason: "removed" }),
      expect.objectContaining({ rateKey: "rate_skid_loader", reason: "added" }),
      expect.objectContaining({ rateKey: "custom_mobilization", reason: "changed",
        fields: expect.arrayContaining([expect.objectContaining({ field: "minimum", new: "One visit" })]) }),
    ]));
    rows("agreement_terms").find(t => t.id === next.id).status = "signed";
    const count = rows("term_status_history").length;
    expect((await agent.put(`${base}/terms/${next.id}/rates`).send([])).status).toBe(200);
    expect(rows("term_rates").filter(r => r.termId === next.id)).toEqual([]);
    expect(rows("term_status_history")).toHaveLength(count + 1);
    expect((await agent.put(`${base}/terms/${next.id}/rates`).send([{ rateKey: "retired", label: "X", unit: "hour", category: "Custom", line: "general" }])).status).toBe(400);
    expect(rows("term_status_history")).toHaveLength(count + 1);
  });
  it("active customers is scoped, returns customer-based counts, inherits only same-company direct parent and uses exactly three reads", async () => {
    tables.customers = [
      { id: "parent", companyId: "company", name: "Parent", status: "active", parentCustomerId: null },
      { id: "branch", companyId: "company", name: "Branch", status: "inactive", parentCustomerId: "parent" },
      { id: "orphan", companyId: "company", name: "Orphan", status: "active", parentCustomerId: "foreign" },
      { id: "foreign", companyId: "other", name: "Hidden", status: "active" },
    ];
    tables.agreements = [{ id: "a", companyId: "company", customerId: "parent" },
      { id: "f", companyId: "other", customerId: "foreign" }];
    tables.agreement_terms = [{ id: "s", companyId: "company", agreementId: "a", line: "both", status: "signed",
      startDate: "2026-01-01", endDate: "2027-12-31", seasonLabel: "2026–27", managingAgentName: "Agent" },
    { id: "foreign-term", companyId: "other", agreementId: "f", line: "both", status: "signed", startDate: "2026-01-01", endDate: "2027-12-31" }];
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-11-03");
    const response = await request(app()).get(`${base}/active-customers`);
    expect(response.status).toBe(200);
    expect(mock.db.select).toHaveBeenCalledTimes(3);
    expect(response.body.asOf).toBe("2026-11-03");
    expect(response.body.rows.map((r: any) => r.customerName)).toEqual(["Branch", "Orphan", "Parent"]);
    expect(response.body.rows[0]).toMatchObject({ viaParent: true, parentName: "Parent",
      managingAgentName: "Agent", landscape: { seasonId: "s", agreementId: "a" }, flags: ["mismatch"] });
    expect(response.body.rows[1]).toMatchObject({ noContract: true, responsible: false, flags: [] });
    expect(response.body.counts).toEqual({ responsible: 2, landscape: 2, snow: 2, mismatch: 1, noContract: 1,
      ending_soon: 0, should_fall_off: 0, lapsed: 0, starting_soon: 0 });
  });
  it.each(["admin", "office"])("active customers allows %s", async role => {
    expect((await request(app(role)).get(`${base}/active-customers`)).status).toBe(200);
    expect(mock.db.select).toHaveBeenCalledTimes(3);
  });
  it.each(["field", "field_manager", "crew_supervisor", "shop_manager", "mapping", "chemical_manager", "landscape_supervisor", "irrigation_manager"])("active customers denies %s without reads", async role => {
    expect((await request(app(role)).get(`${base}/active-customers`)).status).toBe(403);
    expect(mock.db.select).not.toHaveBeenCalled();
  });
  it("active customers denies missing auth/company and permits super-admin", async () => {
    const anonymous = express();
    registerContractCenterRoutes(anonymous);
    expect((await request(anonymous).get(`${base}/active-customers`)).status).toBe(401);
    expect((await request(app("admin", "")).get(`${base}/active-customers`)).status).toBe(403);
    expect((await request(app("mapping", "company", true)).get(`${base}/active-customers`)).status).toBe(200);
  });
  it.each(["asOf=2026-02-30", "asOf=", "asOf=2026-11-03&asOf=2026-11-04", "asOf[x]=2026-11-03",
    "asOf=2028-01-01", "asOf=2025-01-01"])("active customers rejects invalid query %s before querying", async query => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-11-03");
    // Express's default simple parser leaves bracketed names literal; use extended
    // here as well to exercise non-scalar input independently of parser settings.
    const instance = app(); instance.set("query parser", "extended");
    expect((await request(instance).get(`${base}/active-customers?${query}`)).status).toBe(400);
    expect(mock.db.select).not.toHaveBeenCalled();
  });
  it("active customers accepts +/-400, rejects +/-401, and never writes", async () => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-11-03");
    for (const offset of [-400, 400, -401, 401]) {
      const response = await request(app()).get(`${base}/active-customers?asOf=${companyDay.addCalendarDays("2026-11-03", offset)}`);
      expect(response.status).toBe(Math.abs(offset) === 400 ? 200 : 400);
    }
    expect(writes).toBe(0);
  });
  it("active customers reports read failures using handle error response", async () => {
    mock.db.select.mockImplementationOnce(() => { throw new Error("read failed"); });
    const response = await request(app()).get(`${base}/active-customers`);
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Contract Center request failed");
  });
  it("active customers rejects an initiating-company mismatch before reads", async () => {
    const response = await request(app()).get(`${base}/active-customers`).set("X-Company-Id", "other");
    expect(response.status).toBe(409);
    expect(mock.db.select).not.toHaveBeenCalled();
  });
  it("active customers rejects bracketed/repeated dates with Express's simple parser too", async () => {
    for (const query of ["asOf[x]=2026-11-03", "asOf[]=2026-11-03", "asOf=2026-11-03&asOf=2026-11-03"]) {
      expect((await request(app()).get(`${base}/active-customers?${query}`)).status).toBe(400);
    }
    expect(mock.db.select).not.toHaveBeenCalled();
  });
  it("sets/clears coverage with attributable history and derives bounded covered rows", async () => {
    const agent = request(app()), { termId, agreementId } = await create(agent);
    const source = rows("agreement_terms")[0];
    rows("agreement_terms").push(...[
      { id: "middle", startDate: "2026-10-01", endDate: "2027-09-30", seasonLabel: "2026–27" },
      { id: "last", startDate: "2027-10-01", endDate: "2028-09-30", seasonLabel: "2027–28" },
      { id: "beyond", startDate: "2028-10-01", endDate: "2029-09-30", seasonLabel: "2028–29" },
    ].map(t => ({ ...source, ...t })));
    rows("term_documents").push({ id: "doc", companyId: "company", termId, kind: "signed", filename: "signed.pdf", createdAt: new Date(), version: 1 },
      { id: "own", companyId: "company", termId, kind: "other", filename: "own.docx", createdAt: new Date(), version: 1 });
    expect((await agent.patch(`${base}/documents/doc/coverage`).send({ coversThroughTermId: "last" })).status).toBe(200);
    const detail = (await agent.get(`${base}/contracts/${agreementId}`)).body;
    for (const id of ["middle", "last"]) {
      const term = detail.terms.find((t: any) => t.id === id);
      expect(term.documents).toEqual([]);
      expect(term.coveredBy).toMatchObject([{ id: "doc", fromTermId: termId, fromSeasonLabel: source.seasonLabel }]);
      expect(term).not.toHaveProperty("signedDocumentTermId");
    }
    expect(detail.terms.find((t: any) => t.id === "beyond").coveredBy).toEqual([]);
    expect(detail.terms[0].coveredBy).toEqual([]);
    expect(rows("term_status_history").at(-1)).toMatchObject({ termId, changedBy: "actor",
      note: "Document signed.pdf now also covers 2025–26–2027–28" });
    expect((await agent.patch(`${base}/documents/doc/coverage`).send({ coversThroughTermId: null })).body.coversThroughTermId).toBeNull();
    expect(rows("term_status_history").at(-1).note).toBe("Document signed.pdf covers this season only");
    expect((await agent.get(`${base}/contracts/${agreementId}`)).body.terms.every((t: any) => !t.coveredBy.length)).toBe(true);
  });
  it("rejects missing, foreign, self, equal-date and earlier coverage targets and strict payload violations", async () => {
    const agent = request(app()), { termId } = await create(agent);
    const source = rows("agreement_terms")[0];
    rows("term_documents").push({ id: "doc", companyId: "company", termId, filename: "signed.pdf" });
    rows("agreement_terms").push(
      { ...source, id: "equal" }, { ...source, id: "earlier", startDate: "2024-01-01" },
      { ...source, id: "other-agreement", agreementId: "foreign", startDate: "2030-01-01" },
      { ...source, id: "other-company", companyId: "foreign", startDate: "2030-01-01" });
    for (const target of [termId, "equal", "earlier", "other-agreement", "other-company", "missing"])
      expect((await agent.patch(`${base}/documents/doc/coverage`).send({ coversThroughTermId: target })).status).toBe(400);
    for (const payload of [{}, { coversThroughTermId: "" }, { coversThroughTermId: 1 }, { coversThroughTermId: null, termId: "injected" }])
      expect((await agent.patch(`${base}/documents/doc/coverage`).send(payload)).status).toBe(400);
    expect((await request(app("office", "foreign")).patch(`${base}/documents/doc/coverage`).send({ coversThroughTermId: null })).status).toBe(404);
    expect((await agent.patch(`${base}/documents/missing/coverage`).send({ coversThroughTermId: null })).status).toBe(404);
    expect(rows("term_status_history")).toHaveLength(1);
  });
  it.each(["draft", "sent", "signed", "active", "renewed", "lost", "cancelled"].flatMap(status =>
    ["2026-09-29", "2026-09-30", "2026-10-01"].map(today => [status, today] as const)))(
    "agrees between detail and every field endpoint for %s on %s", async (status, today) => {
      vi.spyOn(companyDay, "companyToday").mockReturnValue(today);
      const agent = request(app()), { termId, agreementId } = await create(agent);
      rows("agreement_terms")[0].status = status;
      const editable = ["draft", "sent"].includes(status) || (["signed", "active", "renewed"].includes(status) && today <= "2026-09-30");
      const detail = (await agent.get(`${base}/contracts/${agreementId}`)).body;
      expect(detail.terms[0].editable).toBe(editable);
      expect((await agent.patch(`${base}/terms/${termId}`).send({ notes: "updated" })).status).toBe(editable ? 200 : 409);
      for (const [part, input] of [["scope", body.scope], ["rates", []], ["payments", payments]] as const)
        expect((await agent.put(`${base}/terms/${termId}/${part}`).send({ [part]: input })).status).toBe(editable ? 200 : 409);
      if (editable && ["signed", "active", "renewed"].includes(status))
        expect(rows("term_status_history").slice(1)).toEqual(expect.arrayContaining(
           ["notes", "scope", "payments"].map(note => expect.objectContaining({ changedBy: "actor", note: `Edited after signing: ${note}` }))));
    });
  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor"])("denies %s every lifecycle endpoint", async role => {
    const agent = request(app(role));
    for (const [method, path] of [
      ["get", "/contracts"], ["get", "/contracts/id"], ["get", "/contracts/by-legacy/id"],
      ["post", "/contracts"], ["patch", "/terms/id"], ["put", "/terms/id/scope"],
      ["put", "/terms/id/rates"], ["put", "/terms/id/payments"], ["post", "/terms/id/status"],
      ["post", "/contracts/id/renew"], ["post", "/terms/id/documents/upload-url"], ["post", "/terms/id/documents"], ["patch", "/documents/id/coverage"],
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
  it("preserves the bid-linked list short circuit and its distinct response shape", async () => {
    const linked = [{ bidTicketId: "rfp", agreementId: "agreement", termId: "season", customerName: "Customer",
      line: "both", form: "ours", seasonLabel: "2026", displayStatus: "draft",
      annualPriceCents: null, snowPricing: "time_and_materials" }];
    const spy = vi.spyOn(rfpContracts, "loadLinkedContracts").mockResolvedValueOnce(linked as Awaited<ReturnType<typeof rfpContracts.loadLinkedContracts>>);
    try {
      const response = await request(app()).get(`${base}/contracts?bidTicketId=rfp&customerId=missing&line=snow&q=no-match`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(linked);
      expect(spy).toHaveBeenCalledWith(mock.db, "company", ["rfp"]);
      expect(writes).toBe(0);
    } finally { spy.mockRestore(); }
  });
  it("allows parent customers without invoking operational guards", async () => {
    tables.customers[0].isParent = "true";
    const response = await request(app()).post(`${base}/contracts`).send(body);
    expect(response.status).toBe(201); expect(mock.parent).not.toHaveBeenCalled();
  });
  it("lists own contracts by default and direct-parent contracts only on opt-in, with tenant-safe counts/payments", async () => {
    const agent = request(app());
    await create(agent);
    tables.customers.push({ ...tables.customers[0], id: "parent", name: "Bank", isParent: "true" },
      { ...tables.customers[0], id: "sibling", parentCustomerId: "parent" },
      { ...tables.customers[0], id: "foreign-child", companyId: "other", parentCustomerId: "parent" },
      { ...tables.customers[0], id: "foreign-parent", companyId: "other" });
    Object.assign(tables.customers[0], { parentCustomerId: "parent", customerNumber: "FB01" });
    const parent = await agent.post(`${base}/contracts`).send({ ...body, customerId: "parent" });
    expect(parent.status).toBe(201);
    expect((await agent.get(`${base}/contracts?customerId=customer`)).body).toHaveLength(1);
    const included = await agent.get(`${base}/contracts?customerId=customer&includeParent=true`);
    expect(included.status).toBe(200); expect(included.body).toHaveLength(2);
    expect(included.body.find((c: any) => c.viaParent)).toMatchObject({
      id: parent.body.id, customerId: "parent", customerName: "Bank", locationCount: 2,
      branch: { billingCode: "FB01" }, payments: expect.arrayContaining([{ component: "Fertilization", months: expect.any(Array) }]),
    });
    expect((await agent.get(`${base}/contracts?customerId=parent&includeParent=true`)).body).toMatchObject([{ id: parent.body.id, locationCount: 2 }]);
    expect((await agent.get(`${base}/contracts?customerId=foreign-child&includeParent=true`)).status).toBe(404);
    tables.customers[0].parentCustomerId = "foreign-parent";
    expect((await agent.get(`${base}/contracts?customerId=customer&includeParent=true`)).body).toHaveLength(1);
    expect((await agent.get(`${base}/contracts?includeParent=invalid`)).status).toBe(400);
  });
  it.each([{}, { status: "signed" }, { id: "injected", companyId: "other", annualPriceCents: 1 }])("rejects empty/server-owned PATCH %j", async update => {
    expect((await request(app()).patch(`${base}/terms/id`).send(update)).status).toBe(400);
    expect(writes).toBe(0);
  });
  it("preserves omitted fields, ignores status injection, re-expands date edits and audits signed edits", async () => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-06-01");
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
  it("marks reviewed without clearing the review note and exposes server-owned edit eligibility", async () => {
    const agent = request(app()), { termId, agreementId } = await create(agent);
    Object.assign(rows("agreement_terms")[0], { needsReview: true, reviewNote: "Check copied scope" });
    const before = await agent.get(`${base}/contracts/${agreementId}`);
    expect(before.body).toMatchObject({ currentTermId: termId, renewalDraftId: null });
    expect(before.body.terms[0]).toMatchObject({ editable: true, allowedMoves: ["sent", "cancelled"] });
    const reviewed = await agent.patch(`${base}/terms/${termId}`).send({ needsReview: false });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body).toMatchObject({ needsReview: false, reviewNote: "Check copied scope" });
    rows("agreement_terms")[0].status = "cancelled";
    const after = await agent.get(`${base}/contracts/${agreementId}`);
    expect(after.body.terms[0]).toMatchObject({ editable: false, allowedMoves: [] });
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
    expect((await agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar" })).status).toBe(409);
    await agent.post(`${base}/terms/${renewal.id}/status`).send({ to: "sent" });
    expect((await agent.post(`${base}/terms/${renewal.id}/status`).send({ to: "signed" })).status).toBe(200);
    expect(rows("agreement_terms").find(t => t.id === termId).status).toBe("renewed");
    expect(rows("term_status_history").filter(h => h.termId === termId).at(-1)).toMatchObject({ newStatus: "renewed", changedBy: "actor", note: "Renewed by 2026–27" });
    expect(rows("term_status_history").filter(h => h.termId === renewal.id)).toHaveLength(3);
  });
  it("serializes concurrent renewals and refuses terminal edits", async () => {
    const agent = request(app()), { termId, agreementId } = await create(agent);
    rows("agreement_terms")[0].status = "active";
    const responses = await Promise.all([1,2].map(() => agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "twelve" })));
    expect(responses.map(r => r.status).sort()).toEqual([201,409]);
    rows("agreement_terms").find(t => t.id === termId).status = "renewed";
    expect((await agent.patch(`${base}/terms/${termId}`).send({ notes: "X" })).status).toBe(409);
    expect((await agent.put(`${base}/terms/${termId}/payments`).send([])).status).toBe(409);
  });
  it("logs losing a renewal on its source without changing source status", async () => {
    const agent = request(app()), { termId, agreementId } = await create(agent);
    rows("agreement_terms")[0].status = "active";
    const response = await agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar" });
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
  it.each(["prospect", "active", "inactive"])("adds prospect-only activation metadata to signed documents for %s", async status => {
    rows("customers")[0].status = status;
    rows("customers")[0].billingEmails = [];
    const agent = request(app()), { termId } = await create(agent);
    for (const kind of ["signed", "their_form", "other"]) {
      const upload = await agent.post(`${base}/terms/${termId}/documents/upload-url`);
      const response = await agent.post(`${base}/terms/${termId}/documents`).send({
        uploadURL: upload.body.uploadURL, kind, filename: "test.pdf", fileSize: 1, mimeType: "application/pdf",
      });
      expect(response.status).toBe(201);
      expect(response.body.version).toBe(1);
      if (status === "prospect" && kind === "signed") {
        expect(response.body.customerActivation).toMatchObject({ customerId: "customer", status: "prospect", missingFields: ["billingName", "billingEmails"] });
        expect(mock.customer).toHaveBeenCalledWith("customer", "company");
      } else expect(response.body.customerActivation).toBeUndefined();
    }
  });
  it("retains a committed signed upload and consumes its ownership binding when advisory loading fails", async () => {
    const agent = request(app()), { termId } = await create(agent);
    mock.customer.mockRejectedValueOnce(new Error("advisory unavailable"));
    const upload = await agent.post(`${base}/terms/${termId}/documents/upload-url`);
    const doc = { uploadURL: upload.body.uploadURL, kind: "signed", filename: "test.pdf", fileSize: 1, mimeType: "application/pdf" };
    const response = await agent.post(`${base}/terms/${termId}/documents`).send(doc);
    expect(response.status).toBe(201); expect(response.body.customerActivation).toBeUndefined();
    expect(rows("term_documents")).toHaveLength(1);
    expect((await agent.post(`${base}/terms/${termId}/documents`).send(doc)).status).toBe(404);
  });
  it("refuses attaching an object not issued for the term/company", async () => {
    const agent = request(app()), { termId } = await create(agent);
    const response = await agent.post(`${base}/terms/${termId}/documents`).send({ uploadURL: "/objects/foreign", filename: "x", fileSize: 1, mimeType: "text/plain", kind: "other" });
    expect(response.status).toBe(404); expect(mock.file).not.toHaveBeenCalled(); expect(mock.acl).not.toHaveBeenCalled();
  });
  it("creates flat snow, previews its increase, and preserves all metadata on renew", async () => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-06-01");
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
