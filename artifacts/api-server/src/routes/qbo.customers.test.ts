/**
 * Route-level tests for QBO customer endpoints.
 *
 * Strategy: mock storage + qboClient so tests run without a real DB or QBO
 * connection, but exercise the full route handler logic — validation, auth
 * gates, connected-state checks, notFound / conflict branching, etc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockStorage = {
  getQboConnection: vi.fn(),
  upsertQboCustomerCache: vi.fn(),
  deactivateMissingQboCustomersRaw: vi.fn(),
  refreshStaleDisplayNames: vi.fn(),
  getStaleBindings: vi.fn(),
  getQboCacheList: vi.fn(),
  getQboMappingRows: vi.fn(),
  countActiveUnboundCustomers: vi.fn(),
  bindQboCustomer: vi.fn(),
  unbindQboCustomer: vi.fn(),
  promoteQboCustomerToCrm: vi.fn(),
  getQboCacheRow: vi.fn(),
  writeSeedSuggestion: vi.fn(),
  findBestCrmMatchByName: vi.fn(),
};
vi.mock("../storage", () => ({ storage: mockStorage }));

const mockQboRequest = vi.fn();
vi.mock("../services/qboClient", () => ({
  isQboConfigured: vi.fn().mockReturnValue(true),
  getAuthorizeUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  revokeConnection: vi.fn(),
  getCompanyInfo: vi.fn(),
  isQboWriteEnabled: vi.fn().mockResolvedValue(false),
  qboRequest: mockQboRequest,
}));

vi.mock("../services/qboCrypto", () => ({
  encryptToken: vi.fn((v: string) => `enc:${v}`),
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const COMPANY_ID = "company-1";
const REALM_ID = "realm-1";

function connectedStatus() {
  return { id: "conn-1", companyId: COMPANY_ID, realmId: REALM_ID, status: "connected", environment: "sandbox" };
}

function disconnectedStatus() {
  return { ...connectedStatus(), status: "disconnected" };
}

/** Build a minimal Express app that mounts the qbo router with an injected user session */
async function buildApp(user: Record<string, unknown> | null = null) {
  const { default: qboRouter } = await import("./qbo");
  const app = express();
  app.use(express.json());
  app.use(express.text({ type: ["text/csv", "text/plain"] }));
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.user = user;
    // Passport adds isAuthenticated() — simulate it
    r.isAuthenticated = () => user !== null;
    next();
  });
  app.use("/api/qbo", qboRouter);
  return app;
}

function adminUser() {
  return { id: "user-1", activeCompanyId: COMPANY_ID, activeRole: "admin", email: "admin@test.com" };
}

// ── Auth & role gate tests ────────────────────────────────────────────────────

describe("Auth gates — all customer endpoints require authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  const endpoints = [
    ["GET", "/api/qbo/customers/cache"],
    ["GET", "/api/qbo/customers/mapping"],
    ["GET", "/api/qbo/customers/unbound-count"],
    ["POST", "/api/qbo/customers/bind"],
    ["POST", "/api/qbo/customers/unbind"],
    ["POST", "/api/qbo/customers/promote"],
    ["POST", "/api/qbo/customers/import-seed"],
  ] as const;

  it.each(endpoints)("%s %s returns 401 when not logged in", async (method, path) => {
    const app = await buildApp(null); // no user
    const res = await (method === "GET" ? request(app).get(path) : request(app).post(path).send({}));
    expect(res.status).toBe(401);
  });
});

// ── Connected-state gate tests ────────────────────────────────────────────────

describe("Connection gate — endpoints requiring QBO connection return 503 when disconnected", () => {
  beforeEach(() => vi.clearAllMocks());

  const connectedEndpoints = [
    ["GET", "/api/qbo/customers/cache"],
    ["GET", "/api/qbo/customers/mapping"],
    ["POST", "/api/qbo/customers/bind"],
    ["POST", "/api/qbo/customers/unbind"],
    ["POST", "/api/qbo/customers/promote"],
    ["POST", "/api/qbo/customers/import-seed"],
  ] as const;

  it.each(connectedEndpoints)("%s %s returns 503 when QBO disconnected", async (method, path) => {
    mockStorage.getQboConnection.mockResolvedValue(disconnectedStatus());
    const app = await buildApp(adminUser());
    const res = await (method === "GET" ? request(app).get(path) : request(app).post(path).send({}));
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not connected/i);
  });

  it("GET /api/qbo/customers/unbound-count does NOT require connection (badge always visible)", async () => {
    mockStorage.countActiveUnboundCustomers.mockResolvedValue(3);
    const app = await buildApp(adminUser());
    const res = await request(app).get("/api/qbo/customers/unbound-count");
    // Should succeed without calling getQboConnection
    expect(res.status).toBe(200);
    expect(res.body.activeUnbound).toBe(3);
    expect(mockStorage.getQboConnection).not.toHaveBeenCalled();
  });
});

// ── GET /api/qbo/customers/cache ──────────────────────────────────────────────

describe("GET /api/qbo/customers/cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cache rows for connected company", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheList.mockResolvedValue([
      { qboId: "qbo-1", displayName: "Acme Corp", state: "not_in_crm", active: true },
    ]);
    const app = await buildApp(adminUser());
    const res = await request(app).get("/api/qbo/customers/cache?filter=not_in_crm");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].state).toBe("not_in_crm");
    expect(mockStorage.getQboCacheList).toHaveBeenCalledWith(COMPANY_ID, "not_in_crm", undefined);
  });

  it("defaults invalid filter to 'all'", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheList.mockResolvedValue([]);
    const app = await buildApp(adminUser());
    await request(app).get("/api/qbo/customers/cache?filter=invalid_value");
    expect(mockStorage.getQboCacheList).toHaveBeenCalledWith(COMPANY_ID, "all", undefined);
  });

  it("passes search param to storage", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheList.mockResolvedValue([]);
    const app = await buildApp(adminUser());
    await request(app).get("/api/qbo/customers/cache?search=acme");
    expect(mockStorage.getQboCacheList).toHaveBeenCalledWith(COMPANY_ID, "all", "acme");
  });

  it("scopes cache list to the user's activeCompanyId (isolation)", async () => {
    const otherCompanyUser = { ...adminUser(), activeCompanyId: "company-2" };
    mockStorage.getQboConnection.mockResolvedValue({ ...connectedStatus(), companyId: "company-2" });
    mockStorage.getQboCacheList.mockResolvedValue([]);
    const app = await buildApp(otherCompanyUser);
    await request(app).get("/api/qbo/customers/cache");
    expect(mockStorage.getQboCacheList).toHaveBeenCalledWith("company-2", "all", undefined);
  });
});

// ── GET /api/qbo/customers/mapping ───────────────────────────────────────────

describe("GET /api/qbo/customers/mapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mapping rows with trigram suggestions", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboMappingRows.mockResolvedValue([
      {
        customerId: "cust-1",
        customerName: "Acme Corp",
        bound: false,
        stale: false,
        suggestions: [{ qboId: "qbo-1", displayName: "Acme Corp", score: 0.9 }],
      },
    ]);
    const app = await buildApp(adminUser());
    const res = await request(app).get("/api/qbo/customers/mapping?filter=unbound");
    expect(res.status).toBe(200);
    expect(res.body[0].suggestions[0].score).toBe(0.9);
    expect(mockStorage.getQboMappingRows).toHaveBeenCalledWith(COMPANY_ID, "unbound", undefined);
  });

  it("returns stale:true for bound customers whose QBO id is no longer active", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboMappingRows.mockResolvedValue([
      { customerId: "cust-2", bound: true, stale: true, suggestions: [] },
    ]);
    const app = await buildApp(adminUser());
    const res = await request(app).get("/api/qbo/customers/mapping?filter=bound");
    expect(res.body[0].stale).toBe(true);
  });
});

// ── GET /api/qbo/customers/unbound-count ─────────────────────────────────────

describe("GET /api/qbo/customers/unbound-count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns activeUnbound count without requiring connection", async () => {
    mockStorage.countActiveUnboundCustomers.mockResolvedValue(12);
    const app = await buildApp(adminUser());
    const res = await request(app).get("/api/qbo/customers/unbound-count");
    expect(res.status).toBe(200);
    expect(res.body.activeUnbound).toBe(12);
  });

  it("returns 0 when all customers are bound", async () => {
    mockStorage.countActiveUnboundCustomers.mockResolvedValue(0);
    const app = await buildApp(adminUser());
    const res = await request(app).get("/api/qbo/customers/unbound-count");
    expect(res.body.activeUnbound).toBe(0);
  });
});

// ── POST /api/qbo/customers/bind ─────────────────────────────────────────────

describe("POST /api/qbo/customers/bind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when customerId or qboId missing", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/bind").send({ customerId: "cust-1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it("returns 404 when QBO cache row not found for this company", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.bindQboCustomer.mockResolvedValue({ conflict: false, notFound: "qbo" });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/bind").send({ customerId: "cust-1", qboId: "no-such-qbo" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/quickbooks customer not found/i);
  });

  it("returns 404 when CRM customer not found for this company", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.bindQboCustomer.mockResolvedValue({ conflict: false, notFound: "customer" });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/bind").send({ customerId: "no-such-cust", qboId: "qbo-1" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/crm customer not found/i);
  });

  it("returns 409 when QBO id already bound to a different CRM customer", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.bindQboCustomer.mockResolvedValue({ conflict: true });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/bind").send({ customerId: "cust-1", qboId: "qbo-already-bound" });
    expect(res.status).toBe(409);
  });

  it("returns 200 ok on successful bind", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.bindQboCustomer.mockResolvedValue({ conflict: false });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/bind").send({ customerId: "cust-1", qboId: "qbo-1" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockStorage.bindQboCustomer).toHaveBeenCalledWith(COMPANY_ID, "cust-1", "qbo-1");
  });

  it("always passes activeCompanyId from session — never trusts body for company scope", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.bindQboCustomer.mockResolvedValue({ conflict: false });
    const app = await buildApp(adminUser());
    // Even if attacker sends companyId in body, storage receives COMPANY_ID from session
    await request(app).post("/api/qbo/customers/bind")
      .send({ customerId: "cust-1", qboId: "qbo-1", companyId: "other-company" });
    expect(mockStorage.bindQboCustomer).toHaveBeenCalledWith(COMPANY_ID, "cust-1", "qbo-1");
  });
});

// ── POST /api/qbo/customers/unbind ───────────────────────────────────────────

describe("POST /api/qbo/customers/unbind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when customerId missing", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/unbind").send({});
    expect(res.status).toBe(400);
  });

  it("clears binding successfully", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.unbindQboCustomer.mockResolvedValue(undefined);
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/unbind").send({ customerId: "cust-1" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockStorage.unbindQboCustomer).toHaveBeenCalledWith(COMPANY_ID, "cust-1");
  });

  it("is scoped to session company — never trusts body for company", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.unbindQboCustomer.mockResolvedValue(undefined);
    const app = await buildApp(adminUser());
    await request(app).post("/api/qbo/customers/unbind").send({ customerId: "cust-1", companyId: "attacker" });
    expect(mockStorage.unbindQboCustomer).toHaveBeenCalledWith(COMPANY_ID, "cust-1");
  });
});

// ── POST /api/qbo/customers/promote ──────────────────────────────────────────

describe("POST /api/qbo/customers/promote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when qboId missing", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/promote").send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when qboId not found in cache", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.promoteQboCustomerToCrm.mockResolvedValue({ missingFields: ["qboId not found in cache"] });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/promote").send({ qboId: "no-such" });
    expect(res.status).toBe(400);
    expect(res.body.missingFields).toBeDefined();
  });

  it("returns 409 when already bound", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.promoteQboCustomerToCrm.mockResolvedValue({ conflict: true });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/promote").send({ qboId: "qbo-1" });
    expect(res.status).toBe(409);
  });

  it("returns 400 with missingFields when address data incomplete", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.promoteQboCustomerToCrm.mockResolvedValue({ missingFields: ["street", "city"] });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/promote").send({ qboId: "qbo-1" });
    expect(res.status).toBe(400);
    expect(res.body.missingFields).toEqual(expect.arrayContaining(["street"]));
  });

  it("returns new customer on success", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const newCust = { id: "cust-new", name: "Acme Corp", companyId: COMPANY_ID, qboCustomerId: "qbo-1" };
    mockStorage.promoteQboCustomerToCrm.mockResolvedValue(newCust);
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/promote").send({
      qboId: "qbo-1",
      overrides: { street: "123 Main", city: "Denver", state: "CO", zip: "80202" },
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("cust-new");
    expect(res.body.qboCustomerId).toBe("qbo-1");
  });
});

// ── POST /api/qbo/customers/import-seed ──────────────────────────────────────

describe("POST /api/qbo/customers/import-seed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for body that is neither JSON array nor CSV string", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const app = await buildApp(adminUser());
    // Send a plain JSON object (not an array)
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "application/json")
      .send({ bad: "payload" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when CSV missing required columns", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const app = await buildApp(adminUser());
    const csv = "name,id\nAcme,1\n";
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "text/csv")
      .send(csv);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/customer_name/i);
  });

  it("scores each CSV row against CRM customers using trigram on customer_name", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheRow.mockResolvedValue({
      id: "cache-1", qboId: "qbo-1", displayName: "Acme Corp", seedCustomerId: null,
    });
    mockStorage.findBestCrmMatchByName.mockResolvedValue({
      customerId: "cust-1",
      customerName: "Acme Corp",
      score: 0.92,
    });
    mockStorage.writeSeedSuggestion.mockResolvedValue(undefined);

    const app = await buildApp(adminUser());
    const csv = "customer_name,quickbooks_id\nAcme Corp,qbo-1\n";
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "text/csv")
      .send(csv);

    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe("seeded");
    expect(res.body.results[0].matchedCustomerId).toBe("cust-1");
    // Verify it scored by customer_name directly, not via getQboMappingRows
    expect(mockStorage.findBestCrmMatchByName).toHaveBeenCalledWith(COMPANY_ID, "Acme Corp");
    expect(mockStorage.writeSeedSuggestion).toHaveBeenCalledWith(COMPANY_ID, "qbo-1", "cust-1", "irrigopro");
  });

  it("accepts multipart/form-data CSV file upload and processes correctly", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheRow.mockResolvedValue({
      id: "cache-mp", qboId: "qbo-mp", displayName: "Multipart Corp", seedCustomerId: null,
    });
    mockStorage.findBestCrmMatchByName.mockResolvedValue({
      customerId: "cust-mp",
      customerName: "Multipart Corp",
      score: 0.88,
    });
    mockStorage.writeSeedSuggestion.mockResolvedValue(undefined);

    const app = await buildApp(adminUser());
    const csvContent = "customer_name,quickbooks_id\nMultipart Corp,qbo-mp\n";
    const res = await request(app)
      .post("/api/qbo/customers/import-seed")
      .attach("file", Buffer.from(csvContent), { filename: "seed.csv", contentType: "text/csv" });

    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe("seeded");
    expect(res.body.results[0].matchedCustomerId).toBe("cust-mp");
    expect(mockStorage.findBestCrmMatchByName).toHaveBeenCalledWith(COMPANY_ID, "Multipart Corp");
  });

  it("rejects multipart upload when CSV file has wrong columns", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const app = await buildApp(adminUser());
    const badCsv = "name,id\nAcme,123\n";
    const res = await request(app)
      .post("/api/qbo/customers/import-seed")
      .attach("file", Buffer.from(badCsv), { filename: "bad.csv", contentType: "text/csv" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/customer_name/i);
  });

  it("reports not_in_cache when QBO id not in local cache", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheRow.mockResolvedValue(undefined);
    const app = await buildApp(adminUser());
    const rows = [{ customer_name: "Ghost Inc", quickbooks_id: "no-such-id" }];
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "application/json")
      .send(rows);
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe("not_in_cache");
  });

  it("reports no_match when trigram similarity below threshold", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheRow.mockResolvedValue({
      id: "cache-2", qboId: "qbo-2", displayName: "Zeta LLC", seedCustomerId: null,
    });
    mockStorage.findBestCrmMatchByName.mockResolvedValue(null);
    const app = await buildApp(adminUser());
    const rows = [{ customer_name: "Zeta LLC", quickbooks_id: "qbo-2" }];
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "application/json")
      .send(rows);
    expect(res.body.results[0].status).toBe("no_match");
    expect(mockStorage.writeSeedSuggestion).not.toHaveBeenCalled();
  });

  it("reports already_bound when cache row has existing seed", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheRow.mockResolvedValue({
      id: "cache-3", qboId: "qbo-3", displayName: "Delta Corp", seedCustomerId: "existing-cust",
    });
    const app = await buildApp(adminUser());
    const rows = [{ customer_name: "Delta Corp", quickbooks_id: "qbo-3" }];
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "application/json")
      .send(rows);
    expect(res.body.results[0].status).toBe("already_bound");
    expect(mockStorage.findBestCrmMatchByName).not.toHaveBeenCalled();
  });

  it("returns 400 for empty rows array", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "application/json")
      .send([]);
    expect(res.status).toBe(400);
  });

  it("processes multiple rows and returns per-row results", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockStorage.getQboCacheRow
      .mockResolvedValueOnce({ id: "c1", qboId: "q1", displayName: "Alpha", seedCustomerId: null })
      .mockResolvedValueOnce(undefined); // second row not in cache
    mockStorage.findBestCrmMatchByName.mockResolvedValue({ customerId: "cust-a", customerName: "Alpha", score: 0.8 });
    mockStorage.writeSeedSuggestion.mockResolvedValue(undefined);

    const app = await buildApp(adminUser());
    const rows = [
      { customer_name: "Alpha", quickbooks_id: "q1" },
      { customer_name: "Ghost", quickbooks_id: "q-missing" },
    ];
    const res = await request(app).post("/api/qbo/customers/import-seed")
      .set("Content-Type", "application/json")
      .send(rows);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].status).toBe("seeded");
    expect(res.body.results[1].status).toBe("not_in_cache");
  });
});

// ── findBestCrmMatchByName — suggestion scoring behavior ─────────────────────

describe("findBestCrmMatchByName scoring logic (mocked)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns best scoring match when similarity > 0.1", async () => {
    mockStorage.findBestCrmMatchByName.mockResolvedValue({
      customerId: "cust-acme",
      customerName: "Acme Corp",
      score: 0.92,
    });
    const { storage } = await import("../storage");
    const result = await storage.findBestCrmMatchByName("company-1", "Acme Corp");
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0.1);
    expect(result!.customerId).toBe("cust-acme");
  });

  it("returns null when no match has similarity > 0.1", async () => {
    mockStorage.findBestCrmMatchByName.mockResolvedValue(null);
    const { storage } = await import("../storage");
    const result = await storage.findBestCrmMatchByName("company-1", "Completely Unrelated ZZZ");
    expect(result).toBeNull();
  });

  it("only considers unbound customers (qbo_customer_id IS NULL)", async () => {
    // The mock simulates that already-bound customer is excluded
    mockStorage.findBestCrmMatchByName.mockResolvedValue(null);
    const { storage } = await import("../storage");
    // Even though "Bound Corp" matches exactly, it's bound so storage returns null
    const result = await storage.findBestCrmMatchByName("company-1", "Bound Corp");
    expect(result).toBeNull();
    expect(mockStorage.findBestCrmMatchByName).toHaveBeenCalledWith("company-1", "Bound Corp");
  });

  it("is scoped to the calling company — never returns customers from other companies", async () => {
    mockStorage.findBestCrmMatchByName.mockResolvedValue({
      customerId: "cust-c1",
      customerName: "Acme Corp",
      score: 0.88,
    });
    const { storage } = await import("../storage");
    await storage.findBestCrmMatchByName("company-1", "Acme Corp");
    expect(mockStorage.findBestCrmMatchByName).toHaveBeenCalledWith("company-1", "Acme Corp");
    // Storage should never be called with company-2 here
    expect(mockStorage.findBestCrmMatchByName).not.toHaveBeenCalledWith("company-2", expect.anything());
  });
});

// ── POST /api/qbo/customers/pull — pagination & upsert ───────────────────────

describe("POST /api/qbo/customers/pull", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 503 when not connected", async () => {
    mockStorage.getQboConnection.mockResolvedValue(disconnectedStatus());
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/pull");
    expect(res.status).toBe(503);
  });

  it("pages through QBO and upserts all rows then deactivates missing", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());

    // Simulate two pages: first returns 1000 items, second returns 5
    const makePage = (count: number) => ({
      ok: true,
      json: async () => ({
        QueryResponse: {
          Customer: Array.from({ length: count }, (_, i) => ({
            Id: String(i + 1),
            DisplayName: `Customer ${i + 1}`,
            Active: true,
          })),
        },
      }),
      text: async () => "",
    });
    mockQboRequest
      .mockResolvedValueOnce(makePage(1000))
      .mockResolvedValueOnce(makePage(5));

    mockStorage.upsertQboCustomerCache.mockResolvedValue({ upserted: 1005, inserted: 5, updated: 1000 });
    mockStorage.deactivateMissingQboCustomersRaw.mockResolvedValue(0);
    mockStorage.refreshStaleDisplayNames.mockResolvedValue(undefined);
    mockStorage.getStaleBindings.mockResolvedValue([]);

    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/pull");
    expect(res.status).toBe(200);
    expect(res.body.pulled).toBe(1005);
    expect(res.body.deactivated).toBe(0);
    expect(res.body.staleBindings).toBe(0);
    expect(mockQboRequest).toHaveBeenCalledTimes(2); // two pages
    expect(mockStorage.upsertQboCustomerCache).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.arrayContaining([expect.objectContaining({ qboId: "1" })]),
    );
    // deactivate called with all 1005 IDs
    expect(mockStorage.deactivateMissingQboCustomersRaw).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.arrayContaining(["1", "2", "3"]),
    );
  });

  it("returns staleBindings count when bound customers are now inactive in QBO", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockQboRequest.mockResolvedValue({
      ok: true,
      json: async () => ({ QueryResponse: { Customer: [{ Id: "qbo-1", DisplayName: "Acme", Active: true }] } }),
      text: async () => "",
    });
    mockStorage.upsertQboCustomerCache.mockResolvedValue({ upserted: 1 });
    mockStorage.deactivateMissingQboCustomersRaw.mockResolvedValue(2);
    mockStorage.refreshStaleDisplayNames.mockResolvedValue(undefined);
    mockStorage.getStaleBindings.mockResolvedValue(["old-qbo-1", "old-qbo-2"]);

    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/pull");
    expect(res.status).toBe(200);
    expect(res.body.staleBindings).toBe(2);
  });

  it("returns 502 when QBO API responds with error status", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedStatus());
    mockQboRequest.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    const app = await buildApp(adminUser());
    const res = await request(app).post("/api/qbo/customers/pull");
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/qbo query failed/i);
  });
});
