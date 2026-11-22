import { Router } from "express";
import { db, inTransaction } from "../db";
import { unsortedEmails } from "@workspace/db";
import { eq, and, desc, sql, inArray, gte, isNull, or, ilike } from "drizzle-orm";
import { storage } from "../storage";
import type { UserWithContext } from "../auth";
import { resolveVisibleMailboxes, MailboxScopeForbiddenError, sharedOrUnassigned } from "../services/mailboxScope";
import type { RoleName } from "@workspace/db";
import { lockMailIdentity } from "../services/mailboxIngestion";
import { emailSnippet, splitEmailQuote } from "../services/emailQuotes";

const router = Router();
router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  const user = req.user as UserWithContext | undefined;
  const expected = req.get("X-Company-Id");
  if (expected && expected !== user?.activeCompanyId) {
    res.status(409).json({ error: "Active company changed. Reload and try again." }); return;
  }
  next();
});

const VALID_STATUSES = ["pending", "routed", "archived", "spam"] as const;
type UnsortedEmailStatus = typeof VALID_STATUSES[number];

function isValidStatus(s: unknown): s is UnsortedEmailStatus {
  return VALID_STATUSES.includes(s as UnsortedEmailStatus);
}

router.get("/", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const viewAs = req.query.viewAs as string | undefined;
    let visibleMailboxIds: string[] | null = null;
    let includeNullMailbox = false;

    try {
      const vis = await resolveVisibleMailboxes({
        userId: user.id,
        companyId: user.activeCompanyId,
        role: user.activeRole as RoleName,
        viewAs: viewAs || undefined,
        isSuperAdmin: user.isSuperAdminBool,
      });
      visibleMailboxIds = vis.mailboxIds;
      includeNullMailbox = vis.includeNullMailbox;
    } catch (err) {
      if (err instanceof MailboxScopeForbiddenError) return res.status(403).json({ error: err.message });
      console.error("[unsortedEmails] scope resolution error:", err);
      return res.status(500).json({ error: "Failed to resolve mailbox visibility" });
    }

    if (visibleMailboxIds !== null && visibleMailboxIds.length === 0 && !includeNullMailbox) {
      return res.json([]);
    }

    const { status, mailboxAccountId, assignedToUserId, candidateCustomerId, direction, page, limit: limitStr, resolvedToday } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limitStr as string) || 25));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(unsortedEmails.companyId, user.activeCompanyId), sharedOrUnassigned(user.activeCompanyId, unsortedEmails.mailboxAccountId)];
    if (status && isValidStatus(status)) {
      conditions.push(eq(unsortedEmails.status, status));
    }

    if (mailboxAccountId) {
      const requested = mailboxAccountId as string;
      if (visibleMailboxIds !== null && !visibleMailboxIds.includes(requested)) {
        return res.json([]);
      }
      conditions.push(eq(unsortedEmails.mailboxAccountId, requested));
    } else if (visibleMailboxIds !== null) {
      conditions.push(or(visibleMailboxIds.length ? inArray(unsortedEmails.mailboxAccountId, visibleMailboxIds) : undefined,
        includeNullMailbox ? isNull(unsortedEmails.mailboxAccountId) : undefined)!);
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 300) : "";
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(unsortedEmails.subject, like), ilike(unsortedEmails.fromAddress, like),
        ilike(unsortedEmails.fromName, like), ilike(unsortedEmails.bodyText, like))!);
    }
    if (assignedToUserId) {
      conditions.push(eq(unsortedEmails.assignedToUserId, assignedToUserId as string));
    }
    if (candidateCustomerId) {
      conditions.push(
        sql`${unsortedEmails.candidateCustomerIds} @> ARRAY[${candidateCustomerId as string}]::varchar[]`
      );
    }
    // direction filter: "inbound" | "outbound" — default "all" means no filter
    if (direction === "inbound" || direction === "outbound") {
      conditions.push(eq(unsortedEmails.direction, direction as "inbound" | "outbound"));
    }
    // resolvedToday=true — filter to emails resolved today by the current user
    if (resolvedToday === "true") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      conditions.push(eq(unsortedEmails.resolvedByUserId, user.id));
      conditions.push(gte(unsortedEmails.resolvedAt, todayStart));
    }

    const rows = await db.select()
      .from(unsortedEmails)
      .where(and(...conditions))
      .orderBy(desc(unsortedEmails.receivedAt), desc(unsortedEmails.id))
      .limit(limitNum)
      .offset(offset);
    console.info(`[communications.list] user=${user.id} role=${user.activeRole} tab=unsorted viewAs=${viewAs ?? null} returned=${rows.length} totalAvailable=${rows.length}`);
    res.json(req.query.conversations === "true" ? rows.map(row => {
      const parts = splitEmailQuote(row.bodyHtml, row.bodyText ?? "");
      return { ...row, ...parts, snippet: emailSnippet(parts.newText) };
    }) : rows);
  } catch (err) {
    console.error("GET /api/unsorted-emails error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [email] = await db.select()
      .from(unsortedEmails)
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId),
        sharedOrUnassigned(user.activeCompanyId, unsortedEmails.mailboxAccountId)));
    if (!email) return res.status(404).json({ error: "Not found" });
    res.json(email);
  } catch (err) {
    console.error("GET /api/unsorted-emails/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/route", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ error: "customerId is required" });
    const customer = await storage.getCustomerById(customerId, user.activeCompanyId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const result = await db.transaction(tx => inTransaction(tx, async () => {
      await lockMailIdentity(tx, user.activeCompanyId);
      const [email] = await tx.select().from(unsortedEmails).where(and(eq(unsortedEmails.id, req.params.id),
        eq(unsortedEmails.companyId, user.activeCompanyId), sharedOrUnassigned(user.activeCompanyId, unsortedEmails.mailboxAccountId))).for("update");
      if (!email) return null;
      if (email.resolvedToCommunicationId || email.status !== "pending") return false;
      const comm = await storage.createCommunication({
        companyId: user.activeCompanyId,
        customerId,
        type: "email",
        direction: email.direction ?? "inbound",
        status: "sent",
        followUpStatus: "none",
        subject: email.subject,
        body: email.bodyText || email.subject,
        bodyText: email.bodyText ?? undefined,
        bodyHtml: email.bodyHtml ?? undefined,
        fromAddress: email.fromAddress,
        fromName: email.fromName ?? undefined,
        toAddresses: email.toAddresses ?? [],
        ccAddresses: [],
        bccAddresses: [],
        receivedAt: email.receivedAt,
        providerMessageId: email.providerMessageId ?? undefined,
        providerThreadId: email.providerThreadId ?? undefined,
        attachmentsJson: email.attachmentsJson ?? [],
        mailboxAccountId: email.mailboxAccountId ?? undefined,
        routingMethod: "manual",
        sentAt: email.receivedAt,
      });

      const [updated] = await db.update(unsortedEmails)
        .set({
          status: "routed",
          resolvedToCommunicationId: comm.id,
          resolvedByUserId: user.id,
          resolvedAt: new Date(),
        })
        .where(eq(unsortedEmails.id, req.params.id))
        .returning();
      return { communication: comm, email: updated };
    }));
    if (result === null) return res.status(404).json({ error: "Not found" });
    if (result === false) return res.status(409).json({ error: "This email is already sorted." });
    res.json(result);
  } catch (err) {
    console.error("POST /api/unsorted-emails/:id/route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/archive", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [updated] = await db.update(unsortedEmails)
      .set({ status: "archived" })
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId),
        sharedOrUnassigned(user.activeCompanyId, unsortedEmails.mailboxAccountId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    console.error("POST /api/unsorted-emails/:id/archive error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/spam", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [updated] = await db.update(unsortedEmails)
      .set({ status: "spam" })
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId),
        sharedOrUnassigned(user.activeCompanyId, unsortedEmails.mailboxAccountId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    console.error("POST /api/unsorted-emails/:id/spam error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/assign", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const { assignedToUserId } = req.body;
    const [updated] = await db.update(unsortedEmails)
      .set({ assignedToUserId: assignedToUserId ?? null })
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId),
        sharedOrUnassigned(user.activeCompanyId, unsortedEmails.mailboxAccountId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    console.error("POST /api/unsorted-emails/:id/assign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
