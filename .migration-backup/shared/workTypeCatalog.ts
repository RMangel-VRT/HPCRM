import type { WorkType, BillingBehavior } from "./schema";

export interface WorkTypeDefinition {
  type: WorkType;
  name: string;
  description: string;
  billingBehavior: BillingBehavior;
  billingLabel: string;
  icon: string;
  color: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
}

export const WORK_TYPE_CATALOG: Record<WorkType, WorkTypeDefinition> = {
  contract: {
    type: "contract",
    name: "Contract Work",
    description: "Work included in an existing customer contract",
    billingBehavior: "no_invoice",
    billingLabel: "Included in Contract",
    icon: "file-check",
    color: "#22c55e",
    badgeVariant: "secondary",
  },
  extra_work: {
    type: "extra_work",
    name: "Extra Billable",
    description: "Work outside the contract scope - must be invoiced",
    billingBehavior: "invoice_required",
    billingLabel: "Extra Billable",
    icon: "receipt",
    color: "#f59e0b",
    badgeVariant: "default",
  },
  project: {
    type: "project",
    name: "Project",
    description: "Larger scoped work with estimate, approval, and invoicing",
    billingBehavior: "invoice_required",
    billingLabel: "Project - Invoice Required",
    icon: "folder-kanban",
    color: "#3b82f6",
    badgeVariant: "default",
  },
  admin: {
    type: "admin",
    name: "Admin",
    description: "Internal office work - emails, meetings, documentation",
    billingBehavior: "internal",
    billingLabel: "Internal",
    icon: "briefcase",
    color: "#6b7280",
    badgeVariant: "outline",
  },
  estimate_request: {
    type: "estimate_request",
    name: "Estimate Request",
    description: "Request to price work that may become a Project or Extra Billable job",
    billingBehavior: "internal",
    billingLabel: "Pending Estimate",
    icon: "calculator",
    color: "#8b5cf6",
    badgeVariant: "outline",
  },
  shop_todo: {
    type: "shop_todo",
    name: "Shop To-Do",
    description: "Shop maintenance tasks - can be linked to equipment",
    billingBehavior: "internal",
    billingLabel: "Internal - Shop",
    icon: "wrench",
    color: "#78716c",
    badgeVariant: "outline",
  },
  rfp_request: {
    type: "rfp_request",
    name: "RFP Request",
    description: "Track the full lifecycle of a community requesting a proposal for maintenance services",
    billingBehavior: "internal",
    billingLabel: "Sales Pipeline",
    icon: "file-plus",
    color: "#8b5cf6",
    badgeVariant: "outline",
  },
  invoice: {
    type: "invoice",
    name: "Invoice",
    description: "Track work that needs to be invoiced in QuickBooks",
    billingBehavior: "invoice_required",
    billingLabel: "Pending Invoice",
    icon: "file-text",
    color: "#f59e0b",
    badgeVariant: "default",
  },
};

export const BILLING_BEHAVIOR_LABELS: Record<BillingBehavior, string> = {
  no_invoice: "No Invoice Required",
  invoice_required: "Invoice Required",
  internal: "Internal - No Invoice",
};

export function getBillingBehaviorForWorkType(workType: WorkType): BillingBehavior {
  return WORK_TYPE_CATALOG[workType].billingBehavior;
}

// Ticket Type Names used in the system
export type TicketTypeName = "Project" | "Invoice" | "To-Do" | "RFP Request" | "Extra Billable";

// Explicit mapping from WorkType to TicketTypeName
// This is the single source of truth for which ticket type a work type uses
export const WORK_TYPE_TO_TICKET_TYPE: Record<WorkType, TicketTypeName> = {
  contract: "To-Do",
  extra_work: "Extra Billable",
  project: "Project",
  admin: "To-Do",
  estimate_request: "Project",
  shop_todo: "To-Do",
  rfp_request: "RFP Request",
  invoice: "Invoice",
};

// Get the ticket type name for a given work type
export function getTicketTypeForWorkType(workType: WorkType): TicketTypeName {
  const ticketType = WORK_TYPE_TO_TICKET_TYPE[workType];
  if (!ticketType) {
    throw new Error(`No ticket type mapping found for work type: ${workType}`);
  }
  return ticketType;
}
