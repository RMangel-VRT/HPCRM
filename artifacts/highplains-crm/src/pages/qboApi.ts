import { apiRequest } from "@/lib/queryClient";

export async function qboConnectMutationFn(): Promise<{ authorizeUrl: string }> {
  const res = await apiRequest("POST", "/api/qbo/connect");
  return (await res.json()) as { authorizeUrl: string };
}
