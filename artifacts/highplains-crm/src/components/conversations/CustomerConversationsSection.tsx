import { useState } from "react";
import { UnsortedCandidatesPanel } from "@/components/CommunicationListTab";
import ConversationsWorkspace from "./ConversationsWorkspace";
import type { ConversationFilter } from "./api";

/** CustomerDetail communications section: unsorted candidates + customer-scoped list and pane. */
export default function CustomerConversationsSection({ customerId, showCandidates }: { customerId: string; showCandidates: boolean }) {
  const [filter, setFilter] = useState<ConversationFilter>("all");
  return (
    <div className="space-y-3" data-testid="section-customer-conversations">
      {showCandidates && <UnsortedCandidatesPanel customerId={customerId} />}
      <div className="h-[min(78dvh,820px)] min-h-[520px] overflow-hidden rounded-[10px] border bg-card">
        <ConversationsWorkspace customerId={customerId} filter={filter} onFilterChange={(f) => setFilter(f === "unsorted" ? "all" : f)} />
      </div>
    </div>
  );
}
