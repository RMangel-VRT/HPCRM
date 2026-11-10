import { useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useCustomerScope } from "@/lib/customerScope";
import type { CustomerContractDocumentDto, CustomerDocumentCategory, CustomerDocumentDto } from "./documentModel";

/** Keys keep the ["/api/customers", id, "documents"] prefix so one invalidation refreshes page + Property card. */
export const documentsKeyPrefix = (customerId: string) => ["/api/customers", customerId, "documents"] as const;

export const invalidateCustomerDocuments = (customerId: string) =>
  queryClient.invalidateQueries({ queryKey: documentsKeyPrefix(customerId) });

/**
 * Company + user bound scope. `assertSame(started)` throws when either changed after an await so
 * pending uploads/metadata writes never land in another company or under another viewer.
 */
export function useDocumentScope() {
  const scope = useCustomerScope();
  const { user } = useAuth();
  const key = `${scope.companyId ?? ""}|${user?.id ?? ""}`;
  const ref = useRef(key);
  ref.current = key;
  return {
    ...scope,
    userId: user?.id ?? null,
    snapshot: () => key,
    assertSame: (started: string) => { if (ref.current !== started) throw new Error("scope-changed"); },
  };
}

export function useCustomerDocuments(customerId: string, category?: CustomerDocumentCategory) {
  const scope = useCustomerScope();
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return useQuery<CustomerDocumentDto[]>({
    queryKey: [...documentsKeyPrefix(customerId), category ?? "all", ...scope.scope],
    enabled: !!customerId && scope.enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) => scope.getJson<CustomerDocumentDto[]>(`/api/customers/${encodeURIComponent(customerId)}/documents${qs}`, signal),
  });
}

/** Contract files: only ever requested for privileged viewers (admin/office; AM resolves to admin). */
export function useContractDocuments(customerId: string, privileged: boolean) {
  const scope = useCustomerScope();
  return useQuery<CustomerContractDocumentDto[]>({
    queryKey: [...documentsKeyPrefix(customerId), "from-contracts", ...scope.scope],
    enabled: !!customerId && scope.enabled && privileged,
    staleTime: 30_000,
    queryFn: ({ signal }) => scope.getJson<CustomerContractDocumentDto[]>(`/api/customers/${encodeURIComponent(customerId)}/documents/from-contracts`, signal),
  });
}

export type DocumentPatch = Partial<{ name: string; category: CustomerDocumentCategory; note: string | null }>;

export function useDocumentMutations(customerId: string) {
  const scope = useDocumentScope();
  const base = `/api/customers/${encodeURIComponent(customerId)}/documents`;
  const patch = useMutation({
    mutationFn: async ({ id, data, started }: { id: string; data: DocumentPatch; started?: string }) => {
      const s = started ?? scope.snapshot();
      scope.assertSame(s);
      const res = await scope.request("PATCH", `${base}/${encodeURIComponent(id)}`, data);
      const out = await res.json() as CustomerDocumentDto;
      scope.assertSame(s);
      return out;
    },
    onSettled: () => { void invalidateCustomerDocuments(customerId); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const s = scope.snapshot();
      await scope.request("DELETE", `${base}/${encodeURIComponent(id)}`);
      scope.assertSame(s);
    },
    onSettled: () => { void invalidateCustomerDocuments(customerId); },
  });
  return { patch, remove, scope };
}
