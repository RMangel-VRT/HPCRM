import type { EstimateVersion } from "@workspace/db";
import { addCalendarDays, companyDateString } from "./companyDay";

export type PipelineVersion = Pick<EstimateVersion, "status" | "acceptedOn" | "declinedAt" | "frozenSubtotalCents">
  & Partial<Pick<EstimateVersion, "frozenTotalCents">>;
/** Discounted frozen total; versions frozen before discounts existed use their subtotal. */
const frozenTotal = (v: PipelineVersion) => v.frozenTotalCents ?? v.frozenSubtotalCents ?? 0;

/** Exactly 365 calendar days including today, not 365 elapsed 24-hour periods. */
export function revenuePipelineWindow(today: string) {
  return { from: addCalendarDays(today, -364), to: addCalendarDays(today, 1) };
}

export function revenueEstimatePipeline(versions: readonly PipelineVersion[], today: string) {
  const { from, to } = revenuePipelineWindow(today);
  const inWindow = (day: string | null) => day !== null && from <= day && day < to;
  let acceptedLast12Cents = 0, sentOpenCents = 0, accepted = 0, declined = 0;
  for (const version of versions) {
    if (version.status === "sent") sentOpenCents += frozenTotal(version);
    if (version.status === "accepted" && inWindow(version.acceptedOn)) {
      accepted++;
      acceptedLast12Cents += frozenTotal(version);
    }
    if (version.status === "declined" && version.declinedAt && inWindow(companyDateString(version.declinedAt))) declined++;
  }
  return { acceptedLast12Cents, sentOpenCents, winRatePct: accepted + declined === 0 ? null : accepted / (accepted + declined) * 100 };
}
