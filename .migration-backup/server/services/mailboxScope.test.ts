import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({ db: { select: vi.fn() } }));

import { resolveVisibleMailboxes, MailboxScopeForbiddenError } from "./mailboxScope";
import type { ViewerContext } from "./mailboxScope";
import { db } from "../db";

type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeSelectChain(result: unknown[]): SelectChain {
  const chain: SelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
});

function mockSettings(config: object) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(makeSelectChain([{ defaultMailboxVisibility: config }]));
}

function mockMailboxEmpty() {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(makeSelectChain([]));
}

function mockMailboxes(rows: { id: string; displayName?: string }[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(makeSelectChain(rows));
}

function mockUser(name: string) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(makeSelectChain([{ name }]));
}

describe("resolveVisibleMailboxes", () => {
  const companyId = "company-1";
  const userId = "user-1";
  const otherUserId = "user-2";

  it("Case 1: admin, no viewAs → all mailboxes (null filter)", async () => {
    const ctx: ViewerContext = { userId, companyId, role: "admin" };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).toBeNull();
    expect(result.includeNullMailbox).toBe(true);
    expect(result.scopeLabel).toBe("All mailboxes");
  });

  it("Case 2: office, viewAs=all → all mailboxes (null filter)", async () => {
    const ctx: ViewerContext = { userId, companyId, role: "office", viewAs: "all" };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).toBeNull();
    expect(result.includeNullMailbox).toBe(true);
  });

  it("Case 3: office, viewAs=userId → narrow to that user's personal mailbox", async () => {
    mockMailboxEmpty();
    mockMailboxes([{ id: "mb-personal-other" }]);
    mockUser("Jane Doe");
    const ctx: ViewerContext = { userId, companyId, role: "office", viewAs: otherUserId };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).toEqual(["mb-personal-other"]);
    expect(result.includeNullMailbox).toBe(false);
    expect(result.scopeLabel).toContain("Jane Doe");
  });

  it("Case 4: field (perRole.field=own), no viewAs → own personal mailbox only", async () => {
    mockSettings({ shared: ["admin", "office"], perRole: { field: "own" } });
    mockMailboxes([{ id: "mb-personal-self" }]);
    const ctx: ViewerContext = { userId, companyId, role: "field" };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).not.toBeNull();
    expect(result.mailboxIds).toContain("mb-personal-self");
    expect(result.includeNullMailbox).toBe(false);
    expect(result.nullMailboxSentByUserId).toBe(userId);
  });

  it("Case 5a: field, viewAs=otherUserId → throws MailboxScopeForbiddenError (403)", async () => {
    const ctx: ViewerContext = { userId, companyId, role: "field", viewAs: otherUserId };
    await expect(resolveVisibleMailboxes(ctx)).rejects.toThrow(MailboxScopeForbiddenError);
  });

  it("Case 5b: field, viewAs=all → throws MailboxScopeForbiddenError (403, scope widening blocked)", async () => {
    const ctx: ViewerContext = { userId, companyId, role: "field", viewAs: "all" };
    await expect(resolveVisibleMailboxes(ctx)).rejects.toThrow(MailboxScopeForbiddenError);
  });

  it("Case 6: field_manager, no perRole override, not in shared list → all mailboxes (no restriction)", async () => {
    mockSettings({ shared: ["admin", "office"], perRole: {} });
    const ctx: ViewerContext = { userId, companyId, role: "field_manager" };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).toBeNull();
    expect(result.includeNullMailbox).toBe(true);
    expect(result.scopeLabel).toBe("All mailboxes");
  });

  it("Case 7: field with perRole.field=shared_only → only shared mailboxes, no personal", async () => {
    mockSettings({ shared: ["admin", "office", "field"], perRole: { field: "shared_only" } });
    mockMailboxes([{ id: "mb-shared-1" }, { id: "mb-shared-2" }]);
    const ctx: ViewerContext = { userId, companyId, role: "field" };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).not.toBeNull();
    expect(result.mailboxIds).toContain("mb-shared-1");
    expect(result.mailboxIds).toContain("mb-shared-2");
    expect(result.mailboxIds).not.toContain("mb-personal-self");
    expect(result.includeNullMailbox).toBe(false);
  });

  it("Null-mailbox sentBy fallback: scoped non-admin gets nullMailboxSentByUserId set", async () => {
    mockSettings({ shared: ["admin", "office"], perRole: { field: "own" } });
    mockMailboxes([{ id: "mb-personal-self" }]);
    const ctx: ViewerContext = { userId, companyId, role: "field" };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.nullMailboxSentByUserId).toBe(userId);
  });

  it("viewAs=<mailboxAccountId>: admin narrows scope to that specific mailbox", async () => {
    const mailboxId = "mb-shared-inbox";
    mockMailboxes([{ id: mailboxId, displayName: "Shared Inbox" }]);
    const ctx: ViewerContext = { userId, companyId, role: "admin", viewAs: mailboxId };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).toEqual([mailboxId]);
    expect(result.includeNullMailbox).toBe(false);
    expect(result.scopeLabel).toContain("Viewing:");
    expect(result.scopeLabel).toContain("Shared Inbox");
  });

  it("Filter intersection: office viewAs=userId with no personal mailbox returns empty array", async () => {
    mockMailboxEmpty();
    mockMailboxes([]);
    mockUser("Bob");
    const ctx: ViewerContext = { userId, companyId, role: "office", viewAs: otherUserId };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).toEqual([]);
    expect(result.includeNullMailbox).toBe(false);
  });

  it("superAdmin flag grants all-mailbox access regardless of role", async () => {
    const ctx: ViewerContext = { userId, companyId, role: "field", isSuperAdmin: true };
    const result = await resolveVisibleMailboxes(ctx);
    expect(result.mailboxIds).toBeNull();
    expect(result.includeNullMailbox).toBe(true);
  });
});
