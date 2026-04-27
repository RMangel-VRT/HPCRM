import type { QueryClient } from "@tanstack/react-query";
import type { Customer } from "@shared/schema";

const STORAGE_KEY = "lastViewedCustomerId";
const CUSTOMERS_QUERY_KEY = ["/api/customers"] as const;
const CUSTOMERS_LIST_PATH = "/dashboard/customers";

export function getLastViewedCustomerId(): string | null {
  try {
    return typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
}

export function setLastViewedCustomerId(id: string): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    /* ignore */
  }
}

export function clearLastViewedCustomerId(id?: string): void {
  try {
    if (typeof window === "undefined") return;
    if (id) {
      const current = window.localStorage.getItem(STORAGE_KEY);
      if (current && current !== id) return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Returns the URL the "Customers" navigation should open to, given a fully
 * loaded customer list.
 *
 * - Most-recently-viewed active customer if the saved id is still valid.
 * - Otherwise the first active customer alphabetically.
 * - Otherwise the list page (which renders its own empty state).
 */
export function getDefaultCustomersRoute(customers: Customer[]): string {
  const active = customers.filter((c) => c.active === "true");
  if (active.length === 0) return CUSTOMERS_LIST_PATH;

  const lastId = getLastViewedCustomerId();
  if (lastId) {
    const remembered = active.find((c) => c.id === lastId);
    if (remembered) return `/dashboard/customers/${remembered.id}`;
  }

  const first = [...active].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  )[0];
  return `/dashboard/customers/${first.id}`;
}

/**
 * Synchronous best-guess route for use as a `<Link href>` value.
 *
 * Resolution order (no awaiting):
 * 1. If the customers list is already in the React Query cache, use the
 *    full resolver (validated last-viewed → first alphabetical → list).
 * 2. Else if a last-viewed id exists in localStorage, optimistically point
 *    at that detail page. The detail page itself will clear the memory and
 *    fall back gracefully if the id is no longer valid.
 * 3. Else fall back to the list page.
 *
 * This keeps middle-click / keyboard activation usable even before the
 * customers query resolves, while still landing on the detail view in the
 * common case (returning user with a remembered customer).
 */
export function resolveCustomersRouteSync(queryClient: QueryClient): string {
  const cached = queryClient.getQueryData<Customer[]>(CUSTOMERS_QUERY_KEY);
  if (cached) return getDefaultCustomersRoute(cached);

  const lastId = getLastViewedCustomerId();
  if (lastId) return `/dashboard/customers/${lastId}`;

  return CUSTOMERS_LIST_PATH;
}

/**
 * Async resolver used for plain left-clicks. Always returns a validated
 * route — never optimistically routes to a stale last-viewed id without
 * confirming it's still active.
 *
 * - Uses cached data if available.
 * - Otherwise awaits a fetch of the customers list and runs the standard
 *   resolver (validated last-viewed → first alphabetical → list).
 * - Falls back to the list page only if the fetch fails.
 */
export async function resolveCustomersRouteAsync(
  queryClient: QueryClient
): Promise<string> {
  const cached = queryClient.getQueryData<Customer[]>(CUSTOMERS_QUERY_KEY);
  if (cached) return getDefaultCustomersRoute(cached);

  try {
    const list = await queryClient.fetchQuery<Customer[]>({
      queryKey: [...CUSTOMERS_QUERY_KEY],
    });
    return getDefaultCustomersRoute(list);
  } catch {
    return CUSTOMERS_LIST_PATH;
  }
}
