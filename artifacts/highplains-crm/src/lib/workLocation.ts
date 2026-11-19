import type { QueryClient } from "@tanstack/react-query";

export function refreshWorkLocation(qc: QueryClient, { companyId, ticketId, estimateId }: {
  companyId: string; ticketId?: string | null; estimateId?: string;
}) {
  return Promise.all([
    qc.invalidateQueries({ predicate: ({ queryKey: key }) =>
      key[0] === "/api/estimates" && key[2] === companyId &&
      ((key[1] === "detail" || key[1] === "proposal-linked") && (!estimateId || key[5] === estimateId)
        || key[1] === "by-ticket" && !!ticketId && key[5] === ticketId),
    }),
    qc.invalidateQueries({ queryKey: ["/api/proposals"] }),
    ...(ticketId ? [qc.invalidateQueries({ queryKey: ["/api/tickets", ticketId] })] : []),
  ]);
}
