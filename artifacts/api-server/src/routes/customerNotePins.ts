import type { Express } from "express";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import type { IStorage } from "../storage";

const pinInput = z.object({ pinned: z.boolean() }).strict();

/** Same shared-note editor boundary as the existing writers, not author ownership. */
export function registerCustomerNotePins(app: Express, storage: Pick<IStorage, "pinNote">) {
  app.patch("/api/notes/:id/pin", async (req, res): Promise<void> => {
    if (!req.isAuthenticated?.()) { res.status(401).send("Not authenticated"); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || user.activeRole === "field") {
      res.status(403).send("Insufficient permissions - field role cannot edit notes"); return;
    }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    const result = pinInput.safeParse(req.body);
    if (!result.success) { res.status(400).json({ message: "A pinned boolean is required" }); return; }
    const note = await storage.pinNote(String(req.params.id), user.activeCompanyId, result.data.pinned);
    if (!note) { res.status(404).send("Note not found"); return; }
    res.json(note);
  });
}
