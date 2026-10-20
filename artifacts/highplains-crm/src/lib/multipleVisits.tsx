import { ToastAction } from "@/components/ui/toast";
import { parseApiValidationError } from "@/lib/apiError";
import { focusVisitsCard } from "@/lib/scheduling";

type ToastFn = (t: any) => unknown;

/**
 * MULTIPLE_VISITS from any ticket write: send the user to the Visits card instead of showing generic text.
 * Closes any edit dialog first so the card is visible. Returns true when handled.
 */
export function handleMultipleVisits(err: unknown, toast: ToastFn, opts: { close?: () => void } = {}): boolean {
  const { code, message } = parseApiValidationError(err);
  if (code !== "MULTIPLE_VISITS") return false;
  opts.close?.();
  focusVisitsCard(150);
  toast({
    title: "This job has several visits",
    description: message ?? "Change them in Visits below.",
    variant: "destructive",
    action: <ToastAction altText="Open Visits" onClick={() => focusVisitsCard(0)}>Open Visits</ToastAction>,
  });
  return true;
}
