/**
 * Unit tests for emailRouter.ts direction-aware routing and
 * emailSyncService.ts parseGmailMessage (RFC Message-ID extraction / dedup key).
 *
 * Run with: npx vitest run server/services/emailRouter.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: variables declared here are available inside vi.mock() factories
// because vitest hoists vi.mock() calls to the top of the file before any
// variable declarations execute.
const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

// Mock ../db — only db.select is needed; pool not needed because ./emailService
// and ./googleOAuth are mocked below, cutting the transitive path to storage.ts.
vi.mock("../db", () => ({ db: { select: mockDbSelect } }));

// Cut the transitive chain: emailSyncService imports these, which otherwise
// pull in storage.ts (needs a real PG pool) and the Google OAuth client.
vi.mock("./emailService", () => ({ sendEmail: vi.fn() }));
vi.mock("./googleOAuth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("mock-token"),
  getOAuth2Client: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  contacts: { companyId: "companyId", customerId: "customerId", emails: "emails" },
  customers: {
    companyId: "companyId", id: "id", name: "name",
    customerNumber: "customerNumber", street: "street",
    active: "active", managementCompany: "managementCompany",
  },
  communications: { companyId: "companyId", customerId: "customerId",
    id: "id",
    providerMessageId: "providerMessageId", providerThreadId: "providerThreadId",
  },
  mailboxAccounts: {},
  mailboxSyncRuns: {},
  unsortedEmails: { id: "id", companyId: "companyId", providerMessageId: "providerMessageId" },
  users: {},
  companyUsers: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ _: "eq", a, b }),
  and: (...args: unknown[]) => ({ _: "and", args }),
  or: (...args: unknown[]) => ({ _: "or", args }),
  sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ _: "sql", s, v }),
  inArray: (col: unknown, vals: unknown[]) => ({ _: "inArray", col, vals }),
  desc: (col: unknown) => ({ _: "desc", col }),
}));

// Import AFTER mocks are registered
import { db } from "../db";
import { communications, unsortedEmails } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { parseGmailMessage } from "./emailSyncService";
import { routeMessage } from "./emailRouter";
import type { ParsedMessage } from "./emailRouter";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal ParsedMessage for routing tests.
 *  providerThreadId defaults to "" (falsy) so Tier 2 (thread match) is
 *  skipped unless a test explicitly sets it — keeping mock sequences simple. */
function buildMsg(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    providerMessageId: "<gm-001@highplains.crm>",
    providerThreadId: "",
    fromAddress: "customer@example.com",
    toAddresses: ["mailbox@company.com"],
    subject: "Hello",
    bodyText: "",
    receivedAt: new Date("2025-01-01T00:00:00Z"),
    mailboxEmailAddress: "mailbox@company.com",
    ...overrides,
  };
}

/**
 * Build a DB chain compatible with BOTH query patterns used in this codebase:
 *   - routeMessage:  await db.select().from().where()        (no .limit())
 *   - sync dedup:   await db.select().from().where().limit() (with .limit())
 *
 * `.where()` returns a thenable that also exposes `.limit()`, so both patterns work.
 */
function makeChain(rows: unknown[]) {
  const whereResult = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(whereResult),
  };
}

/** Provide a sequence of return values for successive db.select() calls. */
function mockSelectSequence(sequence: unknown[][]) {
  let i = 0;
  mockDbSelect.mockImplementation(() => makeChain(sequence[i++] ?? []));
}

// ── parseGmailMessage: RFC Message-ID extraction (pure-function tests) ────────

describe("parseGmailMessage", () => {
  it("uses the RFC Message-ID header as providerMessageId when present", () => {
    const result = parseGmailMessage({
      id: "gmail-internal-xyz",
      threadId: "thread-001",
      payload: {
        headers: [
          { name: "Message-ID", value: "<abc123@highplains.crm>" },
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "recipient@customer.com" },
          { name: "Subject", value: "Test" },
        ],
      },
      internalDate: "1700000000000",
    });

    expect(result).not.toBeNull();
    // MUST be the RFC header value — not Gmail's internal ID — so that the
    // dedup check in syncMailbox() matches communications.providerMessageId
    // written by gmailSender when the CRM originally sent the email.
    expect(result?.providerMessageId).toBe("<abc123@highplains.crm>");
  });

  it("falls back to Gmail internal ID when Message-ID header is absent", () => {
    const result = parseGmailMessage({
      id: "gmail-internal-xyz",
      threadId: "thread-001",
      payload: {
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "Subject", value: "No Message-ID header" },
        ],
      },
      internalDate: "1700000000000",
    });

    expect(result).not.toBeNull();
    expect(result?.providerMessageId).toBe("gmail-internal-xyz");
  });

  it("normalizes To display-name format to bare email addresses", () => {
    const result = parseGmailMessage({
      id: "gm-003",
      threadId: "thread-003",
      payload: {
        headers: [
          { name: "From", value: "Sender Name <sender@example.com>" },
          { name: "To", value: "Alice Smith <alice@customer.com>, bob@customer.com" },
          { name: "Subject", value: "To normalization" },
        ],
      },
      internalDate: "1700000000000",
    });

    // Outbound Tier 1 routing matches on toAddresses — must be bare lowercase email
    expect(result?.toAddresses).toEqual(["alice@customer.com", "bob@customer.com"]);
  });

  it("extracts Cc addresses into ccAddresses", () => {
    const result = parseGmailMessage({
      id: "gm-002",
      threadId: "thread-002",
      payload: {
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "primary@customer.com" },
          { name: "Cc", value: "cc1@other.com, cc2@another.com" },
          { name: "Subject", value: "CC test" },
        ],
      },
      internalDate: "1700000000000",
    });

    expect(result?.ccAddresses).toEqual(["cc1@other.com", "cc2@another.com"]);
  });
});

// ── Sync-level dedup: RFC Message-ID contract + DB query verification ─────────

describe("SENT sync dedup contract", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * End-to-end dedup contract:
   *
   * gmailSender generates rfcMessageId = `<hex@highplains.crm>`, embeds it as
   * the MIME `Message-ID:` header, and stores it as communications.providerMessageId.
   *
   * Later, when Gmail's SENT folder sync runs, parseGmailMessage must extract
   * that same value so the dedup query:
   *   WHERE communications.providerMessageId = parsed.providerMessageId
   * finds the existing row and increments deduped counter instead of inserting.
   */
  it("SENT folder message resolves to same RFC ID that gmailSender stored", () => {
    const crmRfcId = "<deadbeef1234@highplains.crm>";

    const parsed = parseGmailMessage({
      id: "gmail-sent-internal-9999",   // Gmail's own ID — NOT the dedup key
      threadId: "thread-sent",
      payload: {
        headers: [
          { name: "Message-ID", value: crmRfcId },
          { name: "From", value: "mailbox@company.com" },
          { name: "To", value: "customer@example.com" },
          { name: "Subject", value: "Follow-up" },
        ],
      },
      internalDate: "1700000001000",
    });

    expect(parsed?.providerMessageId).toBe(crmRfcId);
    expect(parsed?.providerMessageId).not.toBe("gmail-sent-internal-9999");
  });

  it("dedup DB query finds existing communication by RFC Message-ID", async () => {
    const rfcId = "<crmgenerated@highplains.crm>";

    // Parse a SENT folder message — extracts RFC Message-ID as providerMessageId
    const parsed = parseGmailMessage({
      id: "gmail-sent-internal-abc",
      threadId: "thread-sent-001",
      payload: {
        headers: [
          { name: "Message-ID", value: rfcId },
          { name: "From", value: "mailbox@company.com" },
          { name: "To", value: "customer@example.com" },
          { name: "Subject", value: "Service quote" },
        ],
      },
      internalDate: "1700000000000",
    });
    expect(parsed?.providerMessageId).toBe(rfcId);

    // Simulate the SENT loop dedup query — the mock returns an existing row,
    // representing a CRM-sent email already stored in communications.
    mockDbSelect.mockImplementationOnce(() => makeChain([{ id: "existing-comm-001" }]));

    // Execute the exact query that syncMailbox SENT loop runs
    const existingComm = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, "co-1"),
          eq(communications.providerMessageId, parsed!.providerMessageId)
        )
      )
      .limit(1);

    // Dedup hit: existingComm.length > 0 → syncMailbox increments deduped, skips insert
    expect(existingComm).toHaveLength(1);
    expect(existingComm[0]).toEqual({ id: "existing-comm-001" });
  });

  it("dedup DB query returns empty when no matching communication exists", async () => {
    const rfcId = "<newmessage@highplains.crm>";

    const parsed = parseGmailMessage({
      id: "gmail-sent-new-xyz",
      threadId: "thread-new",
      payload: {
        headers: [
          { name: "Message-ID", value: rfcId },
          { name: "From", value: "mailbox@company.com" },
          { name: "To", value: "new-customer@example.com" },
          { name: "Subject", value: "Welcome" },
        ],
      },
      internalDate: "1700000002000",
    });

    // No existing communication with this RFC ID
    mockDbSelect.mockImplementationOnce(() => makeChain([]));

    const existingComm = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, "co-1"),
          eq(communications.providerMessageId, parsed!.providerMessageId)
        )
      )
      .limit(1);

    // No dedup hit: existingComm.length === 0 → syncMailbox proceeds with routing + insert
    expect(existingComm).toHaveLength(0);
  });
});

// ── routeMessage: direction-aware Tier 1 routing ──────────────────────────────

describe("routeMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("inbound", () => {
    it("routes to the matched customer when fromAddress is a known contact", async () => {
      // Tier 1 (contacts query): 1 result → route immediately
      mockSelectSequence([[{ customerId: "cust-123" }]]);

      const result = await routeMessage("co-1",
        buildMsg({ fromAddress: "cust@example.com" }),
        { direction: "inbound" }
      );

      expect(result.action).toBe("route");
      expect(result.customerId).toBe("cust-123");
      expect(result.routingMethod).toBe("email_match");
      expect(result.routingConfidence).toBe(1.0);
    });

    it("returns unsorted when fromAddress belongs to contacts in multiple customers", async () => {
      // Tier 1: 2 results → unsorted with candidate list
      mockSelectSequence([[{ customerId: "cust-a" }, { customerId: "cust-b" }]]);

      const result = await routeMessage("co-1",
        buildMsg({ fromAddress: "shared@example.com" }),
        { direction: "inbound" }
      );

      expect(result.action).toBe("unsorted");
      expect(result.candidateCustomerIds).toEqual(["cust-a", "cust-b"]);
    });

    it("discards when no tier finds any CRM signals", async () => {
      // providerThreadId="" → Tier 2 skipped; sequence covers Tier 1, 3, 4
      mockSelectSequence([[], [], []]);

      const result = await routeMessage("co-1",
        buildMsg({ fromAddress: "stranger@personal.com", subject: "Vacation", bodyText: "" }),
        { direction: "inbound" }
      );

      expect(result.action).toBe("discard");
    });
  });

  describe("outbound", () => {
    it("routes to the matched customer when toAddress is a known contact", async () => {
      // Tier 1 candidates = toAddresses (mailbox excluded); 1 result → route
      mockSelectSequence([[{ customerId: "cust-456" }]]);

      const result = await routeMessage("co-1",
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["recipient@customer.com"],
          mailboxEmailAddress: "mailbox@company.com",
        }),
        { direction: "outbound" }
      );

      expect(result.action).toBe("route");
      expect(result.customerId).toBe("cust-456");
      expect(result.routingMethod).toBe("email_match");
    });

    it("routes to the matched customer when a ccAddress is a known contact", async () => {
      // toAddress has no match; ccAddress resolves to a customer
      mockSelectSequence([[{ customerId: "cust-789" }]]);

      const result = await routeMessage("co-1",
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["nobody@personal.com"],
          ccAddresses: ["cc-contact@customer.com"],
          mailboxEmailAddress: "mailbox@company.com",
        }),
        { direction: "outbound" }
      );

      expect(result.action).toBe("route");
      expect(result.customerId).toBe("cust-789");
      expect(result.routingMethod).toBe("email_match");
    });

    it("discards when no outbound recipient matches any CRM contact", async () => {
      // Tier 1 (contacts): []  Tier 3 (allCustomers): []  Tier 4 (pmcCustomers): []
      mockSelectSequence([[], [], []]);

      const result = await routeMessage("co-1",
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["personal@gmail.com"],
          ccAddresses: [],
          mailboxEmailAddress: "mailbox@company.com",
          subject: "Personal note",
          bodyText: "",
        }),
        { direction: "outbound" }
      );

      expect(result.action).toBe("discard");
    });

    it("excludes the mailbox address itself from outbound recipient candidates", async () => {
      // toAddresses = [mailboxAddress] → filtered out → Tier 1 DB call SKIPPED
      // (uniqueTier1 is empty so the contacts query is never made)
      // Sequence covers Tier 3 and Tier 4 only.
      mockSelectSequence([[], []]);

      const result = await routeMessage("co-1",
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["mailbox@company.com"],   // self-addressed / BCC-to-self
          ccAddresses: [],
          mailboxEmailAddress: "mailbox@company.com",
          subject: "Self BCC",
          bodyText: "",
        }),
        { direction: "outbound" }
      );

      // Mailbox address is filtered out → no Tier 1 candidates → falls through to discard
      expect(result.action).toBe("discard");
    });
  });
});
