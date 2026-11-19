export const TICKET_EDIT_REASONS = {
  TICKET_EDIT_PERMISSION: "Only admins and office staff can change the customer or ticket type.",
  TICKET_EDIT_ESTIMATE: "This ticket has a non-voided estimate.",
  TICKET_EDIT_INVOICE_LINK: "This ticket is linked to an invoice ticket.",
  TICKET_EDIT_CONTRACT: "This ticket is linked to a contract.",
  TICKET_EDIT_CONTRACT_CENTER: "This ticket is linked to Contract Center.",
  TICKET_EDIT_VISIT: "This ticket has a linked visit.",
  TICKET_EDIT_CAMPAIGN: "This ticket is linked to a campaign item.",
  TICKET_EDIT_STARTED: "The type can only change while the ticket is in its first status.",
  TICKET_EDIT_INVOICE_TYPE: "Invoice tickets use a separate workflow and cannot be converted.",
  TICKET_EDIT_SHOP_TYPE: "Shop to-do and equipment tickets cannot be converted.",
  TICKET_EDIT_INVALID_TYPE: "Choose an active ticket type offered in New Ticket.",
  TICKET_EDIT_TYPE_CHANGED: "The ticket type changed while you were editing. Reopen Edit ticket to continue.",
  TICKET_EDIT_INVALID_CUSTOMER: "Choose a customer in the active company.",
  TICKET_EDIT_CUSTOMER_REQUIRED: "Set a customer on the ticket before changing to this type.",
  TICKET_EDIT_INVALID_WORK_TYPE: "Choose Contract or Billable for a Task. Other ticket types set this automatically.",
  TICKET_EDIT_MISSING_STATUS: "The selected ticket type has no workflow statuses.",
  TICKET_EDIT_BILLING_LOCKED: "Work type cannot change at this billing step. Step back to Work completed first.",
  PARENT_CUSTOMER_NOT_ALLOWED: "Choose a child property rather than a parent customer.",
  SCHEDULE_REQUIRED: "The first status of this workflow requires scheduling. Choose another type or have an admin fix the workflow.",
} as const;

export type TicketEditReason = keyof typeof TICKET_EDIT_REASONS;
export type TicketEditAvailability = { customer: TicketEditReason | null; type: TicketEditReason | null };

export const TICKET_CREATION_TYPE_KEYS = ["task", "estimate_request", "project", "rfp_request", "todo", "invoice"] as const;
