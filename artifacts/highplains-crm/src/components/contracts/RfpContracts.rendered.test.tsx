// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { RfpContracts } from "./RfpContracts";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "office", activeCompanyId: "company" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...args: unknown[]) => mocks.api(...args) }));
afterEach(cleanup);
const statuses = ["new", "proposal_draft", "decision_received", "closed_lost", "custom_final"].map((statusKey, i) =>
  ({ id: statusKey, statusKey, displayOrder: i, isFinal: i >= 3 ? "true" : "false" }));
describe.each(["en", "es"])("RFP Overview contract panel in %s", language => {
  async function mount(statusId: string) {
    await i18n.changeLanguage(language);
    mocks.api.mockResolvedValue({ json: async () => [{ agreementId: "agreement", termId: "exact-linked-term",
      customerName: "Branch", line: "landscape", form: "ours", seasonLabel: "2027", displayStatus: "draft", annualPriceCents: 1200000 }] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RfpContracts ticketId="rfp" statuses={statuses} statusId={statusId} />
    </QueryClientProvider>);
    await screen.findByTestId("rfp-contract-exact-linked-term");
    expect(mocks.api).toHaveBeenCalledWith("GET", "/api/contract-center/contracts?bidTicketId=rfp");
  }
  it("shows the muted eligibility message before Proposal Drafted", async () => {
    await mount("new");
    expect(screen.getByText(i18n.t("rfpContracts.beforeDraft"))).toBeTruthy();
    expect(screen.queryByText(i18n.t("rfpContracts.create"))).toBeNull();
  });
  it.each(["proposal_draft", "decision_received"])("allows additional contracts at nonfinal %s", async status => {
    await mount(status);
    expect(screen.getByText(i18n.t("rfpContracts.create")).getAttribute("href")).toBe("/dashboard/contracts/new?fromRfp=rfp");
    expect(screen.getByTestId("rfp-contract-exact-linked-term").textContent).toContain("$12,000");
  });
  it.each(["closed_lost", "custom_final"])("lists contracts but does not create at final %s", async status => {
    await mount(status);
    expect(screen.queryByText(i18n.t("rfpContracts.create"))).toBeNull();
    expect(screen.queryByText(i18n.t("rfpContracts.beforeDraft"))).toBeNull();
  });
});
