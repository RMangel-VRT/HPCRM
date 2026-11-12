import type { EstimateActionTicket, EstimateNextAction } from "@workspace/db";
import { calendarDaysBetween, companyDateString } from "../lib/companyDay";

type Input = Pick<EstimateActionTicket, "assignee" | "daysInStage" | "estimate" | "followUpDate" | "followUpNote" | "owner"> & { stage: string };
/** Ordered business rules. Today is a Colorado calendar day, never a host date. */
export function estimateNextAction(ticket: Input, today: string): EstimateNextAction {
  const { stage, estimate, daysInStage: days, followUpDate } = ticket;
  const message = (key: string, params?: Record<string, string | number>) => ({ key: `estimateActions.reason.${key}`, ...(params ? { params } : {}) });
  const result = (bucket: EstimateNextAction["bucket"], urgency: EstimateNextAction["urgency"], key: string, params?: Record<string, string | number>): EstimateNextAction =>
    ({ bucket, urgency, reason: message(key, params) });
  if (stage === "won") return { bucket: "won", urgency: null, reason: { key: `estimates.owner.${ticket.owner?.sectionKey ?? "scheduling"}` } };
  if (stage === "decision") return result("decide", "amber", "answered", { count: days });
  const start = () => result("start", days >= 3 ? ticket.assignee ? "amber" : "red" : null, ticket.assignee ? "new" : "unassigned", { count: days });
  if ((stage === "sent" || stage === "proposal") && !estimate) return start();
  if (stage === "sent") {
    if (estimate?.validUntil) {
      const remaining = calendarDaysBetween(today, estimate.validUntil);
      if (remaining < 0) return result("follow_up", "red", "expired", { date: estimate.validUntil });
      if (remaining <= 5) return result("follow_up", "red", "expires", { count: remaining });
    }
    if (followUpDate && followUpDate <= today) {
      const late = calendarDaysBetween(followUpDate, today);
      return { ...result("follow_up", late >= 2 ? "red" : "amber", late ? "overdue" : "due", { count: late }),
        detail: ticket.followUpNote ? message("note", { note: ticket.followUpNote }) : null };
    }
    const sentDays = estimate?.sentAt ? Math.max(0, calendarDaysBetween(companyDateString(new Date(estimate.sentAt)), today)) : days;
    if (!followUpDate && sentDays >= 7) return { ...result("follow_up", "amber", "unanswered", { count: sentDays }), detail: message("unscheduled") };
    return followUpDate ? result("waiting", null, "scheduled", { date: followUpDate }) : result("waiting", null, "sent", { count: sentDays });
  }
  if (stage === "proposal") return result("send", days >= 3 ? "amber" : null, "ready", { count: days });
  if (stage === "estimating") {
    const idle = estimate?.draftEditedAt ? Math.max(0, calendarDaysBetween(companyDateString(new Date(estimate.draftEditedAt)), today)) : days;
    return { ...result("finish", idle >= 10 ? "red" : idle >= 5 ? "amber" : null, idle >= 5 ? "untouched" : "edited", { count: idle }),
      detail: estimate?.linesNeedingPrice ? message("prices", { count: estimate.linesNeedingPrice }) : null };
  }
  return start();
}
