import type { RequestHandler } from "express";
import { insertCommunicationSchema } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { ComposeEmailError, composeEmailOptions, sendComposeDraft } from "../services/composeEmail";
import type { storage } from "../storage";

type Dependencies = Pick<typeof storage, "getCustomerById" | "createCommunication"> & {
  options: typeof composeEmailOptions;
  send: typeof sendComposeDraft;
  audit: (companyId: string, userId: string, result: Awaited<ReturnType<typeof sendComposeDraft>>) => Promise<unknown>;
};

export function createCustomerCommunication(deps: Dependencies): RequestHandler<{ customerId: string }> {
  return async (req, res) => {
    try {
      const user = req.user as UserWithContext;
      if (!user?.activeCompanyId) { res.status(401).json({ error: "Unauthorized" }); return; }
      if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
        res.status(403).json({ error: "Admin or office role required" }); return;
      }
      const { customerId } = req.params;
      if (!await deps.getCustomerById(customerId, user.activeCompanyId)) {
        res.status(404).json({ error: "Customer not found" }); return;
      }
      const intent = req.body.deliveryIntent;
      if (intent !== undefined && intent !== "send" && intent !== "log") {
        res.status(400).json({ error: "Invalid email delivery intent" }); return;
      }
      const payload = {
        ...req.body, companyId: user.activeCompanyId, customerId, sentById: user.id, sentByName: user.name,
        routingMethod: "manual", status: req.body.status ?? "sent", type: req.body.type ?? "email",
      };
      if (!payload.subject) payload.subject = "(No subject)";
      if (!payload.body) payload.body = payload.bodyText ?? "";
      if (!payload.sentAt && !payload.receivedAt) {
        if (payload.direction === "inbound") payload.receivedAt = new Date();
        else payload.sentAt = new Date();
      }
      const parsed = insertCommunicationSchema.safeParse(payload);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
      const data = parsed.data;
      const outboundEmail = data.type === "email" && data.direction === "outbound" && data.status === "sent";
      const capable = outboundEmail && intent !== "log" && !!data.mailboxAccountId
        && (await deps.options(user)).mailboxes.some(mailbox => mailbox.id === data.mailboxAccountId);
      if (intent === "send" && !capable) {
        res.status(422).json({ error: "Connect the office mailbox before sending." }); return;
      }
      if (!capable) {
        res.status(201).json(await deps.createCommunication(data)); return;
      }
      const draft = await deps.createCommunication({
        ...data, status: "draft", sentAt: null, deliveryStatus: "pending", failureReason: null,
        bodyHtml: null, providerMessageId: null, providerThreadId: null,
      });
      try {
        const result = await deps.send(user, draft.id);
        if (result.deliveryStatus === "failed") {
          res.status(502).json({ error: result.failureReason, communicationId: result.id }); return;
        }
        await deps.audit(user.activeCompanyId, user.id, result);
        res.status(201).json(result);
      } catch (error) {
        if (!(error instanceof ComposeEmailError)) throw error;
        res.status(error.status).json({ error: error.message, communicationId: draft.id });
      }
    } catch (err) {
      req.log?.error({ err }, "Customer communication creation failed");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
