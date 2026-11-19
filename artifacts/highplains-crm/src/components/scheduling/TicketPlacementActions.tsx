import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useTicketNextStop, useVisitActions } from "@/hooks/use-scheduling";
import { fmtStopDay } from "@/lib/scheduling";
import { VisitDialog } from "./VisitDialog";

export function TicketPlacementActions({ ticket, property, card = false }: {
  ticket: { id: string; title: string }; property?: string | null; card?: boolean;
}) {
  const { t } = useTranslation();
  const { companyId, placeAfterNextStop, pending } = useVisitActions();
  const next = useTicketNextStop(companyId, ticket.id, !!property);
  const [opened, setOpened] = useState(false);
  const stop = !next.isError && !next.isFetching ? next.data : null;
  return (
    <>
      {stop ? (
        <Button size="sm" disabled={pending} data-testid="button-next-schedule-stop" onClick={() => {
          if (property) void placeAfterNextStop(ticket.id, stop, property);
        }}>
          {t("scheduling.ticket.addNext", "Add to next stop here")} ({fmtStopDay(stop.date, t("scheduling.dateLocale", "en-US"))} · {stop.crew.name})
        </Button>
      ) : next.isError ? (
        <Button size="sm" variant="ghost" onClick={() => void next.refetch()}>
          {t("scheduling.ticket.retryNext", "Couldn’t check the next stop. Retry")}
        </Button>
      ) : property && next.data === null && !next.isFetching ? (
        <span className="text-sm text-muted-foreground">{t("scheduling.ticket.noNext", "No upcoming stop at {{property}}", { property })}</span>
      ) : null}
      <Button size="sm" variant={stop ? "outline" : "default"} disabled={pending} onClick={() => setOpened(true)}
        data-testid={card ? "button-add-visit" : "button-pick-ticket-stop"}>
        {t("scheduling.ticket.pick", "Pick a crew and day")}
      </Button>
      <VisitDialog ticketPage mode="schedule" open={opened} onOpenChange={setOpened} ticket={ticket} />
    </>
  );
}
