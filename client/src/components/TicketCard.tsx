import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronRight, CalendarDays, Check, User as UserIcon, MapPin } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Ticket, TicketType, TicketTypeStatus, Customer, User as UserType } from "@shared/schema";
import type { WorkType } from "@shared/schema";
import { WORK_TYPE_CATALOG } from "@shared/workTypeCatalog";

export interface TicketWithDetails extends Ticket {
  ticketType?: TicketType;
  currentStatus?: TicketTypeStatus;
  customer?: Customer;
}

export interface TicketCardProps {
  ticket: TicketWithDetails;
  formatDueDate: (date: Date | null | undefined) => { text: string; className: string } | null;
  usersMap?: Map<string, UserType>;
  schedulingStatusId?: string | null;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  showCustomer?: boolean;
  workflowStatuses?: TicketTypeStatus[];
  onNavigate?: () => void;
}

export default function TicketCard({
  ticket,
  formatDueDate,
  usersMap,
  schedulingStatusId,
  selectionMode,
  isSelected,
  onToggleSelect,
  showCustomer = true,
  workflowStatuses = [],
  onNavigate,
}: TicketCardProps) {
  const dueInfo = formatDueDate(ticket.dueDate);

  const barColor = ticket.completedAt
    ? "#22c55e"
    : (ticket.ticketType?.color || "#6b7280");

  const needsScheduling = schedulingStatusId && ticket.currentStatusId === schedulingStatusId;

  const cardInner = (
    <Card
      className={`hover-elevate active-elevate-2 cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""} ${needsScheduling ? "ring-2 ring-pink-500 dark:ring-pink-400 animate-pulse" : ""}`}
      data-testid={`card-ticket-${ticket.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {selectionMode && (
            <div
              className="flex items-center justify-center pt-1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSelect?.();
              }}
            >
              <Checkbox
                checked={isSelected}
                data-testid={`checkbox-ticket-${ticket.id}`}
              />
            </div>
          )}
          <div
            className="w-1 self-stretch rounded-full"
            style={{ backgroundColor: barColor }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {ticket.ticketType && (
                <span
                  className="text-sm font-semibold"
                  style={{ color: barColor }}
                  data-testid={`text-tickettype-${ticket.id}`}
                >
                  {ticket.ticketType.name}
                </span>
              )}
              {dueInfo?.text === "Overdue" && (
                <Badge
                  variant="destructive"
                  className="text-xs font-semibold"
                  data-testid={`badge-overdue-${ticket.id}`}
                >
                  Overdue
                </Badge>
              )}
              {ticket.workType && WORK_TYPE_CATALOG[ticket.workType as WorkType] && (
                <Badge
                  variant={WORK_TYPE_CATALOG[ticket.workType as WorkType].badgeVariant}
                  className="text-xs font-normal"
                  data-testid={`badge-worktype-${ticket.id}`}
                >
                  {WORK_TYPE_CATALOG[ticket.workType as WorkType].billingLabel}
                </Badge>
              )}
              {needsScheduling && (
                <Badge
                  className="text-xs font-semibold bg-pink-500 text-white border-pink-600 dark:bg-pink-600 dark:border-pink-500"
                  data-testid={`badge-needs-scheduling-${ticket.id}`}
                >
                  Needs Scheduling
                </Badge>
              )}
              {!selectionMode && (
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-auto" />
              )}
            </div>

            <div className="flex items-start justify-between gap-2 mt-1">
              <h3 className="font-medium text-base leading-tight line-clamp-2 flex-1" data-testid={`text-ticket-title-${ticket.id}`}>
                {ticket.title}
              </h3>
              <span className="font-mono text-xs text-muted-foreground shrink-0" data-testid={`text-ticket-id-${ticket.id}`}>
                #{ticket.id.slice(0, 8)}
              </span>
            </div>

            {ticket.ticketType?.name === "Invoice" && ticket.invoiceCategory && (
              <div className="mt-1.5">
                <Badge
                  variant="outline"
                  className={`text-xs font-normal ${
                    ticket.invoiceCategory === "snow"
                      ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300"
                      : "bg-green-50 border-green-300 text-green-700 dark:bg-green-950 dark:border-green-700 dark:text-green-300"
                  }`}
                  data-testid={`badge-invoice-category-${ticket.id}`}
                >
                  {ticket.invoiceCategory === "snow" ? "Snow" : "Maintenance"}
                </Badge>
              </div>
            )}

            {showCustomer && ticket.customer && (
              <div className="flex items-center gap-1 mt-1.5 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{ticket.customer.name}</span>
              </div>
            )}

            <div className="flex items-center flex-wrap justify-between gap-2 mt-3 pt-3 border-t">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {workflowStatuses.length > 0 && ticket.currentStatus && (() => {
                  const currentIndex = workflowStatuses.findIndex(s => s.id === ticket.currentStatusId);
                  const isOnFinalStep = currentIndex === workflowStatuses.length - 1;

                  return (
                    <div className="flex items-center min-w-0 overflow-hidden" data-testid={`workflow-progress-${ticket.id}`}>
                      {workflowStatuses.map((status, index) => {
                        const isCompleted = index < currentIndex || isOnFinalStep;
                        const isCurrent = index === currentIndex && !isOnFinalStep;
                        const isFirst = index === 0;

                        return (
                          <div key={status.id} className="flex items-center">
                            {!isFirst && (
                              <div
                                className={`w-2 h-0.5 ${
                                  isCompleted || isCurrent || isOnFinalStep
                                    ? "bg-green-500 dark:bg-green-400"
                                    : "bg-muted-foreground/30 dark:bg-muted-foreground/20"
                                }`}
                              />
                            )}

                            {isCurrent ? (
                              <Badge
                                variant="outline"
                                className="text-xs mx-0.5"
                                style={{ borderColor: status.color || undefined }}
                                data-testid={`badge-current-status-${ticket.id}`}
                              >
                                {status.name}
                              </Badge>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`w-2.5 h-2.5 rounded-full cursor-default transition-all shrink-0 ${
                                      isCompleted
                                        ? "bg-green-500 dark:bg-green-400"
                                        : "bg-muted-foreground/30 dark:bg-muted-foreground/20"
                                    }`}
                                    data-testid={`bubble-status-${status.id}`}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <span className={isCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                                    {status.name}
                                    {isCompleted && " \u2713"}
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}

                      {isOnFinalStep && (
                        <>
                          <div className="w-2 h-0.5 bg-green-500 dark:bg-green-400" />
                          <Badge
                            variant="outline"
                            className="text-xs mx-0.5 border-green-500 dark:border-green-400 text-green-600 dark:text-green-400"
                            data-testid={`badge-complete-${ticket.id}`}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Complete
                          </Badge>
                        </>
                      )}
                    </div>
                  );
                })()}
                {workflowStatuses.length === 0 && ticket.currentStatus && (
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: ticket.currentStatus.color || undefined }}
                  >
                    {ticket.currentStatus.name}
                  </Badge>
                )}
                {dueInfo && dueInfo.text !== "Overdue" && (
                  <span className={`text-xs flex items-center gap-1 ${dueInfo.className}`}>
                    <CalendarDays className="w-3 h-3" />
                    {dueInfo.text}
                  </span>
                )}
              </div>

              {ticket.assignedToId && usersMap && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-[10px] bg-muted">
                      <UserIcon className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate max-w-[80px] hidden sm:inline" data-testid={`text-assignee-${ticket.id}`}>
                    {usersMap.get(ticket.assignedToId)?.name || usersMap.get(ticket.assignedToId)?.email?.split('@')[0] || 'Assigned'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (selectionMode) {
    return (
      <div onClick={() => onToggleSelect?.()}>
        {cardInner}
      </div>
    );
  }

  return (
    <Link href={`/dashboard/tickets/${ticket.id}`} onClick={onNavigate}>
      {cardInner}
    </Link>
  );
}
