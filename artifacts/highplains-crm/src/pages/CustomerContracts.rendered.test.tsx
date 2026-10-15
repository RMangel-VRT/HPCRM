import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

const fx = vi.hoisted(() => ({ user: { activeRole: "admin", activeCompanyId: "company", isSuperAdminBool: false } as any,
  queries: [] as any[], responses: {} as Record<string, any>, api: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (s: string) => s, i18n: { language: "en" } }) }));
vi.mock("@/lib/queryClient", async original => ({ ...await original<any>(), apiRequest: fx.api }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (options: any) => {
    fx.queries.push(options);
    return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...fx.responses[options.queryKey.join("|")] };
  },
}));
vi.mock("@/components/LayerMapViewer", () => ({ default: () => null }));
vi.mock("@/components/CustomerLocationEditor", () => ({ default: () => null }));
vi.mock("@/components/customer/dashboard/CustomerDashboard", () => ({ default: () => null }));
vi.mock("@/pages/ParentCustomerDashboard", () => ({ default: () => null }));
// Inline the portal for server-rendered history assertions; the real dialog is checked in the browser.
vi.mock("@/components/ui/dialog", () => Object.fromEntries(
  ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter"]
    .map(name => [name, ({ children, open }: any) => name === "Dialog" && !open ? null : <div>{children}</div>])));
import { CustomerContracts } from "@/components/contracts/CustomerContracts";
import { ContractCard, RateSheetSection, VersionHistoryDialog } from "./CustomerDetail";

const old = { id: "old", serviceType: "Maintenance", status: "active", billingPattern: "monthly",
  startDate: "2026-01-01", endDate: "2026-12-31", notes: "Frozen legacy note", hasMobilizationFee: false } as any;
const file = { id: "doc", filename: "Signed legacy.pdf", fileSize: 500, version: 1, uploadedAt: "2026-02-01T15:00:00Z",
  storageObjectPath: "/objects/legacy.pdf", isCurrent: true };
const center = { id: "new", customerId: "customer", line: "both", form: "theirs", renewalDue: true,
  current: { id: "term", seasonLabel: "2026–27", displayStatus: "active", startDate: "2026-10-01", endDate: "2027-09-30", annualPriceCents: 150000 } };
const render = (node: React.ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
  <Router ssrPath="/dashboard/customers/customer">{node}</Router></QueryClientProvider>);
function tab() {
  return render(<CustomerContracts customerId="customer"><ContractCard contract={old} customerId="customer"
    formatFileSize={n => `${n} bytes`} setShowVersionHistory={() => {}} /></CustomerContracts>);
}
beforeEach(() => {
  fx.user = { activeRole: "admin", activeCompanyId: "company", isSuperAdminBool: false };
  fx.queries = []; fx.api.mockReset().mockResolvedValue({ json: async () => [] });
  fx.responses = {
    "/api/contract-center/contracts|company|customer": { data: [center] },
    "/api/contract-center/copy-status|company": { data: { firstCopiedAt: "2026-10-13T15:00:00Z", copiedContracts: 3 } },
    "/api/contracts|old|documents|current": { data: file },
    "/api/contracts|old|documents": { data: [file] },
    "/api/contracts|old|monthly-amounts": { data: [{ month: 1, amount: 12500 }] },
  };
});
describe("customer Contract Center switch-over", () => {
  it.each(["admin", "office"])("shows new cards first for %s and initially collapses legacy cards", role => {
    fx.user.activeRole = role;
    const html = tab();
    expect(html.indexOf('data-testid="center-contract-new"')).toBeLessThan(html.indexOf('data-testid="old-system-contracts"'));
    expect(html).toContain("Old system (read-only)");
    expect(html).toMatch(/<details[^>]*data-testid="old-system-contracts"/);
    expect(html.match(/<details[^>]*>/)?.[0]).not.toMatch(/\sopen[=\s>]/);
    for (const text of ["Landscape + Snow", "Their form", "Active", "2026–27", "$1,500", "Up for renewal", ">Open<", "New contract"]) expect(html).toContain(text);
    expect(html).toContain('href="/dashboard/contracts/new?customerId=customer"');
    expect(html).toContain("These records were moved into the Contract Center on ");
    expect(html).not.toContain("not yet copied");
    expect(html).toContain("$125.00");
  });
  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "crew_supervisor", "unknown"])("does not expose Contract Center data to %s", role => {
    fx.user.activeRole = role;
    const html = tab();
    expect(html).not.toContain("center-contract-new");
    expect(html).not.toContain("button-new-center-contract");
    expect(html).not.toContain("These records were moved");
    expect(fx.queries.filter(q => q.queryKey[0].startsWith("/api/contract-center")).every(q => q.enabled === false)).toBe(true);
  });
  it("uses company/customer scoped keys and filtered API", async () => {
    tab();
    const query = fx.queries.find(q => q.queryKey[0] === "/api/contract-center/contracts");
    expect(query.queryKey).toEqual(["/api/contract-center/contracts", "company", "customer"]);
    await query.queryFn();
    expect(fx.api).toHaveBeenCalledWith("GET", "/api/contract-center/contracts?customerId=customer&includeParent=true");
    fx.user.activeCompanyId = "other"; fx.queries = [];
    expect(tab()).not.toContain("center-contract-new");
    expect(fx.queries[0].queryKey).toContain("other");
  });
  it("renders the exact empty state separately from loading and errors", () => {
    const key = "/api/contract-center/contracts|company|customer";
    fx.responses[key] = { data: [] }; expect(tab()).toContain("No contracts yet.");
    fx.responses[key] = { isLoading: true }; expect(tab()).toContain("Loading contracts"); expect(tab()).not.toContain("No contracts yet.");
    fx.responses[key] = { isError: true }; expect(tab()).toContain("Could not load contracts."); expect(tab()).not.toContain("No contracts yet.");
  });
  it("separates own and inherited cards above legacy with a display-only branch hint", () => {
    const inherited = { ...center, id: "parent-contract", customerId: "parent", customerName: "Parent",
      viaParent: true, parentName: "Parent", branch: { name: "Federal", billingCode: "FB01" },
      payments: [{ component: "FB01 – Federal", months: [{ month: 1, amountCents: 69000 }] }] };
    fx.responses["/api/contract-center/contracts|company|customer"] = { data: [inherited, center] };
    const html = tab();
    expect(html).toContain("Through Parent");
    expect(html).toContain("Your branch: FB01 – Federal, $690.00/month");
    expect(html.indexOf("center-contract-new")).toBeLessThan(html.indexOf("Through Parent"));
    expect(html.indexOf("center-contract-parent-contract")).toBeLessThan(html.indexOf("old-system-contracts"));
    expect(html).toContain('/dashboard/contracts/parent-contract');
    inherited.payments[0].component = "Unrelated branch";
    expect(tab()).not.toContain("Your branch:");
    inherited.payments[0].component = "Federal – site";
    expect(tab()).toContain("Your branch: Federal – site, $690.00/month");
    fx.responses["/api/contract-center/contracts|company|customer"] = { data: [center] };
    expect(tab()).not.toContain("Through Parent");
  });
  it("shows not yet copied only for a successful null provenance", () => {
    const key = "/api/contract-center/copy-status|company";
    fx.responses[key] = { data: { firstCopiedAt: null, copiedContracts: 0 } };
    expect(tab()).toContain("These records were moved into the Contract Center on not yet moved.");
    fx.responses[key] = { isError: true };
    expect(tab()).toContain("Could not load copy status."); expect(tab()).not.toContain("not yet copied");
  });
  it("retains history, downloads and service/schedule reads without legacy writes", () => {
    const html = tab();
    expect(html).toContain("button-download-document");
    expect(html).toContain("button-view-document");
    expect(html).toContain("link-version-history");
    for (const token of ["button-upload-document", "button-replace-document", "button-edit-contract", "button-end-contract",
      "button-delete-contract", "button-edit-amounts", "button-save-amounts", "button-add-service", "button-edit-service", "button-delete-service"]) {
      expect(html).not.toContain(token);
    }
    expect(fx.queries.some(q => q.queryKey.includes("services"))).toBe(true);
  });
  it("renders legacy version download controls and a read-only rate sheet", () => {
    const history = render(<VersionHistoryDialog contractId="old" onClose={() => {}} formatFileSize={n => `${n} bytes`} />);
    expect(history).toContain("Signed legacy.pdf");
    expect(history).toContain("button-download-document-doc");
    fx.responses["/api/customers|customer|rate-sheet"] = { data: { generalLabor: 8500, notes: "Frozen rates" } };
    const rates = render(<RateSheetSection customerId="customer" />);
    expect(rates).toContain("85.00"); expect(rates).toContain("Frozen rates");
    expect(rates).toContain("Rates now live on each contract in the Contract Center.");
    expect(rates).not.toContain("<input"); expect(rates).not.toContain("<textarea");
    expect(rates).not.toContain("button-save");
  });
});
