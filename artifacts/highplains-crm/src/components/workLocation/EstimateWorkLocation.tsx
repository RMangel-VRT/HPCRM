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
import { WorkLocationFields } from "./WorkLocationFields";

export function EstimateWorkLocation({ estimate, companyId, canEdit, showOwner }: {
  estimate: EstimateDetailDto;
  companyId: string;
  canEdit: boolean;
  showOwner?: boolean;
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
  return (
    <>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 whitespace-pre-wrap break-words" data-testid="text-work-location">{display?.workLocation || "—"}</div>
        {canEdit && !estimate.voidedAt && !!display?.workLocationInput && (
          <Button type="button" variant="ghost" size="icon" className="-my-1 h-7 w-7 shrink-0"
            aria-label={t("workLocation.edit")} title={t("workLocation.edit")} data-testid="button-edit-work-location"
            onClick={() => {
              const value = display.workLocationInput;
              setDraft({ label: value?.label ?? "", details: value?.details ?? "" });
              mutation.reset();
              setOpen(true);
            }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {display?.workLocation && display.workLocationSource === "property" && (
        <p className="text-xs text-muted-foreground" data-testid="text-work-location-fallback">{t("workLocation.propertyAddress")}</p>
      )}
      {showOwner && <p className="text-xs text-muted-foreground" data-testid="text-work-location-owner">{t(owner)}</p>}
      <Dialog open={open} onOpenChange={next => { if (!mutation.isPending) setOpen(next); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-work-location">
          <DialogHeader>
            <DialogTitle>{t("workLocation.edit")}</DialogTitle>
            <DialogDescription>{t(owner)}. {t("workLocation.fallbackHint")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
            <WorkLocationFields {...draft} onChange={setDraft} disabled={mutation.isPending}
              property={display && { name: display.customerName, address: display.propertyAddressLines ?? "" }} />
            {mutation.isError && <p className="text-sm text-destructive" role="alert" data-testid="error-work-location">
              {t(mutation.error instanceof Error && "status" in mutation.error && mutation.error.status === 409
                ? "workLocation.conflict" : "workLocation.saveFailed")}
            </p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}
                data-testid="button-cancel-work-location">{t("common.cancel")}</Button>
              <Button type="submit" disabled={mutation.isPending || !!estimate.voidedAt}
                data-testid="button-save-work-location">{t(mutation.isPending ? "common.saving" : "common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
