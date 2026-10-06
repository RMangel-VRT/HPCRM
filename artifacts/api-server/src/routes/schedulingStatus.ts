import type { Express } from "express";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";
import { isSeededStatus, isSeededTicketType } from "../shared/ticketCapabilities";

export function registerSchedulingStatusRoute(app: Express): void {
  // The plural Needs scheduling status set is authoritative. The singular
  // first ID is retained only for older callers, not queue membership.
  app.get("/api/scheduling-status", async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).send("Not authenticated");
      return;
    }
    const user = req.user as UserWithContext;
    const types = await storage.getTicketTypes(user.activeCompanyId);
    const schedulingTypes = types.filter(type =>
      isSeededTicketType(type, "estimate_request")
      || isSeededTicketType(type, "project")
      || isSeededTicketType(type, "task"),
    );
    const statuses = await Promise.all(schedulingTypes.map(type => storage.getTicketTypeStatuses(type.id)));
    const schedulingStatusIds = [...new Set(statuses.flat()
      .filter(status => isSeededStatus(status, "ready_to_schedule")).map(status => status.id))];
    res.json({
      schedulingStatusId: schedulingStatusIds[0] ?? null,
      schedulingStatusIds,
      ...(schedulingTypes.length === 0 ? { message: "No scheduling ticket types found" }
        : schedulingStatusIds.length === 0 ? { message: "Needs scheduling status not found in any scheduling workflow" } : {}),
    });
  });
}
