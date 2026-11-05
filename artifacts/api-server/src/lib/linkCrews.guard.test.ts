import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn(), select: vi.fn() }));
vi.mock("../db", () => ({ db: mocks }));
import { linkCrewsByName } from "./linkCrews";
afterEach(() => vi.restoreAllMocks());
describe("campaign crew linker schema guard", () => {
  it.each([[0, 0], [5, 0], [4, 1]])("skips all DML when schema objects are incomplete (%i columns, %i indexes)", async (columns, indexes) => {
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [{ n: columns }] }).mockResolvedValueOnce({ rows: [{ n: indexes }] });
    await linkCrewsByName("company");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
