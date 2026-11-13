// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { ESTIMATE_UNITS, QUICK_ITEM_UNITS } from "@shared/estimateSetup";
import { FREE_UNITS } from "@/lib/estimateBuilder";
import { CUSTOM_UNITS, unitAllowed } from "@/lib/customLine";
import { SUGGESTED_UNITS } from "@/lib/hardscapeCatalog";
import { formatEstimateUnit, normalizeEstimateUnit } from "../../../../lib/db/src/estimateUnits";
import { unitLabel } from "@/lib/estimateUnits";
import ServicesCatalog from "./ServicesCatalog";
import EquipmentFeesCatalog from "./EquipmentFeesCatalog";
import HardscapeCatalog from "./HardscapeCatalog";
import { AddLineDialog } from "@/components/estimates/AddLineDialog";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({
  user: { id: "u", activeCompanyId: "c", activeRole: "admin", accessRole: "admin", activeTags: [], isSuperAdminBool: false },
  isLoading: false,
}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const expected = ["SF", "LF", "1,000 SF", "HR", "DAY", "WEEK", "EA", "FLAT", "GAL", "CU. YD", "LB", "BAG", "TON", "IN. DBH"];
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const category = { id: "cat", name: "General Landscape", companyId: "c", defaultUmbrellaKey: "landscape_labor", defaultUnit: "1,000 sq ft", isActive: true, sortOrder: 0, itemCount: 0 };
beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("service-categories")
    ? json([category]) : String(url).includes("hardscape") ? json({ items: [], categories: [] }) : json([])));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(<QueryClientProvider client={client}><Router hook={memoryLocation({ path: "/dashboard/estimates" }).hook}>{element}</Router></QueryClientProvider>);
}
async function options(id: string) {
  const trigger = screen.getByTestId(id); trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return (await screen.findAllByRole("option")).map(el => el.textContent);
}
describe("all estimate picker orders and driver-free presentation", () => {
  it("derives every former constant and hardscape save eligibility from the same list", () => {
    for (const list of [ESTIMATE_UNITS, QUICK_ITEM_UNITS, FREE_UNITS, CUSTOM_UNITS, SUGGESTED_UNITS]) expect(list).toEqual(expected);
    for (const catalog of ["hardscape", "equipment", "fee", "service"] as const) {
      for (const unit of expected) expect(unitAllowed(catalog, unit)).toBe(true);
      expect(unitAllowed(catalog, "pallet")).toBe(false);
    }
    expect(normalizeEstimateUnit(" visit ")).toBe("FLAT");
    expect(formatEstimateUnit("pallet")).toBe("pallet");
  });
  it.each(["en", "es"])("labels every canonical unit in %s, including dotted abbreviations", async lang => {
    await i18n.changeLanguage(lang);
    for (const unit of expected) {
      expect(i18n.exists(`estimateBuilder.unit.${unit}`, { lng: lang })).toBe(true);
      expect(unitLabel(unit, i18n.t)).not.toContain("estimateBuilder.");
    }
    expect(unitLabel("visit", i18n.t)).toBe(lang === "es" ? "FIJO" : "FLAT");
    expect(unitLabel("pallet", i18n.t)).toBe("pallet");
  });
  it("shows only the canonical ordered hardscape options, not a free text input", async () => {
    mount(<HardscapeCatalog />);
    fireEvent.click(await screen.findByTestId("button-add-item"));
    const select = screen.getByTestId("input-unit") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect([...select.options].map(o => o.value)).toEqual(expected);
    expect(select.value).toBe("EA");
  });
  it.each(["service", "category", "equipment", "fee"])("shows canonical ordered %s catalog options", async type => {
    mount(type === "equipment" || type === "fee" ? <EquipmentFeesCatalog /> : <ServicesCatalog />);
    if (type === "service") await screen.findByTestId("chip-category-cat");
    if (type === "category") fireEvent.click(await screen.findByTestId("button-add-category"));
    else fireEvent.click(await screen.findByTestId("button-add-item"));
    expect(await options(type === "category" ? "select-category-unit" : "select-unit")).toEqual(expected);
  });
  it.each(["equipment", "fee", "service", "custom"] as const)("shows canonical ordered %s builder options", async type => {
    mount(<AddLineDialog type={type} sectionId="s" customerId="customer" companyId="c"
      onClose={() => {}} onSubmit={async () => true} />);
    if (type !== "custom") {
      fireEvent.click(await screen.findByTestId("option-__free"));
      fireEvent.click(screen.getByTestId("button-picker-add"));
    }
    const select = await screen.findByTestId("select-free-unit") as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(expected);
    await i18n.changeLanguage("es");
    await waitFor(() => expect([...select.options].map(o => o.value)).toEqual(expected));
  });
});
