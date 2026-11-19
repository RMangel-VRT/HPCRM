import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVisitActions } from "@/hooks/use-scheduling";

export function SkipSchedulingDialog({ ticketId, destination, onClose }: { ticketId: string; destination: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { companyId, skipScheduling, pending } = useVisitActions();
  const [openedCompany] = useState(companyId);
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  const choices = {
    regular: t("scheduling.ticket.regular", "Done during a regular stop"),
    noTrip: t("scheduling.ticket.noTrip", "No crew trip needed"),
    vendor: t("scheduling.ticket.vendor", "Handled by a vendor or sub"),
    other: t("scheduling.ticket.other", "Other"),
  };
  const preset = choice && choice !== "other" ? choices[choice as keyof typeof choices] : "";
  const reason = [preset, text.trim()].filter(Boolean).join(" — ");
  const valid = reason.length >= 3 && reason.length <= 500 && !/^(other|otro)$/i.test(reason);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t("scheduling.ticket.skipTitle", "Skip scheduling")}</DialogTitle>
        <DialogDescription>{t("scheduling.ticket.destination", "This moves the job to {{status}}.", { status: destination })}</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault();
        if (valid && await skipScheduling(ticketId, reason, openedCompany)) onClose();
      }}>
        <Label htmlFor="schedule-skip-choice">{t("scheduling.ticket.reason", "Reason (required)")}</Label>
        <select id="schedule-skip-choice" className="w-full rounded-md border bg-background p-2" value={choice} onChange={e => setChoice(e.target.value)}>
          <option value="">{t("scheduling.ticket.chooseReason", "Choose a reason or write your own")}</option>
          {Object.entries(choices).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <Label htmlFor="schedule-skip-text">{t("scheduling.ticket.reasonDetails", "Reason details")}</Label>
        <Textarea id="schedule-skip-text" maxLength={500 - (preset ? preset.length + 3 : 0)} value={text} onChange={e => setText(e.target.value)} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
          <Button type="submit" disabled={!valid || pending}>{t("scheduling.ticket.skipTitle", "Skip scheduling")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
