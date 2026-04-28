import { Router } from "express";
import { db } from "../db";
import { mailboxAccounts } from "@shared/schema";
import { insertMailboxAccountSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { UserWithContext } from "../auth";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }
    const accounts = await db.select()
      .from(mailboxAccounts)
      .where(eq(mailboxAccounts.companyId, user.activeCompanyId));
    res.json(accounts);
  } catch (err) {
    console.error("GET /api/mailbox-accounts error:", err);
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
    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json(account);
  } catch (err) {
    console.error("GET /api/mailbox-accounts/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });
    const parsed = insertMailboxAccountSchema.safeParse({ ...req.body, companyId: user.activeCompanyId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const [account] = await db.insert(mailboxAccounts).values(parsed.data as typeof mailboxAccounts.$inferInsert).returning();
    res.status(201).json(account);
  } catch (err) {
    console.error("POST /api/mailbox-accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });
    const updates = req.body;
    delete updates.id;
    delete updates.companyId;
    const [account] = await db.update(mailboxAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)))
      .returning();
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json(account);
  } catch (err) {
    console.error("PATCH /api/mailbox-accounts/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });
    const [account] = await db.update(mailboxAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)))
      .returning();
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/mailbox-accounts/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
