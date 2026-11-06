// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRecentCustomerIds, recordRecentCustomer, removeRecentCustomer } from "./last-viewed-customer";
describe("tenant-scoped recent customers", () => {
  beforeEach(() => localStorage.clear());
  it("keeps five unique IDs and moves re-visits to the front", () => {
    for (let i = 0; i < 8; i++) recordRecentCustomer("a", `c${i}`);
    recordRecentCustomer("a", "c5");
    expect(getRecentCustomerIds("a")).toEqual(["c5", "c7", "c6", "c4", "c3"]);
    removeRecentCustomer("a", "c5");
    expect(getRecentCustomerIds("a")).toEqual(["c7", "c6", "c4", "c3"]);
  });
  it("never reads another company or the old unscoped storage key", () => {
    localStorage.setItem("lastViewedCustomerId", "foreign");
    recordRecentCustomer("a", "one");
    expect(getRecentCustomerIds("b")).toEqual([]);
    expect(getRecentCustomerIds(undefined)).toEqual([]);
  });
  it("malformed storage cannot break customer navigation", () => {
    localStorage.setItem("recentCustomerIds:a", "bad-json");
    expect(getRecentCustomerIds("a")).toEqual([]);
    localStorage.setItem("recentCustomerIds:a", JSON.stringify([false, "one", "one", null]));
    expect(getRecentCustomerIds("a")).toEqual(["one"]);
  });
  it("storage access failures never prevent navigation", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getRecentCustomerIds("a")).toEqual([]); get.mockRestore();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => recordRecentCustomer("a", "one")).not.toThrow(); set.mockRestore();
  });
});
