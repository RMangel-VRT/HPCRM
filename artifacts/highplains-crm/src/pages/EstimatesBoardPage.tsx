import { OpportunityBoard } from "@/components/OpportunityBoard";
import { EstimatesRail } from "@/components/nav/estimatesRail";

export const STAGE_KEYS = ["new", "estimating", "proposal", "sent", "decision"] as const;

export default function EstimatesBoardPage() {
  return <OpportunityBoard board="estimates" stages={STAGE_KEYS} rail={<EstimatesRail activeKey="all" />} />;
}
