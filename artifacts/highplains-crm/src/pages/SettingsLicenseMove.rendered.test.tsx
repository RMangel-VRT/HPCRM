// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({ calls: [] as { method: string; url: string; body?: any }[] }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeRole: "admin", accessRole: "admin", activeCompanyId: "co1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/lib/queryClient", async (orig) => ({
  ...(await orig() as object),
  apiRequest: async (method: string, url: string, body?: unknown) => { fx.calls.push({ method, url, body }); return new Response("{}", { status: 200 }); },
}));
vi.mock("react-i18next", async () => {
  const { default: en } = await import("@/i18n/locales/en");
  const get = (dict: any, k: string) => k.split(".").reduce<any>((o, p) => o?.[p], dict);
  const t = (k: string, o: Record<string, any> = {}) => { const v = get(en, k); return typeof v === "string" ? v : (o.defaultValue ?? k); };
  return { useTranslation: () => ({ t, i18n: { language: "en", changeLanguage: () => {} } }), initReactI18next: { type: "3rdParty", init: () => {} } };
});

import { queryClient } from "@/lib/queryClient";
import SettingsPage from "./SettingsPage";

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as any;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    fx.calls.push({ method: "GET", url });
    const body = url.startsWith("/api/settings")
      ? { companyName: "High Plains Property Maintenance", mowingSeasonMonths: [], cleanupSeasonMonths: [], hourlyRateBenchmarks: null, featureFlags: null }
      : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as any;
});
afterEach(() => { cleanup(); queryClient.clear(); fx.calls.length = 0; });

describe("Settings › Company profile after the license move", () => {
  it("has no license field, links to Company documents, and saving never sends pesticideLicenseNumber", async () => {
    const { hook } = memoryLocation({ path: "/dashboard/settings/company" });
    render(<QueryClientProvider client={queryClient}><Router hook={hook}><SettingsPage /></Router></QueryClientProvider>);
    const name = await screen.findByTestId("input-company-name") as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe("High Plains Property Maintenance"));
    expect(screen.queryByTestId("input-pesticide-license-number")).toBeNull();
    expect(screen.getByTestId("link-license-moved").getAttribute("href")).toBe("/dashboard/company-documents");
    fireEvent.change(name, { target: { value: "High Plains PM" } });
    fireEvent.click(screen.getByTestId("button-save-company"));
    await waitFor(() => expect(fx.calls.find(c => c.method === "PATCH" && c.url === "/api/settings")?.body).toEqual({ companyName: "High Plains PM" }));
    expect(fx.calls.some(c => c.url === "/api/company")).toBe(false);
    expect(fx.calls.some(c => JSON.stringify(c.body ?? {}).includes("pesticideLicenseNumber"))).toBe(false);
  });
});
