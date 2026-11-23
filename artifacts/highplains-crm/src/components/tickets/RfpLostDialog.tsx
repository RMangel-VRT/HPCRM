import { useMarkRfpLost, type RfpLossInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useRfpLinkedContracts } from "@/components/contracts/RfpContracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { invalidateTicketScheduling } from "@/lib/schedulingStatus";

export function RfpLostDialog({ ticketId, companyId, customerId, reasons, onClose }: {
  ticketId: string; companyId: string; customerId?: string | null; reasons: string[]; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const contracts = useRfpLinkedContracts(ticketId);
  const form = useForm<RfpLossInput>({ defaultValues: { lossReason: "", lossNotes: "" } });
  const loss = useMarkRfpLost<Error & { data?: { message?: string } }>({
    request: { credentials: "include", headers: { "X-Company-Id": companyId } },
    mutation: {
      onSuccess: updated => {
        onClose();
        invalidateTicketScheduling(queryClient, updated.id, customerId);
        void queryClient.invalidateQueries({ queryKey: ["/api/bids/board"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/contract-center/contracts"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/contract-center/attention"] });
        toast({ title: t("ticketDetail.statusUpdated") });
      },
      onError: error => {
        form.setError("root", { message: error.data?.message ?? t("rfpTicket.markLostFailed") });
      },
    },
  });
  const canSubmit = reasons.includes(form.watch("lossReason")) && !loss.isPending &&
    !contracts.isFetching && !contracts.isError && !!contracts.data;

  return <Dialog open onOpenChange={open => { if (!open && !loss.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-md" data-testid="dialog-rfp-lost">
      <DialogHeader>
        <DialogTitle>{t("rfpTicket.markLost")}</DialogTitle>
        <DialogDescription>{t("rfpTicket.markLostDescription")}</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(({ lossReason, lossNotes }) => {
          if (!canSubmit) return;
          loss.mutate({ id: ticketId, data: { lossReason, ...(lossNotes?.trim() ? { lossNotes } : {}) } });
        })}>
          {contracts.isLoading && <p className="text-sm text-muted-foreground">{t("rfpContracts.loading")}</p>}
          {contracts.isError && <Button type="button" size="sm" variant="outline" onClick={() => void contracts.refetch()} data-testid="button-retry-rfp-contracts">
            {t("rfpContracts.retry")}
          </Button>}
          {!!contracts.data?.length && <p className="text-sm text-muted-foreground" data-testid="text-rfp-loss-contract-warning">
            {t("rfpTicket.markLostContractWarning")}
          </p>}
          <div className="space-y-2">
            <Label htmlFor="rfp-loss-reason">{t("rfpTicket.lossReason")}</Label>
            <select id="rfp-loss-reason" className="w-full h-10 px-3 border rounded-md bg-background"
              {...form.register("lossReason")} required disabled={loss.isPending} data-testid="select-rfp-loss-reason">
              <option value="" disabled>{t("rfpTicket.chooseLossReason")}</option>
              {reasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rfp-loss-notes">{t("rfpTicket.lossNotes")}</Label>
            <Textarea id="rfp-loss-notes" {...form.register("lossNotes")} rows={3} disabled={loss.isPending} data-testid="input-rfp-loss-notes" />
          </div>
          {form.formState.errors.root?.message && <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={loss.isPending} onClick={onClose} data-testid="button-cancel-rfp-loss">
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={!canSubmit} data-testid="button-confirm-rfp-loss">
              {t("rfpTicket.markLost")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  </Dialog>;
}
