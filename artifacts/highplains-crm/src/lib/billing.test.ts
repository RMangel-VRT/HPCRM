import { afterEach, describe, it, expect, vi } from "vitest";
import { canViewBilling, sortPendingInvoices, groupByProperty, readGroupPref, writeGroupPref } from "./billing";

const r = (id: string, name: string, d: string, cid = name) =>
  ({ id, title: id, customer: { id: cid, name }, workCompletedDate: d }) as any;

describe("billing", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("roles", () => {
    expect(canViewBilling("admin")).toBe(true);
    expect(canViewBilling("office")).toBe(true);
    expect(canViewBilling("field")).toBe(false);
    expect(canViewBilling(undefined)).toBe(false);
  });
  it("sorts property then oldest, dedupes", () => {
    const out = sortPendingInvoices([r("1", "Zed", "2024-01-01"), r("2", "Alp", "2024-03-01"), r("3", "Alp", "2024-02-01"), r("3", "Alp", "2024-02-01")]);
    expect(out.map((x) => x.id)).toEqual(["3", "2", "1"]);
  });
  it("groups with counts", () => {
    const g = groupByProperty([r("1", "Zed", "2024-01-01"), r("2", "Alp", "2024-03-01"), r("3", "Alp", "2024-02-01")]);
    expect(g.map((x) => [x.name, x.rows.length])).toEqual([["Alp", 2], ["Zed", 1]]);
  });
  it("storage failure safe", () => { expect(readGroupPref("u")).toBe(false); });
  it("keeps grouping isolated per viewer and handles blocked localStorage", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    expect(readGroupPref("one")).toBe(false);
    writeGroupPref("one", true);
    expect(readGroupPref("one")).toBe(true);
    expect(readGroupPref("two")).toBe(false);
    writeGroupPref("one", false);
    expect(readGroupPref("one")).toBe(false);
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", {
      get: () => { throw new Error("blocked"); },
    }));
    expect(readGroupPref("one")).toBe(false);
    expect(() => writeGroupPref("one", true)).not.toThrow();
  });
  it("groups same-named but distinct properties once each using property identity", () => {
    const groups = groupByProperty([
      r("1", "Same", "2024-01-01", "first-property"),
      r("2", "Same", "2024-02-01", "second-property"),
      r("3", "Same", "2024-03-01", "first-property"),
    ]);
    expect(groups.map(group => [group.key, group.rows.map(row => row.id)])).toEqual([
      ["first-property", ["1", "3"]], ["second-property", ["2"]],
    ]);
  });
});
