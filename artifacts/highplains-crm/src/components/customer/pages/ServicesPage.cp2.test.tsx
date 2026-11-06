// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import ServicesPage from "./ServicesPage";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { accessRole: "admin" } }) }));
vi.mock("@/lib/customerScope", () => ({ useCustomerScope: () => ({ scope: ["company", "viewer"], enabled: false }) }));
vi.mock("@/hooks/useCustomerServices", () => ({ useCustomerServices: () => ({
  services: [{ id: "campaign:item1", source: "campaign", title: "Irrigation visit", state: "done",
    start: "2026-05-01", end: "2026-05-31", inContract: true, completedAt: "2026-05-12T12:00:00Z" }],
  items: [{ id: "item1", campaignId: "campaign1", customerId: "customer1", customerName: "Example property",
    status: "completed", completedAt: "2026-05-12T12:00:00Z", currentStep: "work_completed",
    campaign: { title: "Spring irrigation", category: "irrigation", windowStart: "2026-05-01", windowEnd: "2026-05-31" } }],
  isLoading: false, isError: false,
}) }));
afterEach(cleanup);
describe("CP2 Services existing item details", () => {
  it("opens the existing checklist detail panel with its real campaign and canonical links", async () => {
    render(<QueryClientProvider client={new QueryClient()}><ServicesPage customerId="customer1" /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId("row-service-campaign:item1"));
    expect(await screen.findByTestId("checklist-item-detail-panel")).toBeDefined();
    expect(screen.getByTestId("panel-campaign-title").textContent).toBe("Spring irrigation");
    expect(screen.getByTestId("link-open-execution").closest("a")?.getAttribute("href")).toBe("/dashboard/campaigns/campaign1/items/item1");
  });
});
