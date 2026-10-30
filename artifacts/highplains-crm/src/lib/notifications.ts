import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

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
export const notificationListKey = (filter: NotificationFilter) => [lists, filter] as const;
export const notificationCountKey = (filter: NotificationFilter) => [counts, filter] as const;
export const mentionsCountKey = notificationCountKey(mentionsFilter);
const suffix = (filter: NotificationFilter) => new URLSearchParams(filter).toString();

export function notificationListOptions(filter: NotificationFilter, refetchInterval = 15_000) {
  return {
    queryKey: notificationListKey(filter),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Notification[]> =>
      (await apiRequest("GET", `${lists}?${suffix(filter)}`, undefined, { signal })).json(),
    refetchInterval,
    staleTime: 0,
  };
}
export function notificationCountOptions(filter: NotificationFilter) {
  return {
    queryKey: notificationCountKey(filter),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<{ count: number }> =>
      (await apiRequest("GET", `${counts}?${suffix(filter)}`, undefined, { signal })).json(),
    refetchInterval: 60_000,
    staleTime: 50_000,
  };
}
export function useMentionsCount() {
  return useQuery(notificationCountOptions(mentionsFilter));
}

function includesType(key: QueryKey, type: string) {
  const filter = key[1] as NotificationFilter | undefined;
  return !filter || ("type" in filter ? filter.type === type : filter.exclude !== type);
}
async function cancelNotifications(client: QueryClient) {
  await Promise.all([lists, counts].map(root => client.cancelQueries({ queryKey: [root] })));
}
function reconcile(client: QueryClient) {
  // Every request started before the write has been cancelled before patching.
  // These requests therefore observe the committed server state, not a pre-write snapshot.
  for (const root of [lists, counts]) void client.invalidateQueries({ queryKey: [root] });
}
function findRow(client: QueryClient, id: string) {
  return client.getQueriesData<Notification[]>({ queryKey: [lists] })
    .flatMap(([, rows]) => Array.isArray(rows) ? rows : []).find(row => row.id === id);
}
const pending = new WeakMap<QueryClient, Map<string, Promise<void>>>();

export function markNotificationRead(client: QueryClient, id: string): Promise<void> {
  let requests = pending.get(client);
  if (!requests) { requests = new Map(); pending.set(client, requests); }
  const existing = requests.get(id);
  if (existing) return existing;
  if (findRow(client, id)?.isRead) return Promise.resolve();
  const request = (async () => {
    await apiRequest("PATCH", `${lists}/${id}/read`);
    await cancelNotifications(client);
    const row = findRow(client, id);
    // Resolve against current cache, not the clicked render: repeat/concurrent clicks
    // and the global read-all may already have read this row.
    if (row && !row.isRead) {
      client.setQueriesData<Notification[]>({ queryKey: [lists] }, rows =>
        rows?.map(item => item.id === id ? { ...item, isRead: true } : item));
      for (const [key] of client.getQueriesData({ queryKey: [counts] })) {
        if (includesType(key, row.type)) client.setQueryData<{ count: number }>(key,
          data => data ? { count: Math.max(0, data.count - 1) } : data);
      }
    }
    reconcile(client);
  })().finally(() => requests.delete(id));
  requests.set(id, request);
  return request;
}
export async function markAllNotificationsRead(client: QueryClient) {
  await apiRequest("POST", `${lists}/read-all`);
  await cancelNotifications(client);
  // The legacy endpoint clears ALL types, including mentions unseen in the bell.
  client.setQueriesData<Notification[]>({ queryKey: [lists] },
    rows => rows?.map(row => ({ ...row, isRead: true })));
  client.setQueriesData<{ count: number }>({ queryKey: [counts] },
    data => data ? { count: 0 } : data);
  reconcile(client);
}
export function useNotificationRead() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => markNotificationRead(client, id) });
}
export function useNotificationsReadAll() {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => markAllNotificationsRead(client) });
}
