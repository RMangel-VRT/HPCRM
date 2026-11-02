import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import { useAuth } from "@/hooks/use-auth";

// The frontend Drizzle stub infers notification rows as any. Keep the wire fields explicit.
export interface Notification {
  id: string;
  ticketId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string | Date;
}
export type NotificationFilter = { type: "mentioned" } | { exclude: "mentioned" };
export const mentionsFilter = { type: "mentioned" } as const;
export const generalFilter = { exclude: "mentioned" } as const;
const lists = "/api/notifications";
const counts = "/api/notifications/unread-count";
export type NotificationScope = { userId: string; companyId: string; role: string };
export function useNotificationScope(): NotificationScope | null {
  const { user } = useAuth();
  return user?.id && user.activeCompanyId
    ? { userId: user.id, companyId: user.activeCompanyId, role: user.activeRole ?? "" } : null;
}
const scopeParts = (scope: NotificationScope | null) => [scope?.userId ?? "", scope?.companyId ?? "", scope?.role ?? ""] as const;
const scopeKey = (root: string, scope: NotificationScope | null) => [root, ...scopeParts(scope)] as const;
export const notificationListKey = (filter: NotificationFilter, scope: NotificationScope | null) => [...scopeKey(lists, scope), filter] as const;
export const notificationCountKey = (filter: NotificationFilter, scope: NotificationScope | null) => [...scopeKey(counts, scope), filter] as const;
export const mentionsCountKey = (scope: NotificationScope | null) => notificationCountKey(mentionsFilter, scope);
const headers = (scope: NotificationScope | null): Record<string, string> => scope ? { "X-Company-Id": scope.companyId } : {};
const suffix = (filter: NotificationFilter) => new URLSearchParams(filter).toString();

export function notificationListOptions(filter: NotificationFilter, scope: NotificationScope | null, refetchInterval = 15_000) {
  return {
    queryKey: notificationListKey(filter, scope),
    enabled: !!scope,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Notification[]> =>
      scope ? (await apiRequest("GET", `${lists}?${suffix(filter)}`, undefined, { signal, headers: headers(scope) })).json() : [],
    refetchInterval,
    staleTime: 0,
  };
}
export function notificationCountOptions(filter: NotificationFilter, scope: NotificationScope | null) {
  return {
    queryKey: notificationCountKey(filter, scope),
    enabled: !!scope,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<{ count: number }> =>
      scope ? (await apiRequest("GET", `${counts}?${suffix(filter)}`, undefined, { signal, headers: headers(scope) })).json() : { count: 0 },
    refetchInterval: 60_000,
    staleTime: 50_000,
  };
}
export function useMentionsCount() {
  const scope = useNotificationScope();
  return useQuery(notificationCountOptions(mentionsFilter, scope));
}

function includesType(key: QueryKey, type: string) {
  const filter = key[4] as NotificationFilter | undefined;
  return !filter || ("type" in filter ? filter.type === type : filter.exclude !== type);
}
async function cancelNotifications(client: QueryClient, scope: NotificationScope) {
  await Promise.all([lists, counts].map(root => client.cancelQueries({ queryKey: scopeKey(root, scope) })));
}
function reconcile(client: QueryClient, scope: NotificationScope) {
  // Every request started before the write has been cancelled before patching.
  // These requests therefore observe the committed server state, not a pre-write snapshot.
  for (const root of [lists, counts]) void client.invalidateQueries({ queryKey: scopeKey(root, scope) });
}
function findRow(client: QueryClient, id: string, scope: NotificationScope) {
  return client.getQueriesData<Notification[]>({ queryKey: scopeKey(lists, scope) })
    .flatMap(([, rows]) => Array.isArray(rows) ? rows : []).find(row => row.id === id);
}
const pending = new WeakMap<QueryClient, Map<string, Promise<void>>>();

export function markNotificationRead(client: QueryClient, id: string, scope: NotificationScope | null): Promise<void> {
  if (!scope) return Promise.reject(new Error("AUTH_REQUIRED"));
  let requests = pending.get(client);
  if (!requests) { requests = new Map(); pending.set(client, requests); }
  const pendingKey = JSON.stringify([...scopeParts(scope), id]);
  const existing = requests.get(pendingKey);
  if (existing) return existing;
  if (findRow(client, id, scope)?.isRead) return Promise.resolve();
  const request = (async () => {
    await apiRequest("PATCH", `${lists}/${id}/read`, undefined, { headers: headers(scope) });
    await cancelNotifications(client, scope);
    const row = findRow(client, id, scope);
    // Resolve against current cache, not the clicked render: repeat/concurrent clicks
    // and the global read-all may already have read this row.
    if (row && !row.isRead) {
      client.setQueriesData<Notification[]>({ queryKey: scopeKey(lists, scope) }, rows =>
        rows?.map(item => item.id === id ? { ...item, isRead: true } : item));
      for (const [key] of client.getQueriesData({ queryKey: scopeKey(counts, scope) })) {
        if (includesType(key, row.type)) client.setQueryData<{ count: number }>(key,
          data => data ? { count: Math.max(0, data.count - 1) } : data);
      }
    }
    reconcile(client, scope);
  })().finally(() => requests.delete(pendingKey));
  requests.set(pendingKey, request);
  return request;
}
function readAllCoverage(key: QueryKey, filter?: NotificationFilter): "covered" | "disjoint" | "mixed" {
  if (!filter) return "covered";
  const cachedFilter = key[4] as NotificationFilter | undefined;
  if ("type" in filter) {
    if (!includesType(key, filter.type)) return "disjoint";
    return cachedFilter && "type" in cachedFilter ? "covered" : "mixed";
  }
  if (!includesType(key, filter.exclude)) return "covered";
  return cachedFilter && "type" in cachedFilter ? "disjoint" : "mixed";
}
export async function markAllNotificationsRead(client: QueryClient, scope: NotificationScope | null, filter?: NotificationFilter) {
  if (!scope) throw new Error("AUTH_REQUIRED");
  await apiRequest("POST", `${lists}/read-all${filter ? `?${suffix(filter)}` : ""}`, undefined, { headers: headers(scope) });
  await cancelNotifications(client, scope);
  // Only wholly covered caches can be cleared locally. Disjoint caches retain
  // their data; mixed lists AND counts wait for reconciliation without guessing.
  for (const [key] of client.getQueriesData({ queryKey: scopeKey(lists, scope) })) {
    if (readAllCoverage(key, filter) === "covered") client.setQueryData<Notification[]>(key,
      rows => rows?.map(row => ({ ...row, isRead: true })));
  }
  for (const [key] of client.getQueriesData({ queryKey: scopeKey(counts, scope) })) {
    if (readAllCoverage(key, filter) === "covered") client.setQueryData<{ count: number }>(key,
      data => data ? { count: 0 } : data);
  }
  reconcile(client, scope);
}
export function useNotificationRead() {
  const client = useQueryClient();
  const scope = useNotificationScope();
  return useMutation({ mutationFn: (id: string) => markNotificationRead(client, id, scope) });
}
export function useNotificationsReadAll(filter?: NotificationFilter) {
  const client = useQueryClient();
  const scope = useNotificationScope();
  return useMutation({ mutationFn: () => markAllNotificationsRead(client, scope, filter) });
}
