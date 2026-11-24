import {
  useRefreshRevenueQboIncome,
  useUpdateRevenueQboAccountMappings,
  type RevenueQboAccountMappingChanges,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

export type RevenueScope = { companyId: string; userId: string; admin: boolean };
export const revenuePrefix = (scope: RevenueScope) =>
  ["revenueV2", scope.companyId, scope.userId, scope.admin] as const;
export const revenueKey = (scope: RevenueScope, key: readonly unknown[]) =>
  [...revenuePrefix(scope), ...key] as const;
export const revenueRequest = (scope: RevenueScope) => ({
  credentials: "include" as const,
  headers: { "X-Company-Id": scope.companyId },
});
export const revenueQuery = (scope: RevenueScope, key: readonly unknown[], enabled = true) => ({
  query: { queryKey: revenueKey(scope, key), enabled, staleTime: 30_000 },
  request: revenueRequest(scope),
});

export function responseStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error ? error.status : undefined;
}

type RefreshState = "queued" | "loading" | "loaded" | "failed" | "disconnected" |
  "companyChanged" | "permissionChanged" | "skipped";
export type RefreshResult = { year: number; state: RefreshState };

export function useRevenueRefresh(scope: RevenueScope, currentYear: number) {
  const cache = useQueryClient();
  const { mutateAsync } = useRefreshRevenueQboIncome({ request: revenueRequest(scope) });
  const [results, setResults] = useState<RefreshResult[]>([]);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function load(years: readonly number[]) {
    if (!scope.admin || running.current || !years.length || years.length > 5 ||
      years.some(year => !Number.isInteger(year) || year < 2015 || year > currentYear)) return;
    running.current = true;
    setBusy(true);
    setResults(years.map(year => ({ year, state: "queued" })));
    const setYear = (year: number, state: RefreshState) => {
      if (mounted.current) setResults(previous => previous.map(row => row.year === year ? { year, state } : row));
    };
    let invalidate = false;
    try {
      for (const year of years) {
        if (!mounted.current) break;
        setYear(year, "loading");
        try {
          await mutateAsync({ data: { year } });
          invalidate = true;
          setYear(year, "loaded");
        } catch (error) {
          const status = responseStatus(error);
          const state = status === 409 ? "companyChanged" : status === 503 ? "disconnected" :
            status === 401 || status === 403 ? "permissionChanged" : "failed";
          setYear(year, state);
          if (state === "disconnected") invalidate = true;
          if (state !== "failed") {
            if (mounted.current) setResults(previous => previous.map(row =>
              row.state === "queued" ? { ...row, state: "skipped" } : row));
            break;
          }
        }
      }
    } finally {
      if (invalidate) void cache.invalidateQueries({ queryKey: revenuePrefix(scope) });
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { results, busy, load };
}

export type RevenueRefresh = ReturnType<typeof useRevenueRefresh>;

export function useRevenueMappingSave(scope: RevenueScope) {
  const { mutateAsync, isPending } = useUpdateRevenueQboAccountMappings({ request: revenueRequest(scope) });
  return {
    isPending,
    save: (changes: RevenueQboAccountMappingChanges) => mutateAsync({ data: changes }),
  };
}
