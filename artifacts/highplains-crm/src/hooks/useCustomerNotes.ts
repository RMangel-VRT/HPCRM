import { useMutation } from "@tanstack/react-query";
import type { Note } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useCustomerScope } from "@/lib/customerScope";

/** GET /api/customers/:id/notes rows: shared company notes plus the joined author display name. */
export type CustomerNote = Note & { authorName?: string | null };

const time = (v: unknown) => { const n = v ? new Date(v as string).getTime() : NaN; return Number.isFinite(n) ? n : 0; };

/** Same order the server returns: pinned (newest pin) first, then newest created, then id desc. */
export function sortNotes<T extends Pick<Note, "id" | "createdAt"> & { pinnedAt?: Date | string | null }>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => {
    const ap = a.pinnedAt ? 1 : 0, bp = b.pinnedAt ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (ap && bp) { const d = time(b.pinnedAt) - time(a.pinnedAt); if (d) return d; }
    const c = time(b.createdAt) - time(a.createdAt);
    if (c) return c;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** CP3 Dashboard card: newest pinned note, otherwise newest note. */
export function dashboardNote<T extends Pick<Note, "id" | "createdAt"> & { pinnedAt?: Date | string | null }>(notes: readonly T[] | undefined | null): T | null {
  return notes?.length ? sortNotes(notes)[0]! : null;
}

/** Same writers as today's note create/edit/delete: the server rejects the field role only. */
export const canWriteNotes = (accessRole: string | null | undefined) => !!accessRole && accessRole !== "field";

/** Every note write refreshes this customer's notes (all scoped variants) and the dashboard feed. */
export function invalidateCustomerNotes(customerId: string) {
  void queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "notes"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "dashboard-activity"] });
}

export function usePinNote(customerId: string, opts: { onError?: (e: Error) => void } = {}) {
  const scope = useCustomerScope();
  return useMutation({
    mutationFn: async ({ noteId, pinned }: { noteId: string; pinned: boolean }) => {
      const started = scope.companyId;
      const res = await scope.request("PATCH", `/api/notes/${encodeURIComponent(noteId)}/pin`, { pinned });
      scope.assertSameCompany(started);
      return res.json() as Promise<CustomerNote>;
    },
    onSuccess: () => invalidateCustomerNotes(customerId),
    onError: (e: Error) => opts.onError?.(e),
  });
}
