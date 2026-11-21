import { db } from "../db";
import { accessRole } from "../../../../lib/db/src/accessRole";
import { mailboxAccounts, settings } from "@workspace/db";
import type { MailboxVisibilityConfig, RoleName } from "@workspace/db";
import { DEFAULT_MAILBOX_VISIBILITY } from "@workspace/db";
import { eq, and, sql, or, isNull, type SQLWrapper } from "drizzle-orm";
import type { UserWithContext } from "../auth";

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

async function getMailboxById(companyId: string, mailboxId: string): Promise<{ id: string; displayName: string } | null> {
  const [row] = await db.select({ id: mailboxAccounts.id, displayName: mailboxAccounts.displayName })
    .from(mailboxAccounts)
    .where(and(
      eq(mailboxAccounts.id, mailboxId),
      eq(mailboxAccounts.accountType, "shared"),
      eq(mailboxAccounts.companyId, companyId),
      eq(mailboxAccounts.isActive, true),
    ))
    .limit(1);
  return row ?? null;
}

export async function resolveVisibleMailboxes(ctx: ViewerContext): Promise<VisibleMailboxes> {
  const { userId, companyId, viewAs, isSuperAdmin } = ctx;
  const role = accessRole(ctx.role);

  const isAdminLike = isSuperAdmin || role === "admin" || role === "office";

  if (isAdminLike) {
    if (!viewAs || viewAs === "all") {
      return {
        mailboxIds: await getSharedMailboxIds(companyId),
        includeNullMailbox: true,
        scopeLabel: "Shared mailboxes",
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

    return { mailboxIds: [], includeNullMailbox: false, scopeLabel: "Shared mailbox unavailable" };
  }

  if (viewAs) {
    throw new MailboxScopeForbiddenError("You cannot change mailbox visibility.");
  }

  const config = await loadConfig(companyId);
  const perRoleOverride = config.perRole?.[role];

  if (perRoleOverride === "all") {
    return {
      mailboxIds: await getSharedMailboxIds(companyId),
      includeNullMailbox: true,
      scopeLabel: "Shared mailboxes",
    };
  }

  const roleInShared = config.shared.includes(role);

  if (perRoleOverride === undefined && !roleInShared) {
    return {
      mailboxIds: await getSharedMailboxIds(companyId),
      includeNullMailbox: true,
      scopeLabel: "Shared mailboxes",
    };
  }

  const ids = roleInShared || perRoleOverride === "shared_only" ? await getSharedMailboxIds(companyId) : [];
  return {
    mailboxIds: ids,
    includeNullMailbox: false,
    nullMailboxSentByUserId: userId,
    scopeLabel: "Shared mailboxes",
  };
}

/** Existing unscoped customer/history reads keep mailbox-free records, but must
 * not expose CRM copies belonging to personal or deactivated accounts. */
export function sharedOrUnassigned(company: SQLWrapper | string, mailbox: SQLWrapper) {
  return or(isNull(mailbox), sql`EXISTS (SELECT 1 FROM mailbox_accounts AS shared
    WHERE shared.id = ${mailbox} AND shared.company_id = ${company}
    AND shared.account_type = 'shared' AND shared.is_active)`)!;
}

export async function canReferenceSharedMailbox(user: UserWithContext, id: string) {
  const scope = await resolveVisibleMailboxes({ companyId: user.activeCompanyId, userId: user.id,
    role: user.activeRole, isSuperAdmin: user.isSuperAdminBool });
  return scope.mailboxIds?.includes(id) ?? false;
}
