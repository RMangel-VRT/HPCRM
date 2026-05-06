// @vitest-environment node
/**
 * Tests for emailRouter.ts direction-aware routing and
 * emailSyncService.ts parseGmailMessage (RFC Message-ID extraction / dedup key).
 *
 * Run with: npx vitest run server/services/emailRouter.test.ts
 *
 * These tests use a real PostgreSQL database (the dev DATABASE_URL) with
 * per-test company isolation — each test creates its own company UUID and
 * tears it down via CASCADE delete in afterEach.  No drizzle-orm or schema
 * mocks are needed; only emailService and googleOAuth are stubbed to prevent
 * real network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./emailService", () => ({ sendEmail: vi.fn() }));
vi.mock("./googleOAuth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("mock-token"),
  getOAuth2Client: vi.fn(),
}));

import { db } from "../db";
import { communications } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { parseGmailMessage } from "./emailSyncService";
import { routeMessage } from "./emailRouter";
import type { ParsedMessage } from "./emailRouter";
import {
  createTestCompany,
  createTestCustomer,
  createTestContact,
  createTestCommunication,
  cleanupTestCompany,
} from "./testHelpers/dbSeed";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  let companyId: string;

  beforeEach(async () => {
    companyId = await createTestCompany();
  });

  afterEach(async () => {
    await cleanupTestCompany(companyId);
  });

  it("SENT folder message resolves to same RFC ID that gmailSender stored", () => {
    const crmRfcId = "<deadbeef1234@highplains.crm>";

    const parsed = parseGmailMessage({
      id: "gmail-sent-internal-9999",
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

    const customerId = await createTestCustomer(companyId);
    await createTestCommunication(companyId, customerId, { providerMessageId: rfcId });

    const existingComm = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.providerMessageId, parsed!.providerMessageId),
        ),
      )
      .limit(1);

    expect(existingComm).toHaveLength(1);
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

    const existingComm = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.providerMessageId, parsed!.providerMessageId),
        ),
      )
      .limit(1);

    expect(existingComm).toHaveLength(0);
  });
});

// ── routeMessage: direction-aware Tier 1 routing ──────────────────────────────

describe("routeMessage", () => {
  let companyId: string;

  beforeEach(async () => {
    companyId = await createTestCompany();
  });

  afterEach(async () => {
    await cleanupTestCompany(companyId);
  });

  describe("inbound", () => {
    it("routes to the matched customer when fromAddress is a known contact", async () => {
      const customerId = await createTestCustomer(companyId);
      await createTestContact(companyId, customerId, ["cust@example.com"]);

      const result = await routeMessage(
        companyId,
        buildMsg({ fromAddress: "cust@example.com" }),
        { direction: "inbound" },
      );

      expect(result.action).toBe("route");
      expect(result.customerId).toBe(customerId);
      expect(result.routingMethod).toBe("email_match");
      expect(result.routingConfidence).toBe(1.0);
    });

    it("returns unsorted when fromAddress belongs to contacts in multiple customers", async () => {
      const custA = await createTestCustomer(companyId, { name: "Customer A" });
      const custB = await createTestCustomer(companyId, { name: "Customer B" });
      await createTestContact(companyId, custA, ["shared@example.com"]);
      await createTestContact(companyId, custB, ["shared@example.com"]);

      const result = await routeMessage(
        companyId,
        buildMsg({ fromAddress: "shared@example.com" }),
        { direction: "inbound" },
      );

      expect(result.action).toBe("unsorted");
      expect(result.candidateCustomerIds).toHaveLength(2);
      expect(result.candidateCustomerIds).toEqual(
        expect.arrayContaining([custA, custB]),
      );
    });

    it("discards when no tier finds any CRM signals", async () => {
      const result = await routeMessage(
        companyId,
        buildMsg({ fromAddress: "stranger@personal.com", subject: "Vacation", bodyText: "" }),
        { direction: "inbound" },
      );

      expect(result.action).toBe("discard");
    });
  });

  describe("outbound", () => {
    it("routes to the matched customer when toAddress is a known contact", async () => {
      const customerId = await createTestCustomer(companyId);
      await createTestContact(companyId, customerId, ["recipient@customer.com"]);

      const result = await routeMessage(
        companyId,
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["recipient@customer.com"],
          mailboxEmailAddress: "mailbox@company.com",
        }),
        { direction: "outbound" },
      );

      expect(result.action).toBe("route");
      expect(result.customerId).toBe(customerId);
      expect(result.routingMethod).toBe("email_match");
    });

    it("routes to the matched customer when a ccAddress is a known contact", async () => {
      const customerId = await createTestCustomer(companyId);
      await createTestContact(companyId, customerId, ["cc-contact@customer.com"]);

      const result = await routeMessage(
        companyId,
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["nobody@personal.com"],
          ccAddresses: ["cc-contact@customer.com"],
          mailboxEmailAddress: "mailbox@company.com",
        }),
        { direction: "outbound" },
      );

      expect(result.action).toBe("route");
      expect(result.customerId).toBe(customerId);
      expect(result.routingMethod).toBe("email_match");
    });

    it("discards when no outbound recipient matches any CRM contact", async () => {
      const result = await routeMessage(
        companyId,
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["personal@gmail.com"],
          ccAddresses: [],
          mailboxEmailAddress: "mailbox@company.com",
          subject: "Personal note",
          bodyText: "",
        }),
        { direction: "outbound" },
      );

      expect(result.action).toBe("discard");
    });

    it("excludes the mailbox address itself from outbound recipient candidates", async () => {
      const result = await routeMessage(
        companyId,
        buildMsg({
          fromAddress: "mailbox@company.com",
          toAddresses: ["mailbox@company.com"],
          ccAddresses: [],
          mailboxEmailAddress: "mailbox@company.com",
          subject: "Self BCC",
          bodyText: "",
        }),
        { direction: "outbound" },
      );

      expect(result.action).toBe("discard");
    });
  });
});
