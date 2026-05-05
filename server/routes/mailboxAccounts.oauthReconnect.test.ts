// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Capture DB update calls ────────────────────────────────────────────────────
const mockWhere = vi.fn().mockResolvedValue([]);
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

// Simulates an account with a non-zero syncErrorCount (the "reconnect" state)
const fakeAccount = {
  id: "mailbox-1",
  companyId: "company-1",
  emailAddress: "reconnect@example.com",
  syncErrorCount: 5,
  syncStatus: "error",
  accountType: "shared",
  ownerUserId: null,
};

const mockSelectWhere = vi.fn().mockResolvedValue([fakeAccount]);
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

vi.mock("../db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

// ── Google OAuth helpers ───────────────────────────────────────────────────────
vi.mock("../services/googleOAuth", () => ({
  isGoogleOAuthConfigured: () => true,
  generateAuthUrl: vi.fn(),
  generateStateToken: vi.fn(),
  exchangeCodeForTokens: vi.fn().mockResolvedValue({
    access_token: "fresh-access-token",
    refresh_token: "fresh-refresh-token",
    expiry_date: Date.now() + 3600000,
    scope: "https://mail.google.com/",
    token_type: "Bearer",
  }),
  getUserEmail: vi.fn().mockResolvedValue("reconnect@example.com"),
  revokeTokens: vi.fn(),
}));

// ── emailSyncService ───────────────────────────────────────────────────────────
vi.mock("../services/emailSyncService", () => ({
  syncMailbox: vi.fn(),
}));

// ── Shared schema — minimal structural stand-in ────────────────────────────────
vi.mock("@shared/schema", () => ({
  mailboxAccounts: { id: "id", companyId: "companyId" },
  mailboxSyncRuns: {},
  unsortedEmails: {},
  communications: {},
  insertMailboxAccountSchema: {
    parse: (x: unknown) => x,
    safeParse: (x: unknown) => ({ success: true, data: x }),
  },
}));

// ── drizzle-orm helpers ────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => args,
  desc: (col: unknown) => col,
  gte: (col: unknown, val: unknown) => ({ col, val }),
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

// ── Build a minimal Express app that mounts the router ────────────────────────
async function buildApp() {
  // Import AFTER mocks are registered
  const { default: router } = await import("./mailboxAccounts");
  const app = express();
  app.use(express.json());

  // Inject a pre-authenticated user and a valid CSRF session state
  app.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = {
      id: "user-1",
      activeCompanyId: "company-1",
      activeRole: "admin",
      isSuperAdminBool: false,
    };
    // Provide a session with the matching CSRF random part and mailbox id
    (req as express.Request & { session: Record<string, unknown> }).session = {
      oauthState: "random-csrf-token",
      oauthMailboxId: "mailbox-1",
    };
    next();
  });

  app.use("/api/mailbox-accounts", router);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("OAuth callback reconnect — syncErrorCount reset", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Restore default mock return values after clearAllMocks
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockWhere.mockResolvedValue([]);
    mockSelectWhere.mockResolvedValue([fakeAccount]);
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    app = await buildApp();
  });

  it("resets syncErrorCount to 0 on a successful reconnect from an errored state", async () => {
    // The account has syncErrorCount=5 before the callback
    expect(fakeAccount.syncErrorCount).toBe(5);

    const response = await request(app)
      .get("/api/mailbox-accounts/oauth/callback")
      .query({
        code: "valid-auth-code",
        state: "mailbox-1:random-csrf-token",
      });

    // Route should redirect on success
    expect(response.status).toBe(302);

    // The db.update().set(...) must have been called exactly once
    expect(mockSet).toHaveBeenCalledOnce();

    const setPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;

    // Core assertion: reconnect explicitly resets the error counter
    expect(setPayload.syncErrorCount).toBe(0);
    expect(setPayload.syncStatus).toBe("connected");
    expect(setPayload.syncEnabled).toBe(true);
  });

  it("includes syncErrorCount: 0 as an explicit key — not absent — so the DB actually resets it", async () => {
    await request(app)
      .get("/api/mailbox-accounts/oauth/callback")
      .query({
        code: "valid-auth-code",
        state: "mailbox-1:random-csrf-token",
      });

    expect(mockSet).toHaveBeenCalledOnce();
    const setPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;

    // If the key were absent, the DB column would keep its previous non-zero value
    expect(Object.prototype.hasOwnProperty.call(setPayload, "syncErrorCount")).toBe(true);
    expect(setPayload.syncErrorCount).toStrictEqual(0);
  });

  it("does NOT trigger the update at all when the OAuth code exchange fails", async () => {
    const { exchangeCodeForTokens } = await import("../services/googleOAuth");
    vi.mocked(exchangeCodeForTokens).mockRejectedValueOnce(new Error("token exchange failed"));

    const response = await request(app)
      .get("/api/mailbox-accounts/oauth/callback")
      .query({
        code: "bad-code",
        state: "mailbox-1:random-csrf-token",
      });

    // On error the route returns 500, not a redirect
    expect(response.status).toBe(500);
    // The update must NOT have been called — no partial write
    expect(mockSet).not.toHaveBeenCalled();
  });
});
