// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import CustomerHeader, { type CustomerHeaderProps } from "./CustomerHeader";
import { aggregateTerms } from "@/components/customer/dashboard/dashboardModel";
import type { ContractSummaryTerm } from "@/hooks/useCustomerContractSummary";

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  if (!window.PointerEvent) window.PointerEvent = MouseEvent as typeof PointerEvent;
});
afterEach(() => cleanup());
const term = (more: Partial<ContractSummaryTerm> = {}): ContractSummaryTerm => ({
  agreementId: "land", termId: "land-term", line: "landscape", label: "2026–27", annualCents: 1000000,
  startDate: "2026-11-01", endDate: "2027-10-31", ...more,
});
const base: CustomerHeaderProps = {
  customer: { id: "ute", name: "18 at Ute Creek", status: "active", customerType: "hoa", ranking: "preferred", includeInRoute: true,
    street: "12 Test St", city: "Longmont", state: "CO" },
  kind: "regular", pages: ["dashboard", "contacts", "notes", "communications", "services", "tickets", "property", "proposals", "contracts", "billing"],
  switcherCustomers: [{ id: "ute", name: "18 at Ute Creek" }, { id: "bank", name: "1st Bank" }],
  managedBy: { status: "ready", value: { company: "Property Group", manager: "Synthetic Manager" } },
  accountManager: { status: "ready", value: null }, qbo: { status: "ready", value: "linked" },
  contract: { status: "ready", value: aggregateTerms([term(), term({ agreementId: "snow", termId: "snow-term", line: "snow", annualCents: 353600 })]) },
  canEdit: true, actions: { note: true, ticket: true, proposal: true, logCommunication: true },
  onAddNote: vi.fn(), onAddProposal: vi.fn(), onLogCommunication: vi.fn(),
};
function Probe() { const [location] = useLocation(); return <output data-testid="location">{location}</output>; }
async function mount(props: Partial<CustomerHeaderProps> = {}, language = "en") {
  await i18n.changeLanguage(language);
  const location = memoryLocation({ path: "/dashboard/customers/ute" });
  return render(<I18nextProvider i18n={i18n}><Router hook={location.hook}>
    <CustomerHeader {...base} {...props} /><Probe />
  </Router></I18nextProvider>);
}
describe("CP3 Banner real localization and navigation", () => {
  it.each(["en", "es"])("adds the shared attention state and missing PDF to the contract chip in %s", async language => {
    await mount({ contract: { status: "ready", value: aggregateTerms([term({ state: "renewal_due", flags: ["missing_document"] } as never)]) } }, language);
    const chip = screen.getByTestId("chip-contract");
    expect(chip.textContent).toContain(i18n.t("contractAttention.state.renewal_due"));
    expect(chip.textContent).toContain(i18n.t("contractAttention.noPdf"));
    cleanup();
  });
  it.each(["linked", "not_linked", "waiting", "via_parent", "error", "collision"] as const)("retains the QuickBooks card's %s state and Billing destination in both languages", async state => {
    for (const language of ["en", "es"]) {
      await mount({ qbo: { status: "ready", value: state } }, language);
      expect(screen.getByTestId("chip-quickbooks").textContent).toContain(i18n.t(`cp3.qbo.${state}`));
      expect(screen.getByTestId("chip-quickbooks").getAttribute("href")).toBe("/dashboard/customers/ute?tab=billing");
      cleanup();
    }
  });
  it.each(["en", "es"])("shows concurrent priced terms, UC and precise destinations in %s", async language => {
    await mount({}, language);
    const chip = screen.getByTestId("chip-contract");
    expect(chip.textContent).toContain("2026–27");
    expect(chip.textContent).toContain("$13,536");
    expect(chip.textContent).toContain(i18n.t("cp1.both"));
    expect(chip.getAttribute("href")).toBe("/dashboard/customers/ute?tab=contracts");
    expect(screen.getByTestId("customer-monogram").textContent).toBe("UC");
    expect(screen.getByTestId("customer-monogram").getAttribute("aria-hidden")).not.toBeNull();
    expect(screen.getByTestId("status-customer").textContent).toContain(i18n.t("cp3.status.active"));
    expect(screen.getByTestId("quiet-ranking").textContent).toBe(i18n.t("cp3.ranking.preferred"));
    expect(screen.getByTestId("chip-managed-by").getAttribute("href")).toBe("/dashboard/customers/ute?tab=contacts");
    expect(screen.getByTestId("chip-quickbooks").getAttribute("href")).toBe("/dashboard/customers/ute?tab=billing");
    expect(screen.getByTestId("link-header-address").getAttribute("href")).toBe("/dashboard/customers/ute?tab=property");
    expect(screen.getByTestId("button-edit-customer").getAttribute("href")).toBe("/dashboard/customers/ute/edit");
    expect(screen.getByTestId("chip-account-manager").textContent).toContain(i18n.t("accountManagers.notAssigned"));
    expect(screen.getByTestId("chip-account-manager").tagName).not.toBe("A");
    expect(screen.getByTestId("customer-header").textContent).not.toMatch(/cp3\./);
  });
  it("shows different labels and T&M without inventing a snow annual", async () => {
    await mount({ contract: { status: "ready", value: aggregateTerms([
      term(), term({ termId: "snow", agreementId: "snow", line: "snow", label: "Winter 2026", annualCents: null, snowPricing: "time_and_materials" }),
    ]) } });
    expect(screen.getByTestId("chip-contract").textContent).toContain("2026–27, Winter 2026");
    expect(screen.getByTestId("chip-contract").textContent).toContain("$10,000");
    expect(screen.getByTestId("chip-contract").textContent).toContain(i18n.t("cp3.chips.snowTm"));
    expect(screen.getByTestId("chip-contract").textContent).not.toContain("$0");
  });
  it("searches customers and navigates by keyboard, then offers All customers", async () => {
    await mount();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("select-customer-switcher"));
    await user.type(screen.getByTestId("input-customer-switcher"), "Bank");
    expect(screen.queryByTestId("option-customer-ute")).toBeNull();
    expect(screen.getByTestId("option-customer-bank")).toBeTruthy();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("location").textContent).toBe("/dashboard/customers/bank");
    await user.click(screen.getByTestId("select-customer-switcher"));
    await user.click(screen.getByTestId("option-all-customers"));
    expect(screen.getByTestId("location").textContent).toBe("/dashboard/customers");
  });
  it("launches authorized actions, preserves customer ticket context", async () => {
    const onAddNote = vi.fn(), onAddProposal = vi.fn(), onLogCommunication = vi.fn();
    await mount({ onAddNote, onAddProposal, onLogCommunication });
    const user = userEvent.setup();
    for (const [id, callback] of [["menu-add-note", onAddNote], ["menu-add-proposal", onAddProposal], ["menu-log-communication", onLogCommunication]] as const) {
      await user.click(screen.getByTestId("button-header-add"));
      await user.click(screen.getByTestId(id));
      expect(callback).toHaveBeenCalledOnce();
    }
    await user.click(screen.getByTestId("button-header-add"));
    await user.click(screen.getByTestId("menu-add-ticket"));
    expect(screen.getByTestId("location").textContent).toContain("/dashboard/tickets/new");
  });
  it("field-equivalent action configuration offers Note only", async () => {
    await mount({ canEdit: false, actions: { note: true, ticket: false, proposal: false, logCommunication: false }, contract: undefined, qbo: undefined });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-header-add"));
    expect(screen.getByTestId("menu-add-note")).toBeTruthy();
    for (const id of ["menu-add-ticket", "menu-add-proposal", "menu-log-communication", "button-edit-customer", "chip-contract", "chip-quickbooks"])
      expect(screen.queryByTestId(id)).toBeNull();
  });
  it("branch metadata links its parent; parent header has no physical address", async () => {
    await mount({ kind: "branch", parent: { id: "bank", name: "1st Bank" } });
    expect(screen.getByTestId("link-header-parent").getAttribute("href")).toBe("/dashboard/customers/bank?tab=dashboard");
    cleanup();
    await mount({ kind: "parent", billingName: "Master Billing", branchCount: 3, pages: [...base.pages, "branches"] });
    expect(screen.queryByTestId("link-header-address")).toBeNull();
    expect(screen.getByTestId("quiet-billed-as").textContent).toContain("Master Billing");
    expect(screen.getByTestId("chip-branches").getAttribute("href")).toBe("/dashboard/customers/ute?tab=branches");
    expect(screen.queryByTestId("button-edit-customer")).toBeNull();
  });
  it("no contract links to Contracts; self-managed to Contacts", async () => {
    await mount({ contract: { status: "ready", value: null }, managedBy: { status: "ready", value: null } });
    expect(within(screen.getByTestId("chip-contract")).getByText(i18n.t("cp1.noContract"))).toBeTruthy();
    expect(screen.getByTestId("chip-contract").getAttribute("href")).toBe("/dashboard/customers/ute?tab=contracts");
    expect(screen.getByTestId("chip-managed-by").textContent).toContain(i18n.t("cp3.chips.selfManaged"));
  });
});
