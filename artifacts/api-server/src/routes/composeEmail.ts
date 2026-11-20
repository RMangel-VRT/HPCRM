import type { Express, Request, RequestHandler, Response } from "express";
import type { UserWithContext } from "../auth";
import { ComposeEmailError, composeEmailOptions, composeEmailPreviewInput, previewComposeEmail, sendComposeDraft, sendDraftInput } from "../services/composeEmail";

export function registerComposeEmailRoutes(app: Express, requireSend: RequestHandler, dependencies = {
  preview: previewComposeEmail, send: sendComposeDraft,
  audit: async (_company: string, _actor: string, _result: Awaited<ReturnType<typeof sendComposeDraft>>) => {},
}) {
  const handle = (fn: (req: Request, res: Response, user: UserWithContext) => Promise<void>): RequestHandler =>
    async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      const user = req.user as UserWithContext;
      const expected = req.get("X-Company-Id");
      if (!user.activeCompanyId || (expected && expected !== user.activeCompanyId)) {
        res.status(409).json({ error: "Active company changed. Reload and try again." }); return;
      }
      try { await fn(req, res, user); }
      catch (err) {
        if (err instanceof ComposeEmailError) { res.status(err.status).json({ error: err.message }); return; }
        req.log?.error({ err }, "Compose email operation failed");
        res.status(500).json({ error: "Email operation failed." });
      }
    };
  app.post("/api/communications/preview", requireSend, handle(async (req, res, user) => {
    const parsed = composeEmailPreviewInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Enter a valid subject and message." }); return; }
    res.json(await dependencies.preview(user.activeCompanyId, parsed.data));
  }));
  app.get("/api/communications/send-options", requireSend, handle(async (_req, res, user) => {
    res.json(await composeEmailOptions(user));
  }));
  app.post("/api/communications/:id/send", requireSend, handle(async (req, res, user) => {
    const parsed = sendDraftInput.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: "Enter a valid recipient email." }); return; }
    const result = await dependencies.send(user, String(req.params.id), parsed.data.recipientEmail);
    if (result.deliveryStatus === "sent") await dependencies.audit(user.activeCompanyId, user.id, result);
    res.json(result);
  }));
}
