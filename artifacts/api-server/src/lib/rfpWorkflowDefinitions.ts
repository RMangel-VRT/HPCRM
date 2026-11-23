import type { InsertTicketTypeField, InsertTicketTypeStatus } from "@workspace/db";

export const RFP_STATUSES = [
  { statusKey: "new", name: "Received", description: "RFP logged and ticket created", color: "#6366f1" },
  { statusKey: "reviewing", name: "Reviewing", description: "Reviewing RFP requirements and scope", color: "#8b5cf6" },
  { statusKey: "waiting_info", name: "Waiting on info", description: "Waiting for additional information from prospect", color: "#f59e0b", waiting: true },
  { statusKey: "site_visit", name: "Site walk", description: "Optional property walk", color: "#06b6d4" },
  { statusKey: "proposal_draft", name: "Drafting proposal", description: "Proposal is being prepared", color: "#3b82f6" },
  { statusKey: "proposal_sent", name: "Submitted", description: "Proposal has been sent to prospect", color: "#10b981", waiting: true },
  { statusKey: "awarded", name: "Awarded", description: "Verbal yes — waiting for the signed contract", color: "#22c55e", waiting: true },
  { statusKey: "onboarding", name: "Onboarding", description: "Contract signed — setting up the new customer", color: "#14b8a6" },
  { statusKey: "closed_won", name: "Won", description: "Customer onboarded and handed to operations", color: "#22c55e", final: true },
  { statusKey: "closed_lost", name: "Lost", description: "RFP was not awarded", color: "#ef4444", final: true },
] as const satisfies readonly {
  statusKey: string; name: string; description: string; color: string; waiting?: true; final?: true;
}[];

export type RfpStatusKey = (typeof RFP_STATUSES)[number]["statusKey"];

export function rfpStatusRows(ticketTypeId: string) {
  return RFP_STATUSES.map(({ statusKey, name, description, color, ...flags }, displayOrder) => ({
    ticketTypeId, statusKey, name, description, color, displayOrder,
    isFinal: "final" in flags ? "true" : "false",
    actionType: "waiting" in flags ? "waiting" : "needs_action",
    waitingCategory: "waiting" in flags ? "customer" : null,
  } satisfies InsertTicketTypeStatus));
}

type ChecklistField = Omit<InsertTicketTypeField, "ticketTypeId" | "statusId" | "displayOrder" | "options">
  & { options?: string[] };

export const RFP_ONBOARDING_FIELDS: readonly ChecklistField[] = [
  { fieldKey: "customer_setup", fieldLabel: "Customer set up in CRM", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
  { fieldKey: "maps_created", fieldLabel: "Maps in", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
  { fieldKey: "board_contacts_collected", fieldLabel: "Contacts collected", fieldType: "select", isRequired: "true", options: ["Yes", "No", "Partial"] },
  { fieldKey: "kickoff_date", fieldLabel: "Kickoff date", fieldType: "date", isRequired: "true" },
  { fieldKey: "kickoff_notes", fieldLabel: "Kickoff notes", fieldType: "textarea", isRequired: "false" },
  { fieldKey: "handoff_notes", fieldLabel: "Handoff notes", fieldType: "textarea", isRequired: "false" },
];

export const RFP_FIELDS_BY_STAGE: Partial<Record<RfpStatusKey, readonly ChecklistField[]>> = {
  new: [
    { fieldKey: "service_request_type", fieldLabel: "Service Request", fieldType: "select", isRequired: "true", options: ["Maintenance only", "Snow Removal Only", "Maintenance & Snow Removal", "Custom"] },
    { fieldKey: "request_source", fieldLabel: "Source of Request", fieldType: "select", isRequired: "true", options: ["Email", "Phone", "Referral", "Property Manager", "City", "Website", "Other"] },
    { fieldKey: "service_scope", fieldLabel: "Requested Service Scope", fieldType: "textarea", isRequired: "false" },
    { fieldKey: "desired_start_date", fieldLabel: "Desired Start Date", fieldType: "date", isRequired: "false" },
    { fieldKey: "proposal_due_date", fieldLabel: "Proposal Due Date", fieldType: "date", isRequired: "false" },
  ],
  reviewing: [
    { fieldKey: "rfp_documents_received", fieldLabel: "RFP Documents Received?", fieldType: "select", isRequired: "true", options: ["Yes", "No", "Partial"] },
    { fieldKey: "requirements_notes", fieldLabel: "Notes on Requirements", fieldType: "textarea", isRequired: "true" },
  ],
  waiting_info: [
    { fieldKey: "missing_items", fieldLabel: "Missing Items Checklist", fieldType: "textarea", isRequired: "true" },
    { fieldKey: "info_requested_date", fieldLabel: "Date Requested", fieldType: "date", isRequired: "true" },
  ],
  site_visit: [
    { fieldKey: "walk_date", fieldLabel: "Walk Date/Time", fieldType: "date", isRequired: "true" },
    { fieldKey: "walk_notes", fieldLabel: "Walk Notes", fieldType: "textarea", isRequired: "false" },
  ],
  proposal_draft: [
    { fieldKey: "proposal_version", fieldLabel: "Proposal Version", fieldType: "text", isRequired: "true" },
    { fieldKey: "draft_notes", fieldLabel: "Draft Notes", fieldType: "textarea", isRequired: "false" },
  ],
  proposal_sent: [
    { fieldKey: "submitted_date", fieldLabel: "Submitted Date", fieldType: "date", isRequired: "true" },
    { fieldKey: "delivery_method", fieldLabel: "Delivery Method", fieldType: "select", isRequired: "true", options: ["Email", "Portal", "Hard Copy", "Other"] },
  ],
  onboarding: RFP_ONBOARDING_FIELDS,
  closed_lost: [
    { fieldKey: "loss_reason", fieldLabel: "Reason for Loss", fieldType: "select", isRequired: "true", options: ["Price", "Incumbent", "Scope Mismatch", "Timing", "Other"] },
    { fieldKey: "loss_notes", fieldLabel: "Additional Notes", fieldType: "textarea", isRequired: "false" },
  ],
};

export function rfpFieldRows(ticketTypeId: string, statusId: string, key: RfpStatusKey) {
  return (RFP_FIELDS_BY_STAGE[key] ?? []).map(({ options = [], ...field }, displayOrder) => ({
    ...field, ticketTypeId, statusId, displayOrder, options,
  } satisfies InsertTicketTypeField));
}
