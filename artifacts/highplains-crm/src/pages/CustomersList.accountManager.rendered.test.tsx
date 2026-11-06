// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import i18n from "@/i18n";
import CustomersList from "./CustomersList";
const fx = vi.hoisted(() => ({ company: "co", api: vi.fn(), toast: vi.fn(), fail: false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "synthetic", activeCompanyId: fx.company, activeRole: "account_manager", accessRole: "admin" } }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/components/customer/CustomersViewSwitcher", () => ({ CustomersViewSwitcher: () => null }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
    apiRequest: (...args: unknown[]) => fx.api(...args) };
});
let assignments: Record<string, { id: string; name: string } | null>;
const rows = [
  { id: "p", name: "Parent Test", companyId: "co", isParent: "true", status: "prospect", active: "true" },
  { id: "s", name: "Standalone Test", companyId: "co", status: "prospect", active: "true" },
  { id: "b", name: "Branch Test", companyId: "co", parentCustomerId: "p", status: "prospect", active: "true" },
];
beforeEach(() => {
  fx.company = "co"; fx.fail = false; fx.toast.mockClear(); queryClient.clear();
  assignments = { p: null, s: { id: "am", name: "Manager Test" }, b: null };
  fx.api.mockImplementation(async (method: string, url: string, body: any, opts: any) => {
    if (url === "/api/customer-account-managers") return { json: async () => ({ managers: [{ id: "am", name: "Manager Test" }], assignments }) };
    if (url.startsWith("/api/customers?page")) return { json: async () => ({ customers: rows, total: rows.length }) };
    if (method === "POST" && url === "/api/customers/account-manager") {
      if (fx.fail) throw new Error("synthetic 422");
      for (const id of body.customerIds) assignments[id] = body.accountManagerId ? { id: "am", name: "Manager Test" } : null;
      assignments.b = assignments.p;
      return { json: async () => ({ changedCount: body.customerIds.length }) };
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });
});
afterEach(async () => { cleanup(); queryClient.clear(); await i18n.changeLanguage("en"); });
function page() { return render(<QueryClientProvider client={queryClient}><CustomersList /></QueryClientProvider>); }
describe("resolved customer assignment list", () => {
  it("ignores an old company's late bulk result after the keyed view unmounts", async () => {
    const handler = fx.api.getMockImplementation()!;
    let finish: ((value: unknown) => void) | undefined;
    fx.api.mockImplementation((method: string, url: string, body: unknown, opts: unknown) =>
      method === "POST" ? new Promise(resolve => { finish = resolve; }) : handler(method, url, body, opts));
    const view = page(); await screen.findByTestId("row-customer-p");
    fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("accountManagers.select", { name: "Parent Test" }) }));
    fireEvent.click(screen.getByTestId("bulk-set-account-manager"));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fx.company = "other"; view.rerender(<QueryClientProvider client={queryClient}><CustomersList /></QueryClientProvider>);
    await screen.findByTestId("row-customer-p");
    await act(async () => { finish!({ json: async () => ({ changedCount: 1 }) }); });
    await waitFor(() => expect(queryClient.getMutationCache().getAll().every(m => m.state.status !== "pending")).toBe(true));
    expect(fx.toast).not.toHaveBeenCalled();
    expect((screen.getByTestId("bulk-set-account-manager") as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(["en", "es"])("filters resolved unassigned and atomically selects only eligible rows in %s", async language => {
    await i18n.changeLanguage(language); page();
    await screen.findByTestId("row-customer-p");
    const branch = await screen.findByRole("checkbox", { name: i18n.t("accountManagers.select", { name: "Branch Test" }) }) as HTMLInputElement;
    expect(branch.disabled).toBe(true); expect(branch.parentElement?.title).toBe(i18n.t("accountManagers.branchHelp"));
    fireEvent.change(screen.getByTestId("filter-account-manager"), { target: { value: "none" } });
    expect(screen.queryByTestId("row-customer-s")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("accountManagers.selectAll") }));
    fireEvent.change(screen.getByRole("combobox", { name: i18n.t("accountManagers.set") }), { target: { value: "am" } });
    fireEvent.click(screen.getByTestId("bulk-set-account-manager"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith({ title: i18n.t("accountManagers.changed", { count: 1 }) }));
    expect(fx.api).toHaveBeenCalledWith("POST", "/api/customers/account-manager", { customerIds: ["p"], accountManagerId: "am" }, { headers: { "X-Company-Id": "co" } });
    await waitFor(() => expect(screen.queryByTestId("row-customer-p")).toBeNull());
    expect((screen.getByTestId("bulk-set-account-manager") as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps selection on a rejected request but resets on company/viewer switches", async () => {
    fx.fail = true; const view = page(); await screen.findByTestId("row-customer-p");
    fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("accountManagers.select", { name: "Parent Test" }) }));
    fireEvent.click(screen.getByTestId("bulk-set-account-manager"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect((screen.getByTestId("bulk-set-account-manager") as HTMLButtonElement).disabled).toBe(false);
    fx.company = "other"; view.rerender(<QueryClientProvider client={queryClient}><CustomersList /></QueryClientProvider>);
    await screen.findByTestId("row-customer-p");
    expect((screen.getByTestId("bulk-set-account-manager") as HTMLButtonElement).disabled).toBe(true);
  });
});
