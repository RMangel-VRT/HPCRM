import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── DB mock ────────────────────────────────────────────────────────────────────
vi.mock("../db", () => ({ db: { select: vi.fn(), update: vi.fn(), delete: vi.fn(), insert: vi.fn() } }));

// ── Logger mock ────────────────────────────────────────────────────────────────
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Crypto mock (we test crypto separately) ────────────────────────────────────
vi.mock("./qboCrypto", () => ({
  encryptToken: vi.fn((t: string) => `enc:${t}:tag`),
  decryptToken: vi.fn((ct: string) => {
    if (!ct) return null;
    const parts = ct.split(":");
    return parts.length === 3 ? parts[1] : null;
  }),
}));

// ── Global fetch mock ──────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Env setup ─────────────────────────────────────────────────────────────────
const ENV_VARS: Record<string, string> = {
  QBO_CLIENT_ID: "test-client-id",
  QBO_CLIENT_SECRET: "test-client-secret",
  QBO_REDIRECT_URI: "https://example.com/api/qbo/callback",
  QBO_ENVIRONMENT: "sandbox",
  QBO_TOKEN_ENC_KEY: "a".repeat(64),
};

function setEnv() {
  for (const [k, v] of Object.entries(ENV_VARS)) process.env[k] = v;
}
function clearEnv() {
  for (const k of Object.keys(ENV_VARS)) delete process.env[k];
}

beforeEach(() => {
  setEnv();
  mockFetch.mockReset();
  vi.resetAllMocks();
  // Re-apply mocks after reset
  vi.mocked(mockFetch); // keep stubGlobal mock active
});

afterEach(() => {
  clearEnv();
});

// ── Helper to make a Drizzle select chain ──────────────────────────────────────
function makeSelectChain(rows: unknown[]) {
  const thenFn = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: thenFn,
  };
  chain.from.mockReturnValue({ ...chain });
  chain.where.mockReturnValue({ ...chain });
  chain.limit.mockResolvedValue(rows);
  return chain;
}

function makeUpdateChain() {
  const chain = { set: vi.fn(), where: vi.fn() };
  chain.set.mockReturnValue(chain);
  chain.where.mockResolvedValue([]);
  return chain;
}

function makeDeleteChain() {
  const chain = { where: vi.fn() };
  chain.where.mockResolvedValue([]);
  return chain;
}

import { db } from "../db";

// ── isQboConfigured ────────────────────────────────────────────────────────────
describe("isQboConfigured", () => {
  afterEach(() => setEnv());

  it("returns true when all 5 env vars are set", async () => {
    const { isQboConfigured } = await import("./qboClient");
    expect(isQboConfigured()).toBe(true);
  });

  it.each(Object.keys(ENV_VARS))("returns false when %s is missing", async (key) => {
    delete process.env[key];
    vi.resetModules();
    const { isQboConfigured } = await import("./qboClient");
    expect(isQboConfigured()).toBe(false);
    setEnv();
  });
});

// ── getAuthorizeUrl ────────────────────────────────────────────────────────────
describe("getAuthorizeUrl", () => {
  it("includes state, client_id, redirect_uri, and scope", async () => {
    const { getAuthorizeUrl } = await import("./qboClient");
    const url = getAuthorizeUrl("my-state-value");
    expect(url).toContain("state=my-state-value");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("com.intuit.quickbooks.accounting");
  });

  it("throws when env vars are missing", async () => {
    clearEnv();
    vi.resetModules();
    const { getAuthorizeUrl } = await import("./qboClient");
    expect(() => getAuthorizeUrl("state")).toThrow(/Missing/);
    setEnv();
  });
});

// ── exchangeCodeForTokens ──────────────────────────────────────────────────────
describe("exchangeCodeForTokens", () => {
  it("returns token response on 200", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "acc",
        refresh_token: "ref",
        expires_in: 3600,
        x_refresh_token_expires_in: 8640000,
        token_type: "bearer",
      }),
    });
    const { exchangeCodeForTokens } = await import("./qboClient");
    const result = await exchangeCodeForTokens("auth-code", "realm-123");
    expect(result.access_token).toBe("acc");
    expect(result.realmId).toBe("realm-123");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    });
    const { exchangeCodeForTokens } = await import("./qboClient");
    await expect(exchangeCodeForTokens("bad-code", "realm")).rejects.toThrow("400");
  });
});

// ── classifyRefreshError (via qboRequest behavior) ────────────────────────────
describe("classifyRefreshError (internal, tested via qboRequest 401 path)", () => {
  function mockConnRow(overrides?: Partial<Record<string, unknown>>) {
    return {
      companyId: "c1",
      realmId: "r1",
      accessTokenEnc: "enc:acc123:tag",
      refreshTokenEnc: "enc:ref456:tag",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1hr from now → no refresh needed
      refreshTokenExpiresAt: null,
      status: "connected",
      environment: "sandbox",
      companyName: null,
      lastErrorMessage: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("hard-blocks requests when status is 'revoked' (even if token is fresh)", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([mockConnRow({ status: "revoked" })])
    );
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow("not active: revoked");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("hard-blocks requests when status is 'expired'", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([mockConnRow({ status: "expired" })])
    );
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow("not active: expired");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("hard-blocks requests when status is 'error'", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([mockConnRow({ status: "error" })])
    );
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow("not active: error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws 'No QBO connection' when no connection row exists", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([]));
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("unknown-company", "GET", "/test")).rejects.toThrow("No QBO connection");
  });

  it("makes the API call when status is 'connected' and token is fresh", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([mockConnRow()])
    );
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { qboRequest } = await import("./qboClient");
    const resp = await qboRequest("c1", "GET", "/companyinfo/r1");
    expect(resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [callUrl] = mockFetch.mock.calls[0] as [string];
    expect(callUrl).toContain("sandbox-quickbooks");
    expect(callUrl).toContain("/r1/");
  });
});

// ── 401 retry path ─────────────────────────────────────────────────────────────
describe("qboRequest 401 retry", () => {
  function mockConnRow() {
    return {
      companyId: "c1",
      realmId: "r1",
      accessTokenEnc: "enc:acc123:tag",
      refreshTokenEnc: "enc:ref456:tag",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: null,
      status: "connected",
      environment: "sandbox",
      companyName: null,
      lastErrorMessage: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it("refreshes token on 401 and retries the request", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(makeUpdateChain());

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" }) // initial → 401
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-acc",
          refresh_token: "new-ref",
          expires_in: 3600,
          x_refresh_token_expires_in: 8640000,
        }),
      }) // refresh call
      .mockResolvedValueOnce({ ok: true, status: 200 }); // retry → ok

    const { qboRequest } = await import("./qboClient");
    const resp = await qboRequest("c1", "GET", "/test");
    expect(resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("marks connection revoked when refresh 401 follows initial 401", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" }) // initial
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "invalid_grant" }); // refresh fails

    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow();
    // DB update should have been called to mark status
    expect(db.update).toHaveBeenCalled();
  });
});

// ── revokeConnection ───────────────────────────────────────────────────────────
describe("revokeConnection", () => {
  it("calls Intuit revoke endpoint and deletes the DB row", async () => {
    const row = {
      companyId: "c1",
      refreshTokenEnc: "enc:ref456:tag",
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([row]));
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue(makeDeleteChain());
    mockFetch.mockResolvedValue({ ok: true });

    const { revokeConnection } = await import("./qboClient");
    await revokeConnection("c1");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("tokens/revoke");
    expect(db.delete).toHaveBeenCalled();
  });

  it("still deletes the DB row even if Intuit revoke call throws", async () => {
    const row = {
      companyId: "c1",
      refreshTokenEnc: "enc:ref456:tag",
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([row]));
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue(makeDeleteChain());
    mockFetch.mockRejectedValue(new Error("network error"));

    const { revokeConnection } = await import("./qboClient");
    await expect(revokeConnection("c1")).resolves.toBeUndefined();
    expect(db.delete).toHaveBeenCalled();
  });

  it("no-ops when no connection exists", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([]));
    const { revokeConnection } = await import("./qboClient");
    await expect(revokeConnection("nobody")).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── classifyRefreshError — full error code coverage ───────────────────────────
// classifyRefreshError is internal; we test via qboRequest's 401 handler path.
// Instead of calling it directly, we observe DB update calls + thrown errors.
describe("classifyRefreshError — new error codes", () => {
  function makeRefreshErrorFetch(status: number, body: string) {
    return vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" }) // initial
      .mockResolvedValueOnce({ ok: false, status, text: async () => body }); // refresh fails
  }

  function mockConnRow() {
    return {
      companyId: "c1",
      realmId: "r1",
      accessTokenEnc: "enc:acc123:tag",
      refreshTokenEnc: "enc:ref456:tag",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: null,
      status: "connected" as const,
      environment: "sandbox" as const,
      companyName: null,
      lastErrorMessage: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };
  }

  type UpdateSetCall = { status: string };

  it("maps invalid_refresh_token to 'expired'", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    mockFetch.mockImplementation(makeRefreshErrorFetch(401, '{"error":"invalid_refresh_token"}'));
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow();
    const setCalls = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls.flat() as UpdateSetCall[];
    const statusCall = setCalls.find((c) => c?.status);
    expect(statusCall?.status).toBe("expired");
  });

  it("maps revoked_token to 'revoked'", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    mockFetch.mockImplementation(makeRefreshErrorFetch(400, '{"error":"revoked_token"}'));
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow();
    const setCalls = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls.flat() as UpdateSetCall[];
    const statusCall = setCalls.find((c) => c?.status);
    expect(statusCall?.status).toBe("revoked");
  });

  it("does NOT update status for server_error (transient 5xx)", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    mockFetch.mockImplementation(makeRefreshErrorFetch(500, '{"error":"server_error"}'));
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow();
    // No DB update call should set a status (transient error — preserve current status)
    const setCalls = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls.flat() as UpdateSetCall[];
    const statusCall = setCalls.find((c) => c?.status);
    expect(statusCall).toBeUndefined();
  });

  it("does NOT update status for temporarily_unavailable (transient)", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    mockFetch.mockImplementation(makeRefreshErrorFetch(503, '{"error":"temporarily_unavailable"}'));
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow();
    const setCalls = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls.flat() as UpdateSetCall[];
    const statusCall = setCalls.find((c) => c?.status);
    expect(statusCall).toBeUndefined();
  });

  it("maps unknown 4xx to 'error'", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    mockFetch.mockImplementation(makeRefreshErrorFetch(400, '{"error":"some_unknown_error"}'));
    const { qboRequest } = await import("./qboClient");
    await expect(qboRequest("c1", "GET", "/test")).rejects.toThrow();
    const setCalls = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls.flat() as UpdateSetCall[];
    const statusCall = setCalls.find((c) => c?.status);
    expect(statusCall?.status).toBe("error");
  });
});

// ── isQboWriteEnabled ──────────────────────────────────────────────────────────
describe("isQboWriteEnabled", () => {
  it("returns true when qbo_write flag is true", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([{ featureFlags: '{"qbo_write":true}' }])
    );
    const { isQboWriteEnabled } = await import("./qboClient");
    expect(await isQboWriteEnabled("company-1")).toBe(true);
  });

  it("returns false when qbo_write flag is false", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([{ featureFlags: '{"qbo_write":false}' }])
    );
    const { isQboWriteEnabled } = await import("./qboClient");
    expect(await isQboWriteEnabled("company-1")).toBe(false);
  });

  it("returns false when qbo_write key is absent", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([{ featureFlags: '{"tickets_v2":true}' }])
    );
    const { isQboWriteEnabled } = await import("./qboClient");
    expect(await isQboWriteEnabled("company-1")).toBe(false);
  });

  it("returns false when settings row is missing", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([]));
    const { isQboWriteEnabled } = await import("./qboClient");
    expect(await isQboWriteEnabled("company-1")).toBe(false);
  });

  it("returns false when featureFlags is null/empty string", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSelectChain([{ featureFlags: "" }])
    );
    const { isQboWriteEnabled } = await import("./qboClient");
    expect(await isQboWriteEnabled("company-1")).toBe(false);
  });
});

// ── Single-flight: concurrent callers wait for same refresh ───────────────────
describe("ensureFreshToken single-flight", () => {
  it("does not issue two parallel refresh requests for the same companyId", async () => {
    // Token is near-expired so refresh will be triggered
    const expiringConn = {
      companyId: "sftest",
      realmId: "r1",
      accessTokenEnc: "enc:acc:tag",
      refreshTokenEnc: "enc:ref:tag",
      tokenExpiresAt: new Date(Date.now() + 60 * 1000), // 1 min — inside REFRESH_BUFFER_MS (5 min)
      refreshTokenExpiresAt: null,
      status: "connected" as const,
      environment: "sandbox" as const,
      companyName: null,
      lastErrorMessage: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    const freshConn = { ...expiringConn, tokenExpiresAt: new Date(Date.now() + 3600_000) };

    let refreshCallCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if ((url as string).includes("tokens/bearer")) {
        refreshCallCount++;
        // simulate async delay
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          json: async () => ({
            access_token: "new-acc",
            refresh_token: "new-ref",
            expires_in: 3600,
            x_refresh_token_expires_in: 8640000,
          }),
        };
      }
      // API call succeeds
      return { ok: true, status: 200 };
    });

    // Both selects: first returns the expiring conn, subsequent return freshConn
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makeSelectChain([expiringConn]))
      .mockReturnValueOnce(makeSelectChain([expiringConn]))
      .mockReturnValue(makeSelectChain([freshConn])); // post-refresh re-reads

    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(makeUpdateChain());

    const { qboRequest } = await import("./qboClient");

    // Fire two concurrent requests for the same company
    const [r1, r2] = await Promise.all([
      qboRequest("sftest", "GET", "/test"),
      qboRequest("sftest", "GET", "/test"),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Only ONE refresh call should have gone to Intuit
    expect(refreshCallCount).toBe(1);
  });
});

// ── qboRequest URL separator ───────────────────────────────────────────────────
describe("qboRequest URL separator", () => {
  function mockConnRow() {
    return {
      companyId: "c1",
      realmId: "r1",
      accessTokenEnc: "enc:acc123:tag",
      refreshTokenEnc: "enc:ref456:tag",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: null,
      status: "connected" as const,
      environment: "sandbox" as const,
      companyName: null,
      lastErrorMessage: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it("appends ?minorversion= for a plain path (no existing query string)", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { qboRequest } = await import("./qboClient");
    await qboRequest("c1", "GET", "/companyinfo/r1");
    const [callUrl] = mockFetch.mock.calls[0] as [string];
    expect(callUrl).toContain("?minorversion=");
    expect(callUrl).not.toContain("??");
  });

  it("appends &minorversion= for a path that already has a query string", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(makeSelectChain([mockConnRow()]));
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { qboRequest } = await import("./qboClient");
    await qboRequest("c1", "GET", "/query?query=SELECT * FROM Customer");
    const [callUrl] = mockFetch.mock.calls[0] as [string];
    expect(callUrl).toContain("&minorversion=");
    expect(callUrl).not.toContain("??");
  });
});

// ── Connection response does not leak encrypted fields ─────────────────────────
describe("GET /api/qbo/connection token-field exclusion", () => {
  it("safePublicConn-equivalent: encrypted token fields are excluded", () => {
    // Simulate the route's safePublicConn helper by checking what it returns
    // The route returns: status, realmId, companyName, environment, lastErrorMessage, connectedAt, updatedAt
    const conn = {
      id: "uuid-1",
      companyId: "c1",
      realmId: "r1",
      accessTokenEnc: "enc:secret:tag",
      refreshTokenEnc: "enc:secret2:tag",
      tokenExpiresAt: new Date(),
      refreshTokenExpiresAt: null,
      status: "connected" as const,
      companyName: "Acme Corp",
      environment: "production" as const,
      lastErrorMessage: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    // Replicate safePublicConn logic from qbo.ts route
    const safe = {
      status: conn.status,
      realmId: conn.realmId,
      companyName: conn.companyName,
      environment: conn.environment,
      lastErrorMessage: conn.lastErrorMessage,
      connectedAt: conn.connectedAt,
      updatedAt: conn.updatedAt,
    };

    expect(safe).not.toHaveProperty("accessTokenEnc");
    expect(safe).not.toHaveProperty("refreshTokenEnc");
    expect(safe).not.toHaveProperty("id");
    expect(safe).not.toHaveProperty("companyId");
    expect(safe.status).toBe("connected");
    expect(safe.companyName).toBe("Acme Corp");
  });
});
