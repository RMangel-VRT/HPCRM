import type { Ticket } from "@workspace/db";
import { storage } from "../storage";

type LocationFields = Pick<Ticket, "locationLabel" | "locationDescription" | "locationLat" | "locationLng">;

/** Ticket activity uses attributed comments for field edits that aren't status transitions. */
export async function recordTicketLocationEdit(previous: Ticket, current: LocationFields, userId: string) {
  const textChanged = previous.locationLabel !== current.locationLabel || previous.locationDescription !== current.locationDescription;
  const pinChanged = previous.locationLat !== current.locationLat || previous.locationLng !== current.locationLng;
  if (!textChanged && !pinChanged) return;
  const body = textChanged && pinChanged ? "Work location and map pin updated"
    : textChanged ? "Work location updated" : "Work location map pin updated";
  await storage.createTicketComment({ ticketId: previous.id, authorId: userId, body });
}
