import type { TerminalBehavior, TicketTypeKey } from "@workspace/db";

/**
 * Slice A: capability flags + stable status keys for the six seeded ticket types.
 * These are written to the database (schema columns + startup backfill) but are
 * NOT read anywhere yet — readers migrate off display-name matching in Slice B.
 */
export interface TicketTypeCapabilities {
  requiresCustomer: "true" | "false";
  requiresScheduling: "true" | "false";
  requiresCompletion: "true" | "false";
  requiresInvoicing: "true" | "false";
  terminalBehavior: TerminalBehavior;
}

// Capability flags for all six seeded ticket types, keyed by display name
// (post-rename/consolidation names — the backfill migration runs after those).
export const TICKET_TYPE_CAPABILITIES: Record<string, TicketTypeCapabilities> = {
  "To-Do": {
    requiresCustomer: "false", // falls back to the "Internal Tasks" customer
    requiresScheduling: "false",
    requiresCompletion: "false",
    requiresInvoicing: "false",
    terminalBehavior: "close",
  },
  "Estimate Request": {
    requiresCustomer: "true",
    requiresScheduling: "true",
    requiresCompletion: "true",
    requiresInvoicing: "true",
    terminalBehavior: "invoice",
  },
  "Project": {
    requiresCustomer: "true",
    requiresScheduling: "true",
    requiresCompletion: "true",
    requiresInvoicing: "true",
    terminalBehavior: "invoice",
  },
  "Extra Billable": {
    requiresCustomer: "true",
    requiresScheduling: "true",
    requiresCompletion: "true",
    requiresInvoicing: "true",
    terminalBehavior: "invoice",
  },
  "Invoice": {
    requiresCustomer: "true",
    requiresScheduling: "false",
    requiresCompletion: "false",
    requiresInvoicing: "false", // an Invoice ticket IS the billing artifact
    terminalBehavior: "close",
  },
  "RFP Request": {
    requiresCustomer: "false", // a prospect, not yet a customer
    // NOTE: "Pre-Proposal Walk" and "Post-Award Kickoff" are real scheduled site
    // visits with no scheduling mechanism today. Left false to preserve current
    // behavior exactly; revisit in the scheduling slice.
    requiresScheduling: "false",
    requiresCompletion: "false",
    requiresInvoicing: "false",
    terminalBehavior: "handoff",
  },
};

/**
 * Slice A2: display name → stable machine identity, for the six seeded types.
 * Written to the database but NOT read anywhere yet — readers migrate in Slice B2.
 */
export const TICKET_TYPE_KEYS: Record<string, TicketTypeKey> = {
  "To-Do": "todo",
  "Estimate Request": "estimate_request",
  "Project": "project",
  "Extra Billable": "extra_billable",
  "Invoice": "invoice",
  "RFP Request": "rfp_request",
};

// Stable machine keys for every seeded status: [type name][status name] -> statusKey.
// User-created custom statuses are intentionally absent and stay NULL.
export const STATUS_KEY_BACKFILL: Record<string, Record<string, string>> = {
  "To-Do": {
    "Open": "new",
    "Done": "closed_won",
  },
  "Invoice": {
    "Pending Invoice": "pending_invoice",
    "Invoiced": "invoiced",
  },
  "Estimate Request": {
    "New": "new",
    "Estimating": "estimating",
    "Create Proposal": "proposal_draft",
    "Proposal Sent": "proposal_sent",
    "Decision Received": "decision_received",
    "Ready to Schedule": "ready_to_schedule",
    "Work Completed": "work_completed",
    "Ready for Billing": "ready_for_billing",
    "Invoicing": "invoicing",
    "Closed - Lost": "closed_lost",
  },
  "Extra Billable": {
    "New": "new",
    "Ready to Schedule": "ready_to_schedule",
    "In Progress": "in_progress",
    "Work Completed": "work_completed",
    "Ready for Billing": "ready_for_billing",
    "Done": "closed_won",
  },
  "Project": {
    "New": "new",
    "Ready to Schedule": "ready_to_schedule",
    "Scheduled": "scheduled",
    "Work Completed": "work_completed",
    "Ready for Billing": "ready_for_billing",
    "Invoicing": "invoicing",
    "Closed - Lost": "closed_lost",
  },
  "RFP Request": {
    "Request Received": "new",
    "Review Requirements": "reviewing",
    "Request Missing Info": "waiting_info",
    "Pre-Proposal Walk": "site_visit",
    "Proposal Drafted": "proposal_draft",
    "Proposal Submitted": "proposal_sent",
    "Awaiting Response": "awaiting_response",
    "Decision Received": "decision_received",
    "Closed - Lost": "closed_lost",
    "Awarded": "awarded",
    "Contract Executed": "contract_executed",
    "CRM Setup Complete": "crm_setup",
    "Maps Requested": "maps_requested",
    "Maps Uploaded": "maps_uploaded",
    "Contacts Collected": "contacts_collected",
    "Post-Award Kickoff": "kickoff",
    "Handoff to Operations": "handoff_ops",
    "Closed - Won": "closed_won",
  },
};
