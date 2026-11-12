// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import "@/i18n";
import i18n from "@/i18n";
import ServicesCatalog from "./ServicesCatalog";
import EquipmentFeesCatalog from "./EquipmentFeesCatalog";
import { AddLineDialog } from "@/components/estimates/AddLineDialog";
import { AddLineButtons } from "@/components/estimates/AddLineButtons";
import { estimatesRailSections } from "@/components/nav/estimatesRail";
import { LINE_TINT, LINE_TYPES } from "@/lib/estimateBuilder";

const auth = vi.hoisted(() => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "admin" } as Record<string, string> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const fetchMock = vi.fn();
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() });
let handler: (c: Call) => ReturnType<typeof res> = () => res({});
const toCall = (u: string, init?: RequestInit): Call => ({
  url: String(u), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined,
});
const calls = (): Call[] => fetchMock.mock.calls.map(([u, init]: [string, RequestInit | undefined]) => toCall(u, init));

beforeEach(() => {
  auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "admin" };
  fetchMock.mockImplementation(async (u: string, init?: RequestInit) => handler(toCall(u, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});
afterEach(async () => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

function renderAt(el: () => ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path: "/dashboard/estimates/catalogs/services" });
  const ui = () => <QueryClientProvider client={client}><Router hook={loc.hook}>{el()}</Router></QueryClientProvider>;
  const r = render(ui());
  return { ...r, rerenderPage: () => r.rerender(ui()) };
}

const cat = (o: Record<string, unknown>) => ({ id: "cat1", companyId: "c1", name: "General Landscape", defaultUmbrellaKey: "landscape_labor", defaultUnit: "1,000 sq ft", sortOrder: 0, isActive: true, itemCount: 2, ...o });
const cats = [
  cat({}),
  cat({ id: "cat2", name: "Chemical Treatments", defaultUmbrellaKey: "fees_surcharges", defaultUnit: "visit", sortOrder: 1, itemCount: 1 }),
  cat({ id: "cat3", name: "Snow Retired", sortOrder: 2, isActive: false, itemCount: 1 }),
];
const svc = (o: Record<string, unknown>) => ({
  id: "s1", companyId: "c1", kind: "service", label: "Core Aeration", defaultUnit: "1,000 sq ft", defaultRateCents: 1850, umbrellaKey: "landscape_labor",
  isActive: true, sortOrder: 0, serviceCategoryId: "cat1", serviceCategoryName: "General Landscape", serviceCategoryIsActive: true, ...o,
});
const services = [
  svc({}),
  svc({ id: "s2", label: "Overseeding", defaultRateCents: null }),
  svc({ id: "s3", label: "Crabgrass Pre-emergent", serviceCategoryId: "cat2", serviceCategoryName: "Chemical Treatments", defaultUnit: "visit", umbrellaKey: "fees_surcharges" }),
  svc({ id: "s4", label: "Plow Salt", serviceCategoryId: "cat3", serviceCategoryName: "Snow Retired", serviceCategoryIsActive: false }),
  svc({ id: "s5", label: "Dethatching", isActive: false }),
];
const catalogHandler = (over?: (c: Call) => ReturnType<typeof res> | undefined) => (c: Call) => {
  const o = over?.(c); if (o) return o;
  if (c.url.startsWith("/api/estimates/service-categories")) return c.method === "GET" ? res(cats) : res(cats[0]);
  if (c.url.startsWith("/api/quick-items")) return c.method === "GET" ? res(services) : res(services[0]);
  return res({});
};

async function pickSelect(testId: string, optionName: string | RegExp) {
  const trigger = screen.getByTestId(testId);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("navigation", () => {
  it("Services Catalog sits directly above Equipment & Fees under Catalogs", () => {
    const items = estimatesRailSections((k) => k)[1].items;
    const i = items.findIndex((x) => x.key === "services");
    expect(items[i].href).toBe("/dashboard/estimates/catalogs/services");
    expect(items[i + 1].key).toBe("equipment_fees");
  });
});

describe("Services Catalog page", () => {
  it("renders chips with counts, filters by category, scoped headers", async () => {
    handler = catalogHandler();
    renderAt(() => <ServicesCatalog />);
    expect(await screen.findByTestId("text-label-s1")).toBeTruthy();
    expect(screen.getByTestId("chip-category-cat1").textContent).toBe("General Landscape · 2");
    expect(screen.getByTestId("chip-category-cat2").textContent).toBe("Chemical Treatments · 1");
    expect(screen.getByTestId("text-unit-s1").textContent).toBe("1,000 SF");
    expect(screen.getByTestId("text-rate-s2").textContent).toBe("—");
    expect(screen.getByTestId("text-category-s4").textContent).toContain("(inactive)");
    fireEvent.click(screen.getByTestId("chip-category-cat2"));
    expect(screen.queryByTestId("row-item-s1")).toBeNull();
    expect(screen.getByTestId("row-item-s3")).toBeTruthy();
    fireEvent.click(screen.getByTestId("switch-show-inactive"));
    expect(screen.queryByTestId("chip-category-cat3")).toBeNull();
    fireEvent.click(screen.getByTestId("chip-category-all"));
    expect(screen.queryByTestId("row-item-s5")).toBeNull();
    expect(calls().every((c) => c.headers["X-Company-Id"] === "c1")).toBe(true);
    expect(calls().some((c) => c.url === "/api/quick-items?kind=service")).toBe(true);
  });

  it("add service prefills from category until touched and omits untouched defaults", async () => {
    handler = catalogHandler();
    renderAt(() => <ServicesCatalog />);
    fireEvent.click(await screen.findByTestId("chip-category-cat2"));
    fireEvent.click(screen.getByTestId("button-add-item"));
    const dlg = screen.getByTestId("dialog-service");
    expect(within(dlg).getByTestId("select-unit").textContent).toBe("FLAT");
    expect(within(dlg).getByTestId("select-umbrella").textContent).toBe("Fees & Surcharges");
    await pickSelect("select-unit", "SF");
    await pickSelect("select-category", "General Landscape");
    expect(screen.getByTestId("select-unit").textContent).toBe("SF");
    expect(screen.getByTestId("select-umbrella").textContent).toBe("Landscape Labor");
    fireEvent.change(screen.getByTestId("input-label"), { target: { value: "Aeration Plus" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(calls().some((c) => c.method === "POST")).toBe(true));
    const post = calls().find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/quick-items");
    expect(post.body).toEqual({ kind: "service", label: "Aeration Plus", serviceCategoryId: "cat1", defaultRateCents: null, isActive: true, defaultUnit: "SF" });
  });

  it("edit sends only changed fields; deactivate and reactivate services", async () => {
    handler = catalogHandler();
    renderAt(() => <ServicesCatalog />);
    fireEvent.click(await screen.findByTestId("button-edit-s4"));
    fireEvent.change(screen.getByTestId("input-rate"), { target: { value: "20" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(calls().find((c) => c.method === "PATCH")?.body).toEqual({ defaultRateCents: 2000, defaultUnit: "1,000 SF" }));
    fireEvent.click(await screen.findByTestId("button-deactivate-s1"));
    fireEvent.click(await screen.findByTestId("button-confirm-deactivate"));
    await waitFor(() => expect(calls().some((c) => c.method === "DELETE" && c.url === "/api/quick-items/s1")).toBe(true));
    fireEvent.click(screen.getByTestId("button-reactivate-s5"));
    await waitFor(() => expect(calls().some((c) => c.method === "PATCH" && c.url === "/api/quick-items/s5")).toBe(true));
  });

  it("add category dialog posts and shows duplicate 409 message", async () => {
    handler = catalogHandler((c) => c.method === "POST" ? res({ message: "A category with this name already exists" }, 409) : undefined);
    renderAt(() => <ServicesCatalog />);
    fireEvent.click(await screen.findByTestId("button-add-category"));
    fireEvent.click(screen.getByTestId("button-save-category"));
    expect(screen.getByTestId("error-category-name")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-category-name"), { target: { value: "General Landscape" } });
    fireEvent.click(screen.getByTestId("button-save-category"));
    expect((await screen.findByTestId("error-category-form")).textContent).toBe("A category with this name already exists");
    expect(calls().find((c) => c.method === "POST")!.body).toEqual({ name: "General Landscape", defaultUmbrellaKey: "landscape_labor", defaultUnit: "1,000 SF" });
  });

  it("edit category from chip and manage list toggles active", async () => {
    handler = catalogHandler();
    renderAt(() => <ServicesCatalog />);
    fireEvent.click(await screen.findByTestId("button-chip-edit-category-cat2"));
    fireEvent.click(screen.getByTestId("switch-category-active"));
    fireEvent.click(screen.getByTestId("button-save-category"));
    await waitFor(() => expect(calls().find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/estimates/service-categories/cat2", body: { isActive: false } }));
    fireEvent.click(await screen.findByTestId("button-manage-categories"));
    expect(screen.getByTestId("status-category-cat3").textContent).toBe("Inactive");
    fireEvent.click(screen.getByTestId("button-reactivate-category-cat3"));
    await waitFor(() => expect(calls().some((c) => c.method === "PATCH" && c.url.endsWith("/cat3"))).toBe(true));
  });

  it("keeps an explicitly touched umbrella while category changes still prefill untouched units", async () => {
    handler = catalogHandler();
    renderAt(() => <ServicesCatalog />);
    await screen.findByTestId("row-item-s1");
    fireEvent.click(screen.getByTestId("button-add-item"));
    await pickSelect("select-umbrella", "Plants");
    await pickSelect("select-category", "Chemical Treatments");
    expect(screen.getByTestId("select-umbrella").textContent).toBe("Plants");
    expect(screen.getByTestId("select-unit").textContent).toBe("FLAT");
    fireEvent.change(screen.getByTestId("input-label"), { target: { value: "Treatment override" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(calls().find(c => c.method === "POST")?.body).toMatchObject({ umbrellaKey: "plants", serviceCategoryId: "cat2" }));
    expect(calls().find(c => c.method === "POST")?.body).not.toHaveProperty("defaultUnit");
  });

  it("does not show old-company save success or close the new company's dialog", async () => {
    let finish!: (response: ReturnType<typeof res>) => void;
    handler = catalogHandler();
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) => {
      const call = toCall(u, init);
      if (call.method === "POST") return new Promise<ReturnType<typeof res>>(resolve => { finish = resolve; });
      return handler(call);
    });
    const r = renderAt(() => <ServicesCatalog />);
    await screen.findByTestId("row-item-s1");
    fireEvent.click(screen.getByTestId("button-add-item"));
    fireEvent.change(screen.getByTestId("input-label"), { target: { value: "Old company pending" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    auth.user = { id: "u2", activeCompanyId: "c2", activeRole: "admin" };
    r.rerenderPage();
    await screen.findByTestId("row-item-s1");
    fireEvent.click(screen.getByTestId("button-add-category"));
    finish(res(svc({})));
    await waitFor(() => expect(calls().some(c => c.method === "GET" && c.headers["X-Company-Id"] === "c2")).toBe(true));
    expect(screen.getByTestId("dialog-category")).toBeTruthy();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("company switch remounts and refetches with the new company", async () => {
    handler = catalogHandler();
    const r = renderAt(() => <ServicesCatalog />);
    fireEvent.click(await screen.findByTestId("button-add-category"));
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "admin" };
    r.rerenderPage();
    await waitFor(() => expect(screen.queryByTestId("dialog-category")).toBeNull());
    await waitFor(() => expect(calls().some((c) => c.headers["X-Company-Id"] === "c2" && c.url.includes("service-categories"))).toBe(true));
  });

  it("Spanish strings render", async () => {
    await i18n.changeLanguage("es");
    handler = catalogHandler();
    renderAt(() => <ServicesCatalog />);
    expect((await screen.findByTestId("text-page-title")).textContent).toBe("Catálogo de servicios");
    expect((await screen.findByTestId("text-unit-s3")).textContent).toBe("FIJO");
    expect(screen.getByTestId("button-add-category").textContent).toBe("Agregar categoría");
  });
});

describe("Equipment & Fees stays two-kind", () => {
  it("hides services and offers no service kind", async () => {
    handler = () => res([svc({}), { ...svc({ id: "e1", kind: "equipment", label: "Skid Steer" }), serviceCategoryId: null, serviceCategoryName: null, serviceCategoryIsActive: null }]);
    renderAt(() => <EquipmentFeesCatalog />);
    expect(await screen.findByTestId("row-item-e1")).toBeTruthy();
    expect(screen.queryByTestId("row-item-s1")).toBeNull();
    expect(screen.queryByTestId("chip-kind-service")).toBeNull();
  });
});

describe("builder service line", () => {
  it("Service button sits between Labor and Equipment with its own tint", () => {
    expect(LINE_TYPES.slice(3, 6)).toEqual(["labor", "service", "equipment"]);
    expect(new Set(Object.values(LINE_TINT)).size).toBe(LINE_TYPES.length);
    const onAdd = vi.fn();
    render(<AddLineButtons sectionId="sec1" onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId("button-add-service-sec1"));
    expect(onAdd).toHaveBeenCalledWith("service");
  });

  it("picker shows active services in active categories with chips, and submits quickItemId", async () => {
    handler = catalogHandler();
    const onSubmit = vi.fn(async () => true);
    renderAt(() => <AddLineDialog type="service" sectionId="sec1" customerId="cust1" companyId="c1" onClose={() => {}} onSubmit={onSubmit} />);
    expect(await screen.findByTestId("option-s1")).toBeTruthy();
    expect(screen.queryByTestId("option-s4")).toBeNull();
    expect(screen.queryByTestId("option-s5")).toBeNull();
    expect(screen.queryByTestId("chip-picker-service-category-cat3")).toBeNull();
    expect(screen.getByTestId("option-s1").textContent).toContain("General Landscape");
    fireEvent.click(screen.getByTestId("chip-picker-service-category-cat2"));
    expect(screen.queryByTestId("option-s1")).toBeNull();
    fireEvent.click(screen.getByTestId("option-s3"));
    fireEvent.change(screen.getByTestId("input-picker-quantity"), { target: { value: "4" } });
    fireEvent.click(screen.getByTestId("button-picker-add"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ lineType: "service", sectionId: "sec1", quantity: "4", quickItemId: "s3" }));
    expect(calls().find((c) => c.url.startsWith("/api/quick-items"))!.headers["X-Company-Id"]).toBe("c1");
  });

  it("free-type service entry posts a full manual line", async () => {
    handler = catalogHandler();
    const onSubmit = vi.fn(async () => true);
    renderAt(() => <AddLineDialog type="service" sectionId="sec1" customerId="cust1" companyId="c1" onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(await screen.findByTestId("option-__free"));
    fireEvent.click(screen.getByTestId("button-picker-add"));
    fireEvent.change(await screen.findByTestId("input-free-name"), { target: { value: "Topdressing" } });
    fireEvent.change(screen.getByTestId("input-free-rate"), { target: { value: "42.10" } });
    fireEvent.click(screen.getByTestId("button-free-add"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ lineType: "service", sectionId: "sec1", quantity: "1", name: "Topdressing", unit: "1,000 SF", unitPriceCents: 4210, umbrellaKey: "landscape_labor" }));
  });
});
