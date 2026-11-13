import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {} }));
import { reconcileContractPopulation } from "./contractCenterPersistence";
import { logger } from "./logger";
describe("accounting reconciliation safety net", () => {
  it("logs omitted agreements and includes them as unclassified rather than dropping them", () => {
    const log = vi.spyOn(logger, "error").mockImplementation(() => {});
    const result = reconcileContractPopulation([{ id: "a" }, { id: "b" }], [
      { id: "a", state: "good" as const, applicableLines: ["landscape"] },
    ] as { id: string; state: "good" | "unclassified"; applicableLines: string[] }[],
    id => ({ id, state: "unclassified", applicableLines: ["landscape", "snow"] }), "company");
    expect(result.total).toBe(2);
    expect(result.counts.good).toBe(1);
    expect(result.counts.unclassified).toBe(1);
    expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(2);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
