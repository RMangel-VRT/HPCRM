// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockWhere = vi.fn().mockResolvedValue([]);
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockDeleteWhere = vi.fn().mockResolvedValue([]);
const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

vi.mock("../db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) })),
    delete: mockDelete,
  },
}));

// ── drizzle-orm ────────────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...args: unknown[]) => args,
}));

// ── @workspace/db ──────────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  qboConnections: { companyId: "companyId", status: "status" },
  settings: { companyId: "companyId", featureFlags: "featureFlags" },
}));

// ── Logger ─────────────────────────────────────────────────────────────────────
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Storage mock ───────────────────────────────────────────────────────────────
const mockStorage = {
  getQboConnection: vi.fn(),
  upsertQboConnection: vi.fn(),
  deleteQboConnection: vi.fn(),
  updateQboConnectionStatus: vi.fn(),
};

vi.mock("../storage", () => ({
  storage: mockStorage,
}));

// ── qboClient service mock ─────────────────────────────────────────────────────
const mockQboClient = {
  isQboConfigured: vi.fn(() => true),
  getAuthorizeUrl: vi.fn(() => "https://intuit.com/oauth?state=test-state"),
  exchangeCodeForTokens: vi.fn(),
  revokeConnection: vi.fn(),
  getCompanyInfo: vi.fn(),
  isQboWriteEnabled: vi.fn(),
};

vi.mock("../services/qboClient", () => mockQboClient);

// ── qboCrypto mock ─────────────────────────────────────────────────────────────
vi.mock("../services/qboCrypto", () => ({
  encryptToken: vi.fn((t: string) => `enc:${t}:tag`),
  decryptToken: vi.fn((c: string) => c?.split(":")?.[1] ?? null),
}));

// ── Build minimal Express app ──────────────────────────────────────────────────
type UserOverride = {
  activeRole?: string;
  isSuperAdminBool?: boolean;
  activeCompanyId?: string;
};

type SessionOverride = Record<string, unknown>;

async function buildApp(userOverride?: UserOverride, sessionOverride?: SessionOverride) {
  const { default: router } = await import("./qbo");
  const app = express();
  app.use(express.json());

  const user = {
    id: "user-1",
    activeCompanyId: "company-1",
    activeRole: "admin",
    isSuperAdminBool: false,
    ...(userOverride ?? {}),
  };

  const session: Record<string, unknown> = { ...(sessionOverride ?? {}) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((req: any, _res, next) => {
    req.user = user;
    req.isAuthenticated = () => true;
    req.session = { ...session, save: (cb: (err?: Error) => void) => cb() };
    next();
  });

  app.use("/api/qbo", router);
  return app;
}

// ── Helper: connected QBO row ──────────────────────────────────────────────────
function connectedRow() {
  return {
    id: "qbo-1",
    companyId: "company-1",
    realmId: "realm-1",
    accessTokenEnc: "enc:acc:tag",
    refreshTokenEnc: "enc:ref:tag",
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    refreshTokenExpiresAt: null,
    status: "connected" as const,
    companyName: "Acme Corp",
    environment: "production" as const,
    lastErrorMessage: null,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getQboConnection.mockResolvedValue(undefined);
  mockQboClient.isQboConfigured.mockReturnValue(true);
  mockQboClient.getAuthorizeUrl.mockReturnValue("https://intuit.com/oauth?state=test-state");
});

afterEach(() => {
  vi.resetModules();
});

// ── GET /api/qbo/connection ────────────────────────────────────────────────────
describe("GET /api/qbo/connection", () => {
  it("returns not_connected when no row exists", async () => {
    mockStorage.getQboConnection.mockResolvedValue(undefined);
    const app = await buildApp();
    const res = await request(app).get("/api/qbo/connection");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("not_connected");
  });

  it("returns connected status and metadata when row exists", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedRow());
    const app = await buildApp();
    const res = await request(app).get("/api/qbo/connection");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("connected");
    expect(res.body.companyName).toBe("Acme Corp");
    expect(res.body.realmId).toBe("realm-1");
  });

  it("does NOT include accessTokenEnc or refreshTokenEnc in response", async () => {
    mockStorage.getQboConnection.mockResolvedValue(connectedRow());
    const app = await buildApp();
    const res = await request(app).get("/api/qbo/connection");
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("accessTokenEnc");
    expect(res.body).not.toHaveProperty("refreshTokenEnc");
    expect(res.body).not.toHaveProperty("id");
    expect(res.body).not.toHaveProperty("companyId");
  });

  it("returns 401 when not authenticated", async () => {
    const { default: router } = await import("./qbo");
    const app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res, next) => {
      req.isAuthenticated = () => false;
      next();
    });
    app.use("/api/qbo", router);
    const res = await request(app).get("/api/qbo/connection");
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is crew_supervisor", async () => {
    const app = await buildApp({ activeRole: "crew_supervisor" });
    const res = await request(app).get("/api/qbo/connection");
    expect(res.status).toBe(403);
  });

  it("allows office role to read connection status", async () => {
    mockStorage.getQboConnection.mockResolvedValue(undefined);
    const app = await buildApp({ activeRole: "office" });
    const res = await request(app).get("/api/qbo/connection");
    expect(res.status).toBe(200);
  });
});

// ── POST /api/qbo/connect ──────────────────────────────────────────────────────
describe("POST /api/qbo/connect", () => {
  it("returns authorizeUrl when configured", async () => {
    const app = await buildApp();
    const res = await request(app).post("/api/qbo/connect");
    expect(res.status).toBe(200);
    expect(res.body.authorizeUrl).toContain("intuit.com");
  });

  it("returns 503 when QBO is not configured", async () => {
    mockQboClient.isQboConfigured.mockReturnValue(false);
    const app = await buildApp();
    const res = await request(app).post("/api/qbo/connect");
    expect(res.status).toBe(503);
  });

  it("returns 403 when role is office (connect requires admin)", async () => {
    const app = await buildApp({ activeRole: "office" });
    const res = await request(app).post("/api/qbo/connect");
    expect(res.status).toBe(403);
  });

  it("returns 403 when role is field_manager", async () => {
    const app = await buildApp({ activeRole: "field_manager" });
    const res = await request(app).post("/api/qbo/connect");
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const { default: router } = await import("./qbo");
    const app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res, next) => {
      req.isAuthenticated = () => false;
      next();
    });
    app.use("/api/qbo", router);
    const res = await request(app).post("/api/qbo/connect");
    expect(res.status).toBe(401);
  });
});

// ── POST /api/qbo/disconnect ───────────────────────────────────────────────────
describe("POST /api/qbo/disconnect", () => {
  it("calls revokeConnection and returns ok", async () => {
    mockQboClient.revokeConnection.mockResolvedValue(undefined);
    const app = await buildApp();
    const res = await request(app).post("/api/qbo/disconnect");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockQboClient.revokeConnection).toHaveBeenCalledWith("company-1");
  });

  it("returns 403 when role is office (disconnect requires admin)", async () => {
    const app = await buildApp({ activeRole: "office" });
    const res = await request(app).post("/api/qbo/disconnect");
    expect(res.status).toBe(403);
    expect(mockQboClient.revokeConnection).not.toHaveBeenCalled();
  });
});

// ── GET /api/qbo/callback — state validation ───────────────────────────────────
describe("GET /api/qbo/callback — state validation", () => {
  it("redirects to settings with ?qbo=error when state param is missing", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/qbo/callback?code=abc&realmId=r1");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("qbo=error");
    expect(res.headers.location).toContain("reason=missing_params");
  });

  it("redirects to settings with ?qbo=error when session has no state", async () => {
    const app = await buildApp({}, {});
    const res = await request(app)
      .get("/api/qbo/callback")
      .query({ code: "abc", state: "test-state", realmId: "r1" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("qbo=error");
    expect(res.headers.location).toContain("reason=state_missing");
  });

  it("redirects with state_mismatch when state param does not match session", async () => {
    const sessionWithState = {
      qboOAuthState: {
        state: "expected-state",
        companyId: "company-1",
        expiresAt: Date.now() + 60_000,
      },
    };
    const app = await buildApp({}, sessionWithState);
    const res = await request(app)
      .get("/api/qbo/callback")
      .query({ code: "abc", state: "WRONG-state", realmId: "r1" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("qbo=error");
    expect(res.headers.location).toContain("reason=state_mismatch");
  });

  it("redirects with state_expired when state is past its TTL", async () => {
    const sessionWithExpiredState = {
      qboOAuthState: {
        state: "correct-state",
        companyId: "company-1",
        expiresAt: Date.now() - 1, // already expired
      },
    };
    const app = await buildApp({}, sessionWithExpiredState);
    const res = await request(app)
      .get("/api/qbo/callback")
      .query({ code: "abc", state: "correct-state", realmId: "r1" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("qbo=error");
    expect(res.headers.location).toContain("reason=state_expired");
  });

  it("redirects with error reason when Intuit returns an error param", async () => {
    const app = await buildApp();
    const res = await request(app)
      .get("/api/qbo/callback")
      .query({ error: "access_denied" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("qbo=error");
    expect(res.headers.location).toContain("access_denied");
  });

  it("redirects to ?qbo=connected on valid callback and token exchange", async () => {
    const validSession = {
      qboOAuthState: {
        state: "valid-state",
        companyId: "company-1",
        expiresAt: Date.now() + 60_000,
      },
    };
    mockQboClient.exchangeCodeForTokens.mockResolvedValue({
      access_token: "acc",
      refresh_token: "ref",
      expires_in: 3600,
      x_refresh_token_expires_in: 8640000,
    });
    mockStorage.upsertQboConnection.mockResolvedValue(connectedRow());
    mockQboClient.getCompanyInfo.mockResolvedValue({
      CompanyInfo: { CompanyName: "Acme Corp" },
    });
    const app = await buildApp({}, validSession);
    const res = await request(app)
      .get("/api/qbo/callback")
      .query({ code: "auth-code", state: "valid-state", realmId: "realm-1" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("qbo=connected");
  });
});

// ── POST /api/qbo/test ─────────────────────────────────────────────────────────
describe("POST /api/qbo/test", () => {
  it("returns ok:true and companyName on success", async () => {
    mockQboClient.getCompanyInfo.mockResolvedValue({
      CompanyInfo: { CompanyName: "Acme Corp" },
    });
    const app = await buildApp();
    const res = await request(app).post("/api/qbo/test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.companyName).toBe("Acme Corp");
  });

  it("returns ok:false with error message when getCompanyInfo throws", async () => {
    mockQboClient.getCompanyInfo.mockRejectedValue(new Error("connection not active"));
    const app = await buildApp();
    const res = await request(app).post("/api/qbo/test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("connection not active");
  });

  it("allows office role to test the connection", async () => {
    mockQboClient.getCompanyInfo.mockResolvedValue({
      CompanyInfo: { CompanyName: "Acme" },
    });
    const app = await buildApp({ activeRole: "office" });
    const res = await request(app).post("/api/qbo/test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
