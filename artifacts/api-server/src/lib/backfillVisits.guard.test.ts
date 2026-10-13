import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), transaction: vi.fn() }));
vi.mock("../db", () => ({ db: mock }));
import { backfillVisitsFromTickets } from "./backfillVisits";
describe("visits startup guard", () => {
  it("does only a catalog read if visits is absent, without DDL or touching tickets", async () => {
    mock.execute.mockResolvedValue({ rows: [{ table_name: null }] });
    await backfillVisitsFromTickets();
    expect(mock.execute).toHaveBeenCalledOnce();
    expect(mock.select).not.toHaveBeenCalled();
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});
