import { OpportunityBoard } from "@/components/OpportunityBoard";

export const STAGE_KEYS = ["new", "reviewing", "walk", "proposal", "submitted", "decision"] as const;

export default function BidsBoardPage() {
  return <OpportunityBoard board="bids" stages={STAGE_KEYS} />;
}
