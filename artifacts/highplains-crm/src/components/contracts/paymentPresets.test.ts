import { describe, expect, it } from "vitest";
import { cycleOrder, equal12, equalOver, flatSnow, msi } from "./paymentPresets";

describe("calendar-indexed integer-cent payment presets", () => {
  it("matches Pavilion Villas MSI for January and October starts", () => {
    for (const start of [1, 10]) {
      const { amounts } = msi(1175000, start);
      expect(amounts).toEqual([58750, 58750, 117500, 117500, 117500, 117500, 117500, 117500, 117500, 117500, 58750, 58750]);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(1175000);
    }
  });
  it("matches fertilization rounded shares and September reconciliation", () => {
    for (const start of [1, 10]) {
      const { amounts } = equalOver(240000, [3, 4, 5, 6, 7, 8, 9], start);
      expect(amounts).toEqual([0, 0, 34286, 34286, 34286, 34286, 34286, 34286, 34284, 0, 0, 0]);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(240000);
    }
  });
  it("puts equal12 reconciliation in December or September", () => {
    for (const [start, last] of [[1, 12], [10, 9]]) {
      const { amounts, order } = equal12(1000000, start);
      expect(order[11]).toBe(last);
      expect(amounts[last - 1]).toBe(83337);
      expect(amounts.filter((_, i) => i !== last - 1)).toEqual(Array(11).fill(83333));
    }
  });
  it("orders months by cycle and reconciles last selected month, not input order", () => {
    expect(cycleOrder(10)).toEqual([10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(equalOver(100, [1, 12, 11], 10).amounts[0]).toBe(34);
    expect(equalOver(100, [1, 12, 11], 1).amounts[11]).toBe(34);
    expect(equalOver(100, [1, 1, 12], 10).amounts.reduce((a, b) => a + b)).toBe(100);
  });
  it("flat snow pays Dec–Apr, last paid month follows cycle order", () => {
    expect(flatSnow(100003, 10).amounts).toEqual([20001, 20001, 20001, 19999, 0, 0, 0, 0, 0, 0, 0, 20001]);
    expect(flatSnow(100003, 1).amounts[11]).toBe(19999);
  });
  it("MSI odd cents land on the final cycle month", () => {
    for (const start of [1, 10]) {
      const exact = msi(1175000, start), odd = msi(1175001, start);
      expect(odd.amounts.reduce((a, b) => a + b)).toBe(1175001);
      expect(odd.amounts[exact.order[11] - 1]).toBe(exact.amounts[exact.order[11] - 1] + 1);
    }
  });
  it("preserves totals, non-negative integers, even for tiny amounts", () => {
    for (const start of [1, 10]) for (const total of [0, 1, 2, 3, 6, 17, 999999, 2147483647]) {
      for (const result of [equal12(total, start), msi(total, start), equalOver(total, [3, 4, 5, 6, 7, 8, 9], start), flatSnow(total, start)]) {
        expect(result.amounts).toHaveLength(12);
        expect(result.amounts.every(a => Number.isSafeInteger(a) && a >= 0)).toBe(true);
        expect(result.amounts.reduce((a, b) => a + b)).toBe(total);
      }
    }
  });
  it("rejects invalid totals and months explicitly", () => {
    for (const total of [-1, 1.5, NaN, 2147483648]) expect(() => equal12(total)).toThrow(RangeError);
    for (const start of [0, 13, 1.5]) expect(() => cycleOrder(start)).toThrow(RangeError);
    expect(() => equalOver(100, [])).toThrow(RangeError);
    expect(() => equalOver(100, [0])).toThrow(RangeError);
  });
});
