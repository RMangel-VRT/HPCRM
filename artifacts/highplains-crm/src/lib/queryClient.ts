import { QueryClient, QueryFunction, MutationCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { headers?: Record<string, string>; signal?: AbortSignal },
): Promise<Response> {
  const multipart = typeof FormData !== "undefined" && data instanceof FormData;
  const headers: Record<string, string> = { ...(data && !multipart ? { "Content-Type": "application/json" } : {}), ...(options?.headers ?? {}) };
  // Never let callers force a Content-Type on multipart; the browser must set the boundary.
  if (multipart) for (const k of Object.keys(headers)) if (k.toLowerCase() === "content-type") delete headers[k];
  const res = await fetch(url, {
    method,
    headers,
    body: multipart ? data : data ? JSON.stringify(data) : undefined,
    credentials: "include",
    ...(options?.signal ? { signal: options.signal } : {}),
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("PARENT_CUSTOMER_NOT_ALLOWED")) {
        toast({
          title: "Cannot use a parent customer",
          description: "That customer is a grouping for child properties. Please pick a child property instead.",
          variant: "destructive",
        });
      }
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
