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

const fakePersonalAccount = {
  id: "mailbox-2",
  companyId: "company-1",
  emailAddress: "personal@example.com",
  syncErrorCount: 0,
  syncStatus: "not_connected",
  accountType: "personal",
  ownerUserId: "user-1",
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
  mailboxAccounts: { id: "id", companyId: "companyId", emailAddress: "emailAddress", accountType: "accountType", ownerUserId: "ownerUserId" },
  mailboxSyncRuns: {},
  unsortedEmails: {},
  communications: {},
  insertMailboxAccountSchema: {
    parse: (x: unknown) => x,
    safeParse: (x: unknown) => ({ success: true, data: x }),
    pick: () => ({
      safeParse: (x: unknown) => ({ success: true, data: x }),
    }),
  },
}));

// ── drizzle-orm helpers ────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => args,
  desc: (col: unknown) => col,
  gte: (col: unknown, val: unknown) => ({ col, val }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { join: vi.fn() }
  ),
  inArray: (col: unknown, vals: unknown) => ({ col, vals }),
}));

// ── mailboxScope service ───────────────────────────────────────────────────────
vi.mock("../services/mailboxScope", () => ({
  resolveVisibleMailboxes: vi.fn().mockResolvedValue({ mailboxIds: null }),
  MailboxScopeForbiddenError: class MailboxScopeForbiddenError extends Error {},
}));

// ── mailboxBackfillService ─────────────────────────────────────────────────────
vi.mock("../services/mailboxBackfillService", () => ({
  startBackfill: vi.fn(),
  requestCancel: vi.fn(),
  getActiveBackfill: vi.fn(),
  getBackfillHistory: vi.fn(),
}));

// ── Build a minimal Express app that mounts the router ────────────────────────
async function buildApp(overrides: {
  user?: Record<string, unknown>;
  sessionExtra?: Record<string, unknown>;
} = {}) {
  // Import AFTER mocks are registered
  const { default: router } = await import("./mailboxAccounts");
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = overrides.user ?? {
      id: "user-1",
      name: "Test User",
      activeCompanyId: "company-1",
      activeRole: "admin",
      isSuperAdminBool: false,
    };
    (req as express.Request & { session: Record<string, unknown> }).session = {
      oauthState: "random-csrf-token",
      oauthMailboxId: "mailbox-1",
      ...(overrides.sessionExtra ?? {}),
    };
    next();
  });

  app.use("/api/mailbox-accounts", router);
  return app;
}

// ── Tests: existing reconnect behavior ────────────────────────────────────────
describe("OAuth callback reconnect — syncErrorCount reset", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockWhere.mockResolvedValue([]);
    mockSelectWhere.mockResolvedValue([fakeAccount]);
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    app = await buildApp();
  });

  it("resets syncErrorCount to 0 on a successful reconnect from an errored state", async () => {
    expect(fakeAccount.syncErrorCount).toBe(5);

    const response = await request(app)
      .get("/api/mailbox-accounts/oauth/callback")
      .query({
        code: "valid-auth-code",
        state: "mailbox-1:random-csrf-token",
      });

    expect(response.status).toBe(302);
    expect(mockSet).toHaveBeenCalledOnce();

    const setPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;

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

    expect(response.status).toBe(500);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

// ── Tests: email mismatch — shared mailbox rejects ────────────────────────────
describe("OAuth callback — shared mailbox rejects email mismatch", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockWhere.mockResolvedValue([]);
    mockSelectWhere.mockResolvedValue([fakeAccount]);
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    app = await buildApp();
  });

  it("returns 400 with Email Mismatch page when shared mailbox email differs from connected Google account", async () => {
    const { getUserEmail } = await import("../services/googleOAuth");
    vi.mocked(getUserEmail).mockResolvedValueOnce("different@example.com");

    const response = await request(app)
      .get("/api/mailbox-accounts/oauth/callback")
      .query({ code: "valid-auth-code", state: "mailbox-1:random-csrf-token" });

    expect(response.status).toBe(400);
    expect(response.text).toContain("Email Mismatch");
    expect(mockSet).not.toHaveBeenCalled();
  });
});

// ── Tests: personal mailbox auto-correct ──────────────────────────────────────
describe("OAuth callback — personal mailbox auto-correct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockWhere.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });
  });

  it("auto-corrects emailAddress when personal mailbox owner signs in with a different (unclaimed) Gmail", async () => {
    const { getUserEmail } = await import("../services/googleOAuth");
    vi.mocked(getUserEmail).mockResolvedValueOnce("corrected@gmail.com");

    // First select returns the personal account; second select (conflict check) returns empty
    mockSelectWhere
      .mockResolvedValueOnce([fakePersonalAccount])
      .mockResolvedValueOnce([]);

    const app = await buildApp({
      sessionExtra: { oauthMailboxId: "mailbox-2" },
    });

    const response = await request(app)
      .get("/api/mailbox-accounts/oauth/callback")
      .query({ code: "valid-auth-code", state: "mailbox-2:random-csrf-token" });

    // Should succeed (redirect)
    expect(response.status).toBe(302);
    expect(mockSet).toHaveBeenCalledOnce();

    const setPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    // The auto-corrected email address must be saved
    expect(setPayload.emailAddress).toBe("corrected@gmail.com");
    expect(setPayload.syncStatus).toBe("connected");
  });

  it("rejects when the corrected email is already claimed by another mailbox in the company", async () => {
    const { getUserEmail } = await import("../services/googleOAuth");
    vi.mocked(getUserEmail).mockResolvedValueOnce("taken@gmail.com");

    // First select returns the personal account; second select returns a conflicting row
    mockSelectWhere
      .mockResolvedValueOnce([fakePersonalAccount])
      .mockResolvedValueOnce([{ id: "mailbox-conflict" }]);

    const app = await buildApp({
      sessionExtra: { oauthMailboxId: "mailbox-2" },
    });

    const response = await request(app)
      .get("/api/mailbox-accounts/oauth/callback")
      .query({ code: "valid-auth-code", state: "mailbox-2:random-csrf-token" });

    expect(response.status).toBe(400);
    expect(response.text).toContain("Email Conflict");
    expect(mockSet).not.toHaveBeenCalled();
  });
});
