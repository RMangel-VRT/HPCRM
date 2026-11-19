import { ToastAction } from "@/components/ui/toast";
import { parseApiValidationError } from "@/lib/apiError";
import { focusVisitsCard } from "@/lib/scheduling";
import i18n from "@/i18n";

type ToastFn = (t: any) => unknown;

/**
 * MULTIPLE_VISITS from any ticket write: send the user to the Visits card instead of showing generic text.
 * Closes any edit dialog first so the card is visible. Returns true when handled.
 */
export function handleMultipleVisits(err: unknown, toast: ToastFn, opts: { close?: () => void } = {}): boolean {
  const { code } = parseApiValidationError(err);
  if (code !== "MULTIPLE_VISITS") return false;
  opts.close?.();
  focusVisitsCard(150);
  toast({
    title: i18n.t("scheduling.errorTitle", "Couldn't update the schedule"),
    description: i18n.t("scheduling.ticket.multiple", "This job is on the schedule more than once. Change it under On the schedule below."),
    variant: "destructive",
    action: <ToastAction altText={i18n.t("scheduling.ticket.heading", "On the schedule")} onClick={() => focusVisitsCard(0)}>{i18n.t("scheduling.ticket.heading", "On the schedule")}</ToastAction>,
  });
  return true;
}
