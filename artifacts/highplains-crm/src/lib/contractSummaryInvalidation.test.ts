import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, queryClient } from "./queryClient";
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
const own = ["/api/customers", "own", "contract-summary", "a", "viewer", "admin"];
const branch = ["/api/customers", "branch", "contract-summary", "a", "viewer", "admin"];
const snow = ["/api/customers/snow-covered", "a"];
afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });
describe("contract-summary mutation inventory", () => {
  it.each([
    ["POST", "/api/contract-center/contracts"], ["PATCH", "/api/contract-center/terms/t"],
    ["PUT", "/api/contract-center/terms/t/scope"], ["PUT", "/api/contract-center/terms/t/rates"],
    ["PUT", "/api/contract-center/terms/t/payments"], ["POST", "/api/contract-center/terms/t/status"],
    ["POST", "/api/contract-center/contracts/a/renew"], ["POST", "/api/contract-center/terms/t/non-renewal"],
    ["DELETE", "/api/contract-center/terms/t/non-renewal"], ["POST", "/api/contract-center/audit/import"],
    ["PATCH", "/api/customers/own"], ["POST", "/api/customers/setup"], ["POST", "/api/customers/account-manager"],
    ["PATCH", "/api/company-users/u"], ["POST", "/api/qbo/customer-sync"],
    ["POST", "/api/estimates/e/accept"],
  ])("%s %s invalidates owner, inherited branches and snow selection", async (method, path) => {
    for (const key of [own, branch, snow, ["/api/unrelated"]]) queryClient.setQueryData(key, {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await apiRequest(method, path, { a: 1 }, { headers: { "X-Company-Id": "a" } });
    for (const key of [own, branch, snow]) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["/api/unrelated"])?.isInvalidated).toBe(false);
    expect(fetch).toHaveBeenCalledWith(path, expect.objectContaining({ headers: expect.objectContaining({ "X-Company-Id": "a" }) }));
  });
  it("reads and rejected mutations leave successful summaries intact", async () => {
    queryClient.setQueryData(own, {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await apiRequest("GET", "/api/customers/own/contract-summary");
    expect(queryClient.getQueryState(own)?.isInvalidated).toBe(false);
    vi.mocked(fetch).mockResolvedValue(new Response("denied", { status: 409 }));
    await expect(apiRequest("PATCH", "/api/contract-center/terms/t", {})).rejects.toThrow("409");
    expect(queryClient.getQueryState(own)?.isInvalidated).toBe(false);
  });
});
