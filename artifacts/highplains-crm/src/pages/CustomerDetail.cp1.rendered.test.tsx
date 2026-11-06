import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import en from "@/i18n/locales/en";
import es from "@/i18n/locales/es";

const fx = vi.hoisted(() => ({
  user: { id: "viewer", activeRole: "admin", accessRole: "admin", activeCompanyId: "co1", isSuperAdminBool: false } as any,
  data: {} as Record<string, any>,
  queries: [] as any[][],
  summaryError: false,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/components/LayerMapViewer", () => ({ default: () => null }));
vi.mock("@/components/CustomerLocationEditor", () => ({ default: () => null }));
vi.mock("@/components/qbo/QboCustomerCard", () => ({ default: () => null, cardState: () => "not_linked" }));
vi.mock("@/components/customerWizard/FinishSetupBanner", () => ({ FinishSetupBanner: () => null, MissingFieldsNotice: () => null, useSetupMissingFields: () => ({ enabled: false, isLoading: false, isError: false, fields: [], refetch: () => {} }) }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => {
    fx.queries.push(o.queryKey);
    return ({
    data: fx.data[o.queryKey.slice(0, 3).join("|")] ??
      (o.queryKey[2] === fx.user.activeCompanyId ? fx.data[o.queryKey.slice(0, 2).join("|")] : undefined) ?? fx.data[o.queryKey[0]],
    error: o.queryKey[2] === "contract-summary" && fx.summaryError ? new Error("unavailable") : undefined,
    isLoading: false, isError: false, refetch: vi.fn(),
    });
  },
}));
import CustomerDetail from "./CustomerDetail";
import { CustomerContractPanel, CustomerContractValue, CustomerActiveAgreements } from "@/components/customer/CustomerContractPanels";
import { CustomerContracts } from "@/components/contracts/CustomerContracts";

const term = {
  agreementId: "agreement", termId: "term", label: "2026–27", line: "both" as const, startDate: "2026-10-01", endDate: "2027-09-30",
  annualCents: 1353600, snowPricing: "flat_rate", snowTriggers: "",
  billingMonths: Array.from({ length: 12 }, (_, i) => ({ month: `2027-${String(i + 1).padStart(2, "0")}-01`, component: "Contract", amountCents: 112800 })),
  rates: [{ rateKey: "labor", label: "Negotiated labor", unit: "per hour", priceCents: 6500, priceText: null, minimum: null }],
};
const summary = { asOf: "2026-11-05", current: [term], upcoming: [], previous: [], coverage: { landscape: true, snow: true }, parentCustomerId: null };
function keys(obj: any, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}
const localeKeys = new Set([...keys(en), ...keys(es)]);
const visible = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
async function render(node: React.ReactNode, lang: string, tab = "overview") {
  const i18n = createInstance(); await i18n.init({ lng: lang, fallbackLng: false, resources: { en: { translation: en }, es: { translation: es } }, interpolation: { escapeValue: false } });
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}><QueryClientProvider client={new QueryClient()}>
    <Router ssrPath="/dashboard/customers/cp1" ssrSearch={`tab=${tab}`}>{node}</Router>
  </QueryClientProvider></I18nextProvider>);
}
beforeEach(() => {
  fx.queries = [];
  fx.summaryError = false;
  fx.data = {
    "/api/customers|cp1": { id: "cp1", companyId: "co1", name: "Ute Creek fixture", status: "active", active: "true", isParent: "false",
      street: "1 Fixture", city: "Denver", state: "CO", zip: "80000", tags: [], ranking: "standard" },
    "/api/customers|cp1|contract-summary": summary,
    "/api/customers|cp1|campaign-items": [{ id: "campaign-item", status: "pending", campaign: { id: "campaign", title: "Fall cleanup",
      category: "Extra_billable", windowStart: "2026-01-01", windowEnd: "2026-01-31" } }],
    "/api/customer-account-managers": { managers: [], assignments: {} },
    "/api/customers|cp1|proposals": [{ id: "proposal", title: "Draft proposal", status: "draft", proposalDate: "2026-11-01", versions: [] }],
  };
});
describe.each(["en", "es"])("customer tabs rendered in %s", lang => {
  it.each(["overview", "contacts", "notes", "communications", "tickets", "contracts", "rate-sheet", "revenue",
    "monthly-summary", "snow", "fulfillment", "checklist", "maps", "visual-scopes", "proposals", "worksheets"])("%s has no visible translation keys", async tab => {
    const text = visible(await render(<CustomerDetail />, lang, tab));
    const candidates = text.match(/\b[a-z]+[A-Z]\w*\.[A-Za-z.]+\b/g) ?? [];
    const exact = text.split(/\s+/).filter(word => localeKeys.has(word));
    expect([...candidates, ...exact]).toEqual([]);
    expect(fx.queries.filter(k => k.includes("service-plans") || k.includes("all-monthly-amounts") || k.includes("rate-sheet")
      || k.includes("revenue") || k[0] === "/api/contracts")).toEqual([]);
  });
  it("Ute Creek badge, annual KPI, billing and negotiated rates agree", async () => {
    const html = await render(<><CustomerContractValue customerId="cp1" /><CustomerActiveAgreements customerId="cp1" />
      <CustomerContractPanel customerId="cp1" kind="revenue" /><CustomerContractPanel customerId="cp1" kind="monthly" />
      <CustomerContractPanel customerId="cp1" kind="rates" /></>, lang);
    expect(html).toContain("13,536");
    expect(html.match(/1,128/g)).toHaveLength(24);
    expect(html).toContain("Negotiated labor");
    expect(html).toContain("65.00");
    expect(html).toContain("/dashboard/contracts/agreement#term-term");
    expect(html).not.toMatch(/customerDetail\./);
  });
  it("no effective contract never displays previous value by default", async () => {
    fx.data["/api/customers|cp1|contract-summary"] = { ...summary, current: [], previous: [term], coverage: { landscape: false, snow: false } };
    const html = await render(<><CustomerContractValue customerId="cp1" /><CustomerContractPanel customerId="cp1" kind="revenue" /></>, lang);
    expect(html).not.toContain("13,536");
    expect(visible(html)).toContain(lang === "en" ? "No contract" : "Sin contrato");
  });
  it("inherited KPI shows no allocated value; T&M never becomes zero", async () => {
    fx.data["/api/customers|cp1|contract-summary"] = { ...summary, current: [{ ...term, parentCustomerId: "parent" }] };
    const html = await render(<CustomerContractValue customerId="cp1" />, lang);
    expect(html).not.toContain("13,536"); expect(html).toContain("—");
    fx.data["/api/customers|cp1|contract-summary"] = { ...summary, current: [{ ...term, line: "snow", annualCents: null, snowPricing: "time_and_materials" }] };
    expect(await render(<CustomerContractValue customerId="cp1" />, lang)).not.toContain("$0");
  });
  it("contract cards localize missing trigger warning", async () => {
    const html = await render(<CustomerContracts customerId="cp1" />, lang);
    expect(html).toContain(lang === "en" ? "Not stated" : "No especificados");
  });
  it("a failed summary is not presented as a successful no-contract response", async () => {
    fx.summaryError = true;
    delete fx.data["/api/customers|cp1|contract-summary"];
    const html = await render(<CustomerDetail />, lang);
    expect(html).toContain(lang === "en" ? en.cp1.loadFailed : es.cp1.loadFailed);
  });
});
