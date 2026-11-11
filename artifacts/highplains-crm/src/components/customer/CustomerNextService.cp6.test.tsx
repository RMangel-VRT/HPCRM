// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { customerServicesFixture, serviceRowFixture } from "@/lib/contractCustomerServices.fixtures";
import CustomerNextService from "./CustomerNextService";
const fx = vi.hoisted(() => ({ args: vi.fn() }));
vi.mock("@/hooks/useContractCustomerServices", () => ({ useContractCustomerServices: (...args: unknown[]) => {
  fx.args(...args);
  return { data: customerServicesFixture({ rows: [
    serviceRowFixture({ label: "Later window", status: "overdue", next: { ...serviceRowFixture().next!, date: "2026-04-01" } }),
    serviceRowFixture({ label: "Chemical promise", status: "no_count", issues: ["overdue"], next: { ...serviceRowFixture().next!, date: "2026-03-12", kind: "chemical_promise" } }),
  ] }), isLoading: false, error: null };
} }));
afterEach(cleanup);
describe("CP6 next-service summary", () => {
  it("uses the independent default season, earliest returned event and only primary-overdue rows", () => {
    const change = vi.fn(); render(<CustomerNextService customerId="c1" onTabChange={change} />);
    expect(fx.args).toHaveBeenCalledWith("c1");
    expect(screen.getByText("Chemical promise")).toBeTruthy();
    expect(screen.getByText("Promised Mar 12")).toBeTruthy();
    expect(screen.getByTestId("customer-services-overdue").textContent).toBe("1 overdue");
    fireEvent.keyDown(screen.getByTestId("card-next-service"), { key: "Enter" });
    expect(change).toHaveBeenCalledWith("services");
  });
});
