import { Router, type RequestHandler } from "express";
import { CommitLegacyMailboxCleanupBody, CommitDuplicateSentCleanupBody } from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { cleanDuplicateSentCopies, cleanLegacyMailbox, listLegacyMailboxes, MailboxCleanupError } from "../services/mailboxCleanup";

export const mailboxCleanupRouter = Router();

const adminOnly: RequestHandler = (req, res, next) => {
  const user = req.user as UserWithContext | undefined;
  if (!user?.activeCompanyId) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Account managers inherit the ordinary admin UI grants, not destructive cleanup.
  if (user.activeRole !== "admin" && !user.isSuperAdminBool) { res.status(403).json({ error: "Admin only" }); return; }
  if (req.get("X-Company-Id") !== user.activeCompanyId) {
    res.status(409).json({ error: "Active company changed. Reload and review the cleanup again." }); return;
  }
  next();
};
mailboxCleanupRouter.use(adminOnly);

const reviewed = (operation: "legacy" | "duplicates", commit: boolean): RequestHandler<{ id?: string }> =>
  async (req, res) => {
    const user = req.user as UserWithContext;
    const companyId = user.activeCompanyId;
    const mailboxId = req.params.id;
    let reviewKey: string | undefined;
    if (commit) {
      const schema = operation === "legacy" ? CommitLegacyMailboxCleanupBody : CommitDuplicateSentCleanupBody;
      const parsed = schema.strict().safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "Review the counts and explicitly confirm the cleanup." }); return; }
      reviewKey = parsed.data.reviewKey;
    }
    try {
      const result = operation === "legacy"
        ? await cleanLegacyMailbox(companyId, mailboxId!, reviewKey)
        : await cleanDuplicateSentCopies(companyId, reviewKey);
      // Only log committed changes, never provider data, message content or credentials.
      if (commit) req.log?.info({ companyId, mailboxId, actorId: user.id, operation, counts: result.counts }, "Mailbox cleanup committed");
      res.json(result);
    } catch (err) {
      if (err instanceof MailboxCleanupError) { res.status(err.status).json({ error: err.message }); return; }
      req.log?.error({ companyId, operation, code: (err as { code?: string })?.code }, "Mailbox cleanup failed");
      res.status(500).json({ error: "Mailbox cleanup failed. No changes were committed." });
    }
  };

mailboxCleanupRouter.get("/legacy", async (req, res) => {
  const { activeCompanyId } = req.user as UserWithContext;
  res.json(await listLegacyMailboxes(activeCompanyId));
});
mailboxCleanupRouter.get("/legacy/:id", reviewed("legacy", false));
mailboxCleanupRouter.post("/legacy/:id", reviewed("legacy", true));
mailboxCleanupRouter.get("/duplicates", reviewed("duplicates", false));
mailboxCleanupRouter.post("/duplicates", reviewed("duplicates", true));
