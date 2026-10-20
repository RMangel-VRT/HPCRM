import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), transaction: vi.fn() }));
vi.mock("../db", () => ({ db: mock }));
import { backfillVisitServices } from "./backfillVisitServices";
describe("service snapshot startup guard", () => {
  it("does not touch scheduling data or issue DDL when the column is absent", async () => {
    mock.execute.mockResolvedValue({ rows: [{ installed: false }] });
    expect(await backfillVisitServices()).toBe(0);
    expect(mock.execute).toHaveBeenCalledOnce();
    expect(mock.select).not.toHaveBeenCalled();
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});
