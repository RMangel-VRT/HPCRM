import { db } from "../db";
import { mailboxAccounts, settings, users as usersTable } from "@workspace/db";
import type { MailboxVisibilityConfig, RoleName } from "@workspace/db";
import { DEFAULT_MAILBOX_VISIBILITY } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export type ViewerContext = {
  userId: string;
  companyId: string;
  role: RoleName;
  viewAs?: string;
  isSuperAdmin?: boolean;
};

export type VisibleMailboxes = {
  mailboxIds: string[] | null;
  includeNullMailbox: boolean;
  nullMailboxSentByUserId?: string;
  scopeLabel: string;
};

export class MailboxScopeForbiddenError extends Error {
  status = 403 as const;
  constructor(message: string) {
    super(message);
    this.name = "MailboxScopeForbiddenError";
  }
}

async function loadConfig(companyId: string): Promise<MailboxVisibilityConfig> {
  const [row] = await db.select({ defaultMailboxVisibility: settings.defaultMailboxVisibility })
    .from(settings)
    .where(eq(settings.companyId, companyId))
    .limit(1);
  const raw = row?.defaultMailboxVisibility;
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as MailboxVisibilityConfig).shared)) {
    return DEFAULT_MAILBOX_VISIBILITY;
  }
  return raw as MailboxVisibilityConfig;
}

async function getPersonalMailboxIdForUser(companyId: string, userId: string): Promise<string | null> {
  const [row] = await db.select({ id: mailboxAccounts.id })
    .from(mailboxAccounts)
    .where(and(
      eq(mailboxAccounts.companyId, companyId),
      eq(mailboxAccounts.ownerUserId, userId),
      eq(mailboxAccounts.accountType, "personal"),
      eq(mailboxAccounts.isActive, true),
    ))
    .limit(1);
  return row?.id ?? null;
}

async function getSharedMailboxIds(companyId: string): Promise<string[]> {
  const rows = await db.select({ id: mailboxAccounts.id })
    .from(mailboxAccounts)
    .where(and(
      eq(mailboxAccounts.companyId, companyId),
      eq(mailboxAccounts.accountType, "shared"),
      eq(mailboxAccounts.isActive, true),
    ))
    .limit(1000);
  return rows.map(r => r.id);
}

async function getUserNameById(userId: string): Promise<string> {
  const [row] = await db.select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row?.name ?? userId;
}

async function getMailboxById(companyId: string, mailboxId: string): Promise<{ id: string; displayName: string } | null> {
  const [row] = await db.select({ id: mailboxAccounts.id, displayName: mailboxAccounts.displayName })
    .from(mailboxAccounts)
    .where(and(
      eq(mailboxAccounts.id, mailboxId),
      eq(mailboxAccounts.companyId, companyId),
      eq(mailboxAccounts.isActive, true),
    ))
    .limit(1);
  return row ?? null;
}

export async function resolveVisibleMailboxes(ctx: ViewerContext): Promise<VisibleMailboxes> {
  const { userId, companyId, role, viewAs, isSuperAdmin } = ctx;

  const isAdminLike = isSuperAdmin || role === "admin" || role === "office";

  if (isAdminLike) {
    if (!viewAs || viewAs === "all") {
      return {
        mailboxIds: null,
        includeNullMailbox: true,
        scopeLabel: "All mailboxes",
      };
    }

    const targetId = viewAs;

    const mailbox = await getMailboxById(companyId, targetId);
    if (mailbox) {
      return {
        mailboxIds: [mailbox.id],
        includeNullMailbox: false,
        scopeLabel: `Viewing: ${mailbox.displayName}`,
      };
    }

    const personalId = await getPersonalMailboxIdForUser(companyId, targetId);
    const userName = await getUserNameById(targetId);
    const ids: string[] = [];
    if (personalId) ids.push(personalId);
    return {
      mailboxIds: ids,
      includeNullMailbox: false,
      scopeLabel: `Viewing: ${userName}`,
    };
  }

  if (viewAs) {
    throw new MailboxScopeForbiddenError("You can only view your own mailbox.");
  }

  const config = await loadConfig(companyId);
  const perRoleOverride = config.perRole?.[role];

  if (perRoleOverride === "all") {
    return {
      mailboxIds: null,
      includeNullMailbox: true,
      scopeLabel: "All mailboxes",
    };
  }

  const roleInShared = config.shared.includes(role);

  if (perRoleOverride === undefined && !roleInShared) {
    return {
      mailboxIds: null,
      includeNullMailbox: true,
      scopeLabel: "All mailboxes",
    };
  }

  const ids: string[] = [];

  if (perRoleOverride !== "shared_only") {
    const personalId = await getPersonalMailboxIdForUser(companyId, userId);
    if (personalId) ids.push(personalId);
  }

  if (roleInShared || perRoleOverride === "shared_only") {
    const sharedIds = await getSharedMailboxIds(companyId);
    for (const id of sharedIds) {
      if (!ids.includes(id)) ids.push(id);
    }
  }

  return {
    mailboxIds: ids,
    includeNullMailbox: false,
    nullMailboxSentByUserId: userId,
    scopeLabel: "My mailboxes",
  };
}
