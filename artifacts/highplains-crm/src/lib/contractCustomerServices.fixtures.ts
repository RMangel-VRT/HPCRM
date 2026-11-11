import type { CustomerServices, ServiceFulfillment, ServiceSeason } from "@workspace/api-client-react";

/** Synthetic, read-only consumer fixtures. Never persisted or used as application fallback. */
export const serviceSeasonFixture: ServiceSeason = {
  termId: "term1", agreementId: "agreement1", label: "Landscape 2026", startDate: "2026-01-01",
  endDate: "2026-12-31", status: "active", parentCustomerId: null,
};
export const serviceRowFixture = (over: Partial<ServiceFulfillment> = {}): ServiceFulfillment => ({
  serviceKey: "irrigation_activation", label: "Irrigation activation", scheduling: "campaign", statedQuantity: 2,
  owed: 2, done: 1, skipped: 0, remaining: 1, planned: 0, inProgress: 0, status: "missing_item",
  issues: ["missing_item"], next: { kind: "round_window", date: "2026-04-07", campaignId: "round1", itemId: "item1", visitId: null },
  rounds: [{
    calendarEntryId: "calendar1", roundYear: 2026, name: "Spring round", campaignId: "round1", itemId: "item1", dueDate: "2026-04-20",
    windowStart: "2026-04-01", windowEnd: "2026-04-20", dateKind: "round_window", state: "pending", timing: "calendar", countSource: "standard",
  }], ...over,
});
export const customerServicesFixture = (over: Partial<CustomerServices> = {}): CustomerServices => ({
  customerId: "customer1", asOf: "2026-04-01", availableTerms: [serviceSeasonFixture], selectedTerm: serviceSeasonFixture,
  rows: [serviceRowFixture()], alsoInContract: [], otherWork: [], retainedWork: [], ...over,
});
