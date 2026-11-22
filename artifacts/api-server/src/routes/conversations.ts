import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod/v4";
import { GetConversationResponse, ListConversationsResponse, PreviewConversationReplyResponse,
  SendConversationReplyResponse } from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { COMM_LIST_ROLES_SET, requireCommPermission } from "../lib/communicationPermissions";
import { ComposeEmailError } from "../services/composeEmail";
import { conversationScope, listConversations, readConversation } from "../services/conversations";
import { conversationReplyInput, previewConversationReply, sendConversationReply } from "../services/conversationReplies";
import { MailboxScopeForbiddenError } from "../services/mailboxScope";

const customerId = z.string().min(1).max(128).optional();
const detailQuery = z.object({ customerId }).strict();
const listQuery = z.object({ customerId, filter: z.enum(["all", "needs_reply", "sent"]).default("all"),
  search: z.string().trim().max(300).default(""), page: z.coerce.number().int().min(1).max(1_000_000).default(1),
}).strict();

export function registerConversations(app: Express) {
  const handle = (fn: (req: Request, res: Response, user: UserWithContext) => Promise<void>): RequestHandler =>
    async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      const user = req.user as UserWithContext | undefined;
      if (!req.isAuthenticated() || !user?.activeCompanyId) { res.status(401).json({ error: "Not authenticated" }); return; }
      if (!COMM_LIST_ROLES_SET.includes(user.accessRole)) { res.status(403).json({ error: "Access denied" }); return; }
      const company = req.get("X-Company-Id");
      if (company && company !== user.activeCompanyId) {
        res.status(409).json({ error: "Active company changed. Reload and try again." }); return;
      }
      try { await fn(req, res, user); }
      catch (error) {
        if (error instanceof ComposeEmailError || error instanceof MailboxScopeForbiddenError) {
          res.status(error.status).json({ error: error.message }); return;
        }
        req.log?.error({ code: (error as { code?: string })?.code }, "Conversation operation failed");
        res.status(500).json({ error: "Conversation operation failed." });
      }
    };
  const roots = ["/api/conversations", "/api/threads"];
  app.get(roots, handle(async (req, res, user) => {
    const input = listQuery.safeParse(req.query);
    if (!input.success) { res.status(400).json({ error: "Invalid conversation filters." }); return; }
    const { customerId, filter, search, page } = input.data;
    res.json(ListConversationsResponse.parse(await listConversations(await conversationScope(user, customerId), filter, search, page)));
  }));
  app.get(roots.map(root => `${root}/:key`), handle(async (req, res, user) => {
    const input = detailQuery.safeParse(req.query);
    if (!input.success) { res.status(400).json({ error: "Invalid customer filter." }); return; }
    const detail = await readConversation(await conversationScope(user, input.data.customerId), String(req.params.key));
    if (!detail) { res.status(404).json({ error: "Conversation not found." }); return; }
    res.json(GetConversationResponse.parse(detail));
  }));
  for (const [path, operation] of [["reply-preview", previewConversationReply], ["reply", sendConversationReply]] as const) {
    app.post(roots.map(root => `${root}/:key/${path}`), requireCommPermission("send"), handle(async (req, res, user) => {
      if (req.get("X-Company-Id") !== user.activeCompanyId) {
        res.status(409).json({ error: "Active company changed. Reload and try again." }); return;
      }
      const input = conversationReplyInput.safeParse(req.body);
      if (!input.success) { res.status(400).json({ error: "Invalid reply." }); return; }
      const result = await operation(user, String(req.params.key), input.data);
      res.json((path === "reply-preview" ? PreviewConversationReplyResponse : SendConversationReplyResponse).parse(result));
    }));
  }
}
