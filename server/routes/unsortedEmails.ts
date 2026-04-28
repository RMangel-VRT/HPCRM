import { Router } from "express";
import { db } from "../db";
import { unsortedEmails } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { storage } from "../storage";
import type { UserWithContext } from "../auth";

const router = Router();

const VALID_STATUSES = ["pending", "routed", "archived", "spam"] as const;
type UnsortedEmailStatus = typeof VALID_STATUSES[number];

function isValidStatus(s: unknown): s is UnsortedEmailStatus {
  return VALID_STATUSES.includes(s as UnsortedEmailStatus);
}

router.get("/", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const { status, mailboxAccountId, assignedToUserId, page, limit: limitStr } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limitStr as string) || 25);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(unsortedEmails.companyId, user.activeCompanyId)];
    if (status && isValidStatus(status)) {
      conditions.push(eq(unsortedEmails.status, status));
    }
    if (mailboxAccountId) {
      conditions.push(eq(unsortedEmails.mailboxAccountId, mailboxAccountId as string));
    }
    if (assignedToUserId) {
      conditions.push(eq(unsortedEmails.assignedToUserId, assignedToUserId as string));
    }

    const rows = await db.select()
      .from(unsortedEmails)
      .where(and(...conditions))
      .orderBy(desc(unsortedEmails.receivedAt))
      .limit(limitNum)
      .offset(offset);
    res.json(rows);
  } catch (err) {
    console.error("GET /api/unsorted-emails error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [email] = await db.select()
      .from(unsortedEmails)
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId)));
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
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [email] = await db.select()
      .from(unsortedEmails)
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId)));
    if (!email) return res.status(404).json({ error: "Not found" });

    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ error: "customerId is required" });
    const customer = await storage.getCustomerById(customerId, user.activeCompanyId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const comm = await storage.createCommunication({
      companyId: user.activeCompanyId,
      customerId,
      sentById: user.id,
      type: "email",
      direction: "inbound",
      status: "sent",
      subject: email.subject,
      body: email.bodyText || email.subject,
      bodyText: email.bodyText ?? undefined,
      bodyHtml: email.bodyHtml ?? undefined,
      fromAddress: email.fromAddress,
      fromName: email.fromName ?? undefined,
      toAddresses: email.toAddresses ?? [],
      receivedAt: email.receivedAt,
      providerThreadId: email.providerThreadId ?? undefined,
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
    res.json({ communication: comm, email: updated });
  } catch (err) {
    console.error("POST /api/unsorted-emails/:id/route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/archive", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [updated] = await db.update(unsortedEmails)
      .set({ status: "archived" })
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId)))
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
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [updated] = await db.update(unsortedEmails)
      .set({ status: "spam" })
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId)))
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
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const { assignedToUserId } = req.body;
    const [updated] = await db.update(unsortedEmails)
      .set({ assignedToUserId: assignedToUserId ?? null })
      .where(and(eq(unsortedEmails.id, req.params.id), eq(unsortedEmails.companyId, user.activeCompanyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    console.error("POST /api/unsorted-emails/:id/assign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
