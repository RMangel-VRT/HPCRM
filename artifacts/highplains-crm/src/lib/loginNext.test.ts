import { describe, expect, it } from "vitest";
import { loginDestination, safeLoginNext } from "./landing";

describe("safe login destination", () => {
  it("preserves a customer deep link and its exact query string", () => {
    const path = "/dashboard/customers/by-qb/123?from=irrigo&tab=details";
    expect(loginDestination({ activeRole: "office" }, `next=${encodeURIComponent(path)}`)).toBe(path);
  });
  it("preserves arbitrary query data without treating it as pathname normalization", () => {
    const path = "/dashboard/customers/by-qb/123?name=John%20Doe&discount=50%25&url=https%3A%2F%2Fexample.com%2F..%2Fdetails";
    expect(loginDestination({ activeRole: "office" }, `next=${encodeURIComponent(path)}`)).toBe(path);
  });
  it.each([
    "//evil.com", "https://evil.com", "javascript:alert(1)", "/dashboard",
    "/dashboard/../login", "/dashboard/%2e%2e/login", "/dashboard/%252e%252e/login",
    "/dashboard/..%2f..%2f%2fevil.com", "/dashboard/%5cevil.com", "/dashboard/\\evil.com",
    "/dashboard/%255cevil.com", "/dashboard/\tevil.com", "/dashboard//evil.com",
    "/dashboard/%2e/customers", "/dashboard/%", "/dashboard/%00evil",
  ])("rejects %s and uses the role-aware fallback", next => {
    expect(safeLoginNext(next)).toBeNull();
    expect(loginDestination({ activeRole: "mapping" }, `next=${encodeURIComponent(next)}`)).toBe("/dashboard/maps");
  });
  it("keeps ordinary billing and supervisor landings without a destination", () => {
    expect(loginDestination({ activeRole: "crew_supervisor" }, "")).toBe("/dashboard/tickets/my");
    expect(loginDestination({ activeRole: "office", activeTags: ["billing"] }, "")).toBe("/dashboard/tickets/my?tab=invoice");
  });
});
