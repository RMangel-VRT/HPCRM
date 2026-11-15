import { describe, it, expect, vi } from "vitest";
import { carryProposalScope } from "./carryProposalScope";
import { db } from "../db";

describe("proposal scope schema guard", () => {
  it("does not lock or issue DML when any referenced schema is absent", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({ execute }));
    expect(await carryProposalScope({ transaction } as unknown as typeof db)).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
