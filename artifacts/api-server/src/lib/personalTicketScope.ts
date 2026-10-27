import { isSeededTicketType } from "../shared/ticketCapabilities";

/** Contract opportunities belong to Bids, not the personal assignment list. */
export function excludeBidsFromPersonalTickets<T extends { ticketTypeId: string }>(
  rows: T[], types: readonly (Parameters<typeof isSeededTicketType>[0] & { id: string })[],
): T[] {
  const bidTypeIds = new Set(types.filter(type => isSeededTicketType(type, "rfp_request")).map(type => type.id));
  return rows.filter(row => !bidTypeIds.has(row.ticketTypeId));
}
