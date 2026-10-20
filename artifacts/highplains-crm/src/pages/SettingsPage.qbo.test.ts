import { describe, it, expect, vi, beforeEach } from "vitest";
import { settingsRailFor } from "@/components/nav/settingsNav";
import { readFileSync } from "node:fs";

const mockApiRequest = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mockApiRequest,
  queryClient: { invalidateQueries: vi.fn() },
}));

const { qboConnectMutationFn } = await import("./qboApi");

describe("qboConnectMutationFn", () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it("parses the JSON response body and returns authorizeUrl", async () => {
    const authorizeUrl = "https://appcenter.intuit.com/connect/oauth2?...";
    mockApiRequest.mockResolvedValue({
      json: async () => ({ authorizeUrl }),
    });

    const result = await qboConnectMutationFn();

    expect(mockApiRequest).toHaveBeenCalledWith("POST", "/api/qbo/connect");
    expect(result.authorizeUrl).toBe(authorizeUrl);
  });

  it("returns the parsed body object rather than the raw Response", async () => {
    const authorizeUrl = "https://appcenter.intuit.com/connect/oauth2?...";
    const fakeResponse = {
      json: async () => ({ authorizeUrl }),
    };
    mockApiRequest.mockResolvedValue(fakeResponse);

    const result = await qboConnectMutationFn();

    expect(result).not.toBe(fakeResponse);
    expect(result.authorizeUrl).toBeDefined();
    expect(typeof result.authorizeUrl).toBe("string");
  });
  it("links directly to both real QuickBooks settings destinations from the shared rail", () => {
    const sections = settingsRailFor({ activeRole: "admin" });
    const integrations = sections.find(section => section.items.some(item => item.key === "billing"));
    expect(integrations?.items.map(({ key, href }) => ({ key, href }))).toEqual([
      { key: "billing", href: "/dashboard/settings/billing" },
      { key: "qbo-customers", href: "/dashboard/settings/qbo-customers" },
    ]);
    expect(settingsRailFor({ activeRole: "office" }).flatMap(section => section.items).some(item => item.key === "billing")).toBe(false);
    const page = readFileSync(new URL("./QboCustomerMapping.tsx", import.meta.url), "utf8");
    expect(page).toContain('<SettingsRailLayout activeKey="qbo-customers">');
  });
});
