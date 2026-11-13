import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { invalidateContractQueries } from "./AttentionWidgets";

describe("successful contract actions refresh active and previously opened detail", () => {
  it("evicts inactive identity-scoped detail but retains and refetches active detail", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const prefix = "/api/contract-center/contracts";
    const inactive = [prefix, "unsigned", "company", "actor"];
    const active = [prefix, "visible", "company", "actor"];
    qc.setQueryData(inactive, { state: "working_unsigned" });
    qc.setQueryData(active, { state: "working_unsigned" });
    qc.setQueryData([prefix], [{ state: "working_unsigned" }]);
    qc.setQueryData(["/api/unrelated"], "keep");
    const observer = new QueryObserver(qc, { queryKey: active, queryFn: async () => ({ state: "renewal_due" }), staleTime: Infinity });
    const stop = observer.subscribe(() => {});
    try {
      await invalidateContractQueries(qc);
      expect(qc.getQueryData(inactive)).toBeUndefined();
      expect(qc.getQueryData(active)).toEqual({ state: "renewal_due" });
      expect(qc.getQueryData([prefix])).toBeDefined();
      expect(qc.getQueryData(["/api/unrelated"])).toBe("keep");
      expect(await qc.fetchQuery({ queryKey: inactive, queryFn: async () => ({ state: "renewal_due" }) }))
        .toEqual({ state: "renewal_due" });
    } finally { stop(); qc.clear(); }
  });
});
