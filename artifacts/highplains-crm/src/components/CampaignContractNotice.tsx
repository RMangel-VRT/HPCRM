import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CampaignContractState } from "../../../../lib/db/src/campaignGenerationContracts";

export default function CampaignContractNotice({ value, onSkip }: {
  value?: CampaignContractState; onSkip?: () => void;
}) {
  if (!value || value.state === "owed") return null;
  const waiting = value.state === "waiting_on_signature";
  return <div className="flex flex-wrap items-center gap-2 text-xs" data-testid={`contract-${value.state}`}>
    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">
      {waiting ? "Waiting on signature" : "No longer in contract"}
    </Badge>
    {value.agreementId && value.termId
      ? <Link className="text-primary underline" href={`/dashboard/contracts/${value.agreementId}#term-${value.termId}`}
        onClick={e => e.stopPropagation()}>Open contract</Link>
      : <Link className="text-primary underline" href="/dashboard/contracts"
        onClick={e => e.stopPropagation()}>Review contracts</Link>}
    {!waiting && <span>Retained to preserve recorded work or past-round history.</span>}
    {!waiting && onSkip && <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onSkip(); }}>Skip item</Button>}
  </div>;
}
