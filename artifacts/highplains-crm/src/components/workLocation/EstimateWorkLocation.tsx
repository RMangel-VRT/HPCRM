import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { putEstimateWorkLocation } from "@workspace/api-client-react";
import type { EstimateDetailDto } from "@/lib/estimateBuilder";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { refreshWorkLocation } from "@/lib/workLocation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkLocationFields } from "./WorkLocationFields";

export function EstimateWorkLocation({ estimate, companyId, canEdit, showOwner, presentation = "dialog" }: {
  estimate: EstimateDetailDto;
  companyId: string;
  canEdit: boolean;
  showOwner?: boolean;
  presentation?: "dialog" | "popover";
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ label: "", details: "" });
  const display = estimate.display;
  const owner = estimate.ticketId !== null ? "workLocation.savedToTicket" : "workLocation.savedToEstimate";
  const mutation = useMutation({
    mutationFn: () => putEstimateWorkLocation(encodeURIComponent(estimate.id), {
      label: draft.label.trim() || null,
      details: draft.details.trim() || null,
    }, { headers: companyHeaders(companyId), credentials: "include" }),
    onSuccess: async () => {
      await refreshWorkLocation(qc, { companyId, ticketId: estimate.ticketId, estimateId: estimate.id });
      setOpen(false);
    },
  });
  const description = `${t(owner)}. ${t("workLocation.fallbackHint")}`;
  function changeOpen(next: boolean) {
    if (mutation.isPending) return;
    if (next) {
      const value = display?.workLocationInput;
      setDraft({ label: value?.label ?? "", details: value?.details ?? "" });
      mutation.reset();
    }
    setOpen(next);
  }
  const pencil = (
    <Button type="button" variant="ghost" size="icon" className="-my-1 h-7 w-7 shrink-0"
      aria-label={t("workLocation.edit")} title={t("workLocation.edit")} data-testid="button-edit-work-location"
      onClick={presentation === "dialog" ? () => changeOpen(true) : undefined}>
      <Pencil className="h-3.5 w-3.5" />
    </Button>
  );
  const form = (
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
      <WorkLocationFields {...draft} onChange={setDraft} disabled={mutation.isPending}
        property={display && { name: display.customerName, address: display.propertyAddressLines ?? "" }} />
      {mutation.isError && <p className="text-sm text-destructive" role="alert" data-testid="error-work-location">
        {t(mutation.error instanceof Error && "status" in mutation.error && mutation.error.status === 409
          ? "workLocation.conflict" : "workLocation.saveFailed")}
      </p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => changeOpen(false)}
          data-testid="button-cancel-work-location">{t("common.cancel")}</Button>
        <Button type="submit" disabled={mutation.isPending || !!estimate.voidedAt}
          data-testid="button-save-work-location">{t(mutation.isPending ? "common.saving" : "common.save")}</Button>
      </DialogFooter>
    </form>
  );
  return (
    <>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 whitespace-pre-wrap break-words" data-testid="text-work-location">{display?.workLocation || "—"}</div>
        {canEdit && !estimate.voidedAt && !!display?.workLocationInput && (
          presentation === "popover" ? (
            <Popover open={open} onOpenChange={changeOpen}>
              <PopoverTrigger asChild>{pencil}</PopoverTrigger>
              <PopoverContent align="start" aria-label={t("workLocation.edit")}
                className="w-[min(22rem,calc(100vw-2rem))] space-y-3" data-testid="popover-work-location">
                <div>
                  <p className="text-sm font-semibold">{t("workLocation.edit")}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                {form}
              </PopoverContent>
            </Popover>
          ) : pencil
        )}
      </div>
      {display?.workLocation && display.workLocationSource === "property" && (
        <p className="text-xs text-muted-foreground" data-testid="text-work-location-fallback">{t("workLocation.propertyAddress")}</p>
      )}
      {showOwner && <p className="text-xs text-muted-foreground" data-testid="text-work-location-owner">{t(owner)}</p>}
      {presentation === "dialog" && <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-work-location">
          <DialogHeader>
            <DialogTitle>{t("workLocation.edit")}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>}
    </>
  );
}
