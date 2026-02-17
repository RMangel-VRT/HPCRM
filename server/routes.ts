import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { promises as fs } from "fs";
import { setupAuth, type UserWithContext } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import { insertCustomerSchema, insertContactSchema, insertCompanySchema, insertCompanyUserSchema, insertSettingsSchema, insertNoteSchema, insertContractSchema, insertContractDocumentSchema, insertContractBuilderDocumentSchema, insertContractBuilderSectionSchema, insertContractBuilderVariableSchema, insertTicketTypeSchema, insertTicketTypeStatusSchema, insertTicketTypeFieldSchema, insertTicketSchema, insertTicketFieldValueSchema, insertTicketStatusHistorySchema, insertTicketCommentSchema, insertTicketLinkSchema, insertCustomerMapLayerSchema, insertCustomerMapDocumentSchema, insertMaintenanceCrewSchema, insertMaintenanceVisitConfigSchema, insertWeeklyScheduleTemplateSchema, insertScheduleBlockSchema, insertEquipmentSchema, insertEquipmentFileSchema, insertEquipmentTicketSchema, insertEquipmentTicketStatusHistorySchema, insertSnowEventSchema, insertSnowEventPropertyImpactSchema, insertSnowEventAttachmentSchema, insertEmailTemplateSchema, insertEmailRuleSchema, SNOW_RANGES, tickets, ticketTypes, ticketTypeStatuses, customers as customersTable, contractMonthlyAmounts, contractDocuments, contractServices, contractStatusHistory } from "@shared/schema";
import type { Customer } from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient, signObjectURL } from "./objectStorage";
import { ObjectPermission, ObjectAccessGroupType, setObjectAclPolicy } from "./objectAcl";
import { processEmailEvent, resendEmail, getDefaultWorkCompletedTemplate } from './services/emailService';

// Helper to ensure Invoice ticket type exists for a company with required statuses
async function ensureInvoiceTicketType(companyId: string): Promise<{ 
  typeId: string; 
  pendingStatusId: string;
} | null> {
  const ticketTypes = await storage.getTicketTypes(companyId);
  let invoiceType = ticketTypes.find(tt => tt.name === "Invoice");
  
  if (!invoiceType) {
    // Create the Invoice ticket type
    invoiceType = await storage.createTicketType({
      companyId,
      name: "Invoice",
      description: "Tracks work that needs to be invoiced in QuickBooks",
      category: "service",
      icon: "file-text",
      color: "#f59e0b",
      isActive: "true",
    });
    console.log(`Created Invoice ticket type for company ${companyId}`);
  }
  
  // Check if statuses exist, create if missing
  let invoiceStatuses = await storage.getTicketTypeStatuses(invoiceType.id);
  let pendingStatus = invoiceStatuses.find(s => s.name === "Pending Invoice");
  let invoicedStatus = invoiceStatuses.find(s => s.name === "Invoiced");
  
  if (!pendingStatus) {
    pendingStatus = await storage.createTicketTypeStatus({
      ticketTypeId: invoiceType.id,
      name: "Pending Invoice",
      description: "Work completed, awaiting invoice creation in QuickBooks",
      displayOrder: 0,
      color: "#f59e0b",
      isFinal: "false",
    });
    console.log(`Created Pending Invoice status for Invoice type`);
  }
  
  if (!invoicedStatus) {
    invoicedStatus = await storage.createTicketTypeStatus({
      ticketTypeId: invoiceType.id,
      name: "Invoiced",
      description: "Invoice created in QuickBooks",
      displayOrder: 1,
      color: "#22c55e",
      isFinal: "true",
    });
    console.log(`Created Invoiced status for Invoice type`);
    
    // Create Invoice fields for the Invoiced status
    await storage.createTicketTypeField({
      ticketTypeId: invoiceType.id,
      statusId: invoicedStatus.id,
      fieldKey: "invoice_number",
      fieldLabel: "Invoice Number",
      fieldType: "text",
      isRequired: "true",
      options: [],
      displayOrder: 0,
    });
    
    await storage.createTicketTypeField({
      ticketTypeId: invoiceType.id,
      statusId: invoicedStatus.id,
      fieldKey: "invoice_amount",
      fieldLabel: "Invoice Amount",
      fieldType: "currency",
      isRequired: "false",
      options: [],
      displayOrder: 1,
    });
    console.log(`Created Invoice fields for Invoiced status`);
  }
  
  return { typeId: invoiceType.id, pendingStatusId: pendingStatus.id };
}

// Helper to ensure RFP Request ticket type exists for a company with full workflow
async function ensureRFPRequestTicketType(companyId: string): Promise<{ 
  typeId: string; 
  statuses: Map<string, string>;
} | null> {
  const ticketTypes = await storage.getTicketTypes(companyId);
  let rfpType = ticketTypes.find(tt => tt.name === "RFP Request");
  
  if (!rfpType) {
    rfpType = await storage.createTicketType({
      companyId,
      name: "RFP Request",
      description: "Track the full lifecycle of a community requesting a proposal for maintenance services",
      category: "project",
      icon: "file-plus",
      color: "#8b5cf6",
      isActive: "true",
    });
    console.log(`Created RFP Request ticket type for company ${companyId}`);
  }
  
  // Define all RFP workflow statuses
  const rfpStatuses = [
    { name: "Request Received", description: "RFP logged and ticket created", color: "#6366f1", order: 0, isFinal: "false" as const },
    { name: "Review Requirements", description: "Reviewing RFP requirements and scope", color: "#8b5cf6", order: 1, isFinal: "false" as const },
    { name: "Request Missing Info", description: "Requesting additional information from prospect", color: "#f59e0b", order: 2, isFinal: "false" as const },
    { name: "Pre-Proposal Walk", description: "Property walk scheduled or completed", color: "#06b6d4", order: 3, isFinal: "false" as const },
    { name: "Proposal Drafted", description: "Proposal is being prepared", color: "#3b82f6", order: 4, isFinal: "false" as const },
    { name: "Proposal Submitted", description: "Proposal has been sent to prospect", color: "#10b981", order: 5, isFinal: "false" as const },
    { name: "Awaiting Response", description: "Waiting for decision from prospect", color: "#f97316", order: 6, isFinal: "false" as const },
    { name: "Decision Received", description: "Decision has been received - select outcome", color: "#eab308", order: 7, isFinal: "false" as const },
    { name: "Closed - Lost", description: "RFP was not awarded", color: "#ef4444", order: 8, isFinal: "true" as const },
    { name: "Awarded", description: "RFP was awarded - begin onboarding", color: "#22c55e", order: 9, isFinal: "false" as const },
    { name: "Contract Executed", description: "Contract has been signed", color: "#14b8a6", order: 10, isFinal: "false" as const },
    { name: "CRM Setup Complete", description: "Contract and customer details entered in CRM", color: "#0ea5e9", order: 11, isFinal: "false" as const },
    { name: "Maps Requested", description: "Property maps requested from customer", color: "#a855f7", order: 12, isFinal: "false" as const },
    { name: "Maps Uploaded", description: "Property maps created and uploaded", color: "#d946ef", order: 13, isFinal: "false" as const },
    { name: "Contacts Collected", description: "Board and PM contacts collected", color: "#ec4899", order: 14, isFinal: "false" as const },
    { name: "Post-Award Kickoff", description: "Kickoff walk or meeting completed", color: "#f43f5e", order: 15, isFinal: "false" as const },
    { name: "Handoff to Operations", description: "Ready for scheduling and operations", color: "#84cc16", order: 16, isFinal: "false" as const },
    { name: "Closed - Won", description: "RFP complete - customer onboarded", color: "#22c55e", order: 17, isFinal: "true" as const },
  ];
  
  // Get existing statuses
  let existingStatuses = await storage.getTicketTypeStatuses(rfpType.id);
  const statusMap = new Map<string, string>();
  
  // Create missing statuses
  for (const statusDef of rfpStatuses) {
    let status = existingStatuses.find(s => s.name === statusDef.name);
    if (!status) {
      status = await storage.createTicketTypeStatus({
        ticketTypeId: rfpType.id,
        name: statusDef.name,
        description: statusDef.description,
        displayOrder: statusDef.order,
        color: statusDef.color,
        isFinal: statusDef.isFinal,
      });
      console.log(`Created RFP status: ${statusDef.name}`);
    }
    statusMap.set(statusDef.name, status.id);
  }
  
  // Get existing fields to avoid duplicates
  const existingFields = await storage.getTicketTypeFields(rfpType.id);
  const existingFieldKeys = new Set(existingFields.map(f => f.fieldKey));
  
  // Define step-specific fields
  const fieldDefinitions: Array<{
    statusName: string;
    fields: Array<{
      fieldKey: string;
      fieldLabel: string;
      fieldType: "text" | "number" | "date" | "currency" | "select" | "textarea";
      isRequired: "true" | "false";
      options?: string[];
    }>;
  }> = [
    {
      statusName: "Request Received",
      fields: [
        { fieldKey: "service_request_type", fieldLabel: "Service Request", fieldType: "select", isRequired: "true", options: ["Maintenance only", "Snow Removal Only", "Maintenance & Snow Removal", "Custom"] },
        { fieldKey: "request_source", fieldLabel: "Source of Request", fieldType: "select", isRequired: "true", options: ["Email", "Phone", "Referral", "Property Manager", "City", "Website", "Other"] },
        { fieldKey: "service_scope", fieldLabel: "Requested Service Scope", fieldType: "textarea", isRequired: "false" },
        { fieldKey: "desired_start_date", fieldLabel: "Desired Start Date", fieldType: "date", isRequired: "false" },
        { fieldKey: "proposal_due_date", fieldLabel: "Proposal Due Date", fieldType: "date", isRequired: "false" },
      ]
    },
    {
      statusName: "Review Requirements",
      fields: [
        { fieldKey: "rfp_documents_received", fieldLabel: "RFP Documents Received?", fieldType: "select", isRequired: "true", options: ["Yes", "No", "Partial"] },
        { fieldKey: "requirements_notes", fieldLabel: "Notes on Requirements", fieldType: "textarea", isRequired: "true" },
      ]
    },
    {
      statusName: "Request Missing Info",
      fields: [
        { fieldKey: "missing_items", fieldLabel: "Missing Items Checklist", fieldType: "textarea", isRequired: "true" },
        { fieldKey: "info_requested_date", fieldLabel: "Date Requested", fieldType: "date", isRequired: "true" },
      ]
    },
    {
      statusName: "Pre-Proposal Walk",
      fields: [
        { fieldKey: "walk_date", fieldLabel: "Walk Date/Time", fieldType: "date", isRequired: "true" },
        { fieldKey: "walk_notes", fieldLabel: "Walk Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Proposal Drafted",
      fields: [
        { fieldKey: "proposal_version", fieldLabel: "Proposal Version", fieldType: "text", isRequired: "true" },
        { fieldKey: "draft_notes", fieldLabel: "Draft Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Proposal Submitted",
      fields: [
        { fieldKey: "submitted_date", fieldLabel: "Submitted Date", fieldType: "date", isRequired: "true" },
        { fieldKey: "delivery_method", fieldLabel: "Delivery Method", fieldType: "select", isRequired: "true", options: ["Email", "Portal", "Hard Copy", "Other"] },
      ]
    },
    {
      statusName: "Decision Received",
      fields: [
        { fieldKey: "decision_outcome", fieldLabel: "Decision", fieldType: "select", isRequired: "true", options: ["Awarded", "Lost"] },
        { fieldKey: "decision_date", fieldLabel: "Decision Date", fieldType: "date", isRequired: "true" },
      ]
    },
    {
      statusName: "Closed - Lost",
      fields: [
        { fieldKey: "loss_reason", fieldLabel: "Reason for Loss", fieldType: "select", isRequired: "true", options: ["Price", "Incumbent", "Scope Mismatch", "Timing", "Other"] },
        { fieldKey: "loss_notes", fieldLabel: "Additional Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Contract Executed",
      fields: [
        { fieldKey: "contract_signed_date", fieldLabel: "Contract Signed Date", fieldType: "date", isRequired: "true" },
        { fieldKey: "contract_notes", fieldLabel: "Contract Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "CRM Setup Complete",
      fields: [
        { fieldKey: "contract_dates_entered", fieldLabel: "Contract Dates Entered?", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
        { fieldKey: "monthly_amounts_entered", fieldLabel: "Monthly Amounts Entered?", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
        { fieldKey: "services_configured", fieldLabel: "Services Configured?", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
      ]
    },
    {
      statusName: "Maps Requested",
      fields: [
        { fieldKey: "maps_requested_date", fieldLabel: "Maps Requested Date", fieldType: "date", isRequired: "true" },
        { fieldKey: "maps_received", fieldLabel: "Maps Received?", fieldType: "select", isRequired: "false", options: ["Yes", "No", "Pending"] },
      ]
    },
    {
      statusName: "Maps Uploaded",
      fields: [
        { fieldKey: "maps_created", fieldLabel: "Maps Created?", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
        { fieldKey: "map_upload_notes", fieldLabel: "Map Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Contacts Collected",
      fields: [
        { fieldKey: "board_contacts_collected", fieldLabel: "Board/PM Contacts Collected?", fieldType: "select", isRequired: "true", options: ["Yes", "No", "Partial"] },
        { fieldKey: "contacts_notes", fieldLabel: "Contact Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Post-Award Kickoff",
      fields: [
        { fieldKey: "kickoff_date", fieldLabel: "Kickoff Date", fieldType: "date", isRequired: "true" },
        { fieldKey: "kickoff_notes", fieldLabel: "Kickoff Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Handoff to Operations",
      fields: [
        { fieldKey: "handoff_notes", fieldLabel: "Handoff Notes", fieldType: "textarea", isRequired: "false" },
        { fieldKey: "ready_for_scheduling", fieldLabel: "Ready for Scheduling?", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
      ]
    },
  ];
  
  // Create fields for each status
  for (const statusFields of fieldDefinitions) {
    const statusId = statusMap.get(statusFields.statusName);
    if (!statusId) continue;
    
    for (let i = 0; i < statusFields.fields.length; i++) {
      const fieldDef = statusFields.fields[i];
      if (existingFieldKeys.has(fieldDef.fieldKey)) continue;
      
      await storage.createTicketTypeField({
        ticketTypeId: rfpType.id,
        statusId: statusId,
        fieldKey: fieldDef.fieldKey,
        fieldLabel: fieldDef.fieldLabel,
        fieldType: fieldDef.fieldType,
        isRequired: fieldDef.isRequired,
        options: fieldDef.options || [],
        displayOrder: i,
      });
    }
  }
  
  console.log(`RFP Request ticket type setup complete for company ${companyId}`);
  return { typeId: rfpType.id, statuses: statusMap };
}

// Helper to ensure Project ticket type exists with the new 7-step workflow
// This is Office-owned for sales/estimating/billing. Use needs_scheduling for field work.
async function ensureProjectTicketType(companyId: string): Promise<{ 
  typeId: string; 
  statuses: Map<string, string>;
} | null> {
  const ticketTypes = await storage.getTicketTypes(companyId);
  let projectType = ticketTypes.find(tt => tt.name === "Project");
  
  if (!projectType) {
    projectType = await storage.createTicketType({
      companyId,
      name: "Project",
      description: "Large projects requiring estimates and approval - Office-owned workflow",
      category: "project",
      icon: "folder-kanban",
      color: "#8b5cf6",
      isActive: "true",
    });
    console.log(`Created Project ticket type for company ${companyId}`);
  }
  
  // Define the 8-step Project workflow (added Ready to Schedule after approval)
  const projectStatuses = [
    { name: "New", description: "Request captured - pending estimate", color: "#6366f1", order: 0, isFinal: "false" as const },
    { name: "Estimating", description: "Estimate being prepared in QuickBooks", color: "#8b5cf6", order: 1, isFinal: "false" as const },
    { name: "Estimate Sent", description: "Estimate sent to customer, awaiting response", color: "#f59e0b", order: 2, isFinal: "false" as const },
    { name: "Decision Received", description: "Customer decision received", color: "#eab308", order: 3, isFinal: "false" as const },
    { name: "Ready to Schedule", description: "Approved - needs to be scheduled with crew", color: "#f472b6", order: 4, isFinal: "false" as const },
    { name: "Work Completed", description: "Execution task completed - ready for billing review", color: "#10b981", order: 5, isFinal: "false" as const },
    { name: "Ready for Billing", description: "Work verified complete - create invoice", color: "#06b6d4", order: 6, isFinal: "false" as const },
    { name: "Invoicing", description: "Invoice created in QuickBooks", color: "#22c55e", order: 7, isFinal: "true" as const },
    { name: "Closed - Lost", description: "Project declined or cancelled", color: "#ef4444", order: 8, isFinal: "true" as const },
  ];
  
  // Get existing statuses
  let existingStatuses = await storage.getTicketTypeStatuses(projectType.id);
  const statusMap = new Map<string, string>();
  
  // Create missing statuses (preserves existing ones to not break current tickets)
  for (const statusDef of projectStatuses) {
    let status = existingStatuses.find(s => s.name === statusDef.name);
    if (!status) {
      status = await storage.createTicketTypeStatus({
        ticketTypeId: projectType.id,
        name: statusDef.name,
        description: statusDef.description,
        displayOrder: statusDef.order,
        color: statusDef.color,
        isFinal: statusDef.isFinal,
      });
      console.log(`Created status "${statusDef.name}" for Project type`);
    }
    statusMap.set(status.name, status.id);
  }
  
  // Get existing fields to avoid duplicates
  const existingFields = await storage.getTicketTypeFields(projectType.id);
  const existingFieldKeys = new Set(existingFields.map(f => f.fieldKey));
  
  // Define fields for each status
  const fieldDefinitions = [
    {
      statusName: "Estimating",
      fields: [
        { fieldKey: "qb_estimate_number", fieldLabel: "QuickBooks Estimate #", fieldType: "text", isRequired: "true" },
        { fieldKey: "estimate_notes", fieldLabel: "Estimate Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Estimate Sent",
      fields: [
        { fieldKey: "estimate_sent_date", fieldLabel: "Date Estimate Sent", fieldType: "date", isRequired: "true" },
        { fieldKey: "delivery_method", fieldLabel: "Delivery Method", fieldType: "select", isRequired: "true", options: ["Email", "QBO Portal", "Hard Copy", "Other"] },
      ]
    },
    {
      statusName: "Decision Received",
      fields: [
        { fieldKey: "decision_outcome", fieldLabel: "Decision", fieldType: "select", isRequired: "true", options: ["Approved", "Denied"] },
        { fieldKey: "decision_date", fieldLabel: "Decision Date", fieldType: "date", isRequired: "false" },
        { fieldKey: "po_number", fieldLabel: "PO Number", fieldType: "text", isRequired: "false" },
        { fieldKey: "denial_reason", fieldLabel: "Reason for Denial", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Work Completed",
      fields: [
        { fieldKey: "completion_date", fieldLabel: "Completion Date", fieldType: "date", isRequired: "false" },
        { fieldKey: "actual_hours", fieldLabel: "Actual Hours", fieldType: "number", isRequired: "false" },
        { fieldKey: "completion_notes", fieldLabel: "Completion Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
    {
      statusName: "Ready for Billing",
      fields: [
        { fieldKey: "billing_confirmed", fieldLabel: "Work Complete & Ready for Invoice?", fieldType: "select", isRequired: "true", options: ["Yes", "No"] },
      ]
    },
    {
      statusName: "Invoicing",
      fields: [
        { fieldKey: "qb_invoice_number", fieldLabel: "QuickBooks Invoice #", fieldType: "text", isRequired: "true" },
        { fieldKey: "invoice_amount", fieldLabel: "Invoice Amount", fieldType: "currency", isRequired: "true" },
        { fieldKey: "invoice_date", fieldLabel: "Invoice Date", fieldType: "date", isRequired: "false" },
      ]
    },
    {
      statusName: "Closed - Lost",
      fields: [
        { fieldKey: "loss_reason", fieldLabel: "Reason", fieldType: "select", isRequired: "false", options: ["Price", "Timing", "Went with competitor", "No longer needed", "Other"] },
        { fieldKey: "loss_notes", fieldLabel: "Additional Notes", fieldType: "textarea", isRequired: "false" },
      ]
    },
  ];
  
  // Create fields for each status
  for (const statusFields of fieldDefinitions) {
    const statusId = statusMap.get(statusFields.statusName);
    if (!statusId) continue;
    
    for (let i = 0; i < statusFields.fields.length; i++) {
      const fieldDef = statusFields.fields[i];
      if (existingFieldKeys.has(fieldDef.fieldKey)) continue;
      
      await storage.createTicketTypeField({
        ticketTypeId: projectType.id,
        statusId: statusId,
        fieldKey: fieldDef.fieldKey,
        fieldLabel: fieldDef.fieldLabel,
        fieldType: fieldDef.fieldType as "text" | "number" | "date" | "currency" | "select" | "textarea",
        isRequired: fieldDef.isRequired as "true" | "false",
        options: fieldDef.options || [],
        displayOrder: i,
      });
    }
  }
  
  console.log(`Project ticket type setup complete for company ${companyId}`);
  return { typeId: projectType.id, statuses: statusMap };
}

// One-time migration: Transition approved Project tickets from "Decision Received" to "Ready to Schedule"
async function migrateApprovedProjectTickets(companyId: string, triggeringUserId?: string): Promise<number> {
  let migratedCount = 0;
  
  // Get Project ticket type
  const ticketTypes = await storage.getTicketTypes(companyId);
  const projectType = ticketTypes.find(tt => tt.name === "Project");
  if (!projectType) return 0;
  
  // Get all statuses for this ticket type
  const statuses = await storage.getTicketTypeStatuses(projectType.id);
  const decisionReceivedStatus = statuses.find(s => s.name === "Decision Received");
  const readyToScheduleStatus = statuses.find(s => s.name === "Ready to Schedule");
  
  if (!decisionReceivedStatus || !readyToScheduleStatus) {
    console.log(`Migration skipped for company ${companyId}: Required statuses not found`);
    return 0;
  }
  
  // Get all ticket type fields to find the decision_outcome field
  const fields = await storage.getTicketTypeFields(projectType.id);
  const decisionField = fields.find(f => f.fieldKey === "decision_outcome");
  
  if (!decisionField) {
    console.log(`Migration skipped for company ${companyId}: decision_outcome field not found`);
    return 0;
  }
  
  // Get all tickets for this company that are Project type and in Decision Received status
  const allTickets = await storage.getTickets(companyId);
  const candidateTickets = allTickets.filter(
    t => t.ticketTypeId === projectType.id && 
         t.currentStatusId === decisionReceivedStatus.id &&
         !t.completedAt
  );
  
  for (const ticket of candidateTickets) {
    // Get field values for this ticket to check decision_outcome
    const fieldValues = await storage.getTicketFieldValues(ticket.id);
    const decisionValue = fieldValues.find(fv => fv.fieldId === decisionField.id);
    
    if (decisionValue && decisionValue.value === "Approved") {
      // Transition to Ready to Schedule
      await storage.updateTicket(ticket.id, companyId, {
        currentStatusId: readyToScheduleStatus.id,
      });
      
      // Create history entry if we have a triggering user
      if (triggeringUserId) {
        await storage.createTicketStatusHistory({
          ticketId: ticket.id,
          fromStatusId: decisionReceivedStatus.id,
          toStatusId: readyToScheduleStatus.id,
          changedById: triggeringUserId,
          notes: "System migration: Approved ticket moved to Ready to Schedule",
        });
      }
      
      migratedCount++;
      console.log(`Migrated ticket "${ticket.title}" (${ticket.id}) to Ready to Schedule`);
    }
  }
  
  if (migratedCount > 0) {
    console.log(`Migration complete for company ${companyId}: ${migratedCount} tickets moved to Ready to Schedule`);
  }
  
  return migratedCount;
}

// Helper to ensure To-Do ticket type exists with simple Open/Done workflow
// Also creates an "Internal Tasks" customer for non-customer-related to-dos
async function ensureToDoTicketType(companyId: string): Promise<{ 
  typeId: string; 
  statuses: Map<string, string>;
  internalCustomerId: string;
} | null> {
  const ticketTypes = await storage.getTicketTypes(companyId);
  let todoType = ticketTypes.find(tt => tt.name === "To-Do");
  
  if (!todoType) {
    todoType = await storage.createTicketType({
      companyId,
      name: "To-Do",
      description: "Quick personal or team tasks",
      category: "quick_task",
      icon: "check-square",
      color: "#6366f1",
      isActive: "true",
    });
    console.log(`Created To-Do ticket type for company ${companyId}`);
  }
  
  // Define simple 2-step To-Do workflow
  const todoStatuses = [
    { name: "Open", description: "Task needs to be done", color: "#3b82f6", order: 0, isFinal: "false" as const },
    { name: "Done", description: "Task completed", color: "#22c55e", order: 1, isFinal: "true" as const },
  ];
  
  // Get existing statuses
  let existingStatuses = await storage.getTicketTypeStatuses(todoType.id);
  const statusMap = new Map<string, string>();
  
  for (const statusDef of todoStatuses) {
    let status = existingStatuses.find(s => s.name === statusDef.name);
    if (!status) {
      status = await storage.createTicketTypeStatus({
        ticketTypeId: todoType.id,
        name: statusDef.name,
        description: statusDef.description,
        displayOrder: statusDef.order,
        color: statusDef.color,
        isFinal: statusDef.isFinal,
      });
      console.log(`Created status "${statusDef.name}" for To-Do type`);
    }
    statusMap.set(status.name, status.id);
  }
  
  // Ensure "Internal Tasks" customer exists for non-customer-related to-dos
  const customers = await storage.getCustomers(companyId);
  let internalCustomer = customers.find(c => c.name === "Internal Tasks");
  
  if (!internalCustomer) {
    internalCustomer = await storage.createCustomer({
      companyId,
      name: "Internal Tasks",
      street: "N/A",
      city: "N/A",
      state: "N/A",
      zip: "00000",
      status: "active",
      active: "true",
      tags: [],
    });
    console.log(`Created "Internal Tasks" customer for company ${companyId}`);
  }
  
  console.log(`To-Do ticket type setup complete for company ${companyId}`);
  return { typeId: todoType.id, statuses: statusMap, internalCustomerId: internalCustomer.id };
}

// Seeds all standard ticket types for a company (Project, Invoice, To-Do, RFP Request)
// Called during company setup to ensure ticket types exist before users create tickets
export async function seedAllTicketTypes(companyId: string): Promise<void> {
  console.log(`Seeding all ticket types for company ${companyId}...`);
  
  // Seed in order: To-Do, Invoice, Project, RFP Request
  await ensureToDoTicketType(companyId);
  await ensureInvoiceTicketType(companyId);
  await ensureProjectTicketType(companyId);
  await ensureRFPRequestTicketType(companyId);
  
  console.log(`All ticket types seeded for company ${companyId}`);
}

// Startup migration: Link "1st Bank" branches to a parent account
// Creates a parent "1st Bank" customer and links all "1st Bank - *" branches to it
export async function migrateFirstBankHierarchy(): Promise<void> {
  console.log("Running startup migration: Checking 1st Bank parent-child hierarchy...");
  
  try {
    const companies = await storage.getCompanies();
    
    for (const company of companies) {
      const customers = await storage.getCustomers(company.id);
      const bankBranches = customers.filter(
        (c) => c.name.startsWith("1st Bank - ") && !c.parentCustomerId
      );
      
      if (bankBranches.length === 0) {
        continue;
      }
      
      let parentBank = customers.find(
        (c) => c.name === "1st Bank" && c.isParent === "true"
      );
      
      if (!parentBank) {
        parentBank = await storage.createCustomer({
          name: "1st Bank",
          companyId: company.id,
          street: "",
          city: "",
          state: "",
          zip: "",
          status: "active",
          isParent: "true",
          active: "true",
        });
        console.log(`Created parent "1st Bank" customer: ${parentBank.id}`);
      }
      
      for (const branch of bankBranches) {
        await storage.updateCustomer(branch.id, company.id, {
          parentCustomerId: parentBank.id,
        });
      }
      
      console.log(`Linked ${bankBranches.length} branches to parent "1st Bank"`);
    }
    
    const cutoverDate = new Date("2026-04-01T00:00:00");
    const now = new Date();
    
    if (now >= cutoverDate) {
      for (const company of companies) {
        const customers = await storage.getCustomers(company.id);
        const parentBank = customers.find(
          (c) => c.name === "1st Bank" && c.isParent === "true"
        );
        if (!parentBank) continue;
        
        const branches = customers.filter(
          (c) => c.parentCustomerId === parentBank.id
        );
        
        for (const branch of branches) {
          const branchContracts = await storage.getContractsByCustomerId(branch.id, company.id);
          
          if (branchContracts.length === 0) continue;
          
          try {
            const contractIds = branchContracts.map(c => c.id);
            
            for (const contractId of contractIds) {
              await db.delete(contractMonthlyAmounts).where(
                and(eq(contractMonthlyAmounts.contractId, contractId), eq(contractMonthlyAmounts.companyId, company.id))
              );
              await db.delete(contractDocuments).where(
                and(eq(contractDocuments.contractId, contractId), eq(contractDocuments.companyId, company.id))
              );
              await db.delete(contractServices).where(
                and(eq(contractServices.contractId, contractId), eq(contractServices.companyId, company.id))
              );
              await db.delete(contractStatusHistory).where(
                eq(contractStatusHistory.contractId, contractId)
              );
            }
            
            for (const contractId of contractIds) {
              await storage.deleteContract(contractId, company.id);
            }
            
            console.log(`Deleted ${branchContracts.length} legacy contracts from branch "${branch.name}"`);
          } catch (branchError) {
            console.error(`Error deleting contracts for branch "${branch.name}":`, branchError);
          }
        }
      }
      
      console.log("1st Bank branch contract cleanup complete (post April 1, 2026)");
    }
    
    console.log("1st Bank hierarchy migration complete");
  } catch (error) {
    console.error("Error during 1st Bank hierarchy migration:", error);
  }
}

// Startup migration: Ensure all companies have the "Ready to Schedule" status in their Project workflow
// This is called at server startup to migrate existing companies that were created before this status was added
export async function migrateProjectSchedulingStatus(): Promise<void> {
  console.log("Running startup migration: Ensuring Ready to Schedule status exists for all companies...");
  
  try {
    // Get all companies
    const companies = await storage.getCompanies();
    let migratedCount = 0;
    
    for (const company of companies) {
      // Ensure Project ticket type has Ready to Schedule status
      const result = await ensureProjectTicketType(company.id);
      if (result) {
        // Check if Ready to Schedule was just created by looking at the status map
        if (result.statuses.has("Ready to Schedule")) {
          migratedCount++;
        }
      }
    }
    
    console.log(`Startup migration complete: Processed ${companies.length} companies, ensured Ready to Schedule status exists`);
  } catch (error) {
    console.error("Error during startup migration for scheduling status:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Customers routes
  app.get("/api/customers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const customers = await storage.getCustomers(user.activeCompanyId);
    res.json(customers);
  });

  app.get("/api/customers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const customer = await storage.getCustomerById(req.params.id, user.activeCompanyId);
    if (!customer) {
      return res.status(404).send("Customer not found");
    }

    let childCustomers: Customer[] = [];
    let parentCustomer: Customer | undefined;

    if (customer.isParent === "true") {
      childCustomers = await storage.getChildCustomers(customer.id, user.activeCompanyId);
    }

    if (customer.parentCustomerId) {
      parentCustomer = await storage.getCustomerById(customer.parentCustomerId, user.activeCompanyId);
    }

    res.json({
      ...customer,
      childCustomers,
      parentCustomer: parentCustomer || null,
    });
  });

  app.post("/api/customers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertCustomerSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    // Validate and auto-mark parent if parentCustomerId is being set
    if (result.data.parentCustomerId) {
      const parentCust = await storage.getCustomerById(result.data.parentCustomerId, user.activeCompanyId);
      if (!parentCust) {
        return res.status(400).send("Parent customer not found");
      }
      if (parentCust.parentCustomerId) {
        return res.status(400).send("Cannot set a child customer as a parent (only one level of hierarchy allowed)");
      }
      if (parentCust.isParent !== "true") {
        await storage.updateCustomer(result.data.parentCustomerId, user.activeCompanyId, { isParent: "true" });
      }
    }

    const customer = await storage.createCustomer(result.data);
    res.json(customer);
  });

  app.patch("/api/customers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    // Extract expectedUpdatedAt from body for conflict detection
    const { expectedUpdatedAt, ...updateData } = req.body;
    
    const result = insertCustomerSchema.partial().omit({ companyId: true }).safeParse(updateData);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    // Validate property manager belongs to property management company
    const hasManagerId = result.data.propertyManagerId !== undefined;
    const hasCompanyId = result.data.propertyManagementCompanyId !== undefined;
    
    // If company is being cleared to null, also clear the manager
    if (hasCompanyId && result.data.propertyManagementCompanyId === null) {
      result.data.propertyManagerId = null;
    }
    
    // If company is being changed (non-null), validate or clear the existing manager
    if (hasCompanyId && result.data.propertyManagementCompanyId && !hasManagerId) {
      // Company is changing but no manager in payload - check if existing manager is valid
      const existingCustomer = await storage.getCustomerById(req.params.id, user.activeCompanyId);
      if (existingCustomer?.propertyManagerId) {
        const existingManager = await storage.getPropertyManagerById(existingCustomer.propertyManagerId, user.activeCompanyId);
        // If existing manager doesn't belong to new company, clear it
        if (!existingManager || existingManager.propertyManagementCompanyId !== result.data.propertyManagementCompanyId) {
          result.data.propertyManagerId = null;
        }
      }
    }
    
    if (hasManagerId && result.data.propertyManagerId) {
      // Get the company ID - either from the update data or from existing customer
      let companyIdToCheck = result.data.propertyManagementCompanyId;
      
      if (!hasCompanyId) {
        // propertyManagementCompanyId not in update payload - fetch from existing customer
        const existingCustomer = await storage.getCustomerById(req.params.id, user.activeCompanyId);
        if (existingCustomer) {
          companyIdToCheck = existingCustomer.propertyManagementCompanyId;
        }
      }
      
      if (!companyIdToCheck) {
        return res.status(400).send("Cannot assign a property manager without a property management company");
      }
      
      const manager = await storage.getPropertyManagerById(result.data.propertyManagerId, user.activeCompanyId);
      if (!manager || manager.propertyManagementCompanyId !== companyIdToCheck) {
        return res.status(400).send("Property manager does not belong to the selected property management company");
      }
    }

    // Validate parentCustomerId if being set
    if ('parentCustomerId' in result.data) {
      if (result.data.parentCustomerId) {
        if (result.data.parentCustomerId === req.params.id) {
          return res.status(400).send("A customer cannot be its own parent");
        }
        const parentCust = await storage.getCustomerById(result.data.parentCustomerId, user.activeCompanyId);
        if (!parentCust) {
          return res.status(400).send("Parent customer not found");
        }
        if (parentCust.parentCustomerId) {
          return res.status(400).send("Cannot set a child customer as a parent (only one level of hierarchy allowed)");
        }
        if (parentCust.isParent !== "true") {
          await storage.updateCustomer(result.data.parentCustomerId, user.activeCompanyId, { isParent: "true" });
        }
      }
      
      // If removing parentCustomerId, check if old parent still has other children
      const existingCust = await storage.getCustomerById(req.params.id, user.activeCompanyId);
      if (existingCust?.parentCustomerId && existingCust.parentCustomerId !== result.data.parentCustomerId) {
        const siblings = await storage.getChildCustomers(existingCust.parentCustomerId, user.activeCompanyId);
        if (siblings.filter(s => s.id !== req.params.id).length === 0) {
          await storage.updateCustomer(existingCust.parentCustomerId, user.activeCompanyId, { isParent: "false" });
        }
      }
    }

    // Parse expectedUpdatedAt if provided
    const expectedDate = expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined;
    
    const customer = await storage.updateCustomer(req.params.id, user.activeCompanyId, result.data, expectedDate);
    
    if (!customer) {
      return res.status(404).send("Customer not found");
    }
    
    // Check if it's a conflict response
    if ('conflict' in customer && customer.conflict) {
      return res.status(409).json({
        error: "Conflict",
        message: "This record was modified by another user. Please refresh and try again.",
        current: customer.current,
      });
    }
    
    // Auto-create contact when propertyManagerId is assigned
    if (hasManagerId && result.data.propertyManagerId) {
      try {
        // Check if a contact linked to this manager already exists for this customer
        const existingContacts = await storage.getContactsByCustomerId(req.params.id, user.activeCompanyId);
        const existingManagerContact = existingContacts.find(c => c.propertyManagerId === result.data.propertyManagerId);
        
        if (!existingManagerContact) {
          // Get the manager with their contact info
          const managerWithContacts = await storage.getPropertyManagerWithContacts(result.data.propertyManagerId, user.activeCompanyId);
          
          if (managerWithContacts) {
            // Collect all emails and phones from the manager
            const managerEmails = managerWithContacts.emails.map(e => e.email);
            // Fallback to legacy single email if no normalized emails exist
            if (managerEmails.length === 0 && managerWithContacts.email) {
              managerEmails.push(managerWithContacts.email);
            }
            
            const managerPhones = managerWithContacts.phones.map(p => p.phone);
            // Fallback to legacy single phone if no normalized phones exist
            if (managerPhones.length === 0 && managerWithContacts.phone) {
              managerPhones.push(managerWithContacts.phone);
            }
            
            // Create the contact linked to this property manager
            await storage.createContact({
              companyId: user.activeCompanyId,
              customerId: req.params.id,
              propertyManagerId: result.data.propertyManagerId,
              name: managerWithContacts.name,
              role: managerWithContacts.title || "Property Manager",
              emails: managerEmails,
              phones: managerPhones,
              isPrimary: "false",
              notes: `Auto-created from Property Manager assignment`,
            });
          }
        }
      } catch (error) {
        // Log but don't fail the update if contact creation fails
        console.error("Failed to auto-create contact from property manager:", error);
      }
    }
    
    res.json(customer);
  });

  app.delete("/api/customers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteCustomer(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Contacts routes
  app.get("/api/customers/:customerId/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const contacts = await storage.getContactsByCustomerId(req.params.customerId, user.activeCompanyId);
    res.json(contacts);
  });

  app.post("/api/customers/:customerId/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const { selectedPmCompanyId, ...contactData } = req.body;
    
    const result = insertContactSchema.safeParse({
      ...contactData,
      customerId: req.params.customerId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    let contact = await storage.createContact(result.data);
    
    // If role is Property Manager and PM company selected, create PM record and link
    if (result.data.role === "Property Manager" && selectedPmCompanyId) {
      const propertyManager = await storage.createPropertyManager({
        companyId: user.activeCompanyId,
        propertyManagementCompanyId: selectedPmCompanyId,
        name: result.data.name,
        title: "Property Manager",
        notes: result.data.notes || undefined,
        isPrimary: "false",
      });
      
      // Copy emails to property_manager_emails
      const emails = result.data.emails || [];
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        if (email && email.trim()) {
          await storage.createPropertyManagerEmail({
            companyId: user.activeCompanyId,
            propertyManagerId: propertyManager.id,
            email: email.trim(),
            isPrimary: i === 0 ? "true" : "false",
          });
        }
      }
      
      // Copy phones to property_manager_phones
      const phones = result.data.phones || [];
      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i];
        if (phone && phone.trim()) {
          await storage.createPropertyManagerPhone({
            companyId: user.activeCompanyId,
            propertyManagerId: propertyManager.id,
            phone: phone.trim(),
            phoneType: "company",
            isPrimary: i === 0 ? "true" : "false",
          });
        }
      }
      
      // Link contact to the new property manager
      contact = await storage.updateContact(contact.id, user.activeCompanyId, {
        propertyManagerId: propertyManager.id,
      }) || contact;
      
      // Also update the customer to link to the PM company if not already
      await storage.updateCustomer(req.params.customerId, user.activeCompanyId, {
        propertyManagementCompanyId: selectedPmCompanyId,
        propertyManagerId: propertyManager.id,
      });
    }
    
    res.json(contact);
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const { selectedPmCompanyId, ...contactData } = req.body;
    
    const result = insertContactSchema.partial().omit({ customerId: true, companyId: true }).safeParse(contactData);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    // Get existing contact to check if we need to create a PM
    const existingContact = await storage.getContactById(req.params.id, user.activeCompanyId);
    if (!existingContact) {
      return res.status(404).send("Contact not found");
    }

    let contact = await storage.updateContact(req.params.id, user.activeCompanyId, result.data);
    if (!contact) {
      return res.status(404).send("Contact not found");
    }
    
    // If role changed to Property Manager and PM company selected, create PM record
    if (result.data.role === "Property Manager" && selectedPmCompanyId && !existingContact.propertyManagerId) {
      const propertyManager = await storage.createPropertyManager({
        companyId: user.activeCompanyId,
        propertyManagementCompanyId: selectedPmCompanyId,
        name: contact.name,
        title: "Property Manager",
        notes: contact.notes || undefined,
        isPrimary: "false",
      });
      
      // Copy emails to property_manager_emails
      const emails = contact.emails || [];
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        if (email && email.trim()) {
          await storage.createPropertyManagerEmail({
            companyId: user.activeCompanyId,
            propertyManagerId: propertyManager.id,
            email: email.trim(),
            isPrimary: i === 0 ? "true" : "false",
          });
        }
      }
      
      // Copy phones to property_manager_phones
      const phones = contact.phones || [];
      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i];
        if (phone && phone.trim()) {
          await storage.createPropertyManagerPhone({
            companyId: user.activeCompanyId,
            propertyManagerId: propertyManager.id,
            phone: phone.trim(),
            phoneType: "company",
            isPrimary: i === 0 ? "true" : "false",
          });
        }
      }
      
      // Link contact to the new property manager
      contact = await storage.updateContact(contact.id, user.activeCompanyId, {
        propertyManagerId: propertyManager.id,
      }) || contact;
      
      // Also update the customer to link to the PM company
      await storage.updateCustomer(existingContact.customerId, user.activeCompanyId, {
        propertyManagementCompanyId: selectedPmCompanyId,
        propertyManagerId: propertyManager.id,
      });
    }
    
    res.json(contact);
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteContact(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Notes routes
  app.get("/api/customers/:customerId/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const notes = await storage.getNotesByCustomerId(req.params.customerId, user.activeCompanyId);
    res.json(notes);
  });

  app.post("/api/customers/:customerId/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - field role cannot create notes");
    }

    const result = insertNoteSchema.safeParse({
      ...req.body,
      customerId: req.params.customerId,
      companyId: user.activeCompanyId,
      authorId: user.id,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const note = await storage.createNote(result.data);
    res.json(note);
  });

  app.patch("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - field role cannot edit notes");
    }

    const { body } = req.body;
    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return res.status(400).send("Note body is required");
    }
    if (body.length > 5000) {
      return res.status(400).send("Note body must be 5000 characters or less");
    }

    const updated = await storage.updateNote(req.params.id, user.activeCompanyId, body.trim());
    if (!updated) {
      return res.status(404).send("Note not found");
    }
    res.json(updated);
  });

  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - field role cannot delete notes");
    }

    await storage.deleteNote(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // All contracts route (overview)
  app.get("/api/contracts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "shop_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    const allContracts = await storage.getAllContracts(user.activeCompanyId);
    
    const contractIds = allContracts.map(c => c.id);
    const allMonthlyAmounts = contractIds.length > 0
      ? await db
          .select()
          .from(contractMonthlyAmounts)
          .where(and(
            inArray(contractMonthlyAmounts.contractId, contractIds),
            eq(contractMonthlyAmounts.companyId, user.activeCompanyId)
          ))
      : [];
    
    const monthlyAmountsByContract = new Map<string, typeof allMonthlyAmounts>();
    for (const ma of allMonthlyAmounts) {
      if (!monthlyAmountsByContract.has(ma.contractId)) {
        monthlyAmountsByContract.set(ma.contractId, []);
      }
      monthlyAmountsByContract.get(ma.contractId)!.push(ma);
    }
    
    const contractsWithTotals = allContracts.map(contract => {
      const amounts = monthlyAmountsByContract.get(contract.id) || [];
      const annualTotal = amounts.reduce((sum, a) => sum + a.amount, 0);
      return {
        ...contract,
        annualTotal,
      };
    });

    res.json(contractsWithTotals);
  });

  // Contracts routes
  app.get("/api/customers/:customerId/contracts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const contracts = await storage.getContractsByCustomerId(req.params.customerId, user.activeCompanyId);
    res.json(contracts);
  });

  app.post("/api/customers/:customerId/contracts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertContractSchema.safeParse({
      ...req.body,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      customerId: req.params.customerId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    if (result.data.serviceType === "Maintenance" || result.data.serviceType === "Snow") {
      const existingContracts = await storage.getContractsByCustomerId(req.params.customerId, user.activeCompanyId);
      const existingActiveContract = existingContracts.find(
        c => c.serviceType === result.data.serviceType && c.status === "active"
      );
      
      if (existingActiveContract) {
        return res.status(400).json({
          error: `An active ${result.data.serviceType} contract already exists for this customer. Please end the existing contract first.`
        });
      }
    }

    const contract = await storage.createContract(result.data);
    
    await storage.createContractStatusHistory({
      contractId: contract.id,
      newStatus: contract.status,
      changedBy: user.id,
    });

    res.json(contract);
  });

  // Alternative endpoint for creating contracts (customer_id in body instead of URL)
  app.post("/api/contracts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertContractSchema.safeParse({
      ...req.body,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      customerId: req.body.customer_id || req.body.customerId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    if (result.data.serviceType === "Maintenance" || result.data.serviceType === "Snow") {
      const existingContracts = await storage.getContractsByCustomerId(result.data.customerId, user.activeCompanyId);
      const existingActiveContract = existingContracts.find(
        c => c.serviceType === result.data.serviceType && c.status === "active"
      );
      
      if (existingActiveContract) {
        return res.status(400).json({
          error: `An active ${result.data.serviceType} contract already exists for this customer. Please end the existing contract first.`
        });
      }
    }

    const contract = await storage.createContract(result.data);
    
    await storage.createContractStatusHistory({
      contractId: contract.id,
      newStatus: contract.status,
      changedBy: user.id,
    });

    res.json(contract);
  });

  app.patch("/api/contracts/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const existingContract = await storage.getContractById(req.params.id, user.activeCompanyId);
    if (!existingContract) {
      return res.status(404).send("Contract not found");
    }

    // If changing status to active, check uniqueness for Maintenance/Snow contracts
    if (req.body.status === "active" && existingContract.status !== "active") {
      if (existingContract.serviceType === "Maintenance" || existingContract.serviceType === "Snow") {
        const allContracts = await storage.getContractsByCustomerId(existingContract.customerId, user.activeCompanyId);
        const conflictingContract = allContracts.find(
          c => c.id !== req.params.id && c.serviceType === existingContract.serviceType && c.status === "active"
        );
        
        if (conflictingContract) {
          return res.status(400).json({
            error: `An active ${existingContract.serviceType} contract already exists for this customer. Please end the existing contract first.`
          });
        }
      }
    }

    // Convert date strings to Date objects for Drizzle
    const updates = { ...req.body };
    if (updates.startDate && typeof updates.startDate === 'string') {
      updates.startDate = new Date(updates.startDate);
    }
    if (updates.endDate && typeof updates.endDate === 'string') {
      updates.endDate = new Date(updates.endDate);
    }
    
    console.log("Updating contract with body:", JSON.stringify(updates, null, 2));
    const contract = await storage.updateContract(req.params.id, user.activeCompanyId, updates);
    console.log("Updated contract result:", JSON.stringify(contract, null, 2));
    if (!contract) {
      return res.status(404).send("Contract not found");
    }

    if (req.body.status && req.body.status !== existingContract.status) {
      await storage.createContractStatusHistory({
        contractId: contract.id,
        oldStatus: existingContract.status as any,
        newStatus: req.body.status,
        changedBy: user.id,
      });
    }

    res.json(contract);
  });

  app.delete("/api/contracts/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin") {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    await storage.deleteContract(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Contract Documents routes
  app.post("/api/contracts/:contractId/documents/upload-url", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const contract = await storage.getContractById(req.params.contractId, user.activeCompanyId);
      if (!contract) {
        return res.status(404).send("Contract not found");
      }

      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).send("Failed to get upload URL");
    }
  });

  app.post("/api/contracts/:contractId/documents", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(req.body.uploadURL);

      const existingDocs = await storage.getContractDocuments(req.params.contractId, user.activeCompanyId);
      const nextVersion = existingDocs.length > 0 ? Math.max(...existingDocs.map(d => d.version)) + 1 : 1;

      const result = insertContractDocumentSchema.safeParse({
        contractId: req.params.contractId,
        companyId: user.activeCompanyId,
        version: nextVersion,
        filename: req.body.filename,
        uploadedBy: user.id,
        fileSize: req.body.fileSize,
        storageObjectPath: normalizedPath,
        mimeType: req.body.mimeType || "application/pdf",
      });

      if (!result.success) {
        return res.status(400).send(result.error.message);
      }

      const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
      await objectStorageService.trySetObjectEntityAclPolicy(req.body.uploadURL, {
        owner: user.id,
        visibility: "private",
        aclRules: [{
          group: {
            type: ObjectAccessGroupType.COMPANY_MEMBER,
            id: user.activeCompanyId,
          },
          permission: ObjectPermission.READ,
        }],
      });

      const document = await storage.createContractDocument(result.data);
      res.json(document);
    } catch (error) {
      console.error("Error saving document metadata:", error);
      res.status(500).send("Failed to save document metadata");
    }
  });

  app.get("/api/contracts/:contractId/documents", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const documents = await storage.getContractDocuments(req.params.contractId, user.activeCompanyId);
    res.json(documents);
  });

  app.get("/api/contracts/:contractId/documents/current", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const document = await storage.getCurrentContractDocument(req.params.contractId, user.activeCompanyId);
    if (!document) {
      return res.status(404).send("No document found");
    }
    res.json(document);
  });

  app.delete("/api/contracts/:contractId/documents/:docId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteContractDocument(req.params.docId, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Contract Services routes
  app.get("/api/contracts/:contractId/services", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const services = await storage.getContractServices(req.params.contractId, user.activeCompanyId);
    res.json(services);
  });

  app.post("/api/contracts/:contractId/services", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const { insertContractServiceSchema } = await import("@shared/schema");
      
      const result = insertContractServiceSchema.safeParse({
        ...req.body,
        contractId: req.params.contractId,
        companyId: user.activeCompanyId,
      });

      if (!result.success) {
        return res.status(400).send(result.error.message);
      }

      const service = await storage.createContractService(result.data);
      res.json(service);
    } catch (error) {
      console.error("Error creating contract service:", error);
      res.status(500).send("Failed to create service");
    }
  });

  app.patch("/api/contracts/:contractId/services/:serviceId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const service = await storage.updateContractService(req.params.serviceId, user.activeCompanyId, req.body);
    if (!service) {
      return res.status(404).send("Service not found");
    }

    res.json(service);
  });

  app.delete("/api/contracts/:contractId/services/:serviceId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteContractService(req.params.serviceId, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Contract Monthly Amounts routes
  app.get("/api/contracts/:contractId/monthly-amounts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const amounts = await storage.getContractMonthlyAmounts(req.params.contractId, user.activeCompanyId);
    res.json(amounts);
  });

  app.put("/api/contracts/:contractId/monthly-amounts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const { z } = await import("zod");
      
      const monthlyAmountInputSchema = z.object({
        month: z.number().int().min(1).max(12),
        amount: z.number().int().min(0),
      });
      
      const amountsArraySchema = z.array(monthlyAmountInputSchema);
      const result = amountsArraySchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).send(result.error.message);
      }

      const amounts = await storage.upsertContractMonthlyAmounts(
        req.params.contractId,
        user.activeCompanyId,
        result.data
      );
      
      res.json(amounts);
    } catch (error) {
      console.error("Error saving monthly amounts:", error);
      res.status(500).send("Failed to save monthly amounts");
    }
  });

  // Customer Rate Sheet routes
  app.get("/api/customers/:customerId/rate-sheet", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const rateSheet = await storage.getCustomerRateSheet(req.params.customerId, user.activeCompanyId);
    
    if (!rateSheet) {
      return res.json(null);
    }
    
    res.json(rateSheet);
  });

  app.put("/api/customers/:customerId/rate-sheet", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("No permission to edit rate sheet");
    }

    try {
      const { z } = await import("zod");
      
      // Define the rate sheet input schema with nullable fields
      const rateSheetInputSchema = z.object({
        generalLabor: z.number().int().min(0).nullable().optional(),
        operatorLabor: z.number().int().min(0).nullable().optional(),
        irrigationLabor: z.number().int().min(0).nullable().optional(),
        emergencyGeneralLabor: z.number().int().min(0).nullable().optional(),
        emergencyIrrigationLabor: z.number().int().min(0).nullable().optional(),
        handShovelLabor: z.number().int().min(0).nullable().optional(),
        plowTruck: z.number().int().min(0).nullable().optional(),
        atv: z.number().int().min(0).nullable().optional(),
        skidSteer: z.number().int().min(0).nullable().optional(),
        snowBlower: z.number().int().min(0).nullable().optional(),
        iceMeltMaterial: z.number().int().min(0).nullable().optional(),
        iceMeltApplicationLabor: z.number().int().min(0).nullable().optional(),
        notes: z.string().nullable().optional(),
      });
      
      const result = rateSheetInputSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).send(result.error.message);
      }

      const rateSheet = await storage.upsertCustomerRateSheet(
        req.params.customerId,
        user.activeCompanyId,
        result.data,
        user.id
      );
      
      res.json(rateSheet);
    } catch (error) {
      console.error("Error saving rate sheet:", error);
      res.status(500).send("Failed to save rate sheet");
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const objectStorageService = new ObjectStorageService();
    
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: user.id,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        return res.sendStatus(403);
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Admin: Company Management Routes (Super Admin only)
  app.get("/api/admin/companies", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (!user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const companies = await storage.getCompanies();
    res.json(companies);
  });

  app.post("/api/admin/companies", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (!user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const result = insertCompanySchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const company = await storage.createCompany(result.data);
    res.json(company);
  });

  app.patch("/api/admin/companies/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (!user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const result = insertCompanySchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const company = await storage.updateCompany(req.params.id, result.data);
    if (!company) {
      return res.status(404).send("Company not found");
    }
    res.json(company);
  });

  app.delete("/api/admin/companies/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (!user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    await storage.deleteCompany(req.params.id);
    res.status(200).send("Deleted");
  });

  // User Management Routes (Company Admin + Super Admin)
  app.get("/api/companies/users", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const usersWithDetails = await Promise.all(
      companyUsers.map(async (cu) => {
        const userDetails = await storage.getUserById(cu.userId);
        return {
          companyUser: cu,
          user: userDetails,
          isSuperAdmin: userDetails?.isSuperAdmin === "true",
        };
      })
    );
    
    res.json(usersWithDetails);
  });

  app.post("/api/companies/users/create", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const currentUser = req.user as UserWithContext;
    if (currentUser.activeRole !== "admin" && !currentUser.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const { email, name, password, role } = req.body;

    if (!email || !name || !password || !role) {
      return res.status(400).json({ message: "Email, name, password, and role are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    try {
      const { hashPassword } = await import("./auth");
      const passwordHash = await hashPassword(password);

      const newUser = await storage.createUser({
        email,
        name,
        passwordHash,
        isSuperAdmin: "false",
        defaultCompanyId: currentUser.activeCompanyId,
      });

      await storage.createCompanyUser({
        userId: newUser.id,
        companyId: currentUser.activeCompanyId,
        role: role as "admin" | "office" | "field_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping",
        status: "active",
      });

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Team Members endpoint for @mention autocomplete (any authenticated user)
  app.get("/api/team-members", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const teamMembers = await Promise.all(
      companyUsers
        .filter(cu => cu.status === "active")
        .map(async (cu) => {
          const userDetails = await storage.getUserById(cu.userId);
          return {
            id: cu.userId,
            name: userDetails?.name || "Unknown",
            email: userDetails?.email || "",
            role: cu.role,
          };
        })
    );
    
    res.json(teamMembers);
  });

  app.post("/api/companies/users", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const result = insertCompanyUserSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const companyUser = await storage.createCompanyUser(result.data);
    res.json(companyUser);
  });

  app.patch("/api/company-users/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const { password, ...companyUserUpdates } = req.body;

    // Validate company user updates
    const result = insertCompanyUserSchema.partial().omit({ companyId: true, userId: true }).safeParse(companyUserUpdates);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    try {
      // SECURITY: Verify the companyUser belongs to the admin's active company
      const existingCompanyUser = await storage.getCompanyUserById(req.params.id);
      if (!existingCompanyUser) {
        return res.status(404).send("Company user not found");
      }
      
      // Super admins can update users in any company, regular admins only in their own company
      if (!user.isSuperAdminBool && existingCompanyUser.companyId !== user.activeCompanyId) {
        return res.status(403).send("Cannot update users from other companies");
      }

      // SECURITY: Prevent role changes for super admin users
      const targetUser = await storage.getUserById(existingCompanyUser.userId);
      if (targetUser?.isSuperAdmin === "true" && companyUserUpdates.role) {
        return res.status(400).json({ message: "Cannot change role for super admin users" });
      }

      // Update company user record (role, status)
      const companyUser = await storage.updateCompanyUser(req.params.id, result.data);
      if (!companyUser) {
        return res.status(404).send("Company user not found");
      }

      // If password is provided and not empty, update the user's password
      if (password && password.trim().length > 0) {
        if (password.length < 8) {
          return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const { hashPassword } = await import("./auth");
        const passwordHash = await hashPassword(password);
        await storage.updateUserPassword(companyUser.userId, passwordHash);
      }

      res.json(companyUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/company-users/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    await storage.deleteCompanyUser(req.params.id);
    res.status(200).send("Deleted");
  });

  // Settings routes
  app.get("/api/settings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const settings = await storage.getSettings(user.activeCompanyId);
    if (!settings) {
      return res.status(404).send("Settings not found");
    }

    res.json(settings);
  });

  app.patch("/api/settings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Forbidden");
    }

    const result = insertSettingsSchema.partial().omit({ companyId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const settings = await storage.updateSettings(user.activeCompanyId, result.data);
    if (!settings) {
      return res.status(404).send("Settings not found");
    }

    res.json(settings);
  });

  app.get("/api/customers/:customerId/revenue/:year", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const { customerId, year } = req.params;
    
    const customer = await storage.getCustomerById(customerId, user.activeCompanyId);
    if (!customer) {
      return res.status(404).send("Customer not found");
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).send("Invalid year");
    }

    const revenueData = await storage.getCustomerRevenue(customerId, user.activeCompanyId, yearNum);
    res.json(revenueData);
  });

  app.get("/api/customers/:customerId/all-monthly-amounts/:year", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const { customerId, year } = req.params;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "shop_manager") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const customer = await storage.getCustomerById(customerId, user.activeCompanyId);
    if (!customer) {
      return res.status(404).send("Customer not found");
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).send("Invalid year");
    }

    const contracts = await storage.getContractsByCustomerId(customerId, user.activeCompanyId);
    const result: { contractId: string; amounts: any[] }[] = [];
    
    for (const contract of contracts) {
      const amounts = await storage.getContractMonthlyAmounts(contract.id, user.activeCompanyId);
      result.push({ contractId: contract.id, amounts });
    }
    
    res.json(result);
  });

  app.get("/api/dashboard/stats", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const stats = await storage.getDashboardStats(user.activeCompanyId, currentMonth, currentYear);
    res.json(stats);
  });

  app.get("/api/dashboard/customer-growth", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const data = await storage.getCustomerGrowthData(user.activeCompanyId);
    res.json(data);
  });

  app.get("/api/dashboard/monthly-revenue", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const data = await storage.getMonthlyRevenueData(user.activeCompanyId, year);
    res.json(data);
  });

  app.get("/api/dashboard/top-customers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
    const data = await storage.getTopCustomers(user.activeCompanyId, limit);
    res.json(data);
  });

  app.get("/api/dashboard/upcoming-renewals", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const daysAhead = req.query.days ? parseInt(req.query.days as string) : 90;
    const data = await storage.getUpcomingRenewals(user.activeCompanyId, daysAhead);
    res.json(data);
  });

  app.get("/api/revenue/overview", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const { month, year } = req.query;
    
    const monthNum = parseInt(month as string);
    const yearNum = parseInt(year as string);
    
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).send("Invalid month");
    }
    
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).send("Invalid year");
    }

    const overviewData = await storage.getRevenueOverview(user.activeCompanyId, monthNum, yearNum);
    res.json(overviewData);
  });

  // Contract Builder routes
  app.get("/api/contract-templates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const templates = await storage.getContractTemplates();
    res.json(templates);
  });

  app.get("/api/contract-builder/documents", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const customerId = req.query.customerId as string | undefined;
    console.log('[Contract Builder API] Fetching documents, customerId:', customerId, 'companyId:', user.activeCompanyId);
    const documents = await storage.getContractBuilderDocuments(user.activeCompanyId, customerId);
    console.log('[Contract Builder API] Found', documents.length, 'documents');
    res.json(documents);
  });

  app.get("/api/contract-builder/documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const document = await storage.getContractBuilderDocumentById(req.params.id, user.activeCompanyId);
    if (!document) {
      return res.status(404).send("Document not found");
    }
    res.json(document);
  });

  app.post("/api/contract-builder/documents", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    const result = insertContractBuilderDocumentSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
      createdBy: user.id,
      updatedBy: user.id,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const document = await storage.createContractBuilderDocument(result.data);
    res.json(document);
  });

  app.patch("/api/contract-builder/documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    const result = insertContractBuilderDocumentSchema.partial().omit({ companyId: true, createdBy: true }).safeParse({
      ...req.body,
      updatedBy: user.id,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const document = await storage.updateContractBuilderDocument(req.params.id, user.activeCompanyId, result.data);
    if (!document) {
      return res.status(404).send("Document not found");
    }
    res.json(document);
  });

  app.delete("/api/contract-builder/documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteContractBuilderDocument(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  app.get("/api/contract-builder/documents/:id/sections", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const sections = await storage.getContractBuilderSections(req.params.id, user.activeCompanyId);
    res.json(sections);
  });

  app.put("/api/contract-builder/documents/:id/sections", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - field role cannot edit");
    }

    if (!Array.isArray(req.body)) {
      return res.status(400).send("Request body must be an array of sections");
    }

    const validatedSections = [];
    for (const section of req.body) {
      const result = insertContractBuilderSectionSchema.safeParse(section);
      if (!result.success) {
        return res.status(400).send(`Invalid section data: ${result.error.message}`);
      }
      validatedSections.push(result.data);
    }

    const sections = await storage.upsertContractBuilderSections(req.params.id, user.activeCompanyId, validatedSections);
    res.json(sections);
  });

  app.get("/api/contract-builder/documents/:id/variables", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const variables = await storage.getContractBuilderVariables(req.params.id, user.activeCompanyId);
    res.json(variables);
  });

  app.put("/api/contract-builder/documents/:id/variables", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - field role cannot edit");
    }

    if (!Array.isArray(req.body)) {
      return res.status(400).send("Request body must be an array of variables");
    }

    const validatedVariables = [];
    for (const variable of req.body) {
      const result = insertContractBuilderVariableSchema.omit({ documentId: true }).safeParse(variable);
      if (!result.success) {
        return res.status(400).send(`Invalid variable data: ${result.error.message}`);
      }
      validatedVariables.push(result.data);
    }

    const variables = await storage.upsertContractBuilderVariables(req.params.id, user.activeCompanyId, validatedVariables);
    res.json(variables);
  });

  app.post("/api/contract-builder/documents/:id/export-pdf", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    try {
      const document = await storage.getContractBuilderDocumentById(req.params.id, user.activeCompanyId);
      if (!document) {
        return res.status(404).send("Document not found");
      }

      const customer = await storage.getCustomerById(document.customerId, user.activeCompanyId);
      if (!customer) {
        return res.status(404).send("Customer not found");
      }

      const templates = await storage.getContractTemplates();
      const sections = await storage.getContractBuilderSections(req.params.id, user.activeCompanyId);
      const variables = await storage.getContractBuilderVariables(req.params.id, user.activeCompanyId);

      const variablesMap: Record<string, string> = {};
      variables.forEach(v => {
        variablesMap[v.variableKey] = v.variableValue;
      });

      const includedSections = sections
        .filter(s => s.isIncluded)
        .map(s => {
          const template = templates.find(t => t.id === s.templateId);
          if (!template) return null;
          
          let content = s.customContent || template.defaultContent;
          Object.entries(variablesMap).forEach(([key, value]) => {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`);
          });

          return {
            title: template.sectionTitle,
            content: content,
            displayOrder: template.displayOrder
          };
        })
        .filter(s => s !== null)
        .sort((a, b) => a!.displayOrder - b!.displayOrder);

      const PDFDocument = (await import('pdfkit')).default;
      
      const logoPath = path.join(process.cwd(), 'attached_assets', 'NEW - LOGO-03_1763582979034.png');
      let logoBuffer: Buffer | null = null;
      try {
        logoBuffer = await fs.readFile(logoPath);
      } catch (err) {
        console.error('Failed to load logo:', err);
      }

      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 60, right: 60 }
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      const pdfPromise = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      if (logoBuffer) {
        const logoWidth = 100;
        const logoX = (doc.page.width - logoWidth) / 2;
        doc.image(logoBuffer, logoX, 40, { width: logoWidth });
        doc.moveDown(3);
      }

      doc.fillColor('#2E7D32')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('LANDSCAPE MAINTENANCE CONTRACT', { align: 'center' });
      
      doc.moveDown(0.3);
      doc.fillColor('#000000')
         .fontSize(12)
         .font('Helvetica')
         .text(customer.name, { align: 'center' });
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`, { align: 'center' });
      
      doc.moveDown(1);
      doc.moveTo(60, doc.y)
         .lineTo(552, doc.y)
         .strokeColor('#2E7D32')
         .lineWidth(2)
         .stroke();
      doc.moveDown(1.5);

      includedSections.forEach((section) => {
        if (!section) return;
        
        doc.fillColor('#2E7D32')
           .fontSize(13)
           .font('Helvetica-Bold')
           .text(section.title);
        doc.moveDown(0.4);
        
        const lines = section.content.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            doc.fillColor('#000000')
               .fontSize(10)
               .font('Helvetica')
               .text(line, {
                 align: 'justify',
                 lineGap: 2
               });
          } else {
            doc.moveDown(0.2);
          }
        });
        
        doc.moveDown(1.2);
      });

      doc.fillColor('#666666')
         .fontSize(8)
         .text(`Generated on: ${new Date().toLocaleDateString()}`, 60, doc.page.height - 40, { align: 'center' });

      doc.end();

      const pdfBuffer = await pdfPromise;

      const objectStorage = new ObjectStorageService();
      const sanitizedCustomerName = customer.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const pdfFileName = `contract_${sanitizedCustomerName}_${document.id.substring(0, 8)}_${Date.now()}.pdf`;
      const privateDir = objectStorage.getPrivateObjectDir();
      const uploadPath = `${privateDir}/contracts/${user.activeCompanyId}/${customer.id}/${pdfFileName}`;

      // Use the default bucket ID from environment, not extracted from path
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');
      }
      
      // Object name is the full path (Replit object storage uses paths within the bucket)
      const objectName = uploadPath.startsWith("/") ? uploadPath.slice(1) : uploadPath;
      
      const bucket = objectStorageClient.bucket(bucketId);
      const file = bucket.file(objectName);

      await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: {
          contentType: 'application/pdf'
        }
      });

      // Note: Skipping ACL policy setting for now as the object storage path format
      // may not be compatible with the ACL system after direct bucket upload
      // The file is uploaded successfully and company-scoped access is handled
      // through other security layers (authentication, company filtering in queries)

      await storage.updateContractBuilderDocument(document.id, user.activeCompanyId, {
        status: 'published',
        pdfStorageObjectPath: uploadPath,
        publishedAt: new Date(),
        updatedBy: user.id
      });

      res.json({
        success: true,
        documentId: document.id,
        filePath: uploadPath,
        fileName: pdfFileName
      });

    } catch (error: any) {
      console.error('PDF export error:', error);
      res.status(500).send(`Failed to export PDF: ${error.message}`);
    }
  });

  app.post("/api/contract-builder/documents/:id/publish-and-create", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const document = await storage.getContractBuilderDocumentById(req.params.id, user.activeCompanyId);
      if (!document) {
        return res.status(404).send("Document not found");
      }

      const customer = await storage.getCustomerById(document.customerId, user.activeCompanyId);
      if (!customer) {
        return res.status(404).send("Customer not found");
      }

      const templates = await storage.getContractTemplates();
      const sections = await storage.getContractBuilderSections(req.params.id, user.activeCompanyId);
      const variables = await storage.getContractBuilderVariables(req.params.id, user.activeCompanyId);

      // Build variables map
      const variablesMap: Record<string, string> = {};
      variables.forEach(v => {
        variablesMap[v.variableKey] = v.variableValue;
      });

      // Normalize legacy variable names (migration support)
      // This allows existing drafts with old variable names to work
      if (variablesMap['start_date'] && !variablesMap['contract_start_date']) {
        console.log(`[Migration] Normalizing start_date → contract_start_date for document ${req.params.id}`);
        variablesMap['contract_start_date'] = variablesMap['start_date'];
      }
      if (variablesMap['end_date'] && !variablesMap['contract_end_date']) {
        console.log(`[Migration] Normalizing end_date → contract_end_date for document ${req.params.id}`);
        variablesMap['contract_end_date'] = variablesMap['end_date'];
      }

      // Validate required variables for contract creation
      const requiredVars = ['contract_start_date', 'contract_amount'];
      const missingVars = requiredVars.filter(v => !variablesMap[v]);
      if (missingVars.length > 0) {
        return res.status(400).json({ 
          error: `Missing required variables: ${missingVars.join(', ')}` 
        });
      }

      // Parse contract data from variables
      const startDate = new Date(variablesMap.contract_start_date);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid contract_start_date format' });
      }

      const endDate = variablesMap.contract_end_date ? new Date(variablesMap.contract_end_date) : null;
      if (endDate && isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid contract_end_date format' });
      }

      const contractAmount = parseFloat(variablesMap.contract_amount);
      if (isNaN(contractAmount)) {
        return res.status(400).json({ error: 'Invalid contract_amount' });
      }

      // Determine service type from included sections
      const includedTemplates = sections
        .filter(s => s.isIncluded)
        .map(s => templates.find(t => t.id === s.templateId))
        .filter(t => t !== undefined);

      const hasIrrigation = includedTemplates.some(t => t!.category === 'irrigation');
      const hasMaintenance = includedTemplates.some(t => t!.category === 'maintenance');
      const hasSnow = includedTemplates.some(t => t!.category === 'snow');

      let serviceType: "Maintenance" | "Chemical" | "Snow" | "Irrigation" | "Other" = "Other";
      if (hasMaintenance && hasSnow) {
        serviceType = "Maintenance"; // Primary service
      } else if (hasMaintenance) {
        serviceType = "Maintenance";
      } else if (hasIrrigation) {
        serviceType = "Irrigation";
      } else if (hasSnow) {
        serviceType = "Snow";
      }

      // Determine billing pattern from num_months
      const numMonths = parseInt(variablesMap.num_months || '12');
      let billingPattern: "monthly" | "seasonal" | "12-of-12" = "12-of-12";
      if (numMonths === 1) {
        billingPattern = "monthly";
      } else if (numMonths === 12) {
        billingPattern = "12-of-12";
      } else {
        billingPattern = "seasonal";
      }

      // Check for existing active contracts of the same type
      const existingContracts = await storage.getContractsByCustomerId(customer.id, user.activeCompanyId);
      const existingActiveContract = existingContracts.find(
        c => c.serviceType === serviceType && c.status === "active"
      );
      
      if (existingActiveContract && (serviceType === "Maintenance" || serviceType === "Snow")) {
        return res.status(400).json({
          error: `An active ${serviceType} contract already exists for this customer. Please end the existing contract first.`
        });
      }

      // Generate PDF (reuse export logic)
      const includedSections = sections
        .filter(s => s.isIncluded)
        .map(s => {
          const template = templates.find(t => t.id === s.templateId);
          if (!template) return null;
          
          let content = s.customContent || template.defaultContent;
          Object.entries(variablesMap).forEach(([key, value]) => {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`);
          });

          return {
            title: template.sectionTitle,
            content: content,
            displayOrder: template.displayOrder
          };
        })
        .filter(s => s !== null)
        .sort((a, b) => a!.displayOrder - b!.displayOrder);

      const PDFDocument = (await import('pdfkit')).default;
      
      const logoPath = path.join(process.cwd(), 'attached_assets', 'NEW - LOGO-03_1763582979034.png');
      let logoBuffer: Buffer | null = null;
      try {
        logoBuffer = await fs.readFile(logoPath);
      } catch (err) {
        console.error('Failed to load logo:', err);
      }

      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 60, right: 60 }
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      const pdfPromise = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      if (logoBuffer) {
        const logoWidth = 100;
        const logoX = (doc.page.width - logoWidth) / 2;
        doc.image(logoBuffer, logoX, 40, { width: logoWidth });
        doc.moveDown(3);
      }

      doc.fillColor('#2E7D32')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('LANDSCAPE MAINTENANCE CONTRACT', { align: 'center' });
      
      doc.moveDown(0.3);
      doc.fillColor('#000000')
         .fontSize(12)
         .font('Helvetica')
         .text(customer.name, { align: 'center' });
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`, { align: 'center' });
      
      doc.moveDown(1);
      doc.moveTo(60, doc.y)
         .lineTo(552, doc.y)
         .strokeColor('#2E7D32')
         .lineWidth(2)
         .stroke();
      doc.moveDown(1.5);

      includedSections.forEach((section) => {
        if (!section) return;
        
        doc.fillColor('#2E7D32')
           .fontSize(13)
           .font('Helvetica-Bold')
           .text(section.title);
        doc.moveDown(0.4);
        
        const lines = section.content.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            doc.fillColor('#000000')
               .fontSize(10)
               .font('Helvetica')
               .text(line, {
                 align: 'justify',
                 lineGap: 2
               });
          } else {
            doc.moveDown(0.2);
          }
        });
        
        doc.moveDown(1.2);
      });

      doc.fillColor('#666666')
         .fontSize(8)
         .text(`Generated on: ${new Date().toLocaleDateString()}`, 60, doc.page.height - 40, { align: 'center' });

      doc.end();

      const pdfBuffer = await pdfPromise;

      // Upload PDF to object storage
      const objectStorage = new ObjectStorageService();
      const sanitizedCustomerName = customer.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const pdfFileName = `contract_${sanitizedCustomerName}_${document.id.substring(0, 8)}_${Date.now()}.pdf`;
      const privateDir = objectStorage.getPrivateObjectDir();
      const uploadPath = `${privateDir}/contracts/${user.activeCompanyId}/${customer.id}/${pdfFileName}`;

      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');
      }
      
      const objectName = uploadPath.startsWith("/") ? uploadPath.slice(1) : uploadPath;
      
      const bucket = objectStorageClient.bucket(bucketId);
      const file = bucket.file(objectName);

      await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: {
          contentType: 'application/pdf'
        }
      });

      // Create the CRM contract
      const contractData = {
        companyId: user.activeCompanyId,
        customerId: customer.id,
        serviceType,
        billingPattern,
        startDate,
        endDate,
        status: "active" as const,
        notes: `Created from Contract Builder document: ${document.documentTitle}`,
        hasMobilizationFee: false,
        mobilizationFeeAmount: 0
      };

      const contract = await storage.createContract(contractData);

      // Create contract status history
      await storage.createContractStatusHistory({
        contractId: contract.id,
        newStatus: contract.status,
        changedBy: user.id,
      });

      // Upload PDF as contract document
      const contractDoc = await storage.createContractDocument({
        contractId: contract.id,
        companyId: user.activeCompanyId,
        version: 1,
        filename: pdfFileName,
        storageObjectPath: uploadPath,
        fileSize: pdfBuffer.length,
        uploadedBy: user.id,
      });

      // Update contract builder document with link to contract and published status
      await storage.updateContractBuilderDocument(document.id, user.activeCompanyId, {
        status: 'published',
        contractId: contract.id,
        pdfStorageObjectPath: uploadPath,
        publishedAt: new Date(),
        updatedBy: user.id
      });

      res.json({
        success: true,
        contract: contract,
        contractDocument: contractDoc,
        documentId: document.id,
        filePath: uploadPath,
        fileName: pdfFileName
      });

    } catch (error: any) {
      console.error('Publish and create contract error:', error);
      res.status(500).send(`Failed to publish and create contract: ${error.message}`);
    }
  });

  // Ticket Types routes (admin/office only for management)
  app.get("/api/ticket-types", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticketTypes = await storage.getTicketTypes(user.activeCompanyId);
    res.json(ticketTypes);
  });

  // Get the canonical scheduling status ID for this company
  // Returns the "Ready to Schedule" status ID from the Project ticket type
  // This is the single source of truth for scheduling queue membership
  app.get("/api/scheduling-status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Find the Project ticket type for this company
    const ticketTypes = await storage.getTicketTypes(user.activeCompanyId);
    const projectType = ticketTypes.find(t => t.name === "Project");
    
    if (!projectType) {
      return res.json({ schedulingStatusId: null, message: "Project ticket type not found" });
    }
    
    // Find the "Ready to Schedule" status in the Project workflow
    const statuses = await storage.getTicketTypeStatuses(projectType.id);
    const schedulingStatus = statuses.find(s => s.name === "Ready to Schedule");
    
    if (!schedulingStatus) {
      return res.json({ schedulingStatusId: null, message: "Ready to Schedule status not found in Project workflow" });
    }
    
    res.json({ 
      schedulingStatusId: schedulingStatus.id,
      statusName: schedulingStatus.name,
      ticketTypeId: projectType.id,
      ticketTypeName: projectType.name
    });
  });

  // Initialize RFP Request ticket type for a company
  app.post("/api/ticket-types/init-rfp", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const result = await ensureRFPRequestTicketType(user.activeCompanyId);
      if (result) {
        res.json({ success: true, typeId: result.typeId });
      } else {
        res.status(500).send("Failed to initialize RFP Request ticket type");
      }
    } catch (err) {
      console.error("Failed to initialize RFP Request ticket type:", err);
      res.status(500).send("Failed to initialize RFP Request ticket type");
    }
  });

  // Initialize Invoice ticket type for a company
  app.post("/api/ticket-types/init-invoice", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const result = await ensureInvoiceTicketType(user.activeCompanyId);
      if (result) {
        res.json({ success: true, typeId: result.typeId });
      } else {
        res.status(500).send("Failed to initialize Invoice ticket type");
      }
    } catch (err) {
      console.error("Failed to initialize Invoice ticket type:", err);
      res.status(500).send("Failed to initialize Invoice ticket type");
    }
  });

  // Initialize Project ticket type with new 7-step workflow
  app.post("/api/ticket-types/init-project", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    try {
      const result = await ensureProjectTicketType(user.activeCompanyId);
      if (result) {
        // Run migration to transition existing approved tickets
        const migratedCount = await migrateApprovedProjectTickets(user.activeCompanyId, user.id);
        res.json({ success: true, typeId: result.typeId, migratedTickets: migratedCount });
      } else {
        res.status(500).send("Failed to initialize Project ticket type");
      }
    } catch (err) {
      console.error("Failed to initialize Project ticket type:", err);
      res.status(500).send("Failed to initialize Project ticket type");
    }
  });
  
  // Run migration for approved Project tickets to Ready to Schedule status
  app.post("/api/migrate-approved-projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    try {
      // Ensure Project ticket type exists with Ready to Schedule status
      await ensureProjectTicketType(user.activeCompanyId);
      // Run the migration
      const migratedCount = await migrateApprovedProjectTickets(user.activeCompanyId, user.id);
      res.json({ success: true, migratedCount, message: `Migrated ${migratedCount} approved tickets to Ready to Schedule` });
    } catch (err) {
      console.error("Failed to migrate approved project tickets:", err);
      res.status(500).send("Failed to migrate approved project tickets");
    }
  });

  // Initialize To-Do ticket type with simple Open/Done workflow
  app.post("/api/ticket-types/init-todo", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;

    try {
      const result = await ensureToDoTicketType(user.activeCompanyId);
      if (result) {
        res.json({ 
          success: true, 
          typeId: result.typeId, 
          statuses: Object.fromEntries(result.statuses),
          internalCustomerId: result.internalCustomerId 
        });
      } else {
        res.status(500).send("Failed to initialize To-Do ticket type");
      }
    } catch (err) {
      console.error("Failed to initialize To-Do ticket type:", err);
      res.status(500).send("Failed to initialize To-Do ticket type");
    }
  });

  app.get("/api/ticket-types/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticketType = await storage.getTicketTypeById(req.params.id, user.activeCompanyId);
    if (!ticketType) {
      return res.status(404).send("Ticket type not found");
    }
    res.json(ticketType);
  });

  app.post("/api/ticket-types", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    const result = insertTicketTypeSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    // Guardrail: Prevent creation of "Execution Task" ticket type (deprecated)
    if (result.data.name === "Execution Task") {
      return res.status(400).send("Execution Task ticket type is deprecated. Use needs_scheduling flag for field work scheduling.");
    }

    const ticketType = await storage.createTicketType(result.data);
    res.json(ticketType);
  });

  app.patch("/api/ticket-types/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    const result = insertTicketTypeSchema.partial().omit({ companyId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const ticketType = await storage.updateTicketType(req.params.id, user.activeCompanyId, result.data);
    if (!ticketType) {
      return res.status(404).send("Ticket type not found");
    }
    res.json(ticketType);
  });

  app.delete("/api/ticket-types/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    await storage.deleteTicketType(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Ticket Type Statuses routes
  app.get("/api/ticket-types/:ticketTypeId/statuses", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const statuses = await storage.getTicketTypeStatuses(req.params.ticketTypeId);
    res.json(statuses);
  });

  app.post("/api/ticket-types/:ticketTypeId/statuses", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    const result = insertTicketTypeStatusSchema.safeParse({
      ...req.body,
      ticketTypeId: req.params.ticketTypeId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const status = await storage.createTicketTypeStatus(result.data);
    res.json(status);
  });

  app.patch("/api/ticket-type-statuses/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    const result = insertTicketTypeStatusSchema.partial().omit({ ticketTypeId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const status = await storage.updateTicketTypeStatus(req.params.id, result.data);
    if (!status) {
      return res.status(404).send("Status not found");
    }
    res.json(status);
  });

  app.delete("/api/ticket-type-statuses/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    await storage.deleteTicketTypeStatus(req.params.id);
    res.status(200).send("Deleted");
  });

  // Ticket Type Fields routes
  app.get("/api/ticket-types/:ticketTypeId/fields", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const fields = await storage.getTicketTypeFields(req.params.ticketTypeId);
    res.json(fields);
  });

  app.get("/api/ticket-type-statuses/:statusId/fields", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const fields = await storage.getTicketTypeFieldsByStatus(req.params.statusId);
    res.json(fields);
  });

  app.post("/api/ticket-types/:ticketTypeId/fields", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    const result = insertTicketTypeFieldSchema.safeParse({
      ...req.body,
      ticketTypeId: req.params.ticketTypeId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const field = await storage.createTicketTypeField(result.data);
    res.json(field);
  });

  app.patch("/api/ticket-type-fields/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    const result = insertTicketTypeFieldSchema.partial().omit({ ticketTypeId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const field = await storage.updateTicketTypeField(req.params.id, result.data);
    if (!field) {
      return res.status(404).send("Field not found");
    }
    res.json(field);
  });

  app.delete("/api/ticket-type-fields/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    await storage.deleteTicketTypeField(req.params.id);
    res.status(200).send("Deleted");
  });

  // Geocoding route (server-side to set proper User-Agent)
  app.get("/api/geocode", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const address = req.query.address as string;
    if (!address) {
      return res.status(400).send("Address is required");
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            "User-Agent": "LandscapingCRM/1.0 (landscaping-crm@replit.app)",
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        return res.status(response.status).send("Geocoding service error");
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        res.json({
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        });
      } else {
        res.status(404).send("Address not found");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).send("Failed to geocode address");
    }
  });

  // Tickets routes
  
  // Get tickets assigned to the current user
  app.get("/api/tickets/my", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const tickets = await storage.getTickets(user.activeCompanyId, { assignedToId: user.id });
    
    // Enrich tickets with currentStatus and customer info
    const enrichedTickets = await Promise.all(
      tickets.map(async (ticket) => {
        const statuses = await storage.getTicketTypeStatuses(ticket.ticketTypeId);
        const currentStatus = statuses.find(s => s.id === ticket.currentStatusId);
        const customer = ticket.customerId 
          ? await storage.getCustomerById(ticket.customerId, user.activeCompanyId)
          : null;
        return {
          ...ticket,
          currentStatus: currentStatus ? { id: currentStatus.id, name: currentStatus.name, color: currentStatus.color, isFinal: currentStatus.isFinal } : null,
          customer: customer ? { name: customer.name } : null,
        };
      })
    );
    
    res.json(enrichedTickets);
  });

  app.get("/api/tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const filters: { customerId?: string; assignedToId?: string } = {};
    
    if (req.query.customerId) {
      filters.customerId = req.query.customerId as string;
    }
    if (req.query.assignedToId) {
      filters.assignedToId = req.query.assignedToId as string;
    }
    
    // Ops users can only see their assigned tickets
    if (user.activeRole === "field_manager" || user.activeRole === "irrigation_manager") {
      filters.assignedToId = user.id;
    }

    const tickets = await storage.getTickets(user.activeCompanyId, filters);
    res.json(tickets);
  });

  app.get("/api/tickets/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.id, user.activeCompanyId);
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }
    
    // Ops users can only view their assigned tickets
    if ((user.activeRole === "field_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied - not assigned to this ticket");
    }
    
    res.json(ticket);
  });

  app.get("/api/customers/:customerId/tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const tickets = await storage.getTicketsByCustomerId(req.params.customerId, user.activeCompanyId);
    res.json(tickets);
  });

  app.get("/api/contracts/:contractId/tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const tickets = await storage.getTicketsByContractId(req.params.contractId, user.activeCompanyId);
    res.json(tickets);
  });

  app.post("/api/tickets/photo-upload-url", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions");
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath: normalizedPath });
    } catch (error) {
      console.error("Error getting photo upload URL:", error);
      res.status(500).send("Failed to get upload URL");
    }
  });

  app.post("/api/tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin can create tickets
    if (user.activeRole !== "admin") {
      return res.status(403).send("Insufficient permissions - admin role required");
    }

    // Validate assignedToId is provided and user belongs to the company
    if (!req.body.assignedToId) {
      return res.status(400).send("Assignment is required - tickets must be assigned to a user");
    }
    
    const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const isValidAssignee = companyUsers.some(cu => cu.userId === req.body.assignedToId);
    if (!isValidAssignee) {
      return res.status(400).send("Invalid assignee - user must belong to this company");
    }

    // Get the ticket type to find the initial status
    const ticketType = await storage.getTicketTypeById(req.body.ticketTypeId, user.activeCompanyId);
    if (!ticketType) {
      return res.status(400).send("Invalid ticket type");
    }

    const statuses = await storage.getTicketTypeStatuses(ticketType.id);
    if (statuses.length === 0) {
      return res.status(400).send("Ticket type has no statuses defined");
    }

    // Sort by displayOrder and get the first status
    const initialStatus = statuses.sort((a, b) => a.displayOrder - b.displayOrder)[0];

    const result = insertTicketSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
      currentStatusId: initialStatus.id,
      createdById: user.id,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const ticket = await storage.createTicket(result.data);
    
    // Set ACL on uploaded photos to allow company members to read them
    if (ticket.photos && ticket.photos.length > 0) {
      const objectStorageService = new ObjectStorageService();
      for (const photoPath of ticket.photos) {
        try {
          await objectStorageService.trySetObjectEntityAclPolicy(photoPath, {
            owner: user.id,
            visibility: "private",
            aclRules: [{
              group: {
                type: ObjectAccessGroupType.COMPANY_MEMBER,
                id: user.activeCompanyId,
              },
              permission: ObjectPermission.READ,
            }],
          });
        } catch (error) {
          console.error(`Failed to set ACL for photo ${photoPath}:`, error);
        }
      }
    }
    
    // Create initial status history
    await storage.createTicketStatusHistory({
      ticketId: ticket.id,
      fromStatusId: null,
      toStatusId: initialStatus.id,
      changedById: user.id,
      notes: "Ticket created",
    });

    // Create ticket source record (manual creation)
    await storage.createTicketSource({
      ticketId: ticket.id,
      sourceType: "manual",
      sourceId: null,
    });

    // Save initial field values if provided (e.g., for RFP Request)
    if (req.body.initialFieldValues) {
      const fields = await storage.getTicketTypeFields(ticketType.id);
      for (const [fieldKey, value] of Object.entries(req.body.initialFieldValues)) {
        if (value) {
          const field = fields.find(f => f.fieldKey === fieldKey);
          if (field) {
            await storage.upsertTicketFieldValue({
              ticketId: ticket.id,
              fieldId: field.id,
              value: String(value),
              capturedById: user.id,
            });
          }
        }
      }
    }

    // Create notification for initial ticket assignment
    if (ticket.assignedToId && ticket.assignedToId !== user.id) {
      try {
        const customer = ticket.customerId 
          ? await storage.getCustomerById(ticket.customerId, user.activeCompanyId)
          : null;
        
        const dueDateText = ticket.dueDate 
          ? ` (Due: ${new Date(ticket.dueDate).toLocaleDateString()})` 
          : "";
        const customerText = customer ? ` - ${customer.name}` : "";
        
        await storage.createNotification({
          companyId: user.activeCompanyId,
          recipientId: ticket.assignedToId,
          ticketId: ticket.id,
          type: "assigned",
          message: `New ticket assigned: ${ticket.title}${customerText}${dueDateText}`,
          isRead: false,
        });
        
        console.log(`Created assignment notification for new ticket ${ticket.id} to user ${ticket.assignedToId}`);
      } catch (err) {
        console.error("Failed to create assignment notification:", err);
        // Don't fail the creation - notification is secondary
      }
    }

    res.json(ticket);
  });

  // Batch create tickets - creates one ticket per selected customer
  app.post("/api/tickets/batch", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin, office, and irrigation_manager can batch create tickets
    if (!["admin", "office", "irrigation_manager"].includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions - admin, office, or irrigation_manager role required");
    }

    const { customerIds, title, description, ticketTypeId, assignedToId, dueDate, priority, workType, skipDuplicates = true, invoiceCategory, workCompletedDate } = req.body;

    // Validate required fields
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).send("At least one customer must be selected");
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).send("Title is required");
    }
    if (!ticketTypeId) {
      return res.status(400).send("Ticket type is required");
    }
    if (!assignedToId) {
      return res.status(400).send("Assignee is required");
    }

    // Validate assignee belongs to company
    const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const isValidAssignee = companyUsers.some(cu => cu.userId === assignedToId);
    if (!isValidAssignee) {
      return res.status(400).send("Invalid assignee - user must belong to this company");
    }

    // Validate ticket type and get initial status
    const ticketType = await storage.getTicketTypeById(ticketTypeId, user.activeCompanyId);
    if (!ticketType) {
      return res.status(400).send("Invalid ticket type");
    }

    const statuses = await storage.getTicketTypeStatuses(ticketType.id);
    if (statuses.length === 0) {
      return res.status(400).send("Ticket type has no statuses defined");
    }
    const initialStatus = statuses.sort((a, b) => a.displayOrder - b.displayOrder)[0];

    // Get all customers and validate they belong to this company
    const allCustomers = await storage.getCustomers(user.activeCompanyId);
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));
    
    const invalidCustomers: string[] = [];
    for (const custId of customerIds) {
      if (!customerMap.has(custId)) {
        invalidCustomers.push(custId);
      }
    }
    if (invalidCustomers.length > 0) {
      return res.status(400).send(`Invalid customer IDs: ${invalidCustomers.join(", ")}`);
    }

    // Check for duplicates if skipDuplicates is enabled
    const existingTickets = await storage.getTickets(user.activeCompanyId);
    const nonFinalStatuses = statuses.filter(s => s.isFinal !== "true").map(s => s.id);
    
    const duplicateCustomerIds: string[] = [];
    if (skipDuplicates) {
      const normalizedTitle = title.trim().toLowerCase();
      for (const custId of customerIds) {
        const hasDuplicate = existingTickets.some(t => 
          t.customerId === custId && 
          t.ticketTypeId === ticketTypeId &&
          t.title.toLowerCase() === normalizedTitle &&
          nonFinalStatuses.includes(t.currentStatusId)
        );
        if (hasDuplicate) {
          duplicateCustomerIds.push(custId);
        }
      }
    }

    // Filter out duplicates
    const customersToCreate = customerIds.filter((id: string) => !duplicateCustomerIds.includes(id));

    // Create tickets for each customer
    const created: Array<{ id: string; customerId: string; customerName: string }> = [];
    const failed: Array<{ customerId: string; error: string }> = [];

    for (const custId of customersToCreate) {
      try {
        const customer = customerMap.get(custId)!;
        const ticket = await storage.createTicket({
          companyId: user.activeCompanyId,
          customerId: custId,
          ticketTypeId,
          currentStatusId: initialStatus.id,
          title: title.trim(),
          description: description?.trim() || null,
          priority: priority || "normal",
          workType: workType || "admin",
          billingBehavior: "no_invoice",
          assignedToId,
          dueDate: dueDate ? new Date(dueDate + "T12:00:00") : null,
          createdById: user.id,
          invoiceCategory: invoiceCategory || null,
          workCompletedDate: workCompletedDate ? new Date(workCompletedDate + "T12:00:00") : null,
        });

        // Create status history
        await storage.createTicketStatusHistory({
          ticketId: ticket.id,
          fromStatusId: null,
          toStatusId: initialStatus.id,
          changedById: user.id,
          notes: "Batch created",
        });

        // Create assignment notification if assigned to someone else
        if (assignedToId !== user.id) {
          try {
            const dueDateText = ticket.dueDate 
              ? ` (Due: ${new Date(ticket.dueDate).toLocaleDateString()})` 
              : "";
            
            await storage.createNotification({
              companyId: user.activeCompanyId,
              recipientId: assignedToId,
              ticketId: ticket.id,
              type: "assigned",
              message: `New ticket assigned: ${ticket.title} - ${customer.name}${dueDateText}`,
              isRead: false,
            });
          } catch (err) {
            console.error("Failed to create assignment notification for batch ticket:", err);
          }
        }

        created.push({ 
          id: ticket.id, 
          customerId: custId, 
          customerName: customer.name 
        });
      } catch (err) {
        console.error(`Failed to create batch ticket for customer ${custId}:`, err);
        failed.push({ 
          customerId: custId, 
          error: err instanceof Error ? err.message : "Unknown error" 
        });
      }
    }

    const skipped = duplicateCustomerIds.map(id => ({
      customerId: id,
      customerName: customerMap.get(id)?.name || "Unknown",
      reason: "Duplicate - open ticket with same title exists"
    }));

    console.log(`Batch ticket creation: ${created.length} created, ${skipped.length} skipped, ${failed.length} failed`);

    res.json({
      success: true,
      created,
      skipped,
      failed,
      summary: {
        total: customerIds.length,
        createdCount: created.length,
        skippedCount: skipped.length,
        failedCount: failed.length,
      }
    });
  });

  app.patch("/api/tickets/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const existingTicket = await storage.getTicketById(req.params.id, user.activeCompanyId);
    
    if (!existingTicket) {
      return res.status(404).send("Ticket not found");
    }
    
    // Ops users can update their assigned tickets (for status changes and field values)
    if ((user.activeRole === "field_manager" || user.activeRole === "irrigation_manager" || user.activeRole === "shop_manager") && existingTicket.assignedToId !== user.id) {
      return res.status(403).send("Access denied - not assigned to this ticket");
    }
    
    // Viewers cannot update tickets
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions");
    }

    // If status is changing, record history
    if (req.body.currentStatusId && req.body.currentStatusId !== existingTicket.currentStatusId) {
      await storage.createTicketStatusHistory({
        ticketId: existingTicket.id,
        fromStatusId: existingTicket.currentStatusId,
        toStatusId: req.body.currentStatusId,
        changedById: user.id,
        notes: req.body.statusChangeNotes || null,
      });
      
      // Check if new status is final
      const allStatuses = await storage.getTicketTypeStatuses(existingTicket.ticketTypeId);
      const newStatus = allStatuses.find(s => s.id === req.body.currentStatusId);
      
      // Auto-transition work type from estimate_request to project when estimate is approved
      // This only happens when a Project ticket moves to a status in the approved path
      // (Ready to Schedule, Work Completed, Ready for Billing, Invoicing)
      // NOT on Decision Received (waiting for approval) or Closed - Lost (rejected)
      if (existingTicket.workType === "estimate_request" && newStatus) {
        const ticketType = await storage.getTicketTypeById(existingTicket.ticketTypeId, user.activeCompanyId);
        if (ticketType?.name === "Project") {
          // Only transition when entering the approved execution/billing path
          const approvedPathStatuses = ["Ready to Schedule", "Work Completed", "Ready for Billing", "Invoicing"];
          const isInApprovedPath = approvedPathStatuses.includes(newStatus.name);
          if (isInApprovedPath) {
            req.body.workType = "project";
            console.log(`Auto-transitioning ticket ${existingTicket.id} work type from estimate_request to project (status: ${newStatus.name})`);
          }
        }
      }
      
      // Auto-return delegation: when ticket moves to "Work Completed" and has a delegator,
      // reassign back to the delegator and clear delegation
      if (newStatus?.name === "Work Completed" && existingTicket.delegatedById) {
        req.body.assignedToId = existingTicket.delegatedById;
        req.body.delegatedById = null;
        console.log(`Delegation return: ticket ${existingTicket.id} reassigned back to delegator ${existingTicket.delegatedById}`);
        
        // Notify the delegator that the work is complete and ticket is back with them
        try {
          const customer = existingTicket.customerId 
            ? await storage.getCustomerById(existingTicket.customerId, user.activeCompanyId)
            : null;
          const customerText = customer ? ` - ${customer.name}` : "";
          
          await storage.createNotification({
            companyId: user.activeCompanyId,
            recipientId: existingTicket.delegatedById,
            ticketId: existingTicket.id,
            type: "assignment",
            message: `Work completed, ticket returned to you: ${existingTicket.title}${customerText}`,
            isRead: false,
          });
        } catch (err) {
          console.error("Failed to create delegation return notification:", err);
        }
      }
      
      if (newStatus?.isFinal === "true") {
        req.body.completedAt = new Date();
        
        // Create completion notification for main admin
        try {
          // Find the main admin for this company (first admin found)
          const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
          const mainAdmin = companyUsers.find(cu => cu.role === "admin");
          
          if (mainAdmin) {
            const customer = existingTicket.customerId 
              ? await storage.getCustomerById(existingTicket.customerId, user.activeCompanyId)
              : null;
            
            const customerText = customer ? ` - ${customer.name}` : "";
            const completedAt = new Date().toLocaleString();
            
            await storage.createNotification({
              companyId: user.activeCompanyId,
              recipientId: mainAdmin.userId,
              ticketId: existingTicket.id,
              type: "completed",
              message: `Ticket completed: ${existingTicket.title}${customerText} (${completedAt})`,
              isRead: false,
            });
            
            console.log(`Created completion notification for ticket ${existingTicket.id} to admin ${mainAdmin.userId}`);
          }
        } catch (err) {
          console.error("Failed to create completion notification:", err);
          // Don't fail the update - notification is secondary
        }
        
        // Auto-create Invoice ticket if billable work is completed
        // But NOT if this ticket is already an Invoice ticket (prevents duplicates)
        const currentTicketType = await storage.getTicketTypeById(existingTicket.ticketTypeId, user.activeCompanyId);
        const isInvoiceTicket = currentTicketType?.name === "Invoice";
        
        if (existingTicket.billingBehavior === "invoice_required" && !isInvoiceTicket) {
          try {
            // Ensure Invoice ticket type exists for this company
            const invoiceTypeInfo = await ensureInvoiceTicketType(user.activeCompanyId);
            
            if (invoiceTypeInfo) {
              // Create Invoice ticket (unassigned - for Admin/Office to process)
              const invoiceTicket = await storage.createTicket({
                companyId: user.activeCompanyId,
                customerId: existingTicket.customerId,
                contractId: existingTicket.contractId,
                ticketTypeId: invoiceTypeInfo.typeId,
                currentStatusId: invoiceTypeInfo.pendingStatusId,
                workType: "admin",
                billingBehavior: "internal",
                title: `Invoice: ${existingTicket.title}`,
                description: `Invoice required for completed work: ${existingTicket.title}\n\nOriginal description: ${existingTicket.description || "N/A"}`,
                priority: "normal",
                assignedToId: null, // Unassigned - for Admin/Office
                createdById: user.id,
              });
              
              // Link the tickets
              await storage.createTicketLink({
                sourceTicketId: existingTicket.id,
                targetTicketId: invoiceTicket.id,
                linkType: "invoice_for",
              });
              
              // Copy notes from source ticket to invoice ticket
              const sourceComments = await storage.getTicketComments(existingTicket.id);
              for (const comment of sourceComments) {
                await storage.createTicketComment({
                  ticketId: invoiceTicket.id,
                  authorId: comment.authorId,
                  body: comment.body,
                });
              }
              
              console.log(`Auto-created Invoice ticket ${invoiceTicket.id} for completed billable work ${existingTicket.id} with ${sourceComments.length} notes copied`);
            }
          } catch (err) {
            console.error("Failed to auto-create invoice ticket:", err);
            // Don't fail the update - invoice creation is secondary
          }
        }
        
        // Send "Work Completed" email notification to customer contacts
        try {
          if (existingTicket.customerId) {
            const customer = await storage.getCustomerById(existingTicket.customerId, user.activeCompanyId);
            const contacts = await storage.getContactsByCustomerId(existingTicket.customerId, user.activeCompanyId);
            const primaryContact = contacts.find(c => c.isPrimary === "true" && c.email);
            const toEmail = primaryContact?.email || contacts.find(c => c.email)?.email;
            
            if (toEmail && customer) {
              const company = await storage.getCompanyById(user.activeCompanyId);
              const completionDate = new Date().toLocaleDateString('en-US', { 
                year: 'numeric', month: 'long', day: 'numeric' 
              });
              
              await processEmailEvent('ticket.work_completed', user.activeCompanyId, {
                ticketTitle: existingTicket.title,
                customerName: customer.name,
                companyName: company?.name || 'Property Maintenance',
                completionDate,
                ticketDescription: existingTicket.description || '',
              }, {
                customerId: existingTicket.customerId,
                ticketId: existingTicket.id,
                toEmail,
                sentById: user.id,
              });
              
              console.log(`Triggered work completed email for ticket ${existingTicket.id} to ${toEmail}`);
            }
          }
        } catch (err) {
          console.error("Failed to send work completed email:", err);
          // Don't fail the update - email is secondary
        }

      }
    }

    const result = insertTicketSchema.partial().omit({ companyId: true, createdById: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    // Check if assignment is changing for notification purposes
    const assignmentChanged = req.body.assignedToId !== undefined && 
                              req.body.assignedToId !== existingTicket.assignedToId;
    const newAssigneeId = req.body.assignedToId;
    const isBeingAssigned = assignmentChanged && newAssigneeId;

    const ticket = await storage.updateTicket(req.params.id, user.activeCompanyId, result.data);
    
    // Create notification for ticket assignment/reassignment
    if (isBeingAssigned) {
      try {
        // Get customer name for the notification message
        const customer = existingTicket.customerId 
          ? await storage.getCustomerById(existingTicket.customerId, user.activeCompanyId)
          : null;
        
        const dueDateText = existingTicket.dueDate 
          ? ` (Due: ${new Date(existingTicket.dueDate).toLocaleDateString()})` 
          : "";
        const customerText = customer ? ` - ${customer.name}` : "";
        
        await storage.createNotification({
          companyId: user.activeCompanyId,
          recipientId: newAssigneeId,
          ticketId: existingTicket.id,
          type: "assigned",
          message: `Ticket assigned: ${existingTicket.title}${customerText}${dueDateText}`,
          isRead: false,
        });
        
        console.log(`Created assignment notification for ticket ${existingTicket.id} to user ${newAssigneeId}`);
      } catch (err) {
        console.error("Failed to create assignment notification:", err);
        // Don't fail the update - notification is secondary
      }
    }

    res.json(ticket);
  });

  // Batch delete tickets - admin only (MUST be before /:id route)
  app.delete("/api/tickets/batch", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin can batch delete tickets (destructive operation)
    if (user.activeRole !== "admin") {
      return res.status(403).send("Insufficient permissions - admin role required for batch deletion");
    }

    const { ticketIds } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).send("ticketIds array is required");
    }

    if (ticketIds.length > 100) {
      return res.status(400).send("Cannot delete more than 100 tickets at once");
    }

    const deleted: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const ticketId of ticketIds) {
      try {
        await storage.deleteTicket(ticketId, user.activeCompanyId);
        deleted.push(ticketId);
      } catch (err) {
        console.error(`Failed to delete ticket ${ticketId}:`, err);
        failed.push({ 
          id: ticketId, 
          error: err instanceof Error ? err.message : "Unknown error" 
        });
      }
    }

    console.log(`Batch ticket deletion: ${deleted.length} deleted, ${failed.length} failed`);

    res.json({
      success: true,
      deleted,
      failed,
      summary: {
        total: ticketIds.length,
        deletedCount: deleted.length,
        failedCount: failed.length,
      }
    });
  });

  app.delete("/api/tickets/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin and office can delete tickets
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "shop_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteTicket(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Create Invoice ticket linked to a Project at Ready for Billing
  app.post("/api/tickets/create-invoice-from-project", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const { parentTicketId, customerId, title, description, priority } = req.body;
    
    if (!parentTicketId || !customerId) {
      return res.status(400).send("parentTicketId and customerId are required");
    }

    try {
      // Get the parent Project ticket
      const parentProject = await storage.getTicketById(parentTicketId, user.activeCompanyId);
      if (!parentProject) {
        return res.status(404).send("Parent project not found");
      }
      
      // Ensure Invoice ticket type exists
      const invoiceTypeInfo = await ensureInvoiceTicketType(user.activeCompanyId);
      
      if (!invoiceTypeInfo) {
        return res.status(500).send("Failed to initialize Invoice ticket type");
      }
      
      // Create the Invoice ticket
      const invoiceTicket = await storage.createTicket({
        companyId: user.activeCompanyId,
        customerId,
        contractId: parentProject.contractId,
        ticketTypeId: invoiceTypeInfo.typeId,
        currentStatusId: invoiceTypeInfo.pendingStatusId,
        workType: "admin",
        billingBehavior: "internal",
        title: title || `Invoice: ${parentProject.title}`,
        description: description || `Invoice for project: ${parentProject.title}\n\nOriginal description: ${parentProject.description || "N/A"}`,
        priority: priority || "normal",
        assignedToId: null, // Unassigned - for Admin/Office to process
        createdById: user.id,
      });
      
      // Link the Invoice to the parent Project ticket
      await storage.createTicketLink({
        sourceTicketId: parentTicketId,
        targetTicketId: invoiceTicket.id,
        linkType: "invoice_for",
      });
      
      // Copy notes from source ticket to invoice ticket
      const sourceComments = await storage.getTicketComments(parentTicketId);
      for (const comment of sourceComments) {
        await storage.createTicketComment({
          ticketId: invoiceTicket.id,
          authorId: comment.authorId,
          body: comment.body,
        });
      }
      
      console.log(`Created Invoice ticket ${invoiceTicket.id} linked to Project ${parentTicketId} with ${sourceComments.length} notes copied`);
      
      res.json(invoiceTicket);
    } catch (err) {
      console.error("Failed to create Invoice from Project:", err);
      res.status(500).send("Failed to create Invoice ticket");
    }
  });

  // Ticket Field Values routes
  app.get("/api/tickets/:ticketId/field-values", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.ticketId, user.activeCompanyId);
    
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }
    
    // Ops users can only view their assigned tickets
    if ((user.activeRole === "field_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied");
    }

    const fieldValues = await storage.getTicketFieldValues(req.params.ticketId);
    res.json(fieldValues);
  });

  app.put("/api/tickets/:ticketId/field-values/:fieldId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.ticketId, user.activeCompanyId);
    
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }
    
    // Ops users can update field values for their assigned tickets
    if ((user.activeRole === "field_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied");
    }
    
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertTicketFieldValueSchema.safeParse({
      ticketId: req.params.ticketId,
      fieldId: req.params.fieldId,
      value: req.body.value,
      capturedById: user.id,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const fieldValue = await storage.upsertTicketFieldValue(result.data);
    
    // Auto-transition Project tickets to "Ready to Schedule" when decision is Approved
    try {
      // Get the field to check if it's decision_outcome
      const field = await storage.getTicketTypeFieldById(req.params.fieldId);
      if (field && field.fieldKey === "decision_outcome" && req.body.value === "Approved") {
        // Check if this is a Project ticket
        const ticketType = await storage.getTicketTypeById(ticket.ticketTypeId, user.activeCompanyId);
        if (ticketType?.name === "Project") {
          // Get the current status to verify we're in Decision Received
          const statuses = await storage.getTicketTypeStatuses(ticket.ticketTypeId);
          const currentStatus = statuses.find(s => s.id === ticket.currentStatusId);
          const readyToScheduleStatus = statuses.find(s => s.name === "Ready to Schedule");
          
          // Only transition if currently in Decision Received and Ready to Schedule exists
          if (currentStatus?.name === "Decision Received" && readyToScheduleStatus) {
            // Create status history
            await storage.createTicketStatusHistory({
              ticketId: ticket.id,
              fromStatusId: ticket.currentStatusId,
              toStatusId: readyToScheduleStatus.id,
              changedById: user.id,
              notes: "Auto-transitioned: Estimate approved, ready to schedule with crew",
            });
            
            // Update the ticket status
            await storage.updateTicket(ticket.id, user.activeCompanyId, {
              currentStatusId: readyToScheduleStatus.id,
            });
            
            console.log(`Auto-transitioned Project ${ticket.id} to "Ready to Schedule" after approval`);
          }
        }
      }
    } catch (err) {
      console.error("Failed to auto-transition on approval:", err);
      // Don't fail the field value update - auto-transition is secondary
    }
    
    res.json(fieldValue);
  });

  // Ticket Status History routes
  app.get("/api/tickets/:ticketId/status-history", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.ticketId, user.activeCompanyId);
    
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }

    const history = await storage.getTicketStatusHistory(req.params.ticketId);
    res.json(history);
  });

  // Ticket Comments routes
  app.get("/api/tickets/:ticketId/comments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.ticketId, user.activeCompanyId);
    
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }
    
    // Ops users can only view comments on their assigned tickets
    if ((user.activeRole === "field_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied");
    }

    const comments = await storage.getTicketComments(req.params.ticketId);
    res.json(comments);
  });

  app.post("/api/tickets/:ticketId/comments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.ticketId, user.activeCompanyId);
    
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }
    
    // Ops users can add comments to their assigned tickets
    if ((user.activeRole === "field_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied");
    }
    
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertTicketCommentSchema.safeParse({
      ticketId: req.params.ticketId,
      authorId: user.id,
      body: req.body.body,
      parentCommentId: req.body.parentCommentId || null,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const comment = await storage.createTicketComment(result.data);
    
    // Parse @mentions from comment body and create mentions + notifications
    // Format: @[userId:userName] (with display name) or @[userId] or @{userId}
    const mentionRegex = /@\[([a-f0-9-]+):[^\]]+\]|@\[([a-f0-9-]+)\]|@\{([a-f0-9-]+)\}/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(result.data.body)) !== null) {
      const userId = match[1] || match[2] || match[3];
      if (userId && userId !== user.id && !mentions.includes(userId)) {
        mentions.push(userId);
      }
    }
    
    // Create mention records and notifications
    for (const mentionedUserId of mentions) {
      try {
        // Create mention record
        await storage.createTicketCommentMention({
          commentId: comment.id,
          mentionedUserId,
        });
        
        // Create notification for mentioned user
        const mentionedUser = await storage.getUserById(mentionedUserId);
        if (mentionedUser) {
          await storage.createNotification({
            companyId: user.activeCompanyId,
            recipientId: mentionedUserId,
            ticketId: ticket.id,
            type: "mentioned",
            message: `${user.name} mentioned you in ticket "${ticket.title}"`,
            isRead: false,
          });
        }
      } catch (err) {
        console.error("Failed to create mention/notification:", err);
      }
    }
    
    res.json(comment);
  });

  app.delete("/api/ticket-comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin/office can delete comments
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteTicketComment(req.params.id);
    res.status(200).send("Deleted");
  });

  // Ticket Links routes
  app.get("/api/tickets/:ticketId/links", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.ticketId, user.activeCompanyId);
    
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }

    const links = await storage.getTicketLinks(req.params.ticketId);
    
    // Get full details for each linked ticket
    const linkedTickets = await Promise.all(
      links.map(async (link) => {
        const linkedId = link.sourceTicketId === req.params.ticketId 
          ? link.targetTicketId 
          : link.sourceTicketId;
        const linkedTicket = await storage.getTicketById(linkedId, user.activeCompanyId);
        const ticketType = linkedTicket 
          ? await storage.getTicketTypeById(linkedTicket.ticketTypeId, user.activeCompanyId)
          : null;
        const currentStatus = linkedTicket 
          ? await storage.getTicketTypeStatuses(linkedTicket.ticketTypeId)
              .then(statuses => statuses.find(s => s.id === linkedTicket.currentStatusId))
          : null;
        return {
          link,
          ticket: linkedTicket,
          ticketType,
          currentStatus,
          relationship: link.sourceTicketId === req.params.ticketId ? "target" : "source",
        };
      })
    );

    res.json(linkedTickets);
  });

  app.post("/api/tickets/:ticketId/links", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin/office can create ticket links
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertTicketLinkSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const link = await storage.createTicketLink(result.data);
    res.json(link);
  });

  app.delete("/api/ticket-links/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin/office can delete ticket links
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteTicketLink(req.params.id);
    res.status(200).send("Deleted");
  });

  // Pending Invoices dashboard endpoint
  // Returns tickets that need invoicing: Invoice tickets in "Pending Invoice" status,
  // AND Project/Extra Billable tickets at "Ready for Billing" status
  app.get("/api/pending-invoices", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin/office can see pending invoices
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const allTickets = await storage.getTickets(user.activeCompanyId, {});
    const ticketTypes = await storage.getTicketTypes(user.activeCompanyId);
    
    // Collect tickets that need invoicing from multiple sources
    const ticketsNeedingInvoice: typeof allTickets = [];
    
    // 1. Invoice tickets in "Pending Invoice" status
    const invoiceType = ticketTypes.find(tt => tt.name === "Invoice");
    if (invoiceType) {
      const invoiceStatuses = await storage.getTicketTypeStatuses(invoiceType.id);
      const pendingStatus = invoiceStatuses.find(s => s.name === "Pending Invoice");
      if (pendingStatus) {
        const pendingInvoices = allTickets.filter(
          t => t.ticketTypeId === invoiceType.id && t.currentStatusId === pendingStatus.id
        );
        ticketsNeedingInvoice.push(...pendingInvoices);
      }
    }
    
    // 2. Project tickets at "Ready for Billing" status
    const projectType = ticketTypes.find(tt => tt.name === "Project");
    if (projectType) {
      const projectStatuses = await storage.getTicketTypeStatuses(projectType.id);
      const readyForBillingStatus = projectStatuses.find(s => s.name === "Ready for Billing");
      if (readyForBillingStatus) {
        const projectsReadyForBilling = allTickets.filter(
          t => t.ticketTypeId === projectType.id && t.currentStatusId === readyForBillingStatus.id
        );
        ticketsNeedingInvoice.push(...projectsReadyForBilling);
      }
    }
    
    // 3. To-Do tickets with invoice_required billing behavior at their final step (Done)
    // These represent Extra Billable work that's done and needs invoicing
    const toDoType = ticketTypes.find(tt => tt.name === "To-Do");
    if (toDoType) {
      const toDoStatuses = await storage.getTicketTypeStatuses(toDoType.id);
      const doneStatus = toDoStatuses.find(s => s.name === "Done");
      if (doneStatus) {
        // Filter for To-Do tickets that are done AND have invoice_required billing behavior
        const billableToDoCompleted = allTickets.filter(
          t => t.ticketTypeId === toDoType.id && 
               t.currentStatusId === doneStatus.id &&
               t.billingBehavior === "invoice_required"
        );
        ticketsNeedingInvoice.push(...billableToDoCompleted);
      }
    }

    // Enrich with customer info and linked source ticket
    const enrichedInvoices = await Promise.all(
      ticketsNeedingInvoice.map(async (ticket) => {
        const customer = ticket.customerId 
          ? await storage.getCustomerById(ticket.customerId, user.activeCompanyId)
          : null;
        const links = await storage.getTicketLinks(ticket.id);
        const ticketType = ticketTypes.find(tt => tt.id === ticket.ticketTypeId);
        
        // Find the source (billable) ticket if this is an Invoice ticket
        let sourceTicket = null;
        const sourceLink = links.find(l => l.linkType === "invoice_for" && l.targetTicketId === ticket.id);
        if (sourceLink) {
          sourceTicket = await storage.getTicketById(sourceLink.sourceTicketId, user.activeCompanyId);
        }
        
        return {
          ...ticket,
          customer,
          sourceTicket,
          ticketTypeName: ticketType?.name || "Unknown",
        };
      })
    );

    res.json(enrichedInvoices);
  });

  // Get ticket with full details (type, statuses, fields)
  app.get("/api/tickets/:id/details", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const ticket = await storage.getTicketById(req.params.id, user.activeCompanyId);
    
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }
    
    // Ops users can only view their assigned tickets
    if ((user.activeRole === "field_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied");
    }

    const [ticketType, statuses, fieldValues, statusHistory, comments, customer] = await Promise.all([
      storage.getTicketTypeById(ticket.ticketTypeId, user.activeCompanyId),
      storage.getTicketTypeStatuses(ticket.ticketTypeId),
      storage.getTicketFieldValues(ticket.id),
      storage.getTicketStatusHistory(ticket.id),
      storage.getTicketComments(ticket.id),
      ticket.customerId ? storage.getCustomerById(ticket.customerId, user.activeCompanyId) : null,
    ]);

    // Get fields for each status
    const statusesWithFields = await Promise.all(
      statuses.map(async (status) => ({
        ...status,
        fields: await storage.getTicketTypeFieldsByStatus(status.id),
      }))
    );

    // Get assigned user info if assigned
    let assignedUser = null;
    if (ticket.assignedToId) {
      assignedUser = await storage.getUserById(ticket.assignedToId);
    }

    // Get delegator user info if delegated
    let delegatedByUser = null;
    if (ticket.delegatedById) {
      delegatedByUser = await storage.getUserById(ticket.delegatedById);
    }

    // Get contract info and services if linked
    let contract = null;
    let contractServices: any[] = [];
    if (ticket.contractId) {
      contract = await storage.getContractById(ticket.contractId, user.activeCompanyId);
      contractServices = await storage.getContractServices(ticket.contractId, user.activeCompanyId);
    }

    // Get linked tickets
    const links = await storage.getTicketLinks(ticket.id);
    const linkedTickets = await Promise.all(
      links.map(async (link) => {
        const linkedId = link.sourceTicketId === ticket.id 
          ? link.targetTicketId 
          : link.sourceTicketId;
        const linkedTicket = await storage.getTicketById(linkedId, user.activeCompanyId);
        const linkedType = linkedTicket 
          ? await storage.getTicketTypeById(linkedTicket.ticketTypeId, user.activeCompanyId)
          : null;
        const linkedStatus = linkedTicket 
          ? await storage.getTicketTypeStatuses(linkedTicket.ticketTypeId)
              .then(statuses => statuses.find(s => s.id === linkedTicket.currentStatusId))
          : null;
        return {
          link,
          ticket: linkedTicket,
          ticketType: linkedType,
          currentStatus: linkedStatus,
          relationship: link.sourceTicketId === ticket.id ? "target" : "source",
        };
      })
    );

    res.json({
      ticket,
      ticketType,
      statuses: statusesWithFields,
      fieldValues,
      statusHistory,
      comments,
      customer,
      contract,
      contractServices,
      assignedUser: assignedUser ? { id: assignedUser.id, email: assignedUser.email } : null,
      delegatedByUser: delegatedByUser ? { id: delegatedByUser.id, email: delegatedByUser.email } : null,
      linkedTickets,
    });
  });

  // Customer Map Layers (KML) routes
  app.get("/api/customers/:customerId/map-layers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const layers = await storage.getCustomerMapLayers(req.params.customerId, user.activeCompanyId);
    res.json(layers);
  });

  app.post("/api/customers/:customerId/map-layers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertCustomerMapLayerSchema.safeParse({
      ...req.body,
      customerId: req.params.customerId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    try {
      // Validate that the color is not already in use for this customer
      const existingLayers = await storage.getCustomerMapLayers(req.params.customerId, user.activeCompanyId);
      const colorInUse = existingLayers.some(
        (layer) => layer.color.toUpperCase() === result.data.color.toUpperCase()
      );
      if (colorInUse) {
        return res.status(400).send("This color is already in use for another layer. Please select a different color.");
      }

      // Set ACL on the uploaded file to allow company members to read it
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(result.data.kmlPath);
      await setObjectAclPolicy(objectFile, {
        owner: user.id,
        visibility: "private",
        aclRules: [{
          group: {
            type: ObjectAccessGroupType.COMPANY_MEMBER,
            id: user.activeCompanyId,
          },
          permission: ObjectPermission.READ,
        }],
      });

      const layer = await storage.createCustomerMapLayer(result.data);
      res.json(layer);
    } catch (error) {
      console.error("Error creating map layer:", error);
      res.status(500).send("Failed to create map layer");
    }
  });

  app.patch("/api/customers/:customerId/map-layers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    const layer = await storage.updateCustomerMapLayer(req.params.id, user.activeCompanyId, req.body);
    if (!layer) {
      return res.status(404).send("Layer not found");
    }
    res.json(layer);
  });

  app.delete("/api/customers/:customerId/map-layers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    await storage.deleteCustomerMapLayer(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // KML file upload URL
  app.post("/api/customers/:customerId/map-layers/upload-url", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    const { fileName, contentType } = req.body;
    if (!fileName) {
      return res.status(400).send("fileName is required");
    }

    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    // The relative path within .private directory (without .private prefix)
    const relativePath = `map-layers/${user.activeCompanyId}/${req.params.customerId}/${timestamp}_${safeName}`;
    const objectPath = `.private/${relativePath}`;

    try {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        return res.status(500).send("Object storage not configured");
      }

      const uploadURL = await signObjectURL({
        bucketName: bucketId,
        objectName: objectPath,
        method: "PUT",
        ttlSec: 900,
      });

      // Return path in format expected by /objects/:objectPath(*) endpoint
      res.json({ uploadURL, objectPath: `/objects/${relativePath}` });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).send("Failed to generate upload URL");
    }
  });

  // Customer Map Documents (PDF) routes
  app.get("/api/customers/:customerId/map-documents", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const documents = await storage.getCustomerMapDocuments(req.params.customerId, user.activeCompanyId);
    res.json(documents);
  });

  app.post("/api/customers/:customerId/map-documents", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertCustomerMapDocumentSchema.safeParse({
      ...req.body,
      customerId: req.params.customerId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const document = await storage.createCustomerMapDocument(result.data);
    res.json(document);
  });

  app.delete("/api/customers/:customerId/map-documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    await storage.deleteCustomerMapDocument(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // PDF/document upload URL
  app.post("/api/customers/:customerId/map-documents/upload-url", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions");
    }

    const { fileName, contentType } = req.body;
    if (!fileName) {
      return res.status(400).send("fileName is required");
    }

    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const objectPath = `.private/map-documents/${user.activeCompanyId}/${req.params.customerId}/${timestamp}_${safeName}`;

    try {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        return res.status(500).send("Object storage not configured");
      }

      const uploadURL = await signObjectURL({
        bucketName: bucketId,
        objectName: objectPath,
        method: "PUT",
        ttlSec: 900,
      });

      res.json({ uploadURL, objectPath: `/${bucketId}/${objectPath}` });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).send("Failed to generate upload URL");
    }
  });

  // ============================================
  // MAINTENANCE SCHEDULING ROUTES
  // ============================================

  // Maintenance Crews routes
  app.get("/api/maintenance-crews", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const crews = await storage.getMaintenanceCrews(user.activeCompanyId);
    res.json(crews);
  });

  app.get("/api/maintenance-crews/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const crew = await storage.getMaintenanceCrewById(req.params.id, user.activeCompanyId);
    if (!crew) {
      return res.status(404).send("Crew not found");
    }
    res.json(crew);
  });

  app.post("/api/maintenance-crews", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertMaintenanceCrewSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const crew = await storage.createMaintenanceCrew(result.data);
    res.json(crew);
  });

  app.patch("/api/maintenance-crews/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const crew = await storage.updateMaintenanceCrew(req.params.id, user.activeCompanyId, req.body);
    if (!crew) {
      return res.status(404).send("Crew not found");
    }
    res.json(crew);
  });

  app.delete("/api/maintenance-crews/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteMaintenanceCrew(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Maintenance Visit Config routes (per-customer mowing config)
  app.get("/api/customers/:customerId/maintenance-config", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const config = await storage.getMaintenanceVisitConfig(req.params.customerId, user.activeCompanyId);
    res.json(config || null);
  });

  app.put("/api/customers/:customerId/maintenance-config", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertMaintenanceVisitConfigSchema.safeParse({
      ...req.body,
      customerId: req.params.customerId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    // Check if config exists - update or create
    const existing = await storage.getMaintenanceVisitConfig(req.params.customerId, user.activeCompanyId);
    let config;
    if (existing) {
      config = await storage.updateMaintenanceVisitConfig(existing.id, user.activeCompanyId, result.data);
    } else {
      config = await storage.createMaintenanceVisitConfig(result.data);
    }
    res.json(config);
  });

  // Get all maintenance visit configs for the company (for scheduler)
  app.get("/api/maintenance-visit-configs", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const configs = await storage.getMaintenanceVisitConfigs(user.activeCompanyId);
    res.json(configs);
  });

  // Weekly Schedule Template routes
  app.get("/api/schedule-templates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const templates = await storage.getWeeklyScheduleTemplates(user.activeCompanyId);
    res.json(templates);
  });

  app.get("/api/schedule-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const template = await storage.getWeeklyScheduleTemplateById(req.params.id, user.activeCompanyId);
    if (!template) {
      return res.status(404).send("Template not found");
    }
    res.json(template);
  });

  app.post("/api/schedule-templates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertWeeklyScheduleTemplateSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const template = await storage.createWeeklyScheduleTemplate(result.data);
    res.json(template);
  });

  app.patch("/api/schedule-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const template = await storage.updateWeeklyScheduleTemplate(req.params.id, user.activeCompanyId, req.body);
    if (!template) {
      return res.status(404).send("Template not found");
    }
    res.json(template);
  });

  app.delete("/api/schedule-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteWeeklyScheduleTemplate(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  app.post("/api/schedule-templates/:id/duplicate", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).send("Name is required");
    }

    try {
      const template = await storage.duplicateWeeklyScheduleTemplate(req.params.id, user.activeCompanyId, name.trim());
      res.json(template);
    } catch (error: any) {
      if (error.message === "Template not found") {
        return res.status(404).send("Template not found");
      }
      throw error;
    }
  });

  // Schedule Blocks routes (property assignments on schedule grid)
  app.get("/api/schedule-templates/:templateId/blocks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    // Verify template belongs to company
    const template = await storage.getWeeklyScheduleTemplateById(req.params.templateId, user.activeCompanyId);
    if (!template) {
      return res.status(404).send("Template not found");
    }
    
    const blocks = await storage.getScheduleBlocks(req.params.templateId);
    res.json(blocks);
  });

  app.post("/api/schedule-templates/:templateId/blocks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    // Verify template belongs to company
    const template = await storage.getWeeklyScheduleTemplateById(req.params.templateId, user.activeCompanyId);
    if (!template) {
      return res.status(404).send("Template not found");
    }

    const result = insertScheduleBlockSchema.safeParse({
      ...req.body,
      templateId: req.params.templateId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const block = await storage.createScheduleBlock(result.data);
    res.json(block);
  });

  app.patch("/api/schedule-blocks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const block = await storage.updateScheduleBlock(req.params.id, req.body);
    if (!block) {
      return res.status(404).send("Block not found");
    }
    res.json(block);
  });

  app.delete("/api/schedule-blocks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    if (user.activeRole === "field_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteScheduleBlock(req.params.id);
    res.status(200).send("Deleted");
  });

  // =====================
  // Ticket Notifications
  // =====================
  
  // Get all notifications for current user
  app.get("/api/notifications", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const notifications = await storage.getNotificationsByUser(user.id, user.activeCompanyId);
    res.json(notifications);
  });

  // Get unread notification count
  app.get("/api/notifications/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const count = await storage.getUnreadNotificationCount(user.id, user.activeCompanyId);
    res.json({ count });
  });

  // Mark single notification as read
  app.patch("/api/notifications/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const notification = await storage.markNotificationRead(req.params.id, user.id);
    if (!notification) {
      return res.status(404).send("Notification not found");
    }
    res.json(notification);
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    await storage.markAllNotificationsRead(user.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Reset for first-time setup (admin only) - clears all users so setup page appears
  app.post("/api/admin/reset-for-setup", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    // Must be admin role
    if (user.activeRole !== "admin") {
      return res.status(403).send("Only admins can reset for setup");
    }
    
    try {
      // Delete all users and company memberships
      await storage.deleteAllUsers();
      
      // Log the user out
      req.logout((err) => {
        if (err) {
          console.error("Error logging out after reset:", err);
        }
        res.json({ success: true, message: "All users deleted. You can now access the setup page." });
      });
    } catch (error) {
      console.error("Error resetting for setup:", error);
      res.status(500).send("Failed to reset for setup");
    }
  });

  // Admin migration: Fix estimate_request tickets that should be project work type
  // This updates tickets with work_type='estimate_request' that are in approved statuses
  app.post("/api/admin/migrate-estimate-to-project", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin") {
      return res.status(403).send("Only admins can run migrations");
    }
    
    try {
      // Get the Project ticket type
      const projectTicketType = await db
        .select()
        .from(ticketTypes)
        .where(eq(ticketTypes.name, "Project"))
        .limit(1);

      if (!projectTicketType.length) {
        return res.status(404).send("Project ticket type not found");
      }

      const projectTypeId = projectTicketType[0].id;

      // Get the approved-path statuses for Project workflow
      const approvedStatusNames = [
        "Ready to Schedule",
        "Work Completed", 
        "Ready for Billing",
        "Invoicing"
      ];

      const approvedStatuses = await db
        .select()
        .from(ticketTypeStatuses)
        .where(
          and(
            eq(ticketTypeStatuses.ticketTypeId, projectTypeId),
            inArray(ticketTypeStatuses.name, approvedStatusNames)
          )
        );

      const approvedStatusIds = approvedStatuses.map(s => s.id);

      // Find tickets that need to be updated
      const ticketsToUpdate = await db
        .select({
          id: tickets.id,
          title: tickets.title,
          workType: tickets.workType
        })
        .from(tickets)
        .where(
          and(
            eq(tickets.workType, "estimate_request"),
            inArray(tickets.currentStatusId, approvedStatusIds)
          )
        );

      if (ticketsToUpdate.length === 0) {
        return res.json({ 
          success: true, 
          message: "No tickets need to be updated",
          updatedCount: 0 
        });
      }

      // Update the tickets
      const ticketIds = ticketsToUpdate.map(t => t.id);
      
      await db
        .update(tickets)
        .set({ workType: "project" })
        .where(inArray(tickets.id, ticketIds));

      res.json({ 
        success: true, 
        message: `Updated ${ticketsToUpdate.length} tickets from 'estimate_request' to 'project' work type`,
        updatedCount: ticketsToUpdate.length,
        tickets: ticketsToUpdate.map(t => ({ id: t.id, title: t.title }))
      });
    } catch (error) {
      console.error("Error running estimate-to-project migration:", error);
      res.status(500).send("Failed to run migration");
    }
  });

  // =====================
  // Property Management Companies
  // =====================
  
  // Get all property management companies
  app.get("/api/property-management-companies", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const companies = await storage.getPropertyManagementCompanies(user.activeCompanyId);
    res.json(companies);
  });

  // Get single property management company
  app.get("/api/property-management-companies/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const company = await storage.getPropertyManagementCompanyById(req.params.id, user.activeCompanyId);
    if (!company) {
      return res.status(404).send("Property management company not found");
    }
    res.json(company);
  });

  // Create property management company
  app.post("/api/property-management-companies", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const company = await storage.createPropertyManagementCompany({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    res.json(company);
  });

  // Update property management company
  app.patch("/api/property-management-companies/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const company = await storage.updatePropertyManagementCompany(req.params.id, user.activeCompanyId, req.body);
    if (!company) {
      return res.status(404).send("Property management company not found");
    }
    res.json(company);
  });

  // Delete property management company
  app.delete("/api/property-management-companies/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin") {
      return res.status(403).send("Insufficient permissions");
    }
    
    await storage.deletePropertyManagementCompany(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // =====================
  // Property Managers
  // =====================
  
  // Get all property managers
  app.get("/api/property-managers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    // Optionally filter by property management company
    const propertyManagementCompanyId = req.query.propertyManagementCompanyId as string | undefined;
    
    let managers;
    if (propertyManagementCompanyId) {
      managers = await storage.getPropertyManagersByCompany(propertyManagementCompanyId, user.activeCompanyId);
    } else {
      managers = await storage.getPropertyManagers(user.activeCompanyId);
    }
    
    // Enrich managers with first email and phone from normalized tables
    const enrichedManagers = await Promise.all(managers.map(async (manager) => {
      const emails = await storage.getPropertyManagerEmails(manager.id, user.activeCompanyId);
      const phones = await storage.getPropertyManagerPhones(manager.id, user.activeCompanyId);
      const firstEmail = emails.length > 0 ? emails[0].email : manager.email;
      const firstPhone = phones.length > 0 ? phones[0].phone : manager.phone;
      return { ...manager, email: firstEmail, phone: firstPhone };
    }));
    
    res.json(enrichedManagers);
  });

  // Get single property manager
  app.get("/api/property-managers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const manager = await storage.getPropertyManagerById(req.params.id, user.activeCompanyId);
    if (!manager) {
      return res.status(404).send("Property manager not found");
    }
    res.json(manager);
  });

  // Create property manager
  app.post("/api/property-managers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const manager = await storage.createPropertyManager({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    res.json(manager);
  });

  // Update property manager
  app.patch("/api/property-managers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const manager = await storage.updatePropertyManager(req.params.id, user.activeCompanyId, req.body);
    if (!manager) {
      return res.status(404).send("Property manager not found");
    }
    res.json(manager);
  });

  // Delete property manager
  app.delete("/api/property-managers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin") {
      return res.status(403).send("Insufficient permissions");
    }
    
    await storage.deletePropertyManager(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Get property manager with all contact info (emails and phones)
  app.get("/api/property-managers/:id/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    const managerWithContacts = await storage.getPropertyManagerWithContacts(req.params.id, user.activeCompanyId);
    if (!managerWithContacts) {
      return res.status(404).send("Property manager not found");
    }
    res.json(managerWithContacts);
  });

  // Property Manager Emails
  app.get("/api/property-managers/:managerId/emails", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    const emails = await storage.getPropertyManagerEmails(req.params.managerId, user.activeCompanyId);
    res.json(emails);
  });

  app.post("/api/property-managers/:managerId/emails", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const email = await storage.createPropertyManagerEmail({
      ...req.body,
      propertyManagerId: req.params.managerId,
      companyId: user.activeCompanyId,
    });
    res.json(email);
  });

  app.patch("/api/property-manager-emails/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const email = await storage.updatePropertyManagerEmail(req.params.id, user.activeCompanyId, req.body);
    if (!email) {
      return res.status(404).send("Email not found");
    }
    res.json(email);
  });

  app.delete("/api/property-manager-emails/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    await storage.deletePropertyManagerEmail(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Property Manager Phones
  app.get("/api/property-managers/:managerId/phones", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    const phones = await storage.getPropertyManagerPhones(req.params.managerId, user.activeCompanyId);
    res.json(phones);
  });

  app.post("/api/property-managers/:managerId/phones", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const phone = await storage.createPropertyManagerPhone({
      ...req.body,
      propertyManagerId: req.params.managerId,
      companyId: user.activeCompanyId,
    });
    res.json(phone);
  });

  app.patch("/api/property-manager-phones/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const phone = await storage.updatePropertyManagerPhone(req.params.id, user.activeCompanyId, req.body);
    if (!phone) {
      return res.status(404).send("Phone not found");
    }
    res.json(phone);
  });

  app.delete("/api/property-manager-phones/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    await storage.deletePropertyManagerPhone(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Bulk update property manager contacts (replaces all emails and phones)
  app.put("/api/property-managers/:id/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Insufficient permissions");
    }
    
    const { emails, phones } = req.body;
    const managerId = req.params.id;
    const companyId = user.activeCompanyId;
    
    // Verify manager exists
    const manager = await storage.getPropertyManagerById(managerId, companyId);
    if (!manager) {
      return res.status(404).send("Property manager not found");
    }
    
    // Delete existing emails and phones
    await storage.deletePropertyManagerEmailsByManager(managerId, companyId);
    await storage.deletePropertyManagerPhonesByManager(managerId, companyId);
    
    // Create new emails
    const createdEmails = [];
    if (emails && Array.isArray(emails)) {
      for (const email of emails) {
        const created = await storage.createPropertyManagerEmail({
          propertyManagerId: managerId,
          companyId,
          email: email.email,
          isPrimary: email.isPrimary || "false",
        });
        createdEmails.push(created);
      }
    }
    
    // Create new phones
    const createdPhones = [];
    if (phones && Array.isArray(phones)) {
      for (const phone of phones) {
        const created = await storage.createPropertyManagerPhone({
          propertyManagerId: managerId,
          companyId,
          phone: phone.phone,
          phoneType: phone.phoneType || "company",
          isPrimary: phone.isPrimary || "false",
        });
        createdPhones.push(created);
      }
    }
    
    res.json({ emails: createdEmails, phones: createdPhones });
  });

  // =============================================================================
  // EQUIPMENT MANAGEMENT ROUTES
  // =============================================================================
  
  // Helper function to check equipment access permissions
  const canAccessEquipment = (role: string) => ["admin", "shop_manager", "office"].includes(role);
  // Office can create and edit equipment
  const canEditEquipment = (role: string) => ["admin", "shop_manager", "office"].includes(role);
  // Admin, Office, and Shop Manager can retire or delete equipment
  const canRetireOrDeleteEquipment = (role: string) => ["admin", "office", "shop_manager"].includes(role);

  // Get all equipment (Admin, Shop Manager, Office)
  app.get("/api/equipment", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const equipmentList = await storage.getEquipmentWithTicketCounts(user.activeCompanyId);
    res.json(equipmentList);
  });

  // Get single equipment by ID (Admin, Shop Manager, Office)
  app.get("/api/equipment/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const equipmentItem = await storage.getEquipmentById(req.params.id, user.activeCompanyId);
    if (!equipmentItem) {
      return res.status(404).send("Equipment not found");
    }
    res.json(equipmentItem);
  });

  // Create equipment (Admin, Shop Manager, Office)
  app.post("/api/equipment", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    // Office cannot create equipment with retired status
    if (req.body.status === "retired" && !canRetireOrDeleteEquipment(user.activeRole)) {
      return res.status(403).send("Only Admin and Shop Manager can create equipment with retired status");
    }
    
    const parsed = insertEquipmentSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    
    const equipmentItem = await storage.createEquipment(parsed.data);
    res.status(201).json(equipmentItem);
  });

  // Update equipment (Admin, Shop Manager, Office - but Office cannot set status to retired)
  app.patch("/api/equipment/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    // Office cannot change status to retired
    if (req.body.status === "retired" && !canRetireOrDeleteEquipment(user.activeRole)) {
      return res.status(403).send("Only Admin and Shop Manager can retire equipment");
    }
    
    const equipmentItem = await storage.updateEquipment(req.params.id, user.activeCompanyId, req.body);
    if (!equipmentItem) {
      return res.status(404).send("Equipment not found");
    }
    res.json(equipmentItem);
  });

  // Delete equipment (Admin, Shop Manager only)
  app.delete("/api/equipment/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canRetireOrDeleteEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    await storage.deleteEquipment(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Get main tickets linked to this equipment (Shop to-do tickets)
  app.get("/api/equipment/:id/linked-tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const linkedTickets = await storage.getTicketsByEquipmentId(req.params.id, user.activeCompanyId);
    res.json(linkedTickets);
  });

  // Equipment Files - Get files for equipment
  app.get("/api/equipment/:equipmentId/files", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const files = await storage.getEquipmentFiles(req.params.equipmentId, user.activeCompanyId);
    res.json(files);
  });

  // Equipment Files - Upload URL generation
  app.post("/api/equipment/:equipmentId/files/upload-url", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadUrl: uploadURL, storagePath: normalizedPath });
    } catch (error) {
      console.error("Error getting equipment file upload URL:", error);
      res.status(500).send("Failed to get upload URL");
    }
  });

  // Equipment Files - Create file record after upload
  app.post("/api/equipment/:equipmentId/files", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const parsed = insertEquipmentFileSchema.safeParse({
      ...req.body,
      equipmentId: req.params.equipmentId,
      companyId: user.activeCompanyId,
      uploadedById: user.id,
    });
    
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    
    try {
      // Set ACL for the file
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(parsed.data.storagePath);
      await setObjectAclPolicy(objectFile, {
        owner: user.id,
        visibility: "private",
        aclRules: [{
          group: {
            type: ObjectAccessGroupType.COMPANY_MEMBER,
            id: user.activeCompanyId,
          },
          permission: ObjectPermission.READ,
        }],
      });
      
      const file = await storage.createEquipmentFile(parsed.data);
      res.status(201).json(file);
    } catch (error) {
      console.error("Error creating equipment file:", error);
      res.status(500).send("Failed to create equipment file");
    }
  });

  // Equipment Files - Delete file
  app.delete("/api/equipment/:equipmentId/files/:fileId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    await storage.deleteEquipmentFile(req.params.fileId, user.activeCompanyId);
    res.json({ success: true });
  });

  // Equipment Tickets - Get all tickets (with optional filters)
  app.get("/api/equipment-tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const filters: { equipmentId?: string; status?: string; assignedToId?: string } = {};
    if (req.query.equipmentId) filters.equipmentId = req.query.equipmentId as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.assignedToId) filters.assignedToId = req.query.assignedToId as string;
    
    const tickets = await storage.getEquipmentTickets(user.activeCompanyId, filters);
    res.json(tickets);
  });

  // Equipment Tickets - Get by equipment ID
  app.get("/api/equipment/:equipmentId/tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const tickets = await storage.getEquipmentTicketsByEquipmentId(req.params.equipmentId, user.activeCompanyId);
    res.json(tickets);
  });

  // Equipment Tickets - Get single ticket
  app.get("/api/equipment-tickets/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const ticket = await storage.getEquipmentTicketById(req.params.id, user.activeCompanyId);
    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }
    res.json(ticket);
  });

  // Equipment Tickets - Create ticket
  app.post("/api/equipment-tickets", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const parsed = insertEquipmentTicketSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
      reportedById: user.id,
      assignedToId: req.body.assignedToId || user.id,
    });
    
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    
    const ticket = await storage.createEquipmentTicket(parsed.data);
    
    // Create initial status history
    await storage.createEquipmentTicketStatusHistory({
      ticketId: ticket.id,
      fromStatus: null,
      toStatus: ticket.status,
      changedById: user.id,
      notes: "Ticket created",
    });
    
    res.status(201).json(ticket);
  });

  // Equipment Tickets - Update ticket
  app.patch("/api/equipment-tickets/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    // Get current ticket to track status changes
    const currentTicket = await storage.getEquipmentTicketById(req.params.id, user.activeCompanyId);
    if (!currentTicket) {
      return res.status(404).send("Ticket not found");
    }
    
    // If status is changing to completed or closed, require workPerformedNotes
    const newStatus = req.body.status;
    if ((newStatus === "completed" || newStatus === "closed") && !req.body.workPerformedNotes && !currentTicket.workPerformedNotes) {
      return res.status(400).json({ error: "Work performed notes are required when completing or closing a ticket" });
    }
    
    // Set timestamps for status changes
    const updates = { ...req.body };
    if (newStatus === "completed" && !currentTicket.completedAt) {
      updates.completedAt = new Date();
    }
    if (newStatus === "closed" && !currentTicket.closedAt) {
      updates.closedAt = new Date();
    }
    
    const ticket = await storage.updateEquipmentTicket(req.params.id, user.activeCompanyId, updates);
    
    // Create status history if status changed
    if (newStatus && newStatus !== currentTicket.status) {
      await storage.createEquipmentTicketStatusHistory({
        ticketId: ticket!.id,
        fromStatus: currentTicket.status,
        toStatus: newStatus,
        changedById: user.id,
        notes: req.body.statusChangeNotes || null,
      });
    }
    
    res.json(ticket);
  });

  // Equipment Tickets - Delete ticket
  app.delete("/api/equipment-tickets/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    await storage.deleteEquipmentTicket(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Equipment Ticket Status History
  app.get("/api/equipment-tickets/:ticketId/history", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    
    if (!canAccessEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    
    const history = await storage.getEquipmentTicketStatusHistory(req.params.ticketId);
    res.json(history);
  });

  // ── Snow Events ──────────────────────────────────────────────────────
  const canAccessSnow = (role: string) => ["admin", "office", "field_manager"].includes(role);
  const canEditSnow = (role: string) => ["admin", "office"].includes(role);

  app.get("/api/snow-events", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const events = await storage.getSnowEvents(user.activeCompanyId);
    res.json(events);
  });

  app.get("/api/snow-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const event = await storage.getSnowEventById(req.params.id, user.activeCompanyId);
    if (!event) return res.status(404).send("Snow event not found");
    res.json(event);
  });

  app.post("/api/snow-events", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const eventName = req.body.eventName || `Snow Event - ${new Date(req.body.eventStartDateTime).toISOString().split('T')[0]}`;
    const result = insertSnowEventSchema.safeParse({
      ...req.body,
      eventName,
      companyId: user.activeCompanyId,
      createdByUserId: user.id,
      eventStartDateTime: req.body.eventStartDateTime ? new Date(req.body.eventStartDateTime) : undefined,
      eventEndDateTime: req.body.eventEndDateTime ? new Date(req.body.eventEndDateTime) : undefined,
    });
    if (!result.success) return res.status(400).send(result.error.message);
    const event = await storage.createSnowEvent(result.data);
    res.json(event);
  });

  app.patch("/api/snow-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const existing = await storage.getSnowEventById(req.params.id, user.activeCompanyId);
    if (!existing) return res.status(404).send("Snow event not found");
    if (existing.status === "locked") return res.status(400).send("Cannot edit a locked event");
    
    const updates = { ...req.body };
    if (updates.eventStartDateTime) updates.eventStartDateTime = new Date(updates.eventStartDateTime);
    if (updates.eventEndDateTime) updates.eventEndDateTime = new Date(updates.eventEndDateTime);
    const event = await storage.updateSnowEvent(req.params.id, user.activeCompanyId, updates);
    res.json(event);
  });

  app.post("/api/snow-events/:id/lock", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const existing = await storage.getSnowEventById(req.params.id, user.activeCompanyId);
    if (!existing) return res.status(404).send("Snow event not found");
    
    const event = await storage.updateSnowEvent(req.params.id, user.activeCompanyId, { status: "locked" });
    res.json(event);
  });

  app.delete("/api/snow-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const existing = await storage.getSnowEventById(req.params.id, user.activeCompanyId);
    if (!existing) return res.status(404).send("Snow event not found");
    if (existing.status === "locked") return res.status(400).send("Cannot delete a locked event");
    
    await storage.deleteSnowEvent(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Snow Event Attachments
  app.get("/api/snow-events/:eventId/attachments", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const attachments = await storage.getSnowEventAttachments(req.params.eventId, user.activeCompanyId);
    res.json(attachments);
  });

  app.post("/api/snow-events/:eventId/attachments", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const result = insertSnowEventAttachmentSchema.safeParse({
      ...req.body,
      snowEventId: req.params.eventId,
      companyId: user.activeCompanyId,
      uploadedByUserId: user.id,
    });
    if (!result.success) return res.status(400).send(result.error.message);
    const attachment = await storage.createSnowEventAttachment(result.data);
    res.json(attachment);
  });

  app.delete("/api/snow-events/:eventId/attachments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    await storage.deleteSnowEventAttachment(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Snow Event Property Impacts
  app.get("/api/snow-events/:eventId/impacts", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const impacts = await storage.getSnowEventPropertyImpacts(req.params.eventId, user.activeCompanyId);
    res.json(impacts);
  });

  app.get("/api/customers/:customerId/snow-impacts", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const impacts = await storage.getSnowEventPropertyImpactsByCustomer(req.params.customerId, user.activeCompanyId);
    res.json(impacts);
  });

  app.post("/api/snow-events/:eventId/impacts", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const existing = await storage.getSnowEventById(req.params.eventId, user.activeCompanyId);
    if (!existing) return res.status(404).send("Snow event not found");
    if (existing.status === "locked") return res.status(400).send("Cannot modify a locked event");
    
    const result = insertSnowEventPropertyImpactSchema.safeParse({
      ...req.body,
      snowEventId: req.params.eventId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) return res.status(400).send(result.error.message);
    const impact = await storage.createSnowEventPropertyImpact(result.data);
    res.json(impact);
  });

  app.post("/api/snow-events/:eventId/impacts/bulk", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const existing = await storage.getSnowEventById(req.params.eventId, user.activeCompanyId);
    if (!existing) return res.status(404).send("Snow event not found");
    if (existing.status === "locked") return res.status(400).send("Cannot modify a locked event");
    
    const { customerIds, serviceTypes } = req.body;
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).send("customerIds array is required");
    }
    
    const existingImpacts = await storage.getSnowEventPropertyImpacts(req.params.eventId, user.activeCompanyId);
    const existingCustomerIds = new Set(existingImpacts.map(i => i.customerId));
    
    const created = [];
    for (const customerId of customerIds) {
      if (existingCustomerIds.has(customerId)) continue;
      const impact = await storage.createSnowEventPropertyImpact({
        snowEventId: req.params.eventId,
        companyId: user.activeCompanyId,
        customerId,
        serviceTypes: serviceTypes || [],
        billingStatus: "not_created",
      });
      created.push(impact);
    }
    res.json(created);
  });

  app.patch("/api/snow-events/:eventId/impacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const existing = await storage.getSnowEventById(req.params.eventId, user.activeCompanyId);
    if (!existing) return res.status(404).send("Snow event not found");
    if (existing.status === "locked") return res.status(400).send("Cannot modify a locked event");
    
    const impact = await storage.updateSnowEventPropertyImpact(req.params.id, user.activeCompanyId, req.body);
    res.json(impact);
  });

  app.delete("/api/snow-events/:eventId/impacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const existing = await storage.getSnowEventById(req.params.eventId, user.activeCompanyId);
    if (!existing) return res.status(404).send("Snow event not found");
    if (existing.status === "locked") return res.status(400).send("Cannot modify a locked event");
    
    await storage.deleteSnowEventPropertyImpact(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  // Generate Snow Tickets
  app.post("/api/snow-events/:eventId/generate-tickets", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEditSnow(user.activeRole)) return res.status(403).send("Insufficient permissions");
    
    const event = await storage.getSnowEventById(req.params.eventId, user.activeCompanyId);
    if (!event) return res.status(404).send("Snow event not found");
    if (event.status === "locked") return res.status(400).send("Event is locked");
    
    const impacts = await storage.getSnowEventPropertyImpacts(req.params.eventId, user.activeCompanyId);
    const toGenerate = impacts.filter(i => i.billingStatus === "not_created");
    
    if (toGenerate.length === 0) {
      return res.status(400).send("No properties pending ticket creation");
    }
    
    const allTicketTypes = await storage.getTicketTypes(user.activeCompanyId);
    const invoiceType = allTicketTypes.find(t => t.name === "Invoice" || t.name === "invoice");
    if (!invoiceType) {
      return res.status(400).send("No 'Invoice' ticket type found. Please create one first.");
    }
    
    const statuses = await storage.getTicketTypeStatuses(invoiceType.id);
    if (statuses.length === 0) {
      return res.status(400).send("Invoice ticket type has no statuses");
    }
    const initialStatus = statuses.sort((a, b) => a.displayOrder - b.displayOrder)[0];
    
    const dateStr = new Date(event.eventStartDateTime).toISOString().split('T')[0];
    const created = [];
    
    for (const impact of toGenerate) {
      const title = `Snow Event (${event.snowRange}) - ${impact.customerName} - ${dateStr}`;
      const services = (impact.serviceTypes || []).join(", ") || "N/A";
      const description = [
        `Storm Date: ${dateStr}`,
        `Accumulation: ${event.snowRange}`,
        event.reportedTotalInches ? `Reported Total: ${event.reportedTotalInches}"` : null,
        `Services: ${services}`,
        event.eventNotes ? `Event Notes: ${event.eventNotes}` : null,
        impact.siteNotes ? `Site Notes: ${impact.siteNotes}` : null,
      ].filter(Boolean).join("\n");
      
      const ticket = await storage.createTicket({
        companyId: user.activeCompanyId,
        ticketTypeId: invoiceType.id,
        currentStatusId: initialStatus.id,
        title,
        description,
        customerId: impact.customerId,
        assignedToId: user.id,
        createdById: user.id,
        workType: "contract_work",
        invoiceCategory: "snow",
      });
      
      await storage.updateSnowEventPropertyImpact(impact.id, user.activeCompanyId, {
        billingStatus: "ticket_created",
        ticketId: ticket.id,
      });
      
      created.push(ticket);
    }
    
    if (event.status === "draft") {
      await storage.updateSnowEvent(req.params.eventId, user.activeCompanyId, { status: "ready" });
    }
    
    res.json({ created: created.length, tickets: created });
  });

  // ===== EMAIL MANAGEMENT ROUTES =====
  
  // Get email templates for company
  app.get("/api/email-templates", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Admin or office role required");
    }
    const templates = await storage.getEmailTemplates(user.activeCompanyId);
    res.json(templates);
  });
  
  // Update email template
  app.patch("/api/email-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin") {
      return res.status(403).send("Admin role required");
    }
    const result = insertEmailTemplateSchema.partial().omit({ companyId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }
    const template = await storage.updateEmailTemplate(req.params.id, user.activeCompanyId, result.data);
    if (!template) return res.status(404).send("Template not found");
    res.json(template);
  });
  
  // Get email rules for company
  app.get("/api/email-rules", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Admin or office role required");
    }
    const rules = await storage.getEmailRules(user.activeCompanyId);
    res.json(rules);
  });
  
  // Update email rule (enable/disable)
  app.patch("/api/email-rules/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin") {
      return res.status(403).send("Admin role required");
    }
    const result = insertEmailRuleSchema.partial().omit({ companyId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }
    const rule = await storage.updateEmailRule(req.params.id, user.activeCompanyId, result.data);
    if (!rule) return res.status(404).send("Rule not found");
    res.json(rule);
  });
  
  // Get email logs (filterable by ticket, customer, status)
  app.get("/api/email-logs", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Admin or office role required");
    }
    const filters: any = {};
    if (req.query.ticketId) filters.ticketId = req.query.ticketId as string;
    if (req.query.customerId) filters.customerId = req.query.customerId as string;
    if (req.query.status) filters.status = req.query.status as string;
    const logs = await storage.getEmailLogs(user.activeCompanyId, filters);
    res.json(logs);
  });
  
  // Resend an email (admin only)
  app.post("/api/email-logs/:id/resend", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin") {
      return res.status(403).send("Admin role required");
    }
    try {
      const log = await resendEmail(req.params.id, user.activeCompanyId, user.id);
      if (!log) return res.status(404).send("Email log not found");
      res.json(log);
    } catch (err: any) {
      console.error("Failed to resend email:", err);
      res.status(500).send("Failed to resend email");
    }
  });

  // Seed default email templates and rules
  async function seedEmailTemplatesAndRules(companyId: string) {
    try {
      const existing = await storage.getEmailTemplateByName('Work Completed Notification', companyId);
      if (existing) return; // Already seeded
      
      const defaultTemplate = getDefaultWorkCompletedTemplate();
      const template = await storage.createEmailTemplate({
        ...defaultTemplate,
        companyId,
      });
      
      await storage.createEmailRule({
        companyId,
        eventKey: 'ticket.work_completed',
        templateId: template.id,
        conditionsJson: null,
        isEnabled: true,
      });
      
      console.log(`Seeded default email template and rule for company ${companyId}`);
    } catch (err) {
      console.error("Failed to seed email templates:", err);
    }
  }

  // Seed email templates for all companies on startup
  try {
    const allCompanies = await storage.getCompanies();
    for (const company of allCompanies) {
      await seedEmailTemplatesAndRules(company.id);
    }
  } catch (err) {
    console.error("Failed to seed email templates on startup:", err);
  }

  const httpServer = createServer(app);

  return httpServer;
}
