import type { ServiceFulfillmentInputs } from "../lib/customerServiceFulfillment";
import { STARTING_SERVICE_CALENDAR } from "../../../../lib/db/src/serviceCalendarContracts";
import { customerServiceFulfillment } from "../lib/customerServiceFulfillment";
/** Synthetic acceptance data only; never loaded into a customer's calendar. */
export function fiveParksFixture(): ServiceFulfillmentInputs {
  return {
    customers: [{ id: "p", companyId: "c", name: "Village of Five Parks Heritage", street: "8612 Five Parks Drive", city: "", state: "", zip: "", managementCompany: "Hammersmith", isParent: "false", parentCustomerId: null }],
    agreements: [{ id: "a", companyId: "c", customerId: "p" }],
    terms: [{ id: "t", agreementId: "a", companyId: "c", line: "both", status: "signed", seasonLabel: "2025–26", startDate: "2025-11-01", endDate: "2026-10-31",
      projectAddress: "8612 Five Parks Drive", snowTriggers: "2 inches on walks and steps; 4 inches in alleys" }],
    scope: [
      { serviceKey: "mowing", quantity: 26, monthSpread: [0,0,0,2,5,4,4,4,5,2,0,0] },
      { serviceKey: "irrigation_inspection", quantity: null },
      { serviceKey: "winter_visits", quantity: 10, monthSpread: [2,2,2,0,0,0,0,0,0,0,2,2] },
      { serviceKey: "snow_walks", quantity: null },
    ].map((s, i) => ({ id: `s${i}`, companyId: "c", termId: "t", included: true, details: {}, priceCents: null, ...s })),
    calendar: STARTING_SERVICE_CALENDAR.map((c, i) => ({ ...c, id: `entry-${i}`, companyId: "c" })),
    campaigns: [], items: [], stops: [], visits: [], rates: [],
  } as unknown as ServiceFulfillmentInputs;
}
export function completedFiveParksFixture(): ServiceFulfillmentInputs {
  const data = fiveParksFixture();
  const rounds = customerServiceFulfillment(data, "p", "t")!.rows.find(r => r.serviceKey === "broadleaf")!.rounds;
  rounds.forEach((r, i) => {
    data.campaigns.push({ id: `broadleaf-${i}`, companyId: "c", source: "contract", serviceKey: "broadleaf", calendarEntryId: r.calendarEntryId,
      roundYear: r.roundYear, windowStart: r.windowStart, windowEnd: r.windowEnd, title: `Internal treatment ${i}` } as any);
    data.items.push({ id: `item-${i}`, campaignId: `broadleaf-${i}`, companyId: "c", customerId: "p",
      status: i === 1 ? "completed" : i === 2 ? "skipped" : "pending", completedAt: i === 1 ? new Date("2026-06-13T01:00:00Z") : null } as any);
  });
  return data;
}
