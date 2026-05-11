import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

import { apiRequest } from "./api";

// Mobile v1 Slice 7: persist React Query caches to AsyncStorage so the app
// boots into the last-known-good state when offline.
//
// We only persist read-only screen caches (everything keyed `m-…`). Mutations
// have their own offline queue (`lib/upload-queue.ts`); we never persist a
// half-finished mutation here.
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "hp.rq-cache.v1";
const BUSTER = "v1";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // Keep in cache long enough for the persister to round-trip even if a
      // screen unmounts while offline.
      gcTime: TWENTY_FOUR_HOURS_MS,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: STORAGE_KEY,
  throttleTime: 1_000,
});

// Slice 7: one-shot aggregator response. The server returns enough data
// to seed every `m-*` query key the app cares about on first launch.
type SyncAggregatorResponse = {
  today: unknown;
  week: unknown;
  tickets?: Array<{ id: string } & Record<string, unknown>>;
  recentProperties: unknown;
  me: unknown;
};

/**
 * Call `GET /api/m/sync` and seed the React Query caches for Today,
 * Week, Recent completions, Me, and every per-ticket detail on today's
 * route in one round-trip. Used on login, on app foreground, and on
 * Today pull-to-refresh so a crew member who loses signal between the
 * truck and a property still has full ticket payloads (work items +
 * site notes) on screens they haven't opened yet.
 *
 * Cache keys mirror the per-screen consumers exactly:
 *   - ["m-today"]                      → today/index.tsx (no-date branch)
 *   - ["m-me-week"]                    → me/index.tsx WEEK_KEY
 *   - ["m-me-recent"]                  → me/index.tsx RECENT_KEY
 *   - ["m-me"]                         → me/index.tsx ME_KEY
 *   - ["m-properties", ""]             → properties/index.tsx PROPERTIES_KEY("")
 *   - ["m-ticket", id] (per-ticket)    → today/tickets/[id].tsx ticketKey
 *
 * Best-effort: any failure (offline, 4xx) is swallowed — individual
 * screens fall back to their own queries.
 */
export async function warmSyncFromAggregator(): Promise<void> {
  try {
    const resp = await apiRequest<SyncAggregatorResponse>("/api/m/sync");
    if (resp?.today) queryClient.setQueryData(["m-today"], resp.today);
    if (resp?.week) queryClient.setQueryData(["m-me-week"], resp.week);
    if (Array.isArray(resp?.recentProperties)) {
      // Properties tab default (empty search) — the screen consumes
      // `{ recent, results }`. Seed `recent` with the aggregator's
      // recently-viewed slice so the list paints instantly on cold
      // launch; `results` stays empty until the screen's own query
      // returns the full A-Z directory on focus.
      queryClient.setQueryData(
        ["m-properties", ""],
        { recent: resp.recentProperties, results: [] },
      );
      // Note: m-me-recent (recent ticket completions, not properties)
      // intentionally NOT seeded here — different shape, different data
      // source. Me screen refetches on focus.
    }
    if (resp?.me) queryClient.setQueryData(["m-me"], resp.me);
    if (Array.isArray(resp?.tickets)) {
      for (const ticket of resp.tickets) {
        if (ticket && typeof ticket.id === "string") {
          queryClient.setQueryData(["m-ticket", ticket.id], ticket);
        }
      }
    }
  } catch {
    /* offline or auth issue — caller will fall back to per-screen queries */
  }
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: TWENTY_FOUR_HOURS_MS,
  buster: BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (q) => {
      // Persist only `m-…` mobile-app keys. Skip in-flight queries — a half-
      // baked entry is worse than a cold fetch on next launch.
      const first = Array.isArray(q.queryKey) ? q.queryKey[0] : q.queryKey;
      if (typeof first !== "string") return false;
      if (!first.startsWith("m-")) return false;
      return q.state.status === "success";
    },
  },
};
