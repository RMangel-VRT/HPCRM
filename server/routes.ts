import express from "express";
import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { promises as fs } from "fs";
import { setupAuth, type UserWithContext } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { insertCustomerSchema, insertContactSchema, insertCompanySchema, insertCompanyUserSchema, insertSettingsSchema, insertNoteSchema, insertContractSchema, insertContractDocumentSchema, insertContractBuilderDocumentSchema, insertContractBuilderSectionSchema, insertContractBuilderVariableSchema, insertTicketTypeSchema, insertTicketTypeStatusSchema, insertTicketTypeFieldSchema, insertTicketSchema, insertTicketFieldValueSchema, insertTicketStatusHistorySchema, insertTicketCommentSchema, insertTicketLinkSchema, insertCustomerMapLayerSchema, insertCustomerMapDocumentSchema, insertMaintenanceCrewSchema, insertMaintenanceVisitConfigSchema, insertWeeklyScheduleTemplateSchema, insertScheduleBlockSchema, insertEquipmentSchema, insertEquipmentFileSchema, insertEquipmentTicketSchema, insertEquipmentTicketStatusHistorySchema, insertSnowEventSchema, insertSnowEventPropertyImpactSchema, insertSnowEventAttachmentSchema, insertEmailTemplateSchema, insertEmailRuleSchema, SNOW_RANGES, tickets, ticketLinks, ticketTypes, ticketTypeStatuses, customers as customersTable, contacts as contactsTable, contracts as contractsTable, equipment as equipmentTable, users as usersTable, contractMonthlyAmounts, contractDocuments, contractServices, contractStatusHistory, companyUsers as companyUsersTable, insertCommunicationSchema } from "@shared/schema";
import type { Customer, CaptureParams, CampaignItem, Season, InsertCommunication } from "@shared/schema";
import { insertCommunicationTemplateSchema } from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient, signObjectURL } from "./objectStorage";
import { ObjectPermission, ObjectAccessGroupType, setObjectAclPolicy } from "./objectAcl";
import { processEmailEvent, resendEmail, sendEmail, getDefaultWorkCompletedTemplate, getDefaultChemicalPreNoticeTemplate, getDefaultChemicalPostNoticeTemplate } from './services/emailService';
import heicConvert from 'heic-convert';
import { renderVisualScope, type ExportType } from "./visualScopeRenderer";

// Seed sample communications for a company (used during server bootstrap and via API)
async function seedCommunications(companyId: string, sentById: string, _sentByName: string): Promise<number> {
  const companyCustomers = await storage.getCustomers(companyId);
  const seedData: InsertCommunication[] = [
    {
      companyId,
      customerId: companyCustomers[0]?.id ?? null,
      sentById,
      type: "email",
      status: "sent",
      subject: "Spring Service Schedule Confirmation",
      body: "Dear valued customer,\n\nWe are pleased to confirm your spring maintenance schedule starting April 1st. Our crew will arrive between 8am-10am on your designated service day.\n\nPlease let us know if you have any questions.\n\nBest regards,\nHigh Plains Property Maintenance",
      sentAt: new Date("2026-03-15T10:00:00Z"),
    },
    {
      companyId,
      customerId: companyCustomers[1]?.id ?? null,
      sentById,
      type: "sms",
      status: "sent",
      subject: "Crew arriving today",
      body: "Hi! Your maintenance crew will arrive in about 30 minutes. Please ensure gate access is available.",
      sentAt: new Date("2026-03-18T08:30:00Z"),
    },
    {
      companyId,
      customerId: companyCustomers[2]?.id ?? null,
      sentById,
      type: "note",
      status: "sent",
      subject: "Customer Meeting Notes",
      body: "Met with property manager to discuss irrigation concerns on the east lawn. They want to upgrade sprinkler heads in sections 3-5 before summer. Will follow up with proposal next week.",
      sentAt: new Date("2026-03-20T14:00:00Z"),
    },
    {
      companyId,
      customerId: companyCustomers[0]?.id ?? null,
      sentById,
      type: "email",
      status: "draft",
      subject: "Summer Services Proposal Follow-Up",
      body: "Hi,\n\nI wanted to follow up on our conversation about adding summer fertilization to your service package. I've attached our updated pricing for your review.\n\nLooking forward to your feedback!\n\nBest,\nHigh Plains Property Maintenance",
      sentAt: null,
    },
    {
      companyId,
      customerId: companyCustomers[3]?.id ?? null,
      sentById,
      type: "letter",
      status: "sent",
      subject: "Annual Contract Renewal Notice",
      body: "Dear Property Owner,\n\nYour current maintenance contract is scheduled to expire on June 30, 2026. We would like to invite you to renew for another year at your current service level.\n\nEnclosed please find the renewal agreement for your signature. Please return by May 15, 2026 to ensure uninterrupted service.\n\nSincerely,\nHigh Plains Property Maintenance",
      sentAt: new Date("2026-03-10T09:00:00Z"),
    },
    {
      companyId,
      customerId: companyCustomers[1]?.id ?? null,
      sentById,
      type: "email",
      status: "scheduled",
      subject: "Monthly Service Report - March 2026",
      body: "Please find attached your monthly service report for March 2026. This includes a summary of all maintenance activities performed, chemical applications, and upcoming scheduled work.\n\nHave a great day!",
      sentAt: null,
      scheduledFor: new Date("2026-04-01T08:00:00Z"),
    },
    {
      companyId,
      customerId: companyCustomers[4]?.id ?? null,
      sentById,
      type: "sms",
      status: "sent",
      subject: "Service cancellation notice",
      body: "Hi! Due to incoming weather, today's scheduled service has been postponed to Thursday. We apologize for any inconvenience.",
      sentAt: new Date("2026-03-22T07:00:00Z"),
    },
    {
      companyId,
      customerId: companyCustomers[2]?.id ?? null,
      sentById,
      type: "note",
      status: "draft",
      subject: "Follow-up on irrigation proposal",
      body: "Need to call back property manager about the irrigation upgrade proposal sent last week. They had questions about the warranty on the new heads.",
      sentAt: null,
    },
  ];
  const created = await Promise.all(seedData.map((data) => storage.createCommunication(data)));
  return created.length;
}

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
  
  // Define the 10-step Project workflow (Create Proposal + Proposal Sent replace Estimate Sent)
  const projectStatuses = [
    { name: "New", description: "Request captured - pending estimate", color: "#6366f1", order: 0, isFinal: "false" as const },
    { name: "Estimating", description: "Estimate being prepared in QuickBooks", color: "#8b5cf6", order: 1, isFinal: "false" as const },
    { name: "Create Proposal", description: "Build the proposal document in this system", color: "#8b5cf6", order: 2, isFinal: "false" as const },
    { name: "Proposal Sent", description: "Proposal delivered to customer, awaiting decision", color: "#f59e0b", order: 3, isFinal: "false" as const },
    { name: "Decision Received", description: "Customer decision received", color: "#eab308", order: 4, isFinal: "false" as const },
    { name: "Ready to Schedule", description: "Approved - needs to be scheduled with crew", color: "#f472b6", order: 5, isFinal: "false" as const },
    { name: "Work Completed", description: "Execution task completed - ready for billing review", color: "#10b981", order: 6, isFinal: "false" as const },
    { name: "Ready for Billing", description: "Work verified complete - create invoice", color: "#06b6d4", order: 7, isFinal: "false" as const },
    { name: "Invoicing", description: "Invoice created in QuickBooks", color: "#22c55e", order: 8, isFinal: "true" as const },
    { name: "Closed - Lost", description: "Project declined or cancelled", color: "#ef4444", order: 9, isFinal: "true" as const },
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
      statusName: "Proposal Sent",
      fields: [
        { fieldKey: "proposal_sent_date", fieldLabel: "Date Proposal Sent", fieldType: "date", isRequired: "true" },
        { fieldKey: "proposal_delivery_method", fieldLabel: "Delivery Method", fieldType: "select", isRequired: "true", options: ["Email", "QBO Portal", "Hard Copy", "Other"] },
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
      fields: []
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

// Helper to ensure Extra Billable ticket type exists with scheduling workflow
async function ensureExtraBillableTicketType(companyId: string): Promise<{ 
  typeId: string; 
  statuses: Map<string, string>;
} | null> {
  const ticketTypes = await storage.getTicketTypes(companyId);
  let ebType = ticketTypes.find(tt => tt.name === "Extra Billable");
  
  if (!ebType) {
    ebType = await storage.createTicketType({
      companyId,
      name: "Extra Billable",
      description: "Work outside the contract scope - must be scheduled, completed, and invoiced",
      category: "service",
      icon: "receipt",
      color: "#f59e0b",
      isActive: "true",
    });
    console.log(`Created Extra Billable ticket type for company ${companyId}`);
  }
  
  const ebStatuses = [
    { name: "New", description: "Extra work request received", color: "#6366f1", order: 0, isFinal: "false" as const },
    { name: "Ready to Schedule", description: "Approved - needs to be scheduled with crew", color: "#f472b6", order: 1, isFinal: "false" as const },
    { name: "In Progress", description: "Work is underway", color: "#3b82f6", order: 2, isFinal: "false" as const },
    { name: "Work Completed", description: "Field work finished - pending billing", color: "#10b981", order: 3, isFinal: "false" as const },
    { name: "Ready for Billing", description: "Work verified complete - create invoice", color: "#06b6d4", order: 4, isFinal: "false" as const },
    { name: "Done", description: "Invoice created - ticket closed", color: "#22c55e", order: 5, isFinal: "true" as const },
  ];
  
  let existingStatuses = await storage.getTicketTypeStatuses(ebType.id);
  const statusMap = new Map<string, string>();
  
  for (const statusDef of ebStatuses) {
    let status = existingStatuses.find(s => s.name === statusDef.name);
    if (!status) {
      status = await storage.createTicketTypeStatus({
        ticketTypeId: ebType.id,
        name: statusDef.name,
        description: statusDef.description,
        displayOrder: statusDef.order,
        color: statusDef.color,
        isFinal: statusDef.isFinal,
      });
      console.log(`Created status "${statusDef.name}" for Extra Billable type`);
    }
    statusMap.set(status.name, status.id);
  }
  
  // Define fields for Work Completed status
  const existingFields = await storage.getTicketTypeFields(ebType.id);
  const existingFieldKeys = new Set(existingFields.map(f => f.fieldKey));
  
  const workCompletedStatusId = statusMap.get("Work Completed");
  if (workCompletedStatusId) {
    const fieldDefs = [
      { fieldKey: "completion_date", fieldLabel: "Completion Date", fieldType: "date", isRequired: "false", displayOrder: 0 },
      { fieldKey: "actual_hours", fieldLabel: "Actual Hours", fieldType: "number", isRequired: "false", displayOrder: 1 },
      { fieldKey: "completion_notes", fieldLabel: "Completion Notes", fieldType: "textarea", isRequired: "false", displayOrder: 2 },
    ];
    
    for (const fieldDef of fieldDefs) {
      if (!existingFieldKeys.has(fieldDef.fieldKey)) {
        await storage.createTicketTypeField({
          ticketTypeId: ebType.id,
          statusId: workCompletedStatusId,
          fieldKey: fieldDef.fieldKey,
          fieldLabel: fieldDef.fieldLabel,
          fieldType: fieldDef.fieldType,
          isRequired: fieldDef.isRequired as "true" | "false",
          options: [],
          displayOrder: fieldDef.displayOrder,
        });
        console.log(`Created field "${fieldDef.fieldKey}" for Extra Billable Work Completed status`);
      }
    }
  }
  
  console.log(`Extra Billable ticket type setup complete for company ${companyId}`);
  return { typeId: ebType.id, statuses: statusMap };
}

// Helper to ensure "Project (No Estimate)" ticket type exists
// For approved work that skips the estimating/proposal phase entirely
async function ensureProjectNoEstimateTicketType(companyId: string): Promise<{
  typeId: string;
  statuses: Map<string, string>;
} | null> {
  const ticketTypes = await storage.getTicketTypes(companyId);
  let pneType = ticketTypes.find(tt => tt.name === "Project (No Estimate)");

  if (!pneType) {
    pneType = await storage.createTicketType({
      companyId,
      name: "Project (No Estimate)",
      description: "Approved project work with no estimating or proposal phase required",
      category: "project",
      icon: "folder-check",
      color: "#0ea5e9",
      isActive: "true",
    });
    console.log(`Created Project (No Estimate) ticket type for company ${companyId}`);
  }

  const pneStatuses = [
    { name: "New", description: "Project request received and approved", color: "#6366f1", order: 0, isFinal: "false" as const },
    { name: "Ready to Schedule", description: "Approved - needs to be scheduled with crew", color: "#f472b6", order: 1, isFinal: "false" as const },
    { name: "Scheduled", description: "Scheduled with crew", color: "#3b82f6", order: 2, isFinal: "false" as const },
    { name: "Work Completed", description: "Field work finished - pending billing review", color: "#10b981", order: 3, isFinal: "false" as const },
    { name: "Ready for Billing", description: "Work verified complete - create invoice", color: "#06b6d4", order: 4, isFinal: "false" as const },
    { name: "Invoicing", description: "Invoice created in QuickBooks", color: "#22c55e", order: 5, isFinal: "true" as const },
    { name: "Closed - Lost", description: "Project cancelled or closed without billing", color: "#ef4444", order: 6, isFinal: "true" as const },
  ];

  let existingStatuses = await storage.getTicketTypeStatuses(pneType.id);
  const statusMap = new Map<string, string>();

  for (const statusDef of pneStatuses) {
    let status = existingStatuses.find(s => s.name === statusDef.name);
    if (!status) {
      status = await storage.createTicketTypeStatus({
        ticketTypeId: pneType.id,
        name: statusDef.name,
        description: statusDef.description,
        displayOrder: statusDef.order,
        color: statusDef.color,
        isFinal: statusDef.isFinal,
      });
      console.log(`Created status "${statusDef.name}" for Project (No Estimate) type`);
    }
    statusMap.set(status.name, status.id);
  }

  const existingFields = await storage.getTicketTypeFields(pneType.id);
  const existingFieldKeys = new Set(existingFields.map(f => f.fieldKey));

  const fieldDefinitions = [
    {
      statusName: "Work Completed",
      fields: [
        { fieldKey: "pne_completion_date", fieldLabel: "Completion Date", fieldType: "date", isRequired: "false", displayOrder: 0 },
        { fieldKey: "pne_actual_hours", fieldLabel: "Actual Hours", fieldType: "number", isRequired: "false", displayOrder: 1 },
        { fieldKey: "pne_completion_notes", fieldLabel: "Completion Notes", fieldType: "textarea", isRequired: "false", displayOrder: 2 },
      ],
    },
    {
      statusName: "Ready for Billing",
      fields: [
        { fieldKey: "pne_billing_confirmed", fieldLabel: "Work Complete & Ready for Invoice?", fieldType: "select", isRequired: "true", displayOrder: 0, options: ["Yes", "No"] },
      ],
    },
    {
      statusName: "Closed - Lost",
      fields: [
        { fieldKey: "pne_loss_reason", fieldLabel: "Reason", fieldType: "select", isRequired: "false", displayOrder: 0, options: ["Price", "Timing", "Went with competitor", "No longer needed", "Other"] },
        { fieldKey: "pne_loss_notes", fieldLabel: "Additional Notes", fieldType: "textarea", isRequired: "false", displayOrder: 1 },
      ],
    },
  ];

  for (const statusFields of fieldDefinitions) {
    const statusId = statusMap.get(statusFields.statusName);
    if (!statusId) continue;
    for (const fieldDef of statusFields.fields) {
      if (existingFieldKeys.has(fieldDef.fieldKey)) continue;
      await storage.createTicketTypeField({
        ticketTypeId: pneType.id,
        statusId,
        fieldKey: fieldDef.fieldKey,
        fieldLabel: fieldDef.fieldLabel,
        fieldType: fieldDef.fieldType as "text" | "number" | "date" | "currency" | "select" | "textarea",
        isRequired: fieldDef.isRequired as "true" | "false",
        options: fieldDef.options || [],
        displayOrder: fieldDef.displayOrder,
      });
      console.log(`Created field "${fieldDef.fieldKey}" for Project (No Estimate) type`);
    }
  }

  console.log(`Project (No Estimate) ticket type setup complete for company ${companyId}`);
  return { typeId: pneType.id, statuses: statusMap };
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
  
  // Seed in order: To-Do, Invoice, Project, RFP Request, Extra Billable, Project (No Estimate)
  await ensureToDoTicketType(companyId);
  await ensureInvoiceTicketType(companyId);
  await ensureProjectTicketType(companyId);
  await ensureRFPRequestTicketType(companyId);
  await ensureExtraBillableTicketType(companyId);
  await ensureProjectNoEstimateTicketType(companyId);
  
  console.log(`All ticket types seeded for company ${companyId}`);
}

// Startup migration: Ensure "1st Bank" parent-child hierarchy is correct
// Idempotent: finds or creates a canonical parent, enforces correct flags on all branches
export async function migrateFirstBankHierarchy(): Promise<void> {
  console.log("Running startup migration: Checking 1st Bank parent-child hierarchy...");
  
  try {
    const companies = await storage.getCompanies();
    
    for (const company of companies) {
      const customers = await storage.getCustomers(company.id);
      const branches = customers.filter((c) => c.name.startsWith("1st Bank - "));

      if (branches.length === 0) continue;

      let parentBank = customers.find((c) => c.name === "1st Bank" && !c.name.startsWith("1st Bank - "));

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

      if (parentBank.isParent !== "true") {
        await storage.updateCustomer(parentBank.id, company.id, { isParent: "true" });
        console.log(`Fixed parent "1st Bank" isParent flag to "true"`);
      }

      let repaired = 0;
      for (const branch of branches) {
        const fixes: Record<string, string> = {};
        if (branch.parentCustomerId !== parentBank.id) {
          fixes.parentCustomerId = parentBank.id;
        }
        if (branch.isParent === "true") {
          fixes.isParent = "false";
        }
        if (Object.keys(fixes).length > 0) {
          await storage.updateCustomer(branch.id, company.id, fixes);
          repaired++;
          console.log(`Repaired branch "${branch.name}": ${JSON.stringify(fixes)}`);
        }
      }
      if (repaired > 0) {
        console.log(`1st Bank data repair: fixed ${repaired} of ${branches.length} branches`);
      }

      console.log(`1st Bank hierarchy verified: 1 parent + ${branches.length} branches`);
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

// Startup migration: Ensure Extra Billable "Done" status has correct display order (after Ready for Billing)
export async function fixExtraBillableDoneOrder(): Promise<void> {
  console.log("Running startup migration: Fixing Extra Billable Done status display order...");
  try {
    const companies = await storage.getCompanies();
    for (const company of companies) {
      const ticketTypes = await storage.getTicketTypes(company.id);
      const ebType = ticketTypes.find(tt => tt.name === "Extra Billable");
      if (!ebType) continue;
      
      const statuses = await storage.getTicketTypeStatuses(ebType.id);
      const doneStatus = statuses.find(s => s.name === "Done");
      const readyForBilling = statuses.find(s => s.name === "Ready for Billing");
      
      if (doneStatus && doneStatus.displayOrder < 5) {
        await storage.updateTicketTypeStatus(doneStatus.id, { displayOrder: 5 });
        console.log(`Updated Extra Billable "Done" display order to 5 for company ${company.id}`);
      }
    }
    console.log("Extra Billable Done order fix complete");
  } catch (error) {
    console.error("Error fixing Extra Billable Done order:", error);
  }
}

// Startup migration: Fix Project ticket type display orders
// When "Ready to Schedule" was added, existing statuses weren't re-ordered
export async function fixProjectDisplayOrders(): Promise<void> {
  console.log("Running startup migration: Fixing Project ticket type display orders...");
  try {
    const companies = await storage.getCompanies();
    const expectedOrders: Record<string, number> = {
      "New": 0,
      "Estimating": 1,
      "Create Proposal": 2,
      "Proposal Sent": 3,
      "Decision Received": 4,
      "Ready to Schedule": 5,
      "Work Completed": 6,
      "Ready for Billing": 7,
      "Invoicing": 8,
      "Closed - Lost": 9,
    };

    for (const company of companies) {
      const ticketTypes = await storage.getTicketTypes(company.id);
      const projectType = ticketTypes.find(tt => tt.name === "Project");
      if (!projectType) continue;

      const statuses = await storage.getTicketTypeStatuses(projectType.id);
      let fixedCount = 0;

      for (const status of statuses) {
        const expected = expectedOrders[status.name];
        if (expected !== undefined && status.displayOrder !== expected) {
          await storage.updateTicketTypeStatus(status.id, { displayOrder: expected });
          console.log(`Fixed Project status "${status.name}" display order: ${status.displayOrder} → ${expected} (company ${company.id})`);
          fixedCount++;
        }
      }

      if (fixedCount > 0) {
        console.log(`Fixed ${fixedCount} Project status display orders for company ${company.id}`);
      }
    }
    console.log("Project display order fix complete");
  } catch (error) {
    console.error("Error fixing Project display orders:", error);
  }
}

// Startup migration: Remove invoice data fields from Project's "Invoicing" status
// Invoice data should only be entered on the Invoice ticket, not duplicated on the Project
export async function removeProjectInvoicingFields(): Promise<void> {
  console.log("Running startup migration: Removing duplicate invoice fields from Project Invoicing status...");
  
  try {
    const companies = await storage.getCompanies();
    
    for (const company of companies) {
      const ticketTypes = await storage.getTicketTypes(company.id);
      const projectType = ticketTypes.find(tt => tt.name === "Project");
      if (!projectType) continue;
      
      const statuses = await storage.getTicketTypeStatuses(projectType.id);
      const invoicingStatus = statuses.find(s => s.name === "Invoicing");
      if (!invoicingStatus) continue;
      
      const fields = await storage.getTicketTypeFields(projectType.id);
      const invoicingFields = fields.filter(f => 
        f.statusId === invoicingStatus.id && 
        ["qb_invoice_number", "invoice_amount", "invoice_date"].includes(f.fieldKey)
      );
      
      for (const field of invoicingFields) {
        await storage.deleteTicketTypeField(field.id);
        console.log(`Removed field "${field.fieldKey}" from Project Invoicing status`);
      }
    }
    
    console.log("Project Invoicing fields cleanup complete");
  } catch (error) {
    console.error("Error removing Project Invoicing fields:", error);
  }
}

// Startup migration: Fix billing_behavior for Project tickets that originated as estimate_requests
// When workType auto-transitions from estimate_request to project, billingBehavior should also change to invoice_required
// This corrects any existing tickets where the billingBehavior was not updated during the transition
export async function fixEstimateRequestBillingBehavior(): Promise<void> {
  console.log("Running startup migration: Fixing billing_behavior for Project tickets from estimate_requests...");
  
  try {
    const companies = await storage.getCompanies();
    let fixedCount = 0;
    
    for (const company of companies) {
      const ticketTypes = await storage.getTicketTypes(company.id);
      const projectType = ticketTypes.find(tt => tt.name === "Project");
      if (!projectType) continue;
      
      const allTickets = await storage.getTickets(company.id);
      const affectedTickets = allTickets.filter(
        t => t.ticketTypeId === projectType.id && 
             t.workType === "project" && 
             t.billingBehavior === "internal"
      );
      
      for (const ticket of affectedTickets) {
        await storage.updateTicket(ticket.id, company.id, { billingBehavior: "invoice_required" });
        fixedCount++;
        console.log(`Fixed billing_behavior for ticket ${ticket.id} ("${ticket.title}") to invoice_required`);
      }
    }
    
    if (fixedCount > 0) {
      console.log(`Fixed billing_behavior for ${fixedCount} Project tickets`);
    } else {
      console.log("No Project tickets needed billing_behavior fix");
    }
  } catch (error) {
    console.error("Error fixing estimate_request billing behavior:", error);
  }
}

// Startup migration: Replace "Estimate Sent" with "Create Proposal" + "Proposal Sent" in Project workflow
export async function migrateEstimateSentToProposalWorkflow(): Promise<void> {
  console.log("Running startup migration: Replacing Estimate Sent with Create Proposal + Proposal Sent...");
  try {
    const companies = await storage.getCompanies();
    for (const company of companies) {
      const ticketTypes = await storage.getTicketTypes(company.id);
      const projectType = ticketTypes.find(tt => tt.name === "Project");
      if (!projectType) continue;

      const statuses = await storage.getTicketTypeStatuses(projectType.id);

      // 1. Ensure "Create Proposal" status exists (order 2)
      let createProposalStatus = statuses.find(s => s.name === "Create Proposal");
      if (!createProposalStatus) {
        createProposalStatus = await storage.createTicketTypeStatus({
          ticketTypeId: projectType.id,
          companyId: company.id,
          name: "Create Proposal",
          description: "Build the proposal document in this system",
          color: "#8b5cf6",
          displayOrder: 2,
          isFinal: "false",
        });
        console.log(`Created "Create Proposal" status for company ${company.id}`);
      }

      // 2. Ensure "Proposal Sent" status exists (order 3)
      let proposalSentStatus = statuses.find(s => s.name === "Proposal Sent");
      if (!proposalSentStatus) {
        proposalSentStatus = await storage.createTicketTypeStatus({
          ticketTypeId: projectType.id,
          companyId: company.id,
          name: "Proposal Sent",
          description: "Proposal delivered to customer, awaiting decision",
          color: "#f59e0b",
          displayOrder: 3,
          isFinal: "false",
        });
        console.log(`Created "Proposal Sent" status for company ${company.id}`);
      }

      // 3. Add fields for "Proposal Sent" step if not already present
      const existingFields = await storage.getTicketTypeFields(projectType.id);
      const proposalSentFields = existingFields.filter(f => f.statusId === proposalSentStatus!.id);
      if (proposalSentFields.length === 0) {
        await storage.createTicketTypeField({
          ticketTypeId: projectType.id,
          statusId: proposalSentStatus.id,
          companyId: company.id,
          fieldKey: "proposal_sent_date",
          fieldLabel: "Date Proposal Sent",
          fieldType: "date",
          isRequired: "true",
          fieldOptions: null,
          displayOrder: 0,
        });
        await storage.createTicketTypeField({
          ticketTypeId: projectType.id,
          statusId: proposalSentStatus.id,
          companyId: company.id,
          fieldKey: "proposal_delivery_method",
          fieldLabel: "Delivery Method",
          fieldType: "select",
          isRequired: "true",
          fieldOptions: JSON.stringify(["Email", "QBO Portal", "Hard Copy", "Other"]),
          displayOrder: 1,
        });
        console.log(`Added fields for "Proposal Sent" status for company ${company.id}`);
      }

      // 4. Migrate existing "Estimate Sent" tickets to "Proposal Sent"
      const estimateSentStatus = statuses.find(s => s.name === "Estimate Sent");
      if (estimateSentStatus) {
        const allTickets = await storage.getTickets(company.id);
        const estimateSentTickets = allTickets.filter(
          t => t.ticketTypeId === projectType.id && t.currentStatusId === estimateSentStatus.id
        );
        for (const ticket of estimateSentTickets) {
          await storage.updateTicket(ticket.id, company.id, { currentStatusId: proposalSentStatus.id });
          console.log(`Migrated ticket "${ticket.title}" from Estimate Sent → Proposal Sent`);
        }

        // 5. Delete Estimate Sent fields then the status itself
        const estimateSentFields = existingFields.filter(f => f.statusId === estimateSentStatus.id);
        for (const field of estimateSentFields) {
          await storage.deleteTicketTypeField(field.id);
        }
        await storage.deleteTicketTypeStatus(estimateSentStatus.id);
        console.log(`Deleted "Estimate Sent" status for company ${company.id}`);
      }
    }
    console.log("migrateEstimateSentToProposalWorkflow complete");
  } catch (error) {
    console.error("Error in migrateEstimateSentToProposalWorkflow:", error);
  }
}

// Startup migration: Ensure all companies have the Extra Billable ticket type
// and migrate any existing extra_work To-Do tickets to the new type
export async function migrateExtraBillableTicketType(): Promise<void> {
  console.log("Running startup migration: Ensuring Extra Billable ticket type exists for all companies...");
  
  try {
    const companies = await storage.getCompanies();
    
    for (const company of companies) {
      const ebResult = await ensureExtraBillableTicketType(company.id);
      if (!ebResult) continue;
      
      // Migrate existing extra_work tickets that are on the To-Do type to Extra Billable
      const ticketTypes = await storage.getTicketTypes(company.id);
      const todoType = ticketTypes.find(tt => tt.name === "To-Do");
      if (!todoType) continue;
      
      const todoStatuses = await storage.getTicketTypeStatuses(todoType.id);
      const openStatus = todoStatuses.find(s => s.name === "Open");
      const doneStatus = todoStatuses.find(s => s.name === "Done");
      
      // Get all tickets of To-Do type with extra_work work type
      const allTickets = await storage.getTickets(company.id);
      const extraWorkTodoTickets = allTickets.filter(
        t => t.ticketTypeId === todoType.id && t.workType === "extra_work"
      );
      
      if (extraWorkTodoTickets.length === 0) continue;
      
      const ebNewStatusId = ebResult.statuses.get("New");
      const ebDoneStatusId = ebResult.statuses.get("Done");
      
      for (const ticket of extraWorkTodoTickets) {
        // Map old status to new status
        let newStatusId = ebNewStatusId;
        if (ticket.currentStatusId === doneStatus?.id && ebDoneStatusId) {
          newStatusId = ebDoneStatusId;
        }
        
        if (newStatusId) {
          await storage.updateTicket(ticket.id, company.id, {
            ticketTypeId: ebResult.typeId,
            currentStatusId: newStatusId,
          });
          console.log(`Migrated extra_work ticket "${ticket.title}" (${ticket.id}) from To-Do to Extra Billable`);
        }
      }
      
      console.log(`Migrated ${extraWorkTodoTickets.length} extra_work tickets for company ${company.id}`);
    }
    
    console.log("Extra Billable ticket type migration complete");
  } catch (error) {
    console.error("Error during Extra Billable migration:", error);
  }
}

// Startup migration: Ensure all companies have the "Project (No Estimate)" ticket type
export async function migrateProjectNoEstimateTicketType(): Promise<void> {
  console.log("Running startup migration: Ensuring Project (No Estimate) ticket type exists for all companies...");
  try {
    const companies = await storage.getCompanies();
    for (const company of companies) {
      await ensureProjectNoEstimateTicketType(company.id);
    }
    console.log("Project (No Estimate) ticket type migration complete");
  } catch (error) {
    console.error("Error during Project (No Estimate) migration:", error);
  }
}

export async function migrateUserLanguageColumn(): Promise<void> {
  console.log("Running startup migration: Ensuring language column exists on users table...");
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'`);
    console.log("User language column migration complete");
  } catch (error) {
    console.error("Error during user language column migration:", error);
  }
}

export async function migrateUserPhoneColumn(): Promise<void> {
  console.log("Running startup migration: Ensuring phone column exists and email is nullable on users table...");
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text UNIQUE`);
    await db.execute(sql`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);
    console.log("User phone column migration complete");
  } catch (error) {
    console.error("Error during user phone column migration:", error);
  }
}

export async function migrateEquipmentProfilePhotoColumn(): Promise<void> {
  console.log("Running startup migration: Ensuring profile_photo_path column exists on equipment table...");
  try {
    await db.execute(sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS profile_photo_path text`);
    console.log("Equipment profile_photo_path column migration complete");
  } catch (error) {
    console.error("Error during equipment profile_photo_path migration:", error);
  }
}

export async function backfillCustomerType(): Promise<void> {
  console.log("Running startup migration: Backfilling customer_type for existing customers...");
  try {
    const result = await db.execute(sql`UPDATE customers SET customer_type = 'commercial' WHERE customer_type IS NULL`);
    console.log("Customer type backfill complete");
  } catch (error) {
    console.error("Error during customer type backfill:", error);
  }
}

export async function migrateProposalNumbers(): Promise<void> {
  console.log("Running startup migration: Adding proposal_number column, backfilling, and creating sequence...");
  try {
    // 1. Add the column as nullable first so we can backfill
    await db.execute(sql`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS proposal_number varchar`);

    // 2. Backfill any rows that don't have a proposal number yet, ordered by created_at
    const unassigned = await db.execute(sql`
      SELECT id FROM proposals
      WHERE proposal_number IS NULL
      ORDER BY created_at ASC
    `);
    if (unassigned.rows.length > 0) {
      // Find the current numeric max via regex extraction (safe numeric sort)
      const maxRow = await db.execute(sql`
        SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_number FROM 3) AS integer)), 0) AS max_seq
        FROM proposals
        WHERE proposal_number IS NOT NULL AND proposal_number ~ '^P-[0-9]+$'
      `);
      let nextSeq = (maxRow.rows[0]?.max_seq as number ?? 0) + 1;
      for (const row of unassigned.rows) {
        const num = `P-${String(nextSeq).padStart(4, "0")}`;
        await db.execute(sql`UPDATE proposals SET proposal_number = ${num} WHERE id = ${row.id as string}`);
        nextSeq++;
      }
    }

    // 3. Create a sequence (or sync it) so new inserts can use NEXTVAL atomically
    await db.execute(sql`
      CREATE SEQUENCE IF NOT EXISTS proposal_number_seq
      START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
    `);
    // Advance the sequence to be at least as high as the current max assignment
    const maxRow2 = await db.execute(sql`
      SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_number FROM 3) AS integer)), 0) AS max_seq
      FROM proposals
      WHERE proposal_number IS NOT NULL AND proposal_number ~ '^P-[0-9]+$'
    `);
    const currentMax = maxRow2.rows[0]?.max_seq as number ?? 0;
    if (currentMax > 0) {
      await db.execute(sql`SELECT SETVAL('proposal_number_seq', ${currentMax})`);
    }

    // 4. Make the column NOT NULL after backfill
    await db.execute(sql`ALTER TABLE proposals ALTER COLUMN proposal_number SET NOT NULL`);

    // 5. Ensure the uniqueness constraint exists
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'proposals_proposal_number_unique'
        ) THEN
          ALTER TABLE proposals ADD CONSTRAINT proposals_proposal_number_unique UNIQUE (proposal_number);
        END IF;
      END $$
    `);

    console.log("Proposal number migration complete");
  } catch (error) {
    console.error("Error during proposal number migration:", error);
  }
}

// Migration: Create communications tables and extend communication_templates schema
export async function migrateCommunicationTemplatesSchema(): Promise<void> {
  console.log("Running startup migration: Ensuring communications tables exist and extending schema...");
  try {
    // Create communications table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "communications" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "customer_id" varchar,
        "contact_id" varchar,
        "sent_by_id" varchar,
        "type" text NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "subject" text NOT NULL,
        "body" text NOT NULL,
        "scheduled_at" timestamp,
        "sent_at" timestamp,
        "customer_name" text,
        "contact_name" text,
        "sent_by_name" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE communications ADD CONSTRAINT communications_company_id_companies_id_fk
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE cascade;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "communications_company_id_idx" ON "communications" ("company_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "communications_customer_id_idx" ON "communications" ("customer_id")`);

    // Create communication_templates table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "communication_templates" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "name" text NOT NULL,
        "category" text NOT NULL DEFAULT 'general_outreach',
        "type" text NOT NULL,
        "subject" text,
        "body" text NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "default_communication_type" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE communication_templates ADD CONSTRAINT communication_templates_company_id_companies_id_fk
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE cascade;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // Create communication_links table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "communication_links" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "communication_id" varchar NOT NULL,
        "linked_entity_type" text NOT NULL,
        "linked_entity_id" varchar NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE communication_links ADD CONSTRAINT communication_links_company_id_companies_id_fk
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE cascade;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE communication_links ADD CONSTRAINT communication_links_communication_id_communications_id_fk
          FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE cascade;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // For existing installations: add new columns if they don't exist
    await db.execute(sql`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general_outreach'`);
    await db.execute(sql`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS description text`);
    await db.execute(sql`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`);
    await db.execute(sql`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS default_communication_type text`);
    await db.execute(sql`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS created_by_id varchar REFERENCES users(id) ON DELETE SET NULL`);

    // For existing communications installations: add threading columns
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS template_id varchar REFERENCES communication_templates(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS thread_id varchar REFERENCES communication_threads(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS in_reply_to varchar`);
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS parent_communication_id varchar`);
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound'`).catch(() => {});
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS internal_notes text`);
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS scheduled_for timestamp`);
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS follow_up_due_at timestamp`);
    await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS follow_up_status text NOT NULL DEFAULT 'none'`).catch(() => {});

    // Rename communication_links columns if old names exist
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE communication_links RENAME COLUMN linked_entity_type TO linked_type;
      EXCEPTION WHEN undefined_column THEN null; END $$
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE communication_links RENAME COLUMN linked_entity_id TO linked_id;
      EXCEPTION WHEN undefined_column THEN null; END $$
    `);

    // Rename communication_threads subject column if old name exists
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE communication_threads RENAME COLUMN subject TO subject_root;
      EXCEPTION WHEN undefined_column THEN null; END $$
    `);

    console.log("Communications tables and schema migration complete");
  } catch (error) {
    console.error("Error during communications schema migration:", error);
  }
}

// Seed sample communication templates for a company
async function seedCommunicationTemplates(companyId: string): Promise<number> {
  const templates = [
    {
      companyId,
      name: "Proposal Follow-Up — Standard",
      category: "proposal_follow_up" as const,
      type: "email" as const,
      subject: "Following Up on Your Proposal — {{proposal_name}}",
      body: "Dear {{customer_name}},\n\nI wanted to follow up on the proposal we sent over for {{property_name}}. We understand you may have questions, and we're happy to walk you through any details.\n\nProposal Total: {{proposal_total}}\n\nPlease don't hesitate to reach out — we'd love to move forward when you're ready.\n\nBest regards,\n{{pm_name}}\n{{company_name}}",
      description: "Standard follow-up email after a proposal is sent. Use within 5–7 business days of delivery.",
      isActive: true,
      defaultCommunicationType: "email" as const,
    },
    {
      companyId,
      name: "Irrigation System Approval Request",
      category: "irrigation_approval_request" as const,
      type: "email" as const,
      subject: "Irrigation System Startup Approval — {{property_name}}",
      body: "Dear {{contact_name}},\n\nWe are scheduling irrigation system startups for the upcoming season at {{property_name}} and need your approval to proceed.\n\nPlanned Service Date: {{service_date}}\n\nPlease reply to confirm or suggest an alternate date. Our crew will be ready to begin as soon as we receive your authorization.\n\nThank you,\n{{pm_name}}\n{{company_name}}",
      description: "Sent to property contacts requesting approval before irrigation startup visits.",
      isActive: true,
      defaultCommunicationType: "email" as const,
    },
    {
      companyId,
      name: "Chemical Application Pre-Notice",
      category: "chemical_notice" as const,
      type: "email" as const,
      subject: "Upcoming Chemical Application at {{property_name}}",
      body: "Dear {{customer_name}},\n\nThis is an advance notice that a chemical application is scheduled at {{property_name}} on {{service_date}}.\n\nPlease ensure that children and pets are kept off treated areas for 24 hours following application. Our technicians will post temporary signage at the time of service.\n\nIf you have any questions or concerns, please contact us before the scheduled date.\n\n{{pm_name}}\n{{company_name}}",
      description: "Pre-notification for chemical/fertilizer applications. Send 2–3 days before service.",
      isActive: true,
      defaultCommunicationType: "email" as const,
    },
    {
      companyId,
      name: "Snow Event Service Notice",
      category: "snow_event_notice" as const,
      type: "sms" as const,
      subject: "Snow Event — Service Underway",
      body: "Hi {{contact_name}}, this is {{company_name}}. Snow removal crews are currently servicing {{property_name}}. Please allow extra time and keep walkways clear while work is in progress. Reply STOP to opt out.",
      description: "Quick SMS notice sent to property contacts during active snow events.",
      isActive: true,
      defaultCommunicationType: "sms" as const,
    },
    {
      companyId,
      name: "Billing Reminder — Past Due",
      category: "billing_reminder" as const,
      type: "email" as const,
      subject: "Friendly Reminder — Balance Due for {{customer_name}}",
      body: "Dear {{customer_name}},\n\nThis is a friendly reminder that there is an outstanding balance on your account for services at {{property_name}}.\n\nPlease contact our office at your earliest convenience to make arrangements. We appreciate your prompt attention to this matter.\n\nThank you for your continued partnership,\n{{pm_name}}\n{{company_name}}",
      description: "Polite billing reminder for past-due accounts. Adjust tone as needed for the relationship.",
      isActive: true,
      defaultCommunicationType: "email" as const,
    },
    {
      companyId,
      name: "Winter Watering Reminder",
      category: "winter_watering" as const,
      type: "email" as const,
      subject: "Winter Watering Guidelines for {{property_name}}",
      body: "Dear {{customer_name}},\n\nAs temperatures fluctuate this winter, we want to remind you about best practices for winter watering at {{property_name}}.\n\nWater during the warmest part of the day (10am–2pm) when temperatures are above 40°F. Avoid watering if snow or ice is expected within 24 hours. Trees and shrubs benefit from deep monthly watering throughout winter.\n\nOur team is available to assist with any questions.\n\n{{pm_name}}\n{{company_name}}",
      description: "Educational reminder for clients about proper winter irrigation practices.",
      isActive: true,
      defaultCommunicationType: "email" as const,
    },
    {
      companyId,
      name: "Service Update — Delay Notice",
      category: "service_update" as const,
      type: "sms" as const,
      subject: "Service Update for {{property_name}}",
      body: "Hi {{contact_name}}, {{company_name}} here. Due to weather or crew availability, your scheduled service at {{property_name}} on {{service_date}} has been delayed. We'll be in touch with a rescheduled date soon. Sorry for the inconvenience!",
      description: "Short SMS notice to let contacts know about a service delay.",
      isActive: true,
      defaultCommunicationType: "sms" as const,
    },
    {
      companyId,
      name: "General Outreach — Check-In",
      category: "general_outreach" as const,
      type: "email" as const,
      subject: "Checking In — {{customer_name}}",
      body: "Dear {{customer_name}},\n\nI hope this message finds you well. I wanted to take a moment to check in and see how things are going at {{property_name}}.\n\nIf you have any questions about your services, upcoming schedules, or anything else, please feel free to reach out. We appreciate your business and look forward to another great season together.\n\nBest,\n{{pm_name}}\n{{company_name}}",
      description: "A friendly general check-in note. Useful for relationship maintenance.",
      isActive: true,
      defaultCommunicationType: "email" as const,
    },
  ];
  const created = await Promise.all(templates.map((t) => storage.createCommunicationTemplate(t)));
  return created.length;
}

// Startup bootstrap: seed sample communications for any company that has none
export async function seedCommunicationsBootstrap(): Promise<void> {
  console.log("Running startup bootstrap: Checking communications seed data...");
  try {
    const companies = await storage.getCompanies();
    for (const company of companies) {
      const existing = await storage.getCommunications(company.id);
      if (existing.length > 0) continue;
      const companyUsers = await storage.getCompanyUsersByCompanyId(company.id);
      if (companyUsers.length === 0) continue;
      const firstUser = companyUsers[0];
      const userRecord = await storage.getUserById(firstUser.userId);
      if (!userRecord) continue;
      await seedCommunications(company.id, userRecord.id, userRecord.name);
      console.log(`Seeded communications for company ${company.id}`);
    }
    console.log("Communications seed bootstrap complete");
  } catch (error) {
    console.error("Error during communications seed bootstrap:", error);
  }
}

// Startup bootstrap: seed sample communication templates for any company that has none
export async function seedCommunicationTemplatesBootstrap(): Promise<void> {
  console.log("Running startup bootstrap: Checking communication templates seed data...");
  try {
    const companies = await storage.getCompanies();
    for (const company of companies) {
      const existing = await storage.getCommunicationTemplates(company.id, true);
      if (existing.length > 0) continue;
      await seedCommunicationTemplates(company.id);
      console.log(`Seeded communication templates for company ${company.id}`);
    }
    console.log("Communication templates seed bootstrap complete");
  } catch (error) {
    console.error("Error during communication templates seed bootstrap:", error);
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

    // Optional server-side pagination: ?page=1&limit=50&search=foo
    // Without page/limit params, returns the full list (backward compat)
    if (req.query.page || req.query.limit) {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const search = (req.query.search as string) || undefined;
      const result = await storage.getCustomersPaginated(user.activeCompanyId, { page, limit, search });
      return res.json(result);
    }

    const customers = await storage.getCustomers(user.activeCompanyId);
    res.json(customers);
  });

  // Dedicated route-map endpoint — returns only customers with includeInRoute=true and active="true"
  app.get("/api/customers/route", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    const results = await db
      .select()
      .from(customersTable)
      .where(and(
        eq(customersTable.companyId, user.activeCompanyId),
        sql`include_in_route = true`,
        sql`active = 'true'`
      ));
    res.json(results);
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

    childCustomers = await storage.getChildCustomers(customer.id, user.activeCompanyId);

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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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

    const { phone, email, name, password, role, language } = req.body;

    if (!name || !password || !role) {
      return res.status(400).json({ message: "Name, password, and role are required" });
    }

    if (!phone && !email) {
      return res.status(400).json({ message: "Either phone or email is required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    if (email) {
      const existingByEmail = await storage.getUserByEmail(email);
      if (existingByEmail) {
        return res.status(400).json({ message: "User with this email already exists" });
      }
    }

    let normalizedPhone: string | null = null;
    if (phone) {
      normalizedPhone = phone.replace(/\D/g, "");
      if (normalizedPhone.length < 10) {
        return res.status(400).json({ message: "Phone number must be at least 10 digits" });
      }
      const existingByPhone = await storage.getUserByPhone(normalizedPhone);
      if (existingByPhone) {
        return res.status(400).json({ message: "User with this phone number already exists" });
      }
    }

    try {
      const { hashPassword } = await import("./auth");
      const passwordHash = await hashPassword(password);

      const newUser = await storage.createUser({
        email: email || null,
        phone: normalizedPhone,
        name,
        passwordHash,
        isSuperAdmin: "false",
        defaultCompanyId: currentUser.activeCompanyId,
        language: language === "es" ? "es" : "en",
      });

      await storage.createCompanyUser({
        userId: newUser.id,
        companyId: currentUser.activeCompanyId,
        role: role as "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping",
        status: "active",
        tags: [],
      });

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Team Members endpoint for @mention autocomplete (any authenticated user)
  app.get("/api/company-users", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const companyUsersList = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const result = await Promise.all(
      companyUsersList.map(async (cu) => {
        const userDetails = await storage.getUserById(cu.userId);
        return {
          id: cu.id,
          userId: cu.userId,
          role: cu.role,
          status: cu.status,
          tags: cu.tags || [],
          user: {
            id: userDetails?.id || cu.userId,
            firstName: userDetails?.name?.split(" ")[0] || "",
            lastName: userDetails?.name?.split(" ").slice(1).join(" ") || "",
            email: userDetails?.email || "",
          },
        };
      })
    );
    res.json(result);
  });

  app.get("/api/team-members", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const activeUsers = companyUsers.filter(cu => cu.status === "active");

    // Bulk fetch all users in one query instead of N+1
    const userIds = activeUsers.map(cu => cu.userId);
    const allUsers = userIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    const teamMembers = activeUsers.map((cu) => {
      const userDetails = userMap.get(cu.userId);
      return {
        id: cu.userId,
        name: userDetails?.name || "Unknown",
        email: userDetails?.email || "",
        role: cu.role,
      };
    });
    
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor" || user.activeRole === "shop_manager") {
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

    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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

  // Bulk fetch all ticket type statuses for this company (avoids N+1 waterfall on frontend)
  app.get("/api/ticket-type-statuses", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;
    const allStatuses = await storage.getAllTicketTypeStatuses(user.activeCompanyId);
    res.json(allStatuses);
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

  // Batch geocode all customers missing coordinates
  app.post("/api/customers/geocode-missing", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!["admin", "office"].includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const mapboxToken = process.env.MAPBOX_PUBLIC_KEY;
    if (!mapboxToken) return res.status(500).send("Mapbox token not configured");

    const allCustomers = await storage.getCustomers(user.activeCompanyId);
    const customers = allCustomers.filter(c => c.includeInRoute);
    let geocoded = 0, failed = 0, skipped = 0;

    for (const customer of customers) {
      if (customer.locationLat != null && customer.locationLng != null) { skipped++; continue; }
      const addr = [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(", ");
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${mapboxToken}&country=US&limit=1`;
        const r = await fetch(url);
        const data = await r.json();
        const feature = data?.features?.[0];
        if (feature?.center) {
          const [lng, lat] = feature.center;
          await storage.updateCustomer(customer.id, user.activeCompanyId, { locationLat: lat, locationLng: lng });
          geocoded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({ geocoded, failed, skipped });
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
    const [tickets, allStatuses] = await Promise.all([
      storage.getTickets(user.activeCompanyId, { assignedToId: user.id }),
      storage.getAllTicketTypeStatuses(user.activeCompanyId),
    ]);

    const statusMap = new Map(allStatuses.map(s => [s.id, s]));

    // Only fetch customers referenced by this user's tickets
    const distinctCustomerIds = Array.from(new Set(tickets.map(t => t.customerId).filter(Boolean) as string[]));
    const customerMap = await storage.getCustomersByIds(distinctCustomerIds, user.activeCompanyId);

    const enrichedTickets = tickets.map((ticket) => {
      const currentStatus = ticket.currentStatusId ? statusMap.get(ticket.currentStatusId) : undefined;
      const customer = ticket.customerId ? customerMap.get(ticket.customerId) : undefined;
      return {
        ...ticket,
        currentStatus: currentStatus ? { id: currentStatus.id, name: currentStatus.name, color: currentStatus.color, isFinal: currentStatus.isFinal } : null,
        customer: customer ? { name: customer.name } : null,
      };
    });

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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager") {
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
    if ((user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
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

  app.post("/api/tickets/document-upload-url", async (req, res) => {
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
      console.error("Error getting document upload URL:", error);
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

    // Documents are only allowed on estimate_request tickets
    if (req.body.documents && req.body.documents.length > 0 && req.body.workType !== "estimate_request") {
      return res.status(400).send("Documents can only be attached to Estimate Request tickets");
    }
    if (req.body.documentNames && req.body.documentNames.length > 0 && req.body.workType !== "estimate_request") {
      return res.status(400).send("Document names can only be attached to Estimate Request tickets");
    }
    if (req.body.documents && req.body.documentNames && req.body.documents.length !== req.body.documentNames.length) {
      return res.status(400).send("Documents and document names arrays must have the same length");
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
    
    // Set ACL on uploaded documents to allow company members to read them
    if (ticket.documents && ticket.documents.length > 0) {
      const objectStorageService = new ObjectStorageService();
      for (const docPath of ticket.documents) {
        try {
          await objectStorageService.trySetObjectEntityAclPolicy(docPath, {
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
          console.error(`Failed to set ACL for document ${docPath}:`, error);
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
    if ((user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager" || user.activeRole === "shop_manager" || user.activeRole === "landscape_supervisor") && existingTicket.assignedToId !== user.id) {
      return res.status(403).send("Access denied - not assigned to this ticket");
    }
    
    // Viewers cannot update tickets
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions");
    }

    // If status is changing, record history
    if (req.body.currentStatusId && req.body.currentStatusId !== existingTicket.currentStatusId) {
      const allStatuses = await storage.getTicketTypeStatuses(existingTicket.ticketTypeId);
      const newStatus = allStatuses.find(s => s.id === req.body.currentStatusId);
      const oldStatus = allStatuses.find(s => s.id === existingTicket.currentStatusId);
      
      // Determine direction: compare display orders
      const isSteppingBack = oldStatus && newStatus && newStatus.displayOrder < oldStatus.displayOrder;
      
      // === STEP-BACK CLEANUP LOGIC ===
      if (isSteppingBack) {
        console.log(`Step-back detected: ticket ${existingTicket.id} moving from "${oldStatus.name}" (order ${oldStatus.displayOrder}) to "${newStatus.name}" (order ${newStatus.displayOrder})`);
        
        // 1. Clear field values for all statuses being undone (from current back to target, exclusive of target)
        const sortedStatuses = [...allStatuses].sort((a, b) => a.displayOrder - b.displayOrder);
        const statusesBeingUndone = sortedStatuses.filter(
          s => s.displayOrder > newStatus.displayOrder && s.displayOrder <= oldStatus.displayOrder
        );
        
        if (statusesBeingUndone.length > 0) {
          const statusIdsBeingUndone = statusesBeingUndone.map(s => s.id);
          const allFields = await storage.getTicketTypeFields(existingTicket.ticketTypeId);
          const fieldIdsToDelete = allFields
            .filter(f => f.statusId && statusIdsBeingUndone.includes(f.statusId))
            .map(f => f.id);
          
          if (fieldIdsToDelete.length > 0) {
            await storage.deleteTicketFieldValuesByFieldIds(existingTicket.id, fieldIdsToDelete);
            console.log(`Cleared ${fieldIdsToDelete.length} field values for ${statusesBeingUndone.length} undone statuses on ticket ${existingTicket.id}`);
          }
        }
        
        // 2. Handle invoice link cleanup when stepping back past or from "Ready for Billing"
        const readyForBillingStatus = sortedStatuses.find(s => s.name === "Ready for Billing");
        const isSteppingBackPastBilling = readyForBillingStatus && 
          oldStatus.displayOrder >= readyForBillingStatus.displayOrder &&
          newStatus.displayOrder < readyForBillingStatus.displayOrder;
        
        if (isSteppingBackPastBilling) {
          const existingLinks = await storage.getTicketLinks(existingTicket.id);
          const invoiceLink = existingLinks.find(l => l.linkType === "invoice_for" && l.sourceTicketId === existingTicket.id);
          
          if (invoiceLink) {
            const linkedInvoiceTicket = await storage.getTicketById(invoiceLink.targetTicketId, user.activeCompanyId);
            
            if (linkedInvoiceTicket) {
              const invoiceStatuses = await storage.getTicketTypeStatuses(linkedInvoiceTicket.ticketTypeId);
              const invoiceCurrentStatus = invoiceStatuses.find(s => s.id === linkedInvoiceTicket.currentStatusId);
              const isInvoiceCompleted = invoiceCurrentStatus?.isFinal === "true" || !!linkedInvoiceTicket.completedAt;
              
              if (isInvoiceCompleted && !req.body.confirmDeleteInvoice) {
                return res.status(409).json({
                  error: "INVOICE_COMPLETED",
                  message: "A completed Invoice ticket exists for this ticket. Stepping back will delete it.",
                  invoiceTicketId: linkedInvoiceTicket.id,
                  invoiceTicketTitle: linkedInvoiceTicket.title,
                });
              }
              
              // Delete the invoice ticket and link
              await storage.deleteTicketLink(invoiceLink.id);
              await storage.deleteTicket(linkedInvoiceTicket.id, user.activeCompanyId);
              console.log(`Step-back cleanup: deleted Invoice ticket ${linkedInvoiceTicket.id} and link for ticket ${existingTicket.id} (invoice was ${isInvoiceCompleted ? "completed" : "pending"})`);
            } else {
              // Invoice ticket doesn't exist anymore, just clean up the link
              await storage.deleteTicketLink(invoiceLink.id);
            }
          }
        }
        
        // Clear completedAt if stepping back from a final status
        if (oldStatus.isFinal === "true" && newStatus.isFinal !== "true") {
          req.body.completedAt = null;
          console.log(`Ticket ${existingTicket.id} stepped back from final status "${oldStatus.name}" to "${newStatus.name}" - clearing completedAt`);
        }
      }
      
      // Record status history
      await storage.createTicketStatusHistory({
        ticketId: existingTicket.id,
        fromStatusId: existingTicket.currentStatusId,
        toStatusId: req.body.currentStatusId,
        changedById: user.id,
        notes: req.body.statusChangeNotes || null,
      });
      
      // === FORWARD-ONLY LOGIC (skip all of this on step-back) ===
      if (!isSteppingBack) {
        // Auto-transition work type from estimate_request to project when estimate is approved
        if (existingTicket.workType === "estimate_request" && newStatus) {
          const ticketType = await storage.getTicketTypeById(existingTicket.ticketTypeId, user.activeCompanyId);
          if (ticketType?.name === "Project") {
            const approvedPathStatuses = ["Ready to Schedule", "Work Completed", "Ready for Billing", "Invoicing"];
            const isInApprovedPath = approvedPathStatuses.includes(newStatus.name);
            if (isInApprovedPath) {
              req.body.workType = "project";
              req.body.billingBehavior = "invoice_required";
              console.log(`Auto-transitioning ticket ${existingTicket.id} work type from estimate_request to project with invoice_required billing (status: ${newStatus.name})`);
            }
          }
        }
        
        // Auto-return delegation: when ticket moves to "Work Completed" and has a delegator
        if (newStatus?.name === "Work Completed" && existingTicket.delegatedById) {
          req.body.assignedToId = existingTicket.delegatedById;
          req.body.delegatedById = null;
          console.log(`Delegation return: ticket ${existingTicket.id} reassigned back to delegator ${existingTicket.delegatedById}`);
          
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
          }
          
          // Auto-propagate Invoice completion back to parent ticket
          const currentTicketType = await storage.getTicketTypeById(existingTicket.ticketTypeId, user.activeCompanyId);
          const isInvoiceTicket = currentTicketType?.name === "Invoice";
          
          if (isInvoiceTicket) {
            try {
              const links = await storage.getTicketLinks(existingTicket.id);
              const parentLink = links.find(l => l.linkType === "invoice_for" && l.targetTicketId === existingTicket.id);
              
              if (parentLink) {
                const parentTicket = await storage.getTicketById(parentLink.sourceTicketId, user.activeCompanyId);
                if (parentTicket) {
                  const parentTicketType = await storage.getTicketTypeById(parentTicket.ticketTypeId, user.activeCompanyId);
                  const parentStatuses = await storage.getTicketTypeStatuses(parentTicket.ticketTypeId);
                  
                  const invoiceFieldValues = await storage.getTicketFieldValues(existingTicket.id);
                  const invoiceFields = await storage.getTicketTypeFields(existingTicket.ticketTypeId);
                  
                  const invoiceDataParts: string[] = [];
                  for (const fv of invoiceFieldValues) {
                    const field = invoiceFields.find(f => f.id === fv.fieldId);
                    if (field && fv.value) {
                      invoiceDataParts.push(`${field.fieldLabel}: ${fv.value}`);
                    }
                  }
                  
                  if (invoiceDataParts.length > 0) {
                    await storage.createTicketComment({
                      ticketId: parentTicket.id,
                      authorId: user.id,
                      body: `[Invoice Completed] ${invoiceDataParts.join(" | ")}`,
                    });
                  }
                  
                  const sortedParentStatuses = [...parentStatuses].sort((a, b) => a.displayOrder - b.displayOrder);
                  const currentStatusIndex = sortedParentStatuses.findIndex(s => s.id === parentTicket.currentStatusId);
                  const nextFinalStatus = sortedParentStatuses.find((s, i) => i > currentStatusIndex && s.isFinal === "true");
                  
                  if (nextFinalStatus) {
                    await storage.updateTicket(parentTicket.id, user.activeCompanyId, {
                      currentStatusId: nextFinalStatus.id,
                      completedAt: new Date(),
                    });
                    
                    await storage.createTicketStatusHistory({
                      ticketId: parentTicket.id,
                      toStatusId: nextFinalStatus.id,
                      changedById: user.id,
                      notes: `Auto-advanced: linked Invoice ticket completed`,
                    });
                    
                    console.log(`Auto-advanced parent ticket ${parentTicket.id} (${parentTicketType?.name}) to "${nextFinalStatus.name}" after Invoice completion`);
                  }
                }
              }
            } catch (err) {
              console.error("Failed to propagate Invoice completion to parent ticket:", err);
            }
          }
        }
        
        // Auto-create Invoice ticket when moving FORWARD to "Ready for Billing"
        const currentTicketTypeForInvoice = await storage.getTicketTypeById(existingTicket.ticketTypeId, user.activeCompanyId);
        const isInvoiceTicketType = currentTicketTypeForInvoice?.name === "Invoice";
        
        console.log(`Invoice auto-creation check for ticket ${existingTicket.id}: newStatus="${newStatus?.name}", billingBehavior="${existingTicket.billingBehavior}", ticketType="${currentTicketTypeForInvoice?.name}", isInvoiceType=${isInvoiceTicketType}`);
        
        if (newStatus?.name === "Ready for Billing" && existingTicket.billingBehavior === "invoice_required" && !isInvoiceTicketType) {
          const existingLinks = await storage.getTicketLinks(existingTicket.id);
          const hasExistingInvoice = existingLinks.some(l => l.linkType === "invoice_for" && l.sourceTicketId === existingTicket.id);
          console.log(`Invoice auto-creation: hasExistingInvoice=${hasExistingInvoice}, links=${JSON.stringify(existingLinks.map(l => ({ id: l.id, type: l.linkType, src: l.sourceTicketId, tgt: l.targetTicketId })))}`);
          
          if (!hasExistingInvoice) {
            try {
              const invoiceTypeInfo = await ensureInvoiceTicketType(user.activeCompanyId);
              
              if (invoiceTypeInfo) {
                const companyUsersForBilling = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
                const billingUser = companyUsersForBilling.find(cu => cu.tags?.includes("billing") && cu.status === "active");
                
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
                  assignedToId: billingUser?.userId || null,
                  createdById: user.id,
                });
                
                await storage.createTicketLink({
                  sourceTicketId: existingTicket.id,
                  targetTicketId: invoiceTicket.id,
                  linkType: "invoice_for",
                });
                
                const sourceComments = await storage.getTicketComments(existingTicket.id);
                for (const comment of sourceComments) {
                  await storage.createTicketComment({
                    ticketId: invoiceTicket.id,
                    authorId: comment.authorId,
                    body: comment.body,
                  });
                }
                
                console.log(`Auto-created Invoice ticket ${invoiceTicket.id} for ticket ${existingTicket.id} at Ready for Billing (assigned to: ${billingUser?.userId || 'unassigned'}) with ${sourceComments.length} notes copied`);
              }
            } catch (err) {
              console.error("Failed to auto-create invoice ticket:", err);
            }
          }
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor" || user.activeRole === "shop_manager") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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

      // Check if an invoice ticket already exists for this parent (prevent duplicates)
      const existingLinks = await storage.getTicketLinks(parentTicketId);
      const existingInvoiceLink = existingLinks.find(l => l.linkType === "invoice_for" && l.sourceTicketId === parentTicketId);
      if (existingInvoiceLink) {
        const existingInvoice = await storage.getTicketById(existingInvoiceLink.targetTicketId, user.activeCompanyId);
        if (existingInvoice) {
          console.log(`Invoice ticket ${existingInvoice.id} already exists for parent ${parentTicketId}, returning existing instead of creating duplicate`);
          return res.json(existingInvoice);
        }
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
    if ((user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
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
    if ((user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
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
      if (field && field.fieldKey === "decision_outcome") {
        // Check if this is a Project ticket
        const ticketType = await storage.getTicketTypeById(ticket.ticketTypeId, user.activeCompanyId);
        const statuses = await storage.getTicketTypeStatuses(ticket.ticketTypeId);
        const currentStatus = statuses.find(s => s.id === ticket.currentStatusId);

        if (ticketType?.name === "Project" && currentStatus?.name === "Decision Received") {
          if (req.body.value === "Approved") {
            const readyToScheduleStatus = statuses.find(s => s.name === "Ready to Schedule");
            if (readyToScheduleStatus) {
              await storage.createTicketStatusHistory({
                ticketId: ticket.id,
                fromStatusId: ticket.currentStatusId,
                toStatusId: readyToScheduleStatus.id,
                changedById: user.id,
                notes: "Auto-transitioned: Estimate approved, ready to schedule with crew",
              });
              await storage.updateTicket(ticket.id, user.activeCompanyId, {
                currentStatusId: readyToScheduleStatus.id,
              });
              console.log(`Auto-transitioned Project ${ticket.id} to "Ready to Schedule" after approval`);
            }
          } else if (req.body.value === "Denied") {
            const closedLostStatus = statuses.find(s => s.name === "Closed - Lost");
            if (closedLostStatus) {
              await storage.createTicketStatusHistory({
                ticketId: ticket.id,
                fromStatusId: ticket.currentStatusId,
                toStatusId: closedLostStatus.id,
                changedById: user.id,
                notes: "Auto-transitioned: Estimate denied, ticket closed as lost",
              });
              await storage.updateTicket(ticket.id, user.activeCompanyId, {
                currentStatusId: closedLostStatus.id,
                completedAt: new Date(),
              });
              console.log(`Auto-transitioned Project ${ticket.id} to "Closed - Lost" after denial`);
            }
          }
        }

        if (ticketType?.name === "RFP Request" && currentStatus?.name === "Decision Received") {
          if (req.body.value === "Lost") {
            const closedLostStatus = statuses.find(s => s.name === "Closed - Lost");
            if (closedLostStatus) {
              await storage.createTicketStatusHistory({
                ticketId: ticket.id,
                fromStatusId: ticket.currentStatusId,
                toStatusId: closedLostStatus.id,
                changedById: user.id,
                notes: "Auto-transitioned: RFP lost, ticket closed as lost",
              });
              await storage.updateTicket(ticket.id, user.activeCompanyId, {
                currentStatusId: closedLostStatus.id,
                completedAt: new Date(),
              });
              console.log(`Auto-transitioned RFP Request ${ticket.id} to "Closed - Lost" after lost decision`);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to auto-transition on decision:", err);
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
    if ((user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
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
    if ((user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteTicketLink(req.params.id);
    res.status(200).send("Deleted");
  });

  // Pending Invoices dashboard endpoint
  // Returns ONLY Invoice tickets in "Pending Invoice" status
  app.get("/api/pending-invoices", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const allTickets = await storage.getTickets(user.activeCompanyId, {});
    const ticketTypes = await storage.getTicketTypes(user.activeCompanyId);
    
    const ticketsNeedingInvoice: typeof allTickets = [];
    
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

    // Bulk enrich with customer info and linked source ticket
    const invoiceTicketIds = ticketsNeedingInvoice.map(t => t.id);
    const customerIds = ticketsNeedingInvoice.map(t => t.customerId).filter(Boolean) as string[];

    const [allLinks, allCustomers] = await Promise.all([
      invoiceTicketIds.length > 0
        ? db.select().from(ticketLinks).where(inArray(ticketLinks.targetTicketId, invoiceTicketIds))
        : Promise.resolve([]),
      customerIds.length > 0
        ? db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
        : Promise.resolve([]),
    ]);

    const customerMap = new Map(allCustomers.map(c => [c.id, c]));
    const linksByTarget = new Map<string, typeof allLinks>();
    for (const link of allLinks) {
      if (!linksByTarget.has(link.targetTicketId)) linksByTarget.set(link.targetTicketId, []);
      linksByTarget.get(link.targetTicketId)!.push(link);
    }

    // Collect source ticket IDs for bulk fetch
    const sourceTicketIds: string[] = [];
    for (const ticket of ticketsNeedingInvoice) {
      const links = linksByTarget.get(ticket.id) || [];
      const sourceLink = links.find(l => l.linkType === "invoice_for" && l.targetTicketId === ticket.id);
      if (sourceLink) sourceTicketIds.push(sourceLink.sourceTicketId);
    }

    const sourceTickets = sourceTicketIds.length > 0
      ? await db.select().from(tickets).where(and(inArray(tickets.id, sourceTicketIds), eq(tickets.companyId, user.activeCompanyId)))
      : [];
    const sourceTicketMap = new Map(sourceTickets.map(t => [t.id, t]));

    const enrichedInvoices = ticketsNeedingInvoice.map((ticket) => {
      const customer = ticket.customerId ? customerMap.get(ticket.customerId) || null : null;
      const links = linksByTarget.get(ticket.id) || [];
      const sourceLink = links.find(l => l.linkType === "invoice_for" && l.targetTicketId === ticket.id);
      const sourceTicket = sourceLink ? sourceTicketMap.get(sourceLink.sourceTicketId) || null : null;
      const ticketType = ticketTypes.find(tt => tt.id === ticket.ticketTypeId);
      return {
        ...ticket,
        customer,
        sourceTicket,
        ticketTypeName: ticketType?.name || "Unknown",
      };
    });

    res.json(enrichedInvoices);
  });

  // Update user tags (admin only)
  app.patch("/api/company-users/:id/tags", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin") return res.status(403).send("Admin only");
    
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).send("Tags must be an array");
    
    const companyUser = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const targetUser = companyUser.find(cu => cu.id === req.params.id);
    if (!targetUser) return res.status(404).send("Company user not found");
    
    await db.update(companyUsersTable).set({ tags }).where(eq(companyUsersTable.id, req.params.id));
    res.json({ success: true, tags });
  });

  // Invoice migration: dry-run and execute
  // Creates Invoice tickets for existing tickets at billing-ready statuses without linked invoices
  app.post("/api/admin/migrate-invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin") return res.status(403).send("Admin only");
    
    const dryRun = req.body.dryRun !== false; // default to dry-run
    
    const allTickets = await storage.getTickets(user.activeCompanyId, {});
    const ticketTypesAll = await storage.getTicketTypes(user.activeCompanyId);
    
    // Find tickets at billing-ready states that need Invoice tickets created
    const ticketsToMigrate: Array<{ ticket: typeof allTickets[0]; ticketTypeName: string; currentStatusName: string; reason: string }> = [];
    
    for (const tt of ticketTypesAll) {
      if (tt.name === "Invoice") continue;
      const statuses = await storage.getTicketTypeStatuses(tt.id);
      
      // Find tickets at "Ready for Billing" status
      const readyForBillingStatus = statuses.find(s => s.name === "Ready for Billing");
      if (readyForBillingStatus) {
        const ticketsAtBilling = allTickets.filter(t => t.ticketTypeId === tt.id && t.currentStatusId === readyForBillingStatus.id);
        for (const t of ticketsAtBilling) {
          const links = await storage.getTicketLinks(t.id);
          const hasInvoice = links.some(l => l.linkType === "invoice_for" && l.sourceTicketId === t.id);
          if (!hasInvoice) {
            ticketsToMigrate.push({ ticket: t, ticketTypeName: tt.name, currentStatusName: "Ready for Billing", reason: "At Ready for Billing without linked Invoice" });
          }
        }
      }
      
      // Also find tickets with invoice_required at final status without linked invoices (legacy)
      if (tt.name !== "Invoice") {
        const finalStatuses = statuses.filter(s => s.isFinal === "true");
        for (const fs of finalStatuses) {
          const ticketsAtFinal = allTickets.filter(t => t.ticketTypeId === tt.id && t.currentStatusId === fs.id && t.billingBehavior === "invoice_required");
          for (const t of ticketsAtFinal) {
            const links = await storage.getTicketLinks(t.id);
            const hasInvoice = links.some(l => l.linkType === "invoice_for" && l.sourceTicketId === t.id);
            if (!hasInvoice) {
              ticketsToMigrate.push({ ticket: t, ticketTypeName: tt.name, currentStatusName: fs.name, reason: `At final status "${fs.name}" with invoice_required but no linked Invoice` });
            }
          }
        }
      }
    }
    
    if (dryRun) {
      const preview = ticketsToMigrate.map(m => ({
        ticketId: m.ticket.id,
        title: m.ticket.title,
        ticketType: m.ticketTypeName,
        currentStatus: m.currentStatusName,
        reason: m.reason,
        customerName: m.ticket.customerId || "No customer",
      }));
      
      // Also get customer names
      const enrichedPreview = await Promise.all(preview.map(async (p) => {
        if (p.customerName !== "No customer") {
          const customer = await storage.getCustomerById(p.customerName, user.activeCompanyId);
          return { ...p, customerName: customer?.name || "Unknown" };
        }
        return p;
      }));
      
      return res.json({ dryRun: true, count: ticketsToMigrate.length, tickets: enrichedPreview });
    }
    
    // Execute migration
    const invoiceTypeInfo = await ensureInvoiceTicketType(user.activeCompanyId);
    if (!invoiceTypeInfo) return res.status(500).send("Failed to ensure Invoice ticket type");
    
    // Find billing-tagged user for assignment
    const companyUsersAll = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
    const billingUser = companyUsersAll.find(cu => cu.tags?.includes("billing") && cu.status === "active");
    
    const results: Array<{ ticketId: string; title: string; invoiceTicketId: string; assigned: boolean }> = [];
    
    for (const m of ticketsToMigrate) {
      try {
        const invoiceTicket = await storage.createTicket({
          companyId: user.activeCompanyId,
          customerId: m.ticket.customerId,
          contractId: m.ticket.contractId,
          ticketTypeId: invoiceTypeInfo.typeId,
          currentStatusId: invoiceTypeInfo.pendingStatusId,
          workType: "admin",
          billingBehavior: "internal",
          title: `Invoice: ${m.ticket.title}`,
          description: `Invoice required for completed work: ${m.ticket.title}\n\nMigrated from existing ${m.ticketTypeName} ticket at "${m.currentStatusName}" status.`,
          priority: "normal",
          assignedToId: billingUser?.userId || null,
          createdById: user.id,
        });
        
        await storage.createTicketLink({
          sourceTicketId: m.ticket.id,
          targetTicketId: invoiceTicket.id,
          linkType: "invoice_for",
        });
        
        // Copy notes from source ticket
        const sourceComments = await storage.getTicketComments(m.ticket.id);
        for (const comment of sourceComments) {
          await storage.createTicketComment({
            ticketId: invoiceTicket.id,
            authorId: comment.authorId,
            body: comment.body,
          });
        }
        
        results.push({
          ticketId: m.ticket.id,
          title: m.ticket.title,
          invoiceTicketId: invoiceTicket.id,
          assigned: !!billingUser,
        });
        
        console.log(`Migration: Created Invoice ticket ${invoiceTicket.id} for ${m.ticketTypeName} ticket ${m.ticket.id} ("${m.ticket.title}")`);
      } catch (err) {
        console.error(`Migration: Failed to create Invoice for ticket ${m.ticket.id}:`, err);
      }
    }
    
    res.json({ dryRun: false, count: results.length, tickets: results });
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
    if ((user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "irrigation_manager") && ticket.assignedToId !== user.id) {
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

    // Fetch all fields for all statuses in a single batch query
    const statusIds = statuses.map(s => s.id);
    const [allStatusFields, assignedUser, delegatedByUser, contract, contractServices, links] = await Promise.all([
      storage.getTicketTypeFieldsByStatuses(statusIds),
      ticket.assignedToId ? storage.getUserById(ticket.assignedToId) : Promise.resolve(null),
      ticket.delegatedById ? storage.getUserById(ticket.delegatedById) : Promise.resolve(null),
      ticket.contractId ? storage.getContractById(ticket.contractId, user.activeCompanyId) : Promise.resolve(null),
      ticket.contractId ? storage.getContractServices(ticket.contractId, user.activeCompanyId) : Promise.resolve([]),
      storage.getTicketLinks(ticket.id),
    ]);

    // Group fields by statusId for O(1) lookup
    const fieldsByStatusId = new Map<string, typeof allStatusFields>();
    for (const field of allStatusFields) {
      const list = fieldsByStatusId.get(field.statusId ?? "") ?? [];
      list.push(field);
      fieldsByStatusId.set(field.statusId ?? "", list);
    }
    const statusesWithFields = statuses.map(status => ({
      ...status,
      fields: fieldsByStatusId.get(status.id) ?? [],
    }));

    // Batch-fetch all linked tickets in a single query
    const linkedIds = links.map(link =>
      link.sourceTicketId === ticket.id ? link.targetTicketId : link.sourceTicketId
    );
    const linkedTicketsRows = await storage.getTicketsByIds(linkedIds, user.activeCompanyId);
    const linkedTicketMap = new Map(linkedTicketsRows.map(t => [t.id, t]));

    // Batch-fetch all ticket types and statuses for linked tickets
    const linkedTypeIds = Array.from(new Set(linkedTicketsRows.map(t => t.ticketTypeId)));
    const [linkedTypesRows, linkedStatusesRows] = await Promise.all([
      storage.getTicketTypesByIds(linkedTypeIds, user.activeCompanyId),
      storage.getTicketTypeStatusesByTypeIds(linkedTypeIds),
    ]);
    const linkedTypeMap = new Map(linkedTypesRows.map(t => [t.id, t]));
    const linkedStatusesByTypeId = new Map<string, typeof linkedStatusesRows>();
    for (const s of linkedStatusesRows) {
      const list = linkedStatusesByTypeId.get(s.ticketTypeId) ?? [];
      list.push(s);
      linkedStatusesByTypeId.set(s.ticketTypeId, list);
    }

    const linkedTickets = links.map((link) => {
      const linkedId = link.sourceTicketId === ticket.id ? link.targetTicketId : link.sourceTicketId;
      const linkedTicket = linkedTicketMap.get(linkedId) ?? null;
      const linkedType = linkedTicket ? linkedTypeMap.get(linkedTicket.ticketTypeId) ?? null : null;
      const linkedStatus = linkedTicket
        ? (linkedStatusesByTypeId.get(linkedTicket.ticketTypeId) ?? []).find(s => s.id === linkedTicket.currentStatusId) ?? null
        : null;
      return {
        link,
        ticket: linkedTicket,
        ticketType: linkedType,
        currentStatus: linkedStatus,
        relationship: link.sourceTicketId === ticket.id ? "target" : "source",
      };
    });

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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "chemical_manager" || user.activeRole === "field" || user.activeRole === "irrigation_manager" || user.activeRole === "landscape_supervisor") {
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
    
    // If profilePhotoPath is being set to a new value, apply company-scoped ACL
    if (req.body.profilePhotoPath && typeof req.body.profilePhotoPath === "string") {
      try {
        const objectStorageService = new ObjectStorageService();
        const objectFile = await objectStorageService.getObjectEntityFile(req.body.profilePhotoPath);
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
      } catch (aclErr) {
        console.error("Error setting profile photo ACL:", aclErr);
      }
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

  // Equipment Profile Photo - Generate upload URL
  app.post("/api/equipment/:equipmentId/profile-photo-upload-url", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    const user = req.user as UserWithContext;

    if (!canEditEquipment(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
      const storagePath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
      res.json({ uploadUrl, storagePath });
    } catch (error) {
      console.error("Error getting profile photo upload URL:", error);
      res.status(500).send("Failed to get upload URL");
    }
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

  // GET /api/customers/:id/communications — list communications for a specific customer
  app.get("/api/customers/:id/communications", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Admin or office role required");
    }
    const customer = await storage.getCustomerById(req.params.id, user.activeCompanyId);
    if (!customer) return res.status(404).send("Customer not found");
    const filters: { type?: string; status?: string; customerId?: string; fromDate?: string; toDate?: string } = { customerId: req.params.id };
    if (req.query.type) filters.type = req.query.type as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.fromDate) filters.fromDate = req.query.fromDate as string;
    if (req.query.toDate) filters.toDate = req.query.toDate as string;
    const items = await storage.getCommunications(user.activeCompanyId, filters);
    res.json(items);
  });

  // GET /api/properties/:id/communications — list communications for a property
  // The communications table has no propertyId column; returns all company communications
  // that would be scoped to a property (empty until property linkage is added to schema).
  app.get("/api/properties/:id/communications", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Admin or office role required");
    }
    const filters: { type?: string; status?: string; fromDate?: string; toDate?: string } = {};
    if (req.query.type) filters.type = req.query.type as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.fromDate) filters.fromDate = req.query.fromDate as string;
    if (req.query.toDate) filters.toDate = req.query.toDate as string;
    // Communications table has no propertyId column; return empty array (property-level comm is a future schema enhancement)
    res.json([]);
  });
  
  // Manually send "Work Completed" email for a ticket (completion protocol final step)
  app.post("/api/tickets/:id/send-completion-email", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Admin or office role required");
    }
    try {
      const ticket = await storage.getTicketById(req.params.id, user.activeCompanyId);
      if (!ticket) return res.status(404).send("Ticket not found");

      if (!ticket.customerId) {
        return res.status(400).send("Ticket has no customer — cannot send completion email");
      }

      const ticketType = await storage.getTicketTypeById(ticket.typeId, user.activeCompanyId);
      if (ticketType) {
        const statuses = await storage.getTicketTypeStatuses(ticketType.id, user.activeCompanyId);
        const currentStatus = statuses.find(s => s.id === ticket.currentStatusId);
        if (!currentStatus || currentStatus.isFinal !== "true") {
          return res.status(400).send("Ticket must be in a final/completed status before sending completion email");
        }
      }

      const customer = await storage.getCustomerById(ticket.customerId, user.activeCompanyId);
      if (!customer) {
        return res.status(400).send("Customer not found");
      }

      let toEmails: string[] = [];
      if (req.body.toEmails && Array.isArray(req.body.toEmails)) {
        toEmails = req.body.toEmails.filter((e: any) => typeof e === 'string' && e.includes('@'));
      } else if (req.body.toEmail && typeof req.body.toEmail === 'string' && req.body.toEmail.includes('@')) {
        toEmails = [req.body.toEmail];
      }

      if (toEmails.length === 0) {
        const contacts = await storage.getContactsByCustomerId(ticket.customerId, user.activeCompanyId);
        const primaryContact = contacts.find(c => c.isPrimary === "true" && c.emails && c.emails.length > 0);
        const fallbackEmail = primaryContact?.emails?.[0] || contacts.find(c => c.emails && c.emails.length > 0)?.emails?.[0];
        if (fallbackEmail) toEmails = [fallbackEmail];
      }

      if (toEmails.length === 0) {
        return res.status(400).send("No email address found for customer contacts");
      }

      const company = await storage.getCompanyById(user.activeCompanyId);
      const completionDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      const allResults: any[] = [];
      for (const toEmail of toEmails) {
        const results = await processEmailEvent('ticket.work_completed', user.activeCompanyId, {
          ticketTitle: ticket.title,
          customerName: customer.name,
          companyName: company?.name || 'Property Maintenance',
          completionDate,
          ticketDescription: ticket.description || '',
        }, {
          customerId: ticket.customerId,
          ticketId: ticket.id,
          toEmail,
          sentById: user.id,
        });
        allResults.push(...results);
      }

      if (allResults.length === 0) {
        return res.status(400).send("No active email rules or templates found for work_completed event");
      }

      res.json({ sent: allResults.length, recipients: toEmails, logs: allResults });
    } catch (err: any) {
      console.error("Failed to send completion email:", err);
      res.status(500).send("Failed to send completion email");
    }
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
      if (!existing) {
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
      }

      const existingChemPre = await storage.getEmailTemplateByName('Chemical Treatment Notice', companyId);
      if (!existingChemPre) {
        const chemPreTemplate = getDefaultChemicalPreNoticeTemplate();
        const preTemplate = await storage.createEmailTemplate({
          ...chemPreTemplate,
          companyId,
        });
        await storage.createEmailRule({
          companyId,
          eventKey: 'campaign.chemical_pre_notice',
          templateId: preTemplate.id,
          conditionsJson: null,
          isEnabled: true,
        });
        console.log(`Seeded Chemical Treatment Notice template for company ${companyId}`);
      }

      const existingChemPost = await storage.getEmailTemplateByName('Chemical Treatment Completion', companyId);
      if (!existingChemPost) {
        const chemPostTemplate = getDefaultChemicalPostNoticeTemplate();
        const postTemplate = await storage.createEmailTemplate({
          ...chemPostTemplate,
          companyId,
        });
        await storage.createEmailRule({
          companyId,
          eventKey: 'campaign.chemical_post_notice',
          templateId: postTemplate.id,
          conditionsJson: null,
          isEnabled: true,
        });
        console.log(`Seeded Chemical Treatment Completion template for company ${companyId}`);
      }
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

  // ===== Reports API =====
  app.get("/api/reports/:type", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const user = req.user as UserWithContext;
    const companyId = user.activeCompanyId;
    const role = user.activeRole;

    if (!["admin", "office"].includes(role || "")) {
      return res.status(403).json({ error: "Reports are available to Admin and Office roles" });
    }

    const reportType = req.params.type;

    try {
      switch (reportType) {
        case "customers": {
          const allCustomers = await storage.getCustomers(companyId);
          const rows = allCustomers.map(c => ({
            name: c.name,
            customerNumber: c.customerNumber || "",
            street: c.street,
            city: c.city,
            state: c.state,
            zip: c.zip,
            status: c.status,
            acres: c.acres || "",
            snowEnabled: c.snowEnabled ? "Yes" : "No",
          }));
          return res.json({
            title: "Customer / Property List",
            columns: [
              { key: "name", label: "Customer Name" },
              { key: "customerNumber", label: "Customer #" },
              { key: "street", label: "Street" },
              { key: "city", label: "City" },
              { key: "state", label: "State" },
              { key: "zip", label: "Zip" },
              { key: "status", label: "Status" },
              { key: "acres", label: "Acres" },
              { key: "snowEnabled", label: "Snow" },
            ],
            rows,
          });
        }

        case "contacts": {
          const allContacts = await db
            .select({
              contactName: contactsTable.name,
              role: contactsTable.role,
              phones: contactsTable.phones,
              emails: contactsTable.emails,
              isPrimary: contactsTable.isPrimary,
              notes: contactsTable.notes,
              customerName: customersTable.name,
            })
            .from(contactsTable)
            .innerJoin(customersTable, eq(contactsTable.customerId, customersTable.id))
            .where(eq(contactsTable.companyId, companyId));

          const rows = allContacts.map(c => ({
            customerName: c.customerName,
            contactName: c.contactName,
            role: c.role || "",
            phone: (c.phones || []).join(", "),
            email: (c.emails || []).join(", "),
            isPrimary: c.isPrimary === "true" ? "Yes" : "",
            notes: c.notes || "",
          }));
          return res.json({
            title: "Contacts by Customer",
            columns: [
              { key: "customerName", label: "Customer" },
              { key: "contactName", label: "Contact Name" },
              { key: "role", label: "Role" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
              { key: "isPrimary", label: "Primary" },
              { key: "notes", label: "Notes" },
            ],
            rows,
          });
        }

        case "equipment": {
          const allEquipment = await storage.getEquipment(companyId);
          const companyUsersForEquip = await storage.getCompanyUsersByCompanyId(companyId);
          const userMapEquip = new Map<string, string>();
          for (const cu of companyUsersForEquip) {
            const u = await storage.getUserById(cu.userId);
            if (u) userMapEquip.set(u.id, u.name || u.email);
          }

          const rows = allEquipment.map(e => ({
            name: e.name,
            equipmentType: e.equipmentType,
            status: e.status,
            make: e.make || "",
            model: e.model || "",
            year: e.year ? String(e.year) : "",
            serialNumber: e.serialNumber || "",
            licensePlate: e.licensePlate || "",
            assignedTo: e.assignedToId ? (userMapEquip.get(e.assignedToId) || "") : "",
            location: e.location || "",
          }));
          return res.json({
            title: "Equipment List",
            columns: [
              { key: "name", label: "Name" },
              { key: "equipmentType", label: "Type" },
              { key: "status", label: "Status" },
              { key: "make", label: "Make" },
              { key: "model", label: "Model" },
              { key: "year", label: "Year" },
              { key: "serialNumber", label: "Serial / VIN" },
              { key: "licensePlate", label: "License Plate" },
              { key: "assignedTo", label: "Assigned To" },
              { key: "location", label: "Location" },
            ],
            rows,
          });
        }

        case "contracts": {
          const allContracts = await db
            .select({
              customerName: customersTable.name,
              serviceType: contractsTable.serviceType,
              billingPattern: contractsTable.billingPattern,
              status: contractsTable.status,
              startDate: contractsTable.startDate,
              endDate: contractsTable.endDate,
              po: contractsTable.po,
              notes: contractsTable.notes,
            })
            .from(contractsTable)
            .innerJoin(customersTable, eq(contractsTable.customerId, customersTable.id))
            .where(eq(contractsTable.companyId, companyId));

          const rows = allContracts.map(c => ({
            customerName: c.customerName,
            serviceType: c.serviceType,
            billingPattern: c.billingPattern,
            status: c.status,
            startDate: c.startDate ? new Date(c.startDate).toLocaleDateString() : "",
            endDate: c.endDate ? new Date(c.endDate).toLocaleDateString() : "",
            po: c.po || "",
            notes: c.notes || "",
          }));
          return res.json({
            title: "Contracts List",
            columns: [
              { key: "customerName", label: "Customer" },
              { key: "serviceType", label: "Service Type" },
              { key: "billingPattern", label: "Billing Pattern" },
              { key: "status", label: "Status" },
              { key: "startDate", label: "Start Date" },
              { key: "endDate", label: "End Date" },
              { key: "po", label: "PO #" },
              { key: "notes", label: "Notes" },
            ],
            rows,
          });
        }

        case "tickets": {
          const allTickets = await storage.getTickets(companyId);
          const allTicketTypes = await storage.getTicketTypes(companyId);
          const companyUsersForTickets = await storage.getCompanyUsersByCompanyId(companyId);
          const userMapTickets = new Map<string, string>();
          for (const cu of companyUsersForTickets) {
            const u = await storage.getUserById(cu.userId);
            if (u) userMapTickets.set(u.id, u.name || u.email);
          }
          const typeMap = new Map(allTicketTypes.map(tt => [tt.id, tt.name]));

          const allStatusesForReport: Array<{ id: string; name: string; ticketTypeId: string }> = [];
          for (const tt of allTicketTypes) {
            const statuses = await storage.getTicketTypeStatuses(tt.id, companyId);
            statuses.forEach(s => allStatusesForReport.push({ id: s.id, name: s.name, ticketTypeId: s.ticketTypeId }));
          }
          const statusMap = new Map(allStatusesForReport.map(s => [s.id, s.name]));

          const allCustomersForTickets = await storage.getCustomers(companyId);
          const custMap = new Map(allCustomersForTickets.map(c => [c.id, c.name]));

          const rows = allTickets.map(t => ({
            title: t.title,
            ticketType: typeMap.get(t.ticketTypeId) || "",
            status: statusMap.get(t.currentStatusId) || "",
            customer: t.customerId ? (custMap.get(t.customerId) || "") : "",
            priority: t.priority,
            workType: t.workType,
            assignedTo: t.assignedToId ? (userMapTickets.get(t.assignedToId) || "") : "",
            dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "",
            completed: t.completedAt ? "Yes" : "No",
            created: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "",
          }));
          return res.json({
            title: "Tickets Summary",
            columns: [
              { key: "title", label: "Title" },
              { key: "ticketType", label: "Ticket Type" },
              { key: "status", label: "Status" },
              { key: "customer", label: "Customer" },
              { key: "priority", label: "Priority" },
              { key: "workType", label: "Work Type" },
              { key: "assignedTo", label: "Assigned To" },
              { key: "dueDate", label: "Due Date" },
              { key: "completed", label: "Completed" },
              { key: "created", label: "Created" },
            ],
            rows,
          });
        }

        default:
          return res.status(400).json({ error: `Unknown report type: ${reportType}` });
      }
    } catch (err) {
      console.error(`Error generating report ${reportType}:`, err);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // ==================== PROPOSAL MAKER ROUTES ====================

  const canAccessProposals = (role: string) => role === "admin" || role === "office";

  app.get("/api/proposals", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const list = await storage.getProposals(user.activeCompanyId);
    res.json(list);
  });

  app.post("/api/proposals", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const { customerId, title, proposalDate, estimateNumber, scopeOfWork, ticketId } = req.body;
    if (!customerId) return res.status(400).json({ error: "customerId is required" });

    const customer = await storage.getCustomerById(customerId, user.activeCompanyId);
    if (!customer) return res.status(400).json({ error: "Customer not found or does not belong to your company" });

    const today = new Date().toISOString().split("T")[0];
    // Use the DB sequence for atomic, concurrency-safe number assignment
    const seqRow = await db.execute(sql`SELECT NEXTVAL('proposal_number_seq') AS seq`);
    const nextSeq = seqRow.rows[0]?.seq as number ?? 1;
    const proposalNumber = `P-${String(nextSeq).padStart(4, "0")}`;
    const proposal = await storage.createProposal({
      companyId: user.activeCompanyId,
      customerId,
      createdById: user.id,
      ticketId: ticketId || null,
      title: title || "Proposal",
      proposalDate: proposalDate || today,
      estimateNumber: estimateNumber || null,
      scopeOfWork: scopeOfWork || "",
      status: "draft",
      proposalNumber,
    });
    res.status(201).json(proposal);
  });

  app.get("/api/proposals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const proposal = await storage.getProposalById(req.params.id, user.activeCompanyId);
    if (!proposal) return res.status(404).send("Not found");
    res.json(proposal);
  });

  app.patch("/api/proposals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { title, proposalDate, estimateNumber, scopeOfWork, ticketId,
            visualScopeSheetId, vsIncludeBase, vsIncludeOverlay } = req.body;
    const updated = await storage.updateProposal(req.params.id, user.activeCompanyId, {
      ...(title !== undefined && { title }),
      ...(proposalDate !== undefined && { proposalDate }),
      ...(estimateNumber !== undefined && { estimateNumber }),
      ...(scopeOfWork !== undefined && { scopeOfWork }),
      ...(ticketId !== undefined && { ticketId: ticketId || null }),
      ...(visualScopeSheetId !== undefined && { visualScopeSheetId: visualScopeSheetId || null }),
      ...(vsIncludeBase !== undefined && { vsIncludeBase: !!vsIncludeBase }),
      ...(vsIncludeOverlay !== undefined && { vsIncludeOverlay: !!vsIncludeOverlay }),
    });
    if (!updated) return res.status(404).send("Not found");
    res.json(updated);
  });

  app.delete("/api/proposals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const proposal = await storage.getProposalById(req.params.id, user.activeCompanyId);
    if (!proposal) return res.status(404).send("Not found");

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (bucketId && proposal.files.length > 0) {
      const bucket = objectStorageClient.bucket(bucketId);
      for (const f of proposal.files) {
        try {
          const objectName = f.storageObjectPath.startsWith("/") ? f.storageObjectPath.slice(1) : f.storageObjectPath;
          await bucket.file(objectName).delete({ ignoreNotFound: true });
        } catch (e) {
          console.error("Error deleting proposal file from GCS:", e);
        }
      }
    }

    await storage.deleteProposal(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  app.get("/api/customers/:id/proposals", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const list = await storage.getProposalsByCustomer(req.params.id, user.activeCompanyId);
    res.json(list);
  });

  app.get("/api/tickets/:ticketId/proposals", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const list = await storage.getProposalsForTicket(req.params.ticketId, user.activeCompanyId);
    res.json(list);
  });

  app.post("/api/convert-heic", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    try {
      const inputBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
      const outputBuffer = await heicConvert({ buffer: inputBuffer, format: "JPEG", quality: 0.85 });
      res.set("Content-Type", "image/jpeg");
      res.send(Buffer.from(outputBuffer));
    } catch (err: any) {
      console.error("HEIC conversion error:", err);
      res.status(400).json({ error: "Failed to convert HEIC file: " + (err.message ?? String(err)) });
    }
  });

  app.post("/api/proposals/:id/files/upload-url", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const { fileType, mimeType, fileSize } = req.body;

    if (!["estimate_pdf", "image"].includes(fileType)) {
      return res.status(400).json({ error: "fileType must be 'estimate_pdf' or 'image'" });
    }
    if (fileType === "estimate_pdf") {
      if (mimeType !== "application/pdf") return res.status(400).json({ error: "Estimate PDF must be a PDF file" });
      if (fileSize > 25 * 1024 * 1024) return res.status(400).json({ error: "PDF must be ≤ 25MB" });
    }
    if (fileType === "image") {
      if (!mimeType?.startsWith("image/")) return res.status(400).json({ error: "Image files must have an image/* MIME type" });
      if (fileSize > 10 * 1024 * 1024) return res.status(400).json({ error: "Images must be ≤ 10MB" });
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadUrl: uploadURL, storagePath: normalizedPath });
    } catch (error) {
      console.error("Error getting proposal file upload URL:", error);
      res.status(500).send("Failed to get upload URL");
    }
  });

  app.post("/api/proposals/:id/files", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const proposal = await storage.getProposalById(req.params.id, user.activeCompanyId);
    if (!proposal) return res.status(404).send("Proposal not found");

    const { fileType, storagePath, filename, mimeType, fileSize, caption } = req.body;

    if (!["estimate_pdf", "image"].includes(fileType)) {
      return res.status(400).json({ error: "Invalid fileType" });
    }

    try {
      const objectStorageService = new ObjectStorageService();

      if (fileType === "estimate_pdf") {
        const existing = await storage.getProposalEstimatePdf(req.params.id, user.activeCompanyId);
        if (existing) {
          const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
          if (bucketId) {
            const bucket = objectStorageClient.bucket(bucketId);
            const objectName = existing.storageObjectPath.startsWith("/") ? existing.storageObjectPath.slice(1) : existing.storageObjectPath;
            try { await bucket.file(objectName).delete({ ignoreNotFound: true }); } catch (e) { /* ignore */ }
          }
          await storage.deleteProposalFile(existing.id, user.activeCompanyId);
        }
      }

      let displayOrder = 0;
      if (fileType === "image") {
        const existingFiles = await storage.getProposalFiles(req.params.id, user.activeCompanyId);
        const images = existingFiles.filter(f => f.fileType === "image");
        displayOrder = images.length > 0 ? Math.max(...images.map(f => f.displayOrder)) + 1 : 0;
      }

      const objectFile = await objectStorageService.getObjectEntityFile(storagePath);
      await setObjectAclPolicy(objectFile, {
        owner: user.id,
        visibility: "private",
        aclRules: [{
          group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: user.activeCompanyId },
          permission: ObjectPermission.READ,
        }],
      });

      const file = await storage.createProposalFile({
        proposalId: req.params.id,
        companyId: user.activeCompanyId,
        fileType,
        storageObjectPath: storagePath,
        filename,
        mimeType,
        fileSize,
        caption: caption || null,
        displayOrder,
      });
      res.status(201).json(file);
    } catch (error) {
      console.error("Error creating proposal file:", error);
      res.status(500).send("Failed to create proposal file");
    }
  });

  app.patch("/api/proposals/:id/files/:fileId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const file = await storage.getProposalFileById(req.params.fileId, user.activeCompanyId);
    if (!file) return res.status(404).send("File not found");

    const { caption } = req.body;
    const updated = await storage.updateProposalFile(req.params.fileId, user.activeCompanyId, { caption: caption ?? null });
    res.json(updated);
  });

  app.delete("/api/proposals/:id/files/:fileId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const file = await storage.getProposalFileById(req.params.fileId, user.activeCompanyId);
    if (!file) return res.status(404).send("File not found");

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (bucketId) {
      const bucket = objectStorageClient.bucket(bucketId);
      const objectName = file.storageObjectPath.startsWith("/") ? file.storageObjectPath.slice(1) : file.storageObjectPath;
      try { await bucket.file(objectName).delete({ ignoreNotFound: true }); } catch (e) { /* ignore */ }
    }

    await storage.deleteProposalFile(req.params.fileId, user.activeCompanyId);
    res.json({ success: true });
  });

  // ---- Image compression helper for proposal PDF ----
  async function compressImageForPdf(buffer: Buffer): Promise<Buffer> {
    try {
      const { createCanvas, loadImage } = await import("canvas");
      const img = await loadImage(buffer);
      const MAX_DIM = 1500;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img as any, 0, 0, w, h);
      return canvas.toBuffer("image/jpeg", { quality: 0.80 });
    } catch (err) {
      console.warn("compressImageForPdf: compression failed, using original buffer:", err);
      return buffer;
    }
  }

  // ---- Proposal PDF helper (used by both the preview endpoint and the finalize endpoint) ----
  async function generateProposalPdf(proposal: import("@shared/schema").ProposalWithDetails, companyId: string): Promise<Buffer> {
    const estimateFile = await storage.getProposalEstimatePdf(proposal.id, companyId);
    if (!estimateFile) {
      throw Object.assign(new Error("No estimate PDF attached to this proposal. Upload a QB Estimate PDF before generating."), { statusCode: 400 });
    }

    const companySettings = await storage.getSettings(companyId);
    const companyName = companySettings?.companyName || "High Plains Property Maintenance";

    const logoPath = path.join(process.cwd(), 'attached_assets', 'NEW - LOGO-03_1763582979034.png');
    let logoBuffer: Buffer | null = null;
    try {
      logoBuffer = await fs.readFile(logoPath);
    } catch (_err) {}

    const objectStorageService = new ObjectStorageService();
    let estimateBuffer: Buffer;
    try {
      const gcsFile = await objectStorageService.getObjectEntityFile(estimateFile.storageObjectPath);
      const [downloaded] = await gcsFile.download();
      estimateBuffer = downloaded as Buffer;
    } catch (err) {
      console.error('Proposal PDF: failed to download estimate PDF:', err);
      throw Object.assign(new Error("Failed to download estimate PDF. The file may be missing or corrupted."), { statusCode: 500 });
    }

    const PDFDocumentKit = (await import('pdfkit')).default;

    const LM = 72;
    const RM = 72;
    const BRAND = '#1a4d1a';

    function drawWatermark(d: InstanceType<typeof PDFDocumentKit>) {
      const W = d.page.width;
      const H = d.page.height;
      d.save();
      d.opacity(0.05);

      d.fillColor('#6aaa6a');
      d.moveTo(0, H * 0.55)
        .bezierCurveTo(W * 0.20, H * 0.35, W * 0.40, H * 0.42, W * 0.55, H * 0.38)
        .bezierCurveTo(W * 0.70, H * 0.34, W * 0.85, H * 0.44, W, H * 0.50)
        .lineTo(W, H)
        .lineTo(0, H)
        .closePath()
        .fill();

      d.fillColor('#3d7a3d');
      d.moveTo(0, H * 0.65)
        .bezierCurveTo(W * 0.15, H * 0.50, W * 0.32, H * 0.57, W * 0.50, H * 0.52)
        .bezierCurveTo(W * 0.68, H * 0.47, W * 0.82, H * 0.55, W, H * 0.62)
        .lineTo(W, H)
        .lineTo(0, H)
        .closePath()
        .fill();

      d.fillColor('#1a4d1a');
      d.moveTo(0, H * 0.76)
        .bezierCurveTo(W * 0.18, H * 0.64, W * 0.36, H * 0.70, W * 0.52, H * 0.66)
        .bezierCurveTo(W * 0.70, H * 0.62, W * 0.86, H * 0.68, W, H * 0.73)
        .lineTo(W, H)
        .lineTo(0, H)
        .closePath()
        .fill();

      d.restore();
    }

    function drawFooter(d: InstanceType<typeof PDFDocumentKit>, pageNum: number, company: string) {
      const W = d.page.width;
      const H = d.page.height;
      const footerY = H - 50;
      d.save();
      d.moveTo(LM, footerY - 10)
        .lineTo(W - RM, footerY - 10)
        .strokeColor('#cccccc')
        .lineWidth(0.4)
        .stroke();
      const origBottom = (d.page.margins as any).bottom;
      (d.page.margins as any).bottom = 0;
      d.fillColor('#999999')
        .fontSize(8)
        .font('Helvetica')
        .text(company, LM, footerY, { width: W - LM - RM, align: 'center' });
      d.fillColor('#bbbbbb')
        .fontSize(7)
        .font('Helvetica')
        .text(`Page ${pageNum}`, LM, footerY + 12, { width: W - LM - RM, align: 'center' });
      (d.page.margins as any).bottom = origBottom;
      d.restore();
    }

    const chunks: Buffer[] = [];
    const doc = new PDFDocumentKit({
      size: 'LETTER',
      margins: { top: LM, bottom: LM, left: LM, right: RM },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    let brandedPageCounter = 0;
    const brandedGuard = { active: false };
    // Track current body font state — PDFKit save()/restore() does NOT restore font state,
    // so after drawFooter sets fontSize(7) the font leaks into overflow text unless we restore it.
    let bodyFontState = { font: 'Helvetica', size: 10.5, color: '#222222' };
    function drawPageDecorations(d: InstanceType<typeof PDFDocumentKit>, num: number) {
      if (brandedGuard.active) return;
      brandedGuard.active = true;
      const savedY = d.y;
      try {
        drawWatermark(d);
        drawFooter(d, num, companyName);
      } finally {
        d.y = savedY;
        brandedGuard.active = false;
      }
    }
    brandedPageCounter = 1;
    drawPageDecorations(doc, brandedPageCounter);
    doc.on('pageAdded', () => {
      brandedPageCounter++;
      drawPageDecorations(doc, brandedPageCounter);
      // Restore body font after footer drawing — footer sets fontSize(7) which would otherwise
      // leak into any text that overflows onto this new page.
      doc.fillColor(bodyFontState.color).fontSize(bodyFontState.size).font(bodyFontState.font);
    });

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - LM - RM;

    // --- Letterhead block ---
    if (logoBuffer) {
      const logoWidth = 160;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.image(logoBuffer, logoX, LM, { width: logoWidth });
      const logoHeight = (logoWidth / 160) * 80;
      doc.y = LM + logoHeight + 18;
    } else {
      doc.y = LM + 10;
    }

    doc.fillColor(BRAND)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(companyName, LM, doc.y, { width: contentWidth, align: 'center' });

    doc.moveDown(1.0);
    doc.moveTo(LM, doc.y)
      .lineTo(pageWidth - RM, doc.y)
      .strokeColor(BRAND)
      .lineWidth(0.75)
      .stroke();
    doc.moveDown(1.2);

    // --- Title block ---
    doc.fillColor(BRAND)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(proposal.title || 'Proposal', LM, doc.y, { width: contentWidth });

    doc.moveDown(0.5);
    doc.moveTo(LM, doc.y)
      .lineTo(pageWidth - RM, doc.y)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(1.0);

    // --- Metadata block (labeled fields) ---
    const formattedDate = proposal.proposalDate
      ? (() => {
          const d = new Date(proposal.proposalDate + 'T00:00:00');
          return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        })()
      : '';

    const labelWidth = 105;
    const valueX = LM + labelWidth;
    const valueWidth = contentWidth - labelWidth;

    function metaRow(label: string, value: string) {
      const rowY = doc.y;
      doc.fillColor('#333333').fontSize(10).font('Helvetica-Bold')
        .text(label, LM, rowY, { width: labelWidth, lineBreak: false });
      doc.fillColor('#333333').fontSize(10).font('Helvetica')
        .text(value, valueX, rowY, { width: valueWidth });
      doc.moveDown(0.3);
    }

    metaRow('Prepared For:', proposal.customerName || '');
    if (formattedDate) metaRow('Proposal Date:', formattedDate);
    if (proposal.estimateNumber && proposal.estimateNumber.trim() !== '') {
      metaRow('Estimate #:', proposal.estimateNumber.trim());
    }

    doc.moveDown(1.0);
    doc.moveTo(LM, doc.y)
      .lineTo(pageWidth - RM, doc.y)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(1.0);

    // --- Scope heading ---
    doc.fillColor(BRAND)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('SCOPE OF WORK', LM, doc.y, { width: contentWidth });

    doc.moveDown(0.4);
    doc.moveTo(LM, doc.y)
      .lineTo(pageWidth - RM, doc.y)
      .strokeColor(BRAND)
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.8);

    // --- Scope body text ---
    bodyFontState = { font: 'Helvetica', size: 10.5, color: '#222222' };
    doc.fillColor(bodyFontState.color).fontSize(bodyFontState.size).font(bodyFontState.font);

    const scopeText = proposal.scopeOfWork || '';
    const lines = scopeText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[PAGE BREAK]') {
        doc.addPage();
        // pageAdded event fires: decorates the page and restores bodyFontState
      } else if (trimmed === '') {
        doc.moveDown(0.5);
      } else if (line.trimStart().startsWith('-') || line.trimStart().startsWith('•')) {
        const bulletText = line.trimStart().replace(/^[-•]\s*/, '');
        doc.text(`  \u2022  ${bulletText}`, LM, doc.y, { width: contentWidth, lineGap: 4 });
      } else {
        doc.text(line, LM, doc.y, { width: contentWidth, lineGap: 4 });
      }
    }

    doc.end();
    const brandedBuffer = await pdfPromise;

    // --- Photo appendix (P4) ---
    const MAX_IMAGES = 25;
    const images = proposal.files
      .filter(f => f.fileType === 'image')
      .sort((a, b) => a.displayOrder - b.displayOrder);

    if (images.length > MAX_IMAGES) {
      throw Object.assign(new Error(`Too many images attached (${images.length}). Maximum allowed for PDF generation is ${MAX_IMAGES}. Remove some images and try again.`), { statusCode: 400 });
    }

    const imageBuffers: { buffer: Buffer; filename: string; caption: string | null }[] = [];
    for (const img of images) {
      try {
        const gcsFile = await objectStorageService.getObjectEntityFile(img.storageObjectPath);
        const [imgData] = await gcsFile.download();
        const rawBuffer = imgData as Buffer;
        const compressed = await compressImageForPdf(rawBuffer);
        imageBuffers.push({ buffer: compressed, filename: img.filename, caption: img.caption ?? null });
      } catch (err) {
        console.error(`Proposal PDF: failed to download image "${img.filename}":`, err);
        throw Object.assign(new Error(`Failed to load image "${img.filename}". The file may be missing or corrupted.`), { statusCode: 400 });
      }
    }

    let appendixBuffer: Buffer | null = null;
    if (imageBuffers.length > 0) {
      const appendixDoc = new PDFDocumentKit({
        size: 'LETTER',
        margins: { top: LM, bottom: LM, left: LM, right: RM },
      });
      const appChunks: Buffer[] = [];
      appendixDoc.on('data', (chunk: Buffer) => appChunks.push(chunk));
      const appendixPromise = new Promise<Buffer>((resolve, reject) => {
        appendixDoc.on('end', () => resolve(Buffer.concat(appChunks)));
        appendixDoc.on('error', reject);
      });

      let appendixPageCounter = 0;
      const appendixGuard = { active: false };
      function drawAppendixDecorations(d: InstanceType<typeof PDFDocumentKit>, num: number) {
        if (appendixGuard.active) return;
        appendixGuard.active = true;
        const savedY = d.y;
        try {
          drawWatermark(d);
          drawFooter(d, num, companyName);
        } finally {
          d.y = savedY;
          appendixGuard.active = false;
        }
      }
      appendixPageCounter = 1;
      drawAppendixDecorations(appendixDoc, appendixPageCounter);
      appendixDoc.on('pageAdded', () => {
        appendixPageCounter++;
        drawAppendixDecorations(appendixDoc, appendixPageCounter);
      });

      const appPageWidth = appendixDoc.page.width;
      const appPageHeight = appendixDoc.page.height;
      const appLeft = LM;
      const appContentWidth = appPageWidth - LM - RM;

      const captionReserve = 55;
      const captionY = appPageHeight - RM - 35;
      const maxImgWidth = appContentWidth;

      for (let idx = 0; idx < imageBuffers.length; idx++) {
        const img = imageBuffers[idx];
        if (idx > 0) appendixDoc.addPage();

        let currentImgTopY: number;
        let currentMaxImgHeight: number;

        if (idx === 0) {
          // Draw PROJECT IMAGES heading at top of first image page
          appendixDoc.fillColor(BRAND)
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('PROJECT IMAGES', appLeft, LM, { width: appContentWidth, align: 'center' });
          const dividerY = LM + 20;
          const dividerX = appLeft + (appContentWidth - 200) / 2;
          appendixDoc.moveTo(dividerX, dividerY)
            .lineTo(dividerX + 200, dividerY)
            .strokeColor(BRAND)
            .lineWidth(0.5)
            .stroke();
          currentImgTopY = LM + 36;
          currentMaxImgHeight = appPageHeight - currentImgTopY - RM - captionReserve;
        } else {
          currentImgTopY = LM;
          currentMaxImgHeight = appPageHeight - LM - RM - captionReserve;
        }

        try {
          appendixDoc.image(img.buffer, appLeft, currentImgTopY, {
            fit: [maxImgWidth, currentMaxImgHeight],
            align: 'center',
          });
        } catch (err) {
          console.error(`Proposal PDF: failed to render image "${img.filename}":`, err);
          throw Object.assign(new Error(`Image "${img.filename}" could not be rendered. It may be corrupted or an unsupported format (JPG and PNG are supported).`), { statusCode: 400 });
        }
        if (img.caption && img.caption.trim()) {
          appendixDoc.fillColor('#666666').fontSize(9.5).font('Helvetica')
            .text(img.caption.trim(), appLeft, captionY, { width: appContentWidth, align: 'center' });
        }
      }

      appendixDoc.end();
      appendixBuffer = await appendixPromise;
    }

    // --- VS4: Render Visual Scope pages if attached ---
    let vsBuffer: Buffer | null = null;
    if (proposal.visualScopeSheetId && proposal.visualScopeSheet) {
      const vsSheet = proposal.visualScopeSheet;
      if (!vsSheet.baseImagePath) {
        throw Object.assign(new Error("Attached Visual Scope Sheet has no base image. Capture or upload a base image before generating the proposal PDF."), { statusCode: 400 });
      }

      // Render pages server-side using VS3 renderer
      let combinedPng: Buffer;
      try {
        combinedPng = await renderVisualScope(vsSheet as any, "combined", 2000);
      } catch (err: any) {
        throw Object.assign(new Error(`Visual Scope export failed: ${err.message}`), { statusCode: 400 });
      }

      let basePng: Buffer | null = null;
      if (proposal.vsIncludeBase) {
        try {
          basePng = await renderVisualScope(vsSheet as any, "base", 2000);
        } catch (err: any) {
          throw Object.assign(new Error(`Visual Scope base export failed: ${err.message}`), { statusCode: 400 });
        }
      }

      let overlayPng: Buffer | null = null;
      if (proposal.vsIncludeOverlay) {
        try {
          overlayPng = await renderVisualScope(vsSheet as any, "overlay", 2000);
        } catch (err: any) {
          throw Object.assign(new Error(`Visual Scope overlay export failed: ${err.message}`), { statusCode: 400 });
        }
      }

      const vsPageList: { title: string; buffer: Buffer }[] = [
        { title: "VISUAL SCOPE", buffer: combinedPng },
        ...(basePng ? [{ title: "VISUAL SCOPE — BASE IMAGE", buffer: basePng }] : []),
        ...(overlayPng ? [{ title: "VISUAL SCOPE — OVERLAY", buffer: overlayPng }] : []),
      ];

      const vsDoc = new PDFDocumentKit({ size: "LETTER", margins: { top: LM, bottom: LM, left: LM, right: RM } });
      const vsChunks: Buffer[] = [];
      vsDoc.on("data", (chunk: Buffer) => vsChunks.push(chunk));
      const vsPromise = new Promise<Buffer>((resolve, reject) => {
        vsDoc.on("end", () => resolve(Buffer.concat(vsChunks)));
        vsDoc.on("error", reject);
      });

      let vsPageCounter = 0;
      const vsGuard = { active: false };
      function drawVsDecorations(d: InstanceType<typeof PDFDocumentKit>, num: number) {
        if (vsGuard.active) return;
        vsGuard.active = true;
        const savedY = d.y;
        try { drawWatermark(d); drawFooter(d, num, companyName); }
        finally { d.y = savedY; vsGuard.active = false; }
      }
      vsPageCounter = 1;
      drawVsDecorations(vsDoc, vsPageCounter);
      vsDoc.on("pageAdded", () => { vsPageCounter++; drawVsDecorations(vsDoc, vsPageCounter); });

      const vsCaption = `${vsSheet.title}  ·  ${vsSheet.scopeDate}`;
      const captionHeight = 26;
      const footerReserve = 60;

      for (let i = 0; i < vsPageList.length; i++) {
        if (i > 0) vsDoc.addPage();

        const W = vsDoc.page.width;
        const H = vsDoc.page.height;
        const contentW = W - LM - RM;

        // Section title
        vsDoc.fillColor(BRAND).fontSize(13).font("Helvetica-Bold")
          .text(vsPageList[i].title, LM, LM, { width: contentW, align: "center" });
        const dividerY = LM + 20;
        const dividerX = LM + (contentW - 200) / 2;
        vsDoc.moveTo(dividerX, dividerY).lineTo(dividerX + 200, dividerY)
          .strokeColor(BRAND).lineWidth(0.5).stroke();

        // Image area
        const imgTopY = LM + 36;
        const availH = H - imgTopY - footerReserve - captionHeight;

        try {
          vsDoc.image(vsPageList[i].buffer, LM, imgTopY, {
            fit: [contentW, availH],
            align: "center",
          });
        } catch (err) {
          throw Object.assign(new Error("Visual Scope image could not be rendered in the PDF."), { statusCode: 400 });
        }

        // Caption
        const captionY = H - footerReserve - captionHeight + 4;
        vsDoc.fillColor("#666666").fontSize(9).font("Helvetica")
          .text(vsCaption, LM, captionY, { width: contentW, align: "center" });
      }

      vsDoc.end();
      vsBuffer = await vsPromise;
    }

    // --- Merge all sections with pdf-lib ---
    const { PDFDocument, PDFName } = await import('pdf-lib');

    function isEstimatePageBlank(pdfDoc: InstanceType<typeof PDFDocument>, pageIdx: number): boolean {
      try {
        const page = pdfDoc.getPage(pageIdx);
        const resourcesRef = page.node.get(PDFName.of('Resources'));
        if (!resourcesRef) return true;
        const resources = (pdfDoc as any).context.lookup(resourcesRef) ?? resourcesRef;
        const fonts = resources.get?.(PDFName.of('Font'));
        const xObjects = resources.get?.(PDFName.of('XObject'));
        return !fonts && !xObjects;
      } catch { return false; }
    }

    let mergedBuffer: Buffer;
    try {
      const mergedDoc = await PDFDocument.load(brandedBuffer);

      // VS4: Insert Visual Scope pages after branded cover, before estimate
      if (vsBuffer) {
        const vsPdfDoc = await PDFDocument.load(vsBuffer);
        const vsPages = await mergedDoc.copyPages(vsPdfDoc, vsPdfDoc.getPageIndices());
        vsPages.forEach(p => mergedDoc.addPage(p));
      }

      const estimateDoc = await PDFDocument.load(estimateBuffer);
      const allIndices = estimateDoc.getPageIndices();
      const filteredIndices = allIndices.filter(i => !isEstimatePageBlank(estimateDoc, i));
      const indicesToCopy = filteredIndices.length > 0 ? filteredIndices : allIndices;
      const estimatePages = await mergedDoc.copyPages(estimateDoc, indicesToCopy);
      estimatePages.forEach(p => mergedDoc.addPage(p));

      if (appendixBuffer) {
        const appendixPdfDoc = await PDFDocument.load(appendixBuffer);
        const appendixPages = await mergedDoc.copyPages(appendixPdfDoc, appendixPdfDoc.getPageIndices());
        appendixPages.forEach(p => mergedDoc.addPage(p));
      }

      mergedBuffer = Buffer.from(await mergedDoc.save());
    } catch (err) {
      console.error('Proposal PDF: pdf-lib merge failed:', err);
      throw Object.assign(new Error("PDF merge failed. One or more documents may be corrupted or use an unsupported format."), { statusCode: 422 });
    }

    const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
    if (mergedBuffer.byteLength > MAX_PDF_BYTES) {
      const totalMB = (mergedBuffer.byteLength / 1024 / 1024).toFixed(1);
      const estimateMB = (estimateBuffer.byteLength / 1024 / 1024).toFixed(1);
      const imageMB = (imageBuffers.reduce((sum, b) => sum + b.buffer.byteLength, 0) / 1024 / 1024).toFixed(1);
      let guidance = `Generated PDF is ${totalMB} MB, which exceeds the 25 MB email limit.`;
      if (estimateBuffer.byteLength > 10 * 1024 * 1024) {
        guidance += ` Your QB Estimate PDF is ${estimateMB} MB — try exporting a smaller/flattened version from QuickBooks.`;
      }
      if (imageBuffers.length > 0) {
        guidance += ` Supporting images total ${imageMB} MB after compression — consider reducing the number of images or their file sizes.`;
      }
      throw Object.assign(new Error(guidance), { statusCode: 400 });
    }

    return mergedBuffer;
  }

  app.get("/api/proposals/:id/pdf", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const proposal = await storage.getProposalById(req.params.id, user.activeCompanyId);
    if (!proposal) return res.status(404).send("Proposal not found");

    let mergedBuffer: Buffer;
    try {
      mergedBuffer = await generateProposalPdf(proposal, user.activeCompanyId);
    } catch (err: any) {
      return res.status(err?.statusCode ?? 500).send(err?.message ?? "PDF generation failed");
    }

    const safeTitle = (proposal.title || 'Proposal')
      .replace(/[/\\:*?"<>|]/g, '-')
      .trim()
      .substring(0, 80) || 'Proposal';
    const safeCustomer = (proposal.customerName || 'Client')
      .replace(/[/\\:*?"<>|]/g, '-')
      .trim()
      .substring(0, 60) || 'Client';
    const dateStr = proposal.proposalDate
      ? proposal.proposalDate.substring(0, 10)
      : new Date().toISOString().substring(0, 10);
    const filename = `${safeTitle} - ${safeCustomer} - ${dateStr}.pdf`;

    const isInline = req.query.inline === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', isInline ? `inline; filename="proposal.pdf"` : `attachment; filename="${filename}"`);
    res.end(mergedBuffer);
  });

  // ---- Finalize proposal (create immutable version) ----
  app.post("/api/proposals/:id/finalize", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const proposal = await storage.getProposalById(req.params.id, user.activeCompanyId);
    if (!proposal) return res.status(404).send("Proposal not found");

    const estimateFile = proposal.files.find(f => f.fileType === 'estimate_pdf');
    if (!estimateFile) {
      return res.status(400).send("No estimate PDF attached. Upload a QB Estimate PDF before finalizing.");
    }

    let mergedBuffer: Buffer;
    try {
      mergedBuffer = await generateProposalPdf(proposal, user.activeCompanyId);
    } catch (err: any) {
      return res.status(err?.statusCode ?? 500).send(`PDF generation failed: ${err?.message ?? "Unknown error"}`);
    }

    // Render VS PNGs once before the retry loop (expensive, render only once)
    type VsSnapshots = {
      combinedBuffer: Buffer;
      baseBuffer: Buffer | null;
      overlayBuffer: Buffer | null;
    };
    let vsSnapshots: VsSnapshots | null = null;

    if (proposal.visualScopeSheetId && proposal.visualScopeSheet) {
      const vsSheet = proposal.visualScopeSheet;
      if (!vsSheet.baseImagePath) {
        return res.status(400).send("Attached Visual Scope Sheet has no base image. Capture or upload an image before finalizing.");
      }
      try {
        const combinedBuffer = await renderVisualScope(vsSheet as any, "combined", 2000);
        const baseBuffer = proposal.vsIncludeBase
          ? await renderVisualScope(vsSheet as any, "base", 2000)
          : null;
        const overlayBuffer = proposal.vsIncludeOverlay
          ? await renderVisualScope(vsSheet as any, "overlay", 2000)
          : null;
        vsSnapshots = { combinedBuffer, baseBuffer, overlayBuffer };
      } catch (err: any) {
        return res.status(400).send(`Visual Scope snapshot render failed: ${err?.message ?? "Unknown error"}`);
      }
    }

    const attemptFinalize = async (): Promise<import("@shared/schema").ProposalVersion> => {
      const nextVersion = await storage.getNextVersionNumber(proposal.id, user.activeCompanyId);
      const objectStorageService = new ObjectStorageService();
      const relativePath = `proposal-versions/${proposal.id}/v${nextVersion}.pdf`;
      let storedPath: string;
      try {
        storedPath = await objectStorageService.saveBufferToPrivatePath(relativePath, mergedBuffer, 'application/pdf');
      } catch (err) {
        console.error('Proposal finalize: GCS upload failed:', err);
        throw Object.assign(new Error("Failed to store finalized PDF. Please try again."), { statusCode: 500 });
      }

      let vsCombinedPath: string | null = null;
      let vsBasePath: string | null = null;
      let vsOverlayPath: string | null = null;

      if (vsSnapshots) {
        const vsPrefix = `proposal-versions/${proposal.id}/v${nextVersion}`;
        try {
          vsCombinedPath = await objectStorageService.saveBufferToPrivatePath(
            `${vsPrefix}/visual-scope-combined.png`, vsSnapshots.combinedBuffer, "image/png"
          );
          if (vsSnapshots.baseBuffer) {
            vsBasePath = await objectStorageService.saveBufferToPrivatePath(
              `${vsPrefix}/visual-scope-base.png`, vsSnapshots.baseBuffer, "image/png"
            );
          }
          if (vsSnapshots.overlayBuffer) {
            vsOverlayPath = await objectStorageService.saveBufferToPrivatePath(
              `${vsPrefix}/visual-scope-overlay.png`, vsSnapshots.overlayBuffer, "image/png"
            );
          }
        } catch (err) {
          console.error("Proposal finalize: VS PNG GCS upload failed:", err);
          throw Object.assign(new Error("Failed to store Visual Scope snapshot. Please try again."), { statusCode: 500 });
        }
      }

      try {
        return await storage.createProposalVersion({
          proposalId: proposal.id,
          companyId: user.activeCompanyId,
          versionNumber: nextVersion,
          title: proposal.title,
          proposalDate: proposal.proposalDate,
          estimateNumber: proposal.estimateNumber ?? null,
          finalizedById: user.id,
          pdfStoragePath: storedPath,
          ...(vsSnapshots && proposal.visualScopeSheet ? {
            visualScopeSheetId: proposal.visualScopeSheetId!,
            visualScopeTitle: proposal.visualScopeSheet.title,
            visualScopeDate: proposal.visualScopeSheet.scopeDate,
            vsExportWidth: 2000,
            vsIncludedBase: proposal.vsIncludeBase ?? false,
            vsIncludedOverlay: proposal.vsIncludeOverlay ?? false,
            vsFrozenAt: new Date(),
            vsCombinedPath,
            vsBasePath,
            vsOverlayPath,
          } : {}),
        });
      } catch (err: any) {
        if (err?.code === '23505') {
          throw Object.assign(new Error('RETRY'), { isRetry: true });
        }
        throw Object.assign(new Error("Failed to save finalized version record."), { statusCode: 500 });
      }
    };

    let version: import("@shared/schema").ProposalVersion;
    try {
      version = await attemptFinalize();
    } catch (err: any) {
      if (err?.isRetry) {
        try {
          version = await attemptFinalize();
        } catch (retryErr: any) {
          return res.status(409).send("Version number conflict. Please try again.");
        }
      } else {
        return res.status((err as any)?.statusCode ?? 500).send(err?.message ?? "Finalization failed");
      }
    }

    const versionWithUser = await storage.getProposalVersionById(version.id, user.activeCompanyId);
    res.status(201).json(versionWithUser);
  });

  // ---- List finalized versions for a proposal ----
  app.get("/api/proposals/:id/versions", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const versions = await storage.getProposalVersions(req.params.id, user.activeCompanyId);
    res.json(versions);
  });

  // ---- Download a specific finalized version PDF ----
  app.get("/api/proposals/:id/versions/:versionId/download", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const version = await storage.getProposalVersionById(req.params.versionId, user.activeCompanyId);
    if (!version) return res.status(404).send("Version not found");

    const proposal = await storage.getProposalById(req.params.id, user.activeCompanyId);

    let pdfBytes: Buffer;
    try {
      const objectStorageService = new ObjectStorageService();
      pdfBytes = await objectStorageService.downloadByPath(version.pdfStoragePath);
    } catch (err) {
      console.error('Proposal version download: failed to retrieve stored PDF:', err);
      return res.status(500).send("Failed to retrieve the finalized PDF. It may have been removed.");
    }

    const safeTitle = ((proposal?.title) || 'Proposal')
      .replace(/[/\\:*?"<>|]/g, '-').trim().substring(0, 80) || 'Proposal';
    const safeCustomer = ((proposal?.customerName) || 'Client')
      .replace(/[/\\:*?"<>|]/g, '-').trim().substring(0, 60) || 'Client';
    const dateStr = version.proposalDate ? version.proposalDate.substring(0, 10) : new Date().toISOString().substring(0, 10);
    const filename = `${safeTitle} - ${safeCustomer} - v${version.versionNumber} - ${dateStr}.pdf`;

    const isInline = req.query.inline === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', isInline ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`);
    res.end(pdfBytes);
  });

  // ---- Download a frozen VS PNG snapshot for a specific version ----
  app.get("/api/proposals/:id/versions/:versionId/visual-scope/:type", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessProposals(user.activeRole)) return res.status(403).send("Insufficient permissions");

    const version = await storage.getProposalVersionById(req.params.versionId, user.activeCompanyId);
    if (!version) return res.status(404).send("Version not found");

    const type = req.params.type as "combined" | "base" | "overlay";
    const pathMap: Record<string, string | null | undefined> = {
      combined: version.vsCombinedPath,
      base: version.vsBasePath,
      overlay: version.vsOverlayPath,
    };
    const gcsPath = pathMap[type];
    if (!gcsPath) return res.status(404).send("Visual Scope snapshot not found for this version");

    let imgBytes: Buffer;
    try {
      const objectStorageService = new ObjectStorageService();
      imgBytes = await objectStorageService.downloadByPath(gcsPath);
    } catch (err) {
      console.error("VS snapshot download failed:", err);
      return res.status(500).send("Failed to retrieve Visual Scope snapshot.");
    }

    const inline = req.query.inline === "1";
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition",
      inline
        ? `inline; filename="visual-scope-${type}.png"`
        : `attachment; filename="visual-scope-${type}.png"`
    );
    res.send(imgBytes);
  });

  // ─── Visual Scope Sheets ────────────────────────────────────────────────────
  const canAccessVisualScope = (role: string) => role === "admin" || role === "office";

  app.get("/api/config/mapbox-token", (_req, res) => {
    res.json({ token: process.env.MAPBOX_PUBLIC_KEY ?? null });
  });

  app.get("/api/visual-scope-sheets", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheets = await storage.getVisualScopeSheets(user.activeCompanyId);
    res.json(sheets);
  });

  app.get("/api/visual-scope-sheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheet = await storage.getVisualScopeSheet(req.params.id, user.activeCompanyId);
    if (!sheet) return res.status(404).json({ error: "Not found" });
    res.json(sheet);
  });

  app.get("/api/visual-scope-sheets/:id/base-image", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheet = await storage.getVisualScopeSheet(req.params.id, user.activeCompanyId);
    if (!sheet) return res.status(404).json({ error: "Not found" });
    if (!sheet.baseImagePath) return res.status(404).json({ error: "No base image" });
    try {
      const objectStorage = new ObjectStorageService();
      if ((sheet.baseImagePath as string).startsWith("/objects/")) {
        const file = await objectStorage.getObjectEntityFile(sheet.baseImagePath as string);
        await objectStorage.downloadObject(file, res);
      } else {
        const buffer = await objectStorage.downloadByPath(sheet.baseImagePath as string);
        res.set("Content-Type", (sheet as any).baseImageMimeType ?? "image/png");
        res.set("Cache-Control", "no-cache, private");
        res.send(buffer);
      }
    } catch (err) {
      console.error("Error serving VS base image:", err);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  app.post("/api/visual-scope-sheets", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { customerId, title, scopeDate } = req.body;
    if (!customerId) return res.status(400).json({ error: "customerId is required" });
    const today = new Date().toISOString().substring(0, 10);
    const sheet = await storage.createVisualScopeSheet({
      companyId: user.activeCompanyId,
      customerId,
      createdById: user.id,
      title: title?.trim() || "Visual Scope",
      scopeDate: scopeDate || today,
      status: "draft",
    });
    res.json(sheet);
  });

  app.patch("/api/visual-scope-sheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const allowed = ["title", "scopeDate", "baseImagePath", "baseImageFilename", "baseImageMimeType", "baseImageSize", "markupData", "captureParams"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    const sheet = await storage.updateVisualScopeSheet(req.params.id, user.activeCompanyId, updates as any);
    res.json(sheet);
  });

  app.delete("/api/visual-scope-sheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheet = await storage.getVisualScopeSheet(req.params.id, user.activeCompanyId);
    if (!sheet) return res.status(404).json({ error: "Not found" });
    if (sheet.baseImagePath) {
      try { await objectStorageClient.deleteObject(sheet.baseImagePath.replace(/^\/objects\//, "")); } catch {}
    }
    await storage.deleteVisualScopeSheet(req.params.id, user.activeCompanyId);
    res.json({ ok: true });
  });

  app.post("/api/visual-scope-sheets/:id/upload-url", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { mimeType, fileSize } = req.body;
    if (!mimeType?.startsWith("image/")) return res.status(400).json({ error: "mimeType must be image/*" });
    if (fileSize > 50 * 1024 * 1024) return res.status(400).json({ error: "File must be ≤ 50 MB" });
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
      res.json({ uploadUrl, objectPath });
    } catch (err) {
      console.error("VS upload-url error:", err);
      res.status(500).send("Failed to get upload URL");
    }
  });

  app.post("/api/visual-scope-sheets/:id/replace-base-image", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheet = await storage.getVisualScopeSheet(req.params.id, user.activeCompanyId);
    if (!sheet) return res.status(404).json({ error: "Not found" });
    const { newObjectPath, newFilename, newMimeType, newSize } = req.body;
    if (!newObjectPath) return res.status(400).json({ error: "newObjectPath required" });
    if (sheet.baseImagePath) {
      try { await objectStorageClient.deleteObject(sheet.baseImagePath.replace(/^\/objects\//, "")); } catch {}
    }
    const updated = await storage.updateVisualScopeSheet(req.params.id, user.activeCompanyId, {
      baseImagePath: newObjectPath,
      baseImageFilename: newFilename ?? null,
      baseImageMimeType: newMimeType ?? null,
      baseImageSize: newSize ?? null,
    } as any);
    res.json(updated);
  });

  app.get("/api/customers/:id/visual-scope-sheets", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheets = await storage.getVisualScopeSheetsForCustomer(req.params.id, user.activeCompanyId);
    res.json(sheets);
  });

  // VS3.5 High-Res Base Image Capture endpoint
  app.post("/api/visual-scope-sheets/:id/capture-highres", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheet = await storage.getVisualScopeSheet(req.params.id, user.activeCompanyId);
    if (!sheet) return res.status(404).json({ error: "Not found" });

    const mapboxToken = process.env.MAPBOX_PUBLIC_KEY;
    if (!mapboxToken) return res.status(400).json({ error: "Mapbox token not configured" });

    const { centerLat, centerLng, zoom, bearing = 0, pitch = 0, width: reqWidth = 2000 } = req.body;
    if (typeof centerLat !== "number" || typeof centerLng !== "number" || typeof zoom !== "number") {
      return res.status(400).json({ error: "centerLat, centerLng, and zoom are required numbers" });
    }

    const targetWidth = Math.max(1200, Math.min(4000, Number(reqWidth)));
    const targetHeight = targetWidth;

    // Mapbox Static API @2x doubles pixels; max CSS size is 1280
    const cssW = Math.min(Math.round(targetWidth / 2), 1280);
    const cssH = Math.min(Math.round(targetHeight / 2), 1280);
    const zoomStr = Number(zoom).toFixed(2);
    const bearingStr = Number(bearing ?? 0).toFixed(1);
    const pitchStr = Number(pitch ?? 0).toFixed(1);

    const staticUrl =
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
      `${centerLng},${centerLat},${zoomStr},${bearingStr},${pitchStr}/` +
      `${cssW}x${cssH}@2x?access_token=${mapboxToken}`;

    let imgBuffer: Buffer;
    try {
      const response = await fetch(staticUrl);
      if (!response.ok) {
        const errText = await response.text();
        console.error("Mapbox Static API error:", response.status, errText);
        return res.status(400).json({ error: "Mapbox Static API request failed" });
      }
      imgBuffer = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      console.error("Mapbox fetch error:", err);
      return res.status(500).json({ error: "Failed to fetch static map image" });
    }

    // Resize to target dimensions if needed (when target > @2x output)
    let finalBuffer = imgBuffer;
    try {
      const { createCanvas, loadImage } = await import("canvas");
      const srcImg = await loadImage(imgBuffer);
      if (srcImg.width !== targetWidth || srcImg.height !== targetHeight) {
        const canvas = createCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(srcImg as any, 0, 0, targetWidth, targetHeight);
        finalBuffer = canvas.toBuffer("image/png");
      }
    } catch (err) {
      console.error("Canvas resize error:", err);
      // Use original buffer if resize fails
    }

    // Save to object storage (private path)
    const objectStorage = new ObjectStorageService();
    const relativePath = `vs-highres-${sheet.id}-${Date.now()}.png`;
    let savedPath: string;
    try {
      savedPath = await objectStorage.saveBufferToPrivatePath(relativePath, finalBuffer, "image/png");
    } catch (err) {
      console.error("GCS save error:", err);
      return res.status(500).json({ error: "Failed to save image to storage" });
    }

    // Delete old base image only after new one is saved successfully
    if (sheet.baseImagePath) {
      try {
        await objectStorageClient.deleteObject(sheet.baseImagePath.replace(/^\/objects\//, ""));
      } catch {}
    }

    const captureParams: CaptureParams = {
      centerLat,
      centerLng,
      zoom,
      bearing: bearing ?? 0,
      pitch: pitch ?? 0,
      widthUsed: targetWidth,
      capturedAt: new Date().toISOString(),
    };

    const updated = await storage.updateVisualScopeSheet(req.params.id, user.activeCompanyId, {
      baseImagePath: savedPath,
      baseImageFilename: `vs-satellite-${targetWidth}px.png`,
      baseImageMimeType: "image/png",
      baseImageSize: finalBuffer.length,
      captureParams,
    } as any);

    res.json(updated);
  });

  // VS3 Export endpoints
  async function handleVsExport(req: express.Request, res: express.Response, type: ExportType) {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canAccessVisualScope(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const sheet = await storage.getVisualScopeSheet(req.params.id, user.activeCompanyId);
    if (!sheet) return res.status(404).json({ error: "Not found" });
    if (!sheet.baseImagePath) return res.status(400).json({ error: "Sheet has no base image" });
    const rawW = parseInt((req.query.w as string) || "2000", 10);
    const width = Math.max(1200, Math.min(4000, isNaN(rawW) ? 2000 : rawW));
    const inline = req.query.inline === "1";
    try {
      const pngBuffer = await renderVisualScope(sheet, type, width);
      const filename = `vs-${sheet.id}-${type}-${width}px.png`;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", pngBuffer.length);
      res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(pngBuffer);
    } catch (err: any) {
      if (err?.message === "NO_BASE_IMAGE")
        return res.status(400).json({ error: "Sheet has no base image" });
      if (err?.message === "BASE_IMAGE_TOO_LARGE")
        return res.status(400).json({ error: "Base image exceeds the maximum allowed size (30 MB / 20000 px)" });
      if (err?.name === "ObjectNotFoundError" || err?.message?.includes("Object not found"))
        return res.status(400).json({ error: "Base image file not found in storage" });
      console.error("VS export error:", err);
      return res.status(500).json({ error: "Export failed" });
    }
  }

  app.get("/api/visual-scope-sheets/:id/export/base",     (req, res) => handleVsExport(req, res, "base"));
  app.get("/api/visual-scope-sheets/:id/export/overlay",  (req, res) => handleVsExport(req, res, "overlay"));
  app.get("/api/visual-scope-sheets/:id/export/combined", (req, res) => handleVsExport(req, res, "combined"));

  // ─── Campaign System ───────────────────────────────────────────
  const campaignAllowedRoles = ["admin", "office", "field_manager", "field", "chemical_manager", "landscape_supervisor"];

  app.get("/api/campaigns", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!campaignAllowedRoles.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    const assignedToId = user.activeRole !== "admin" ? user.id : undefined;
    const allCampaigns = await storage.getCampaigns(user.activeCompanyId, assignedToId);
    res.json(allCampaigns);
  });

  app.post("/api/campaigns", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Only admin/office can create campaigns");
    }
    const { title, description, assignedToId, windowStart, windowEnd, customerIds, category, subtype, checklistTasks } = req.body as {
      title?: string;
      description?: string;
      assignedToId?: string;
      windowStart?: string;
      windowEnd?: string;
      customerIds?: string[];
      category?: string;
      subtype?: string;
      checklistTasks?: { label: string; order: number }[];
    };
    const validCategories = ["general", "chemical", "irrigation"];
    const campaignCategory = (validCategories.includes(category || "") ? category : "general") as "general" | "chemical" | "irrigation";
    if (!title || !windowStart || !windowEnd || !customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (windowStart > windowEnd) {
      return res.status(400).json({ error: "Start date must be before or equal to end date" });
    }
    if (assignedToId) {
      const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
      const assigneeCompanyUser = companyUsers.find(cu => cu.userId === assignedToId);
      if (!assigneeCompanyUser) {
        return res.status(400).json({ error: "Assignee must be a member of this company" });
      }
      if (campaignCategory === "chemical" && assigneeCompanyUser.role !== "chemical_manager") {
        return res.status(400).json({ error: "Chemical campaigns must be assigned to a chemical manager" });
      }
    }
    const allCustomers = await storage.getCustomers(user.activeCompanyId);
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));
    const itemsData = customerIds
      .filter(custId => customerMap.has(custId))
      .map(custId => {
        const cust = customerMap.get(custId)!;
        return {
          campaignId: "",
          companyId: user.activeCompanyId,
          customerId: custId,
          customerName: cust.name,
          customerCity: cust.city || "",
          status: "pending" as const,
          notes: null,
          skipReason: null,
          photos: [] as string[],
          completedById: null,
          completedAt: null,
          workflowStep: campaignCategory === "chemical" ? "pre_communication" : null,
          preCommSentAt: null,
          preCommSentById: null,
          workCompletedAt: null,
          workCompletedById: null,
          postCommSentAt: null,
          postCommSentById: null,
        };
      });
    if (itemsData.length === 0) {
      return res.status(400).json({ error: "No valid properties selected" });
    }
    const validSubtypes = ["spring_turn_on", "winterization", "custom"];
    const campaignSubtype = campaignCategory === "irrigation" && subtype && validSubtypes.includes(subtype) ? subtype as "spring_turn_on" | "winterization" | "custom" : null;
    if (campaignCategory === "irrigation" && (!checklistTasks || checklistTasks.length === 0)) {
      return res.status(400).json({ error: "Irrigation campaigns require at least one checklist task" });
    }
    const campaign = await storage.createCampaignWithItems(
      {
        companyId: user.activeCompanyId,
        title,
        description: description || null,
        assignedToId: assignedToId || null,
        windowStart,
        windowEnd,
        category: campaignCategory,
        subtype: campaignSubtype,
        status: "active",
        createdById: user.id,
      },
      itemsData
    );
    if (campaignCategory === "irrigation" && checklistTasks && checklistTasks.length > 0) {
      for (const task of checklistTasks) {
        await storage.createCampaignChecklistTask({
          campaignId: campaign.id,
          label: task.label,
          order: task.order,
        });
      }
    }
    res.json(campaign);
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!campaignAllowedRoles.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Not found" });
    if ((user.activeRole === "field" || user.activeRole === "landscape_supervisor") && campaign.assignedToId !== user.id) {
      return res.status(403).send("Not assigned to this campaign");
    }
    const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
    const assignedUser = campaign.assignedToId
      ? await storage.getUserById(campaign.assignedToId)
      : undefined;
    const createdUser = campaign.createdById
      ? await storage.getUserById(campaign.createdById)
      : undefined;
    const userIdSet = new Set<string>();
    items.forEach(i => {
      if (i.completedById) userIdSet.add(i.completedById);
      if (i.preCommSentById) userIdSet.add(i.preCommSentById);
      if (i.workCompletedById) userIdSet.add(i.workCompletedById);
      if (i.postCommSentById) userIdSet.add(i.postCommSentById);
    });
    const userNameMap = new Map<string, string>();
    for (const uid of userIdSet) {
      const u = await storage.getUserById(uid);
      if (u) userNameMap.set(uid, u.name);
    }
    const customerIdSet = new Set<string>();
    items.forEach(i => { if (i.customerId) customerIdSet.add(i.customerId); });
    const customerTypeMap = new Map<string, string>();
    const customerCoordsMap = new Map<string, { lat: number | null; lng: number | null; address: string }>();
    for (const cid of customerIdSet) {
      const cust = await storage.getCustomerById(cid, user.activeCompanyId);
      if (cust) {
        customerTypeMap.set(cid, cust.customerType || "commercial");
        customerCoordsMap.set(cid, {
          lat: cust.locationLat,
          lng: cust.locationLng,
          address: [cust.street, cust.city, cust.state, cust.zip].filter(Boolean).join(", "),
        });
      }
    }
    const itemsWithNames = items.map(i => {
      const coords = customerCoordsMap.get(i.customerId);
      return {
        ...i,
        workflowStep: (campaign.category === "chemical" && !i.workflowStep) ? "pre_communication" : i.workflowStep,
        completedByName: i.completedById ? userNameMap.get(i.completedById) || null : null,
        preCommSentByName: i.preCommSentById ? userNameMap.get(i.preCommSentById) || null : null,
        workCompletedByName: i.workCompletedById ? userNameMap.get(i.workCompletedById) || null : null,
        postCommSentByName: i.postCommSentById ? userNameMap.get(i.postCommSentById) || null : null,
        customerType: customerTypeMap.get(i.customerId) || "commercial",
        customerLat: coords?.lat ?? null,
        customerLng: coords?.lng ?? null,
        customerAddress: coords?.address ?? "",
      };
    });
    let seasonName: string | undefined;
    if (campaign.seasonId) {
      const s = await storage.getSeasonById(campaign.seasonId, user.activeCompanyId);
      seasonName = s?.name;
    }
    let checklistTasks: any[] = [];
    let itemTaskCompletions: Record<string, string[]> = {};
    if (campaign.category === "irrigation") {
      checklistTasks = await storage.getCampaignChecklistTasks(req.params.id);
      for (const item of items) {
        const completions = await storage.getCampaignItemTaskCompletions(item.id);
        itemTaskCompletions[item.id] = completions.map(c => c.campaignChecklistTaskId);
      }
    }
    res.json({
      ...campaign,
      items: itemsWithNames,
      totalItems: items.length,
      completedItems: items.filter((i: { status: string }) => i.status === "completed").length,
      skippedItems: items.filter((i: { status: string }) => i.status === "skipped").length,
      assignedToName: assignedUser?.name,
      createdByName: createdUser?.name,
      seasonName,
      checklistTasks,
      itemTaskCompletions,
    });
  });

  function resolveChemCompletionDate(item: { weatherRecordedAt?: Date | null; workCompletedAt?: Date | null; completedAt?: Date | null }): string {
    const date = item.weatherRecordedAt || item.workCompletedAt || item.completedAt || new Date();
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function resolveChemRecipientEmail(customerId: string, companyId: string): Promise<{ email: string | null; contactName: string | null }> {
    const customer = await storage.getCustomerById(customerId, companyId);
    if (customer?.propertyManagerId) {
      const pm = await storage.getPropertyManagerWithContacts(customer.propertyManagerId, companyId);
      if (pm) {
        const primaryPmEmail = pm.emails?.find(e => e.isPrimary === "true")?.email || pm.emails?.[0]?.email || pm.email;
        if (primaryPmEmail) {
          return { email: primaryPmEmail, contactName: pm.name };
        }
      }
    }
    const customerContacts = await storage.getContactsByCustomerId(customerId, companyId);
    const pmContacts = customerContacts.filter(c =>
      (c.propertyManagerId || (c.role && c.role.toLowerCase().includes("property manager"))) &&
      c.emails && c.emails.length > 0
    );
    if (pmContacts.length > 0) {
      const allPmEmails = pmContacts.flatMap(c => c.emails || []).filter(Boolean);
      if (allPmEmails.length > 0) {
        return { email: allPmEmails[0], contactName: pmContacts[0].name };
      }
    }
    const primaryContact = customerContacts.find(c => c.isPrimary === "true") || customerContacts[0];
    const recipientEmail = primaryContact?.emails?.[0] || customerContacts.find(c => c.emails && c.emails.length > 0)?.emails?.[0];
    return { email: recipientEmail || null, contactName: primaryContact?.name || null };
  }

  app.get("/api/campaigns/:id/items/:itemId/email-preview", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    const emailRoles = ["admin", "office", "chemical_manager"];
    if (!emailRoles.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    try {
      const { type, windowStart: customWindowStart, windowEnd: customWindowEnd } = req.query as { type?: string; windowStart?: string; windowEnd?: string };
      if (type !== "post" && customWindowStart && customWindowEnd && customWindowStart > customWindowEnd) {
        return res.status(400).json({ error: "Window start date must be before or equal to window end date" });
      }
      const eventKey = type === "post" ? "campaign.chemical_post_notice" : "campaign.chemical_pre_notice";
      const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const targetItem = (await storage.getCampaignItems(req.params.id, user.activeCompanyId))
        .find((i: { id: string }) => i.id === req.params.itemId);
      if (!targetItem) return res.status(404).json({ error: "Item not found" });
      const company = await storage.getCompanyById(user.activeCompanyId);
      const { email: recipientEmail, contactName } = await resolveChemRecipientEmail(targetItem.customerId, user.activeCompanyId);
      const rules = await storage.getEmailRulesByEvent(eventKey, user.activeCompanyId);
      let subject = "";
      let htmlBody = "";
      let templateName = "";
      if (rules.length > 0) {
        const template = await storage.getEmailTemplateById(rules[0].templateId, user.activeCompanyId);
        if (template) {
          templateName = template.name;
          const variables: Record<string, string> = {
            companyName: company?.name || '',
            customerName: targetItem.customerName,
            campaignTitle: campaign.title,
            windowStart: (type !== "post" && customWindowStart) ? customWindowStart : campaign.windowStart,
            windowEnd: (type !== "post" && customWindowEnd) ? customWindowEnd : campaign.windowEnd,
            ...(type === "post" ? { completionDate: resolveChemCompletionDate(targetItem) } : {}),
            notes: '',
          };
          subject = template.subject;
          htmlBody = template.htmlBody;
          for (const [key, val] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            subject = subject.replace(regex, val);
            htmlBody = htmlBody.replace(regex, val);
          }
        }
      }
      res.json({ recipientEmail: recipientEmail || null, subject, htmlBody, templateName, contactName: contactName || null });
    } catch (error) {
      console.error("Error fetching email preview:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/campaigns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Only admin/office can update campaigns");
    }
    const { status, title, description, assignedToId, windowStart, windowEnd } = req.body as {
      status?: string;
      title?: string;
      description?: string;
      assignedToId?: string;
      windowStart?: string;
      windowEnd?: string;
    };
    const validStatuses = ["active", "completed", "archived"];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    {
      const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
      if (!campaign) return res.status(404).json({ error: "Not found" });
      const effectiveStart = windowStart || campaign.windowStart;
      const effectiveEnd = windowEnd || campaign.windowEnd;
      if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
        return res.status(400).json({ error: "Start date must be before or equal to end date" });
      }
    }
    if (assignedToId) {
      const companyUsers = await storage.getCompanyUsersByCompanyId(user.activeCompanyId);
      const isCompanyMember = companyUsers.some(cu => cu.userId === assignedToId);
      if (!isCompanyMember) {
        return res.status(400).json({ error: "Assignee must be a member of this company" });
      }
    }
    const updates: Partial<{ status: "active" | "completed" | "archived"; title: string; description: string | null; assignedToId: string | null; windowStart: string; windowEnd: string }> = {};
    if (status !== undefined) updates.status = status as "active" | "completed" | "archived";
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assignedToId !== undefined) updates.assignedToId = assignedToId;
    if (windowStart !== undefined) updates.windowStart = windowStart;
    if (windowEnd !== undefined) updates.windowEnd = windowEnd;
    const updated = await storage.updateCampaign(req.params.id, user.activeCompanyId, updates);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.post("/api/campaigns/:id/items", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin") {
      return res.status(403).send("Only admin can add campaign items");
    }
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const { customerIds } = req.body as { customerIds?: string[] };
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: "customerIds required" });
    }
    const existingItems = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
    const existingCustomerIds = new Set(existingItems.map(i => i.customerId));
    const allCustomers = await storage.getCustomers(user.activeCompanyId);
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));
    const newItems: CampaignItem[] = [];
    for (const custId of customerIds) {
      if (existingCustomerIds.has(custId)) continue;
      const cust = customerMap.get(custId);
      if (!cust) continue;
      const item = await storage.createCampaignItem({
        campaignId: req.params.id,
        companyId: user.activeCompanyId,
        customerId: custId,
        customerName: cust.name,
        customerCity: cust.city || "",
        status: "pending",
        notes: null,
        skipReason: null,
        photos: [],
        completedById: null,
        completedAt: null,
        workflowStep: campaign.category === "chemical" ? "pre_communication" : null,
        preCommSentAt: null,
        preCommSentById: null,
        workCompletedAt: null,
        workCompletedById: null,
        postCommSentAt: null,
        postCommSentById: null,
      });
      newItems.push(item);
    }
    res.json({ added: newItems.length, items: newItems });
  });

  app.delete("/api/campaigns/:id/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin") {
      return res.status(403).send("Only admin can remove campaign items");
    }
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
    const item = items.find(i => i.id === req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (item.status !== "pending") {
      return res.status(400).json({ error: "Only pending items can be removed" });
    }
    await storage.deleteCampaignItem(req.params.itemId, user.activeCompanyId);
    res.json({ success: true });
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      return res.status(403).send("Only admin/office can delete campaigns");
    }
    await storage.deleteCampaign(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  app.get("/api/campaigns/:id/checklist-tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!campaignAllowedRoles.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Not found" });
    const tasks = await storage.getCampaignChecklistTasks(req.params.id);
    res.json(tasks);
  });

  app.post("/api/campaigns/:id/items/:itemId/checklist/:taskId/toggle", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    const allowedRoles = ["admin", "office", "field_manager", "field", "chemical_manager", "landscape_supervisor"];
    if (!allowedRoles.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.category !== "irrigation") return res.status(400).json({ error: "Not an irrigation campaign" });
    if ((user.activeRole === "field" || user.activeRole === "landscape_supervisor") && campaign.assignedToId !== user.id) {
      return res.status(403).send("Not assigned to this campaign");
    }
    const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
    const targetItem = items.find(i => i.id === req.params.itemId);
    if (!targetItem) return res.status(404).json({ error: "Item not found" });
    if (targetItem.status === "skipped") return res.status(400).json({ error: "Cannot toggle tasks on a skipped item" });

    const existingCompletions = await storage.getCampaignItemTaskCompletions(req.params.itemId);
    const alreadyCompleted = existingCompletions.find(c => c.campaignChecklistTaskId === req.params.taskId);

    if (alreadyCompleted) {
      await storage.deleteCampaignItemTaskCompletion(req.params.itemId, req.params.taskId);
      if (targetItem.status === "completed") {
        await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, {
          status: "pending",
          completedById: null,
          completedAt: null,
          updatedAt: new Date(),
        });
        const allItems = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
        const hasPending = allItems.some(i => i.id === req.params.itemId ? true : i.status === "pending");
        if (hasPending && campaign.status === "completed") {
          await storage.updateCampaign(req.params.id, user.activeCompanyId, { status: "active" });
        }
      }
    } else {
      await storage.createCampaignItemTaskCompletion({
        campaignItemId: req.params.itemId,
        campaignChecklistTaskId: req.params.taskId,
        completedById: user.id,
      });
      const updatedCompletions = await storage.getCampaignItemTaskCompletions(req.params.itemId);
      const allTasks = await storage.getCampaignChecklistTasks(req.params.id);
      if (updatedCompletions.length >= allTasks.length) {
        await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, {
          status: "completed",
          completedById: user.id,
          completedAt: new Date(),
          updatedAt: new Date(),
        });
        const allItems = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
        const allDone = allItems.every(i => i.id === req.params.itemId ? true : (i.status === "completed" || i.status === "skipped"));
        if (allDone && allItems.length > 0) {
          await storage.updateCampaign(req.params.id, user.activeCompanyId, { status: "completed" });
        }
      }
    }

    const finalCompletions = await storage.getCampaignItemTaskCompletions(req.params.itemId);
    const updatedItem = (await storage.getCampaignItems(req.params.id, user.activeCompanyId)).find(i => i.id === req.params.itemId);
    res.json({ item: updatedItem, completions: finalCompletions });
  });

  app.patch("/api/campaigns/:id/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    const allowedRoles = ["admin", "office", "field_manager", "field", "chemical_manager", "landscape_supervisor"];
    if (!allowedRoles.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if ((user.activeRole === "field" || user.activeRole === "landscape_supervisor") && campaign.assignedToId !== user.id) {
      return res.status(403).send("Not assigned to this campaign");
    }
    const existingItems = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
    const targetItem = existingItems.find(i => i.id === req.params.itemId);
    if (!targetItem) {
      return res.status(404).json({ error: "Item not found in this campaign" });
    }
    const { status, notes, skipReason, photos, chemAction, overrideEmail } = req.body as {
      status?: string;
      notes?: string;
      skipReason?: string;
      photos?: string[];
      chemAction?: string;
      overrideEmail?: string;
    };

    // Handle chemical workflow step advancement
    if (chemAction && campaign.category === "chemical") {
      const chemEmailRoles = ["admin", "office", "chemical_manager"];
      const chemWorkRoles = ["admin", "office", "field_manager", "field", "chemical_manager"];

      const chemUpdates: Partial<CampaignItem> = { updatedAt: new Date() };

      if (chemAction === "send_pre_communication") {
        if (!chemEmailRoles.includes(user.activeRole)) {
          return res.status(403).send("Only admin, office, or chemical manager can send communications");
        }
        if ((targetItem.workflowStep ?? "pre_communication") !== "pre_communication") {
          return res.status(400).json({ error: "Item is not in pre-communication step" });
        }
        const company = await storage.getCompanyById(user.activeCompanyId);
        const { email: resolvedEmail } = await resolveChemRecipientEmail(targetItem.customerId, user.activeCompanyId);
        const recipientEmail = (overrideEmail && overrideEmail.trim()) ? overrideEmail.trim() : resolvedEmail;
        if (!recipientEmail) {
          return res.status(400).json({ error: "No recipient email available. Add a contact or property manager with an email address." });
        }
        try {
          const emailResults = await processEmailEvent('campaign.chemical_pre_notice', user.activeCompanyId, {
            companyName: company?.name || '',
            customerName: targetItem.customerName,
            campaignTitle: campaign.title,
            windowStart: campaign.windowStart,
            windowEnd: campaign.windowEnd,
            notes: notes || '',
          }, {
            customerId: targetItem.customerId,
            toEmail: recipientEmail,
            sentById: user.id,
          });
          const sentLog = emailResults.find(l => l.status === "sent");
          if (!sentLog) {
            return res.status(502).json({ error: "Email delivery failed. Please try again." });
          }
          chemUpdates.workflowStep = "work_in_progress";
          chemUpdates.preCommSentAt = new Date();
          chemUpdates.preCommSentById = user.id;
          chemUpdates.preCommEmailLogId = sentLog.id;
        } catch (emailErr) {
          console.error("Failed to send chemical pre-notice email:", emailErr);
          return res.status(500).json({ error: "Failed to send pre-work notification email" });
        }
      } else if (chemAction === "complete_work") {
        if (!chemWorkRoles.includes(user.activeRole)) {
          return res.status(403).send("Insufficient permissions to complete work");
        }
        if (targetItem.workflowStep !== "work_in_progress") {
          return res.status(400).json({ error: "Item is not in work-in-progress step" });
        }
        chemUpdates.workflowStep = "work_completed";
        chemUpdates.workCompletedAt = new Date();
        chemUpdates.workCompletedById = user.id;
      } else if (chemAction === "send_post_communication") {
        if (!chemEmailRoles.includes(user.activeRole)) {
          return res.status(403).send("Only admin, office, or chemical manager can send communications");
        }
        if (targetItem.workflowStep !== "work_completed") {
          return res.status(400).json({ error: "Item is not in work-completed step" });
        }
        const company = await storage.getCompanyById(user.activeCompanyId);
        const { email: resolvedEmail } = await resolveChemRecipientEmail(targetItem.customerId, user.activeCompanyId);
        const recipientEmail = (overrideEmail && overrideEmail.trim()) ? overrideEmail.trim() : resolvedEmail;
        if (!recipientEmail) {
          return res.status(400).json({ error: "No recipient email available. Add a contact or property manager with an email address." });
        }
        try {
          const emailResults = await processEmailEvent('campaign.chemical_post_notice', user.activeCompanyId, {
            companyName: company?.name || '',
            customerName: targetItem.customerName,
            campaignTitle: campaign.title,
            completionDate: resolveChemCompletionDate(targetItem),
            notes: notes || '',
          }, {
            customerId: targetItem.customerId,
            toEmail: recipientEmail,
            sentById: user.id,
          });
          const sentLog = emailResults.find(l => l.status === "sent");
          if (!sentLog) {
            return res.status(502).json({ error: "Email delivery failed. Please try again." });
          }
          chemUpdates.workflowStep = "post_communication";
          chemUpdates.postCommSentAt = new Date();
          chemUpdates.postCommSentById = user.id;
          chemUpdates.status = "completed";
          chemUpdates.completedById = user.id;
          chemUpdates.completedAt = new Date();
          chemUpdates.postCommEmailLogId = sentLog.id;
        } catch (emailErr) {
          console.error("Failed to send chemical post-notice email:", emailErr);
          return res.status(500).json({ error: "Failed to send post-completion notification email" });
        }
      } else if (chemAction === "finish_without_comms") {
        const finishRoles = ["admin", "office", "chemical_manager"];
        if (!finishRoles.includes(user.activeRole)) {
          return res.status(403).send("Only admin, office, or chemical manager can finish without communications");
        }
        if (targetItem.status === "completed" || targetItem.status === "skipped") {
          return res.status(400).json({ error: "Item is already completed or skipped" });
        }
        const { completionDate, weatherTemp, weatherWindSpeed, weatherWindDirection, weatherHumidity, weatherConditions } = req.body as {
          completionDate?: string;
          weatherTemp?: number;
          weatherWindSpeed?: number;
          weatherWindDirection?: string;
          weatherHumidity?: number;
          weatherConditions?: string;
        };
        if (!completionDate) {
          return res.status(400).json({ error: "Completion date is required" });
        }
        if (weatherTemp == null || weatherWindSpeed == null || !weatherConditions) {
          return res.status(400).json({ error: "Weather data (temperature, wind speed, conditions) is required" });
        }
        const completionDateObj = new Date(completionDate + "T12:00:00");
        if (isNaN(completionDateObj.getTime())) {
          return res.status(400).json({ error: "Invalid completion date" });
        }
        chemUpdates.workflowStep = "post_communication";
        chemUpdates.status = "completed";
        chemUpdates.workCompletedAt = completionDateObj;
        chemUpdates.workCompletedById = user.id;
        chemUpdates.completedById = user.id;
        chemUpdates.completedAt = completionDateObj;
        chemUpdates.weatherTemp = weatherTemp;
        chemUpdates.weatherWindSpeed = weatherWindSpeed;
        chemUpdates.weatherWindDirection = weatherWindDirection || null;
        chemUpdates.weatherHumidity = weatherHumidity ?? null;
        chemUpdates.weatherConditions = weatherConditions;
        chemUpdates.weatherRecordedAt = completionDateObj;
        chemUpdates.finishedWithoutComms = "true";
        if (notes !== undefined) chemUpdates.notes = (notes || "") + "\n[Completed without communications by " + (user as any).name + "]";
      } else if (chemAction === "reset") {
        const resetRoles = ["admin", "office", "chemical_manager"];
        if (!resetRoles.includes(user.activeRole)) {
          return res.status(403).send("Only admin, office, or chemical manager can reset chemical workflow");
        }
        chemUpdates.workflowStep = "pre_communication";
        chemUpdates.preCommSentAt = null;
        chemUpdates.preCommSentById = null;
        chemUpdates.workCompletedAt = null;
        chemUpdates.workCompletedById = null;
        chemUpdates.postCommSentAt = null;
        chemUpdates.postCommSentById = null;
        chemUpdates.preCommEmailLogId = null;
        chemUpdates.postCommEmailLogId = null;
        chemUpdates.status = "pending";
        chemUpdates.completedById = null;
        chemUpdates.completedAt = null;
        chemUpdates.weatherTemp = null;
        chemUpdates.weatherWindSpeed = null;
        chemUpdates.weatherWindDirection = null;
        chemUpdates.weatherHumidity = null;
        chemUpdates.weatherConditions = null;
        chemUpdates.weatherRecordedAt = null;
        chemUpdates.finishedWithoutComms = "false";
      } else {
        return res.status(400).json({ error: "Invalid chemical action" });
      }

      if (notes !== undefined) chemUpdates.notes = notes;
      if (photos !== undefined) chemUpdates.photos = photos;

      const updated = await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, chemUpdates);
      if (!updated) return res.status(404).json({ error: "Not found" });

      const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
      const allDone = items.every((i: { status: string }) => i.status === "completed" || i.status === "skipped");
      const hasPending = items.some((i: { status: string }) => i.status === "pending");
      if (allDone && items.length > 0) {
        await storage.updateCampaign(req.params.id, user.activeCompanyId, { status: "completed" });
      } else if (hasPending && campaign.status === "completed") {
        await storage.updateCampaign(req.params.id, user.activeCompanyId, { status: "active" });
      }
      return res.json(updated);
    }

    const validItemStatuses = ["pending", "completed", "skipped"];
    if (status !== undefined && !validItemStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    const skipResetRoles = ["admin", "office", "chemical_manager"];
    if (status === "pending" && !skipResetRoles.includes(user.activeRole)) {
      return res.status(403).send("Only admin, office, or chemical manager can reset items to pending");
    }
    if (status === "skipped" && !skipResetRoles.includes(user.activeRole)) {
      return res.status(403).send("Only admin, office, or chemical manager can skip campaign items");
    }
    if (status === "skipped" && (!skipReason || !skipReason.trim())) {
      return res.status(400).json({ error: "Skip reason is required" });
    }
    const updates: Partial<{ status: "pending" | "completed" | "skipped"; notes: string | null; skipReason: string | null; photos: string[]; completedById: string | null; completedAt: Date | null; updatedAt: Date }> = {};
    if (status !== undefined) updates.status = status as "pending" | "completed" | "skipped";
    if (notes !== undefined) updates.notes = notes;
    if (skipReason !== undefined) updates.skipReason = skipReason;
    if (photos !== undefined) updates.photos = photos;
    if (status === "completed" || status === "skipped") {
      updates.completedById = user.id;
      updates.completedAt = new Date();
    }
    if (status === "pending") {
      updates.completedById = null;
      updates.completedAt = null;
    }
    updates.updatedAt = new Date();
    const updated = await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, updates);
    if (!updated) return res.status(404).json({ error: "Not found" });
    const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
    const allDone = items.every((i: { status: string }) => i.status === "completed" || i.status === "skipped");
    const hasPending = items.some((i: { status: string }) => i.status === "pending");
    if (allDone && items.length > 0) {
      await storage.updateCampaign(req.params.id, user.activeCompanyId, { status: "completed" });
    } else if (hasPending && campaign.status === "completed") {
      await storage.updateCampaign(req.params.id, user.activeCompanyId, { status: "active" });
    }
    res.json(updated);
  });

  app.post("/api/campaigns/:id/items/:itemId/send-pre-comm", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    const chemEmailRoles = ["admin", "office", "chemical_manager"];
    if (!chemEmailRoles.includes(user.activeRole)) {
      return res.status(403).send("Only admin, office, or chemical manager can send communications");
    }
    try {
      const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
      if (!campaign || campaign.category !== "chemical") return res.status(404).json({ error: "Chemical campaign not found" });
      if (user.activeRole === "field" && campaign.assignedToId !== user.id) {
        return res.status(403).send("Not assigned to this campaign");
      }
      const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
      const targetItem = items.find((i: { id: string }) => i.id === req.params.itemId);
      if (!targetItem) return res.status(404).json({ error: "Item not found" });
      if ((targetItem.workflowStep ?? "pre_communication") !== "pre_communication") {
        return res.status(400).json({ error: "Item is not in pre-communication step" });
      }
      const { notes, overrideEmail, customWindowStart, customWindowEnd } = req.body || {};
      if (customWindowStart && customWindowEnd && customWindowStart.trim() > customWindowEnd.trim()) {
        return res.status(400).json({ error: "Window start date must be before or equal to window end date" });
      }
      const chemUpdates: Partial<CampaignItem> = { updatedAt: new Date() };
      const company = await storage.getCompanyById(user.activeCompanyId);
      const { email: resolvedEmail } = await resolveChemRecipientEmail(targetItem.customerId, user.activeCompanyId);
      const recipientEmail = overrideEmail?.trim() || resolvedEmail;
      if (!recipientEmail) {
        return res.status(400).json({ error: "No recipient email available. Provide an email address or add a contact/property manager." });
      }
      try {
        const emailResults = await processEmailEvent('campaign.chemical_pre_notice', user.activeCompanyId, {
          companyName: company?.name || '',
          customerName: targetItem.customerName,
          campaignTitle: campaign.title,
          windowStart: customWindowStart?.trim() || campaign.windowStart,
          windowEnd: customWindowEnd?.trim() || campaign.windowEnd,
          notes: notes || '',
        }, {
          customerId: targetItem.customerId,
          toEmail: recipientEmail,
          sentById: user.id,
        });
        const sentLog = emailResults.find(l => l.status === "sent");
        if (!sentLog) {
          return res.status(502).json({ error: "Email delivery failed. Please try again." });
        }
        chemUpdates.preCommEmailLogId = sentLog.id;
      } catch (emailErr) {
        console.error("Failed to send chemical pre-notice email:", emailErr);
        return res.status(500).json({ error: "Failed to send pre-work notification email" });
      }
      chemUpdates.workflowStep = "work_in_progress";
      chemUpdates.preCommSentAt = new Date();
      chemUpdates.preCommSentById = user.id;
      if (notes !== undefined) chemUpdates.notes = notes;
      const updated = await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, chemUpdates);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error in send-pre-comm:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/campaigns/:id/items/:itemId/complete-work", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    const chemWorkRoles = ["admin", "office", "field_manager", "field", "chemical_manager"];
    if (!chemWorkRoles.includes(user.activeRole)) {
      return res.status(403).send("Insufficient permissions to complete work");
    }
    try {
      const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
      if (!campaign || campaign.category !== "chemical") return res.status(404).json({ error: "Chemical campaign not found" });
      if (user.activeRole === "field" && campaign.assignedToId !== user.id) {
        return res.status(403).send("Not assigned to this campaign");
      }
      const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
      const targetItem = items.find((i: { id: string }) => i.id === req.params.itemId);
      if (!targetItem) return res.status(404).json({ error: "Item not found" });
      if (targetItem.workflowStep !== "work_in_progress") {
        return res.status(400).json({ error: "Item is not in work-in-progress step" });
      }
      const { notes } = req.body || {};
      const chemUpdates: Partial<CampaignItem> = { updatedAt: new Date() };
      chemUpdates.workflowStep = "work_completed";
      chemUpdates.workCompletedAt = new Date();
      chemUpdates.workCompletedById = user.id;
      if (notes !== undefined) chemUpdates.notes = notes;
      const updated = await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, chemUpdates);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error in complete-work:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/campaigns/:id/items/:itemId/send-post-comm", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    const chemEmailRoles = ["admin", "office", "chemical_manager"];
    if (!chemEmailRoles.includes(user.activeRole)) {
      return res.status(403).send("Only admin, office, or chemical manager can send communications");
    }
    try {
      const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
      if (!campaign || campaign.category !== "chemical") return res.status(404).json({ error: "Chemical campaign not found" });
      if (user.activeRole === "field" && campaign.assignedToId !== user.id) {
        return res.status(403).send("Not assigned to this campaign");
      }
      const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
      const targetItem = items.find((i: { id: string }) => i.id === req.params.itemId);
      if (!targetItem) return res.status(404).json({ error: "Item not found" });
      if (targetItem.workflowStep !== "work_completed") {
        return res.status(400).json({ error: "Item is not in work-completed step" });
      }
      const { notes, overrideEmail } = req.body || {};
      const chemUpdates: Partial<CampaignItem> = { updatedAt: new Date() };
      const company = await storage.getCompanyById(user.activeCompanyId);
      const { email: resolvedEmail } = await resolveChemRecipientEmail(targetItem.customerId, user.activeCompanyId);
      const recipientEmail = overrideEmail?.trim() || resolvedEmail;
      if (!recipientEmail) {
        return res.status(400).json({ error: "No recipient email available. Provide an email address or add a contact/property manager." });
      }
      try {
        const emailResults = await processEmailEvent('campaign.chemical_post_notice', user.activeCompanyId, {
          companyName: company?.name || '',
          customerName: targetItem.customerName,
          campaignTitle: campaign.title,
          completionDate: resolveChemCompletionDate(targetItem),
          notes: notes || '',
        }, {
          customerId: targetItem.customerId,
          toEmail: recipientEmail,
          sentById: user.id,
        });
        const sentLog = emailResults.find(l => l.status === "sent");
        if (!sentLog) {
          return res.status(502).json({ error: "Email delivery failed. Please try again." });
        }
        chemUpdates.postCommEmailLogId = sentLog.id;
      } catch (emailErr) {
        console.error("Failed to send chemical post-notice email:", emailErr);
        return res.status(500).json({ error: "Failed to send post-completion notification email" });
      }
      chemUpdates.workflowStep = "post_communication";
      chemUpdates.postCommSentAt = new Date();
      chemUpdates.postCommSentById = user.id;
      chemUpdates.status = "completed";
      chemUpdates.completedById = user.id;
      chemUpdates.completedAt = new Date();
      if (notes !== undefined) chemUpdates.notes = notes;
      const updated = await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, chemUpdates);
      if (!updated) return res.status(404).json({ error: "Not found" });
      const allItems = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
      const allDone = allItems.every((i: { status: string }) => i.status === "completed" || i.status === "skipped");
      if (allDone && allItems.length > 0) {
        await storage.updateCampaign(req.params.id, user.activeCompanyId, { status: "completed" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error in send-post-comm:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/campaigns/photo-upload-url", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const campaignUser = req.user as UserWithContext;
    const campaignRoles = ["admin", "office", "field_manager", "field", "chemical_manager"];
    if (!campaignRoles.includes(campaignUser.activeRole)) {
      return res.status(403).send("Insufficient permissions");
    }
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath: normalizedPath });
    } catch (error) {
      console.error("Error getting campaign photo upload URL:", error);
      res.status(500).send("Failed to get upload URL");
    }
  });

  // ==================== WEATHER API ====================

  app.get("/api/weather", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const { lat, lng, datetime } = req.query as { lat?: string; lng?: string; datetime?: string };
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng are required" });
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return res.status(400).json({ error: "Invalid coordinates" });

    try {
      const now = new Date();
      const targetDate = datetime ? new Date(datetime) : now;
      if (isNaN(targetDate.getTime())) return res.status(400).json({ error: "Invalid datetime" });

      const isPast = targetDate < now;
      const isFuture = targetDate > new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000);

      if (isFuture) return res.status(400).json({ error: "Cannot fetch weather for dates more than 16 days in the future" });

      let apiUrl: string;
      if (isPast) {
        const dateStr = targetDate.toISOString().slice(0, 10);
        apiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
      } else {
        const dateStr = targetDate.toISOString().slice(0, 10);
        apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
      }

      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errText = await response.text();
        console.error("Open-Meteo API error:", errText);
        return res.status(502).json({ error: "Weather service unavailable" });
      }

      const data = await response.json() as {
        hourly?: {
          time?: string[];
          temperature_2m?: number[];
          relative_humidity_2m?: number[];
          wind_speed_10m?: number[];
          wind_direction_10m?: number[];
          weather_code?: number[];
        };
      };

      if (!data.hourly?.time?.length) return res.status(404).json({ error: "No weather data available for this date" });

      const targetMs = targetDate.getTime();
      let idx = 0;
      let closestDiff = Infinity;
      for (let i = 0; i < data.hourly.time.length; i++) {
        const entryTime = new Date(data.hourly.time[i]).getTime();
        const diff = Math.abs(entryTime - targetMs);
        if (diff < closestDiff) {
          closestDiff = diff;
          idx = i;
        }
      }

      const weatherCodeToCondition = (code: number): string => {
        if (code === 0) return "Clear sky";
        if (code <= 3) return "Partly cloudy";
        if (code <= 49) return "Foggy";
        if (code <= 59) return "Drizzle";
        if (code <= 69) return "Rain";
        if (code <= 79) return "Snow";
        if (code <= 82) return "Rain showers";
        if (code <= 86) return "Snow showers";
        if (code <= 99) return "Thunderstorm";
        return "Unknown";
      };

      res.json({
        temperature: data.hourly.temperature_2m?.[idx] ?? null,
        windSpeed: data.hourly.wind_speed_10m?.[idx] ?? null,
        windDirection: data.hourly.wind_direction_10m?.[idx] ?? null,
        humidity: data.hourly.relative_humidity_2m?.[idx] ?? null,
        conditions: weatherCodeToCondition(data.hourly.weather_code?.[idx] ?? -1),
        recordedAt: targetDate.toISOString(),
      });
    } catch (error) {
      console.error("Weather fetch error:", error);
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  app.patch("/api/campaigns/:id/items/:itemId/weather", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!campaignAllowedRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.category !== "chemical") return res.status(400).json({ error: "Weather capture is only available for chemical campaigns" });
    if (user.activeRole === "field" && campaign.assignedToId !== user.id) {
      return res.status(403).send("Not assigned to this campaign");
    }
    const items = await storage.getCampaignItems(req.params.id, user.activeCompanyId);
    const item = items.find(i => i.id === req.params.itemId);
    if (!item) return res.status(404).json({ error: "Campaign item not found in this campaign" });
    const { temperature, windSpeed, windDirection, humidity, conditions, recordedAt } = req.body as {
      temperature?: number; windSpeed?: number; windDirection?: number; humidity?: number; conditions?: string; recordedAt?: string;
    };
    if (temperature == null || conditions == null || recordedAt == null) {
      return res.status(400).json({ error: "temperature, conditions, and recordedAt are required" });
    }
    const updated = await storage.updateCampaignItem(req.params.itemId, user.activeCompanyId, {
      weatherTemp: temperature,
      weatherWindSpeed: windSpeed ?? null,
      weatherWindDirection: windDirection ?? null,
      weatherHumidity: humidity ?? null,
      weatherConditions: conditions,
      weatherRecordedAt: new Date(recordedAt),
      updatedAt: new Date(),
    });
    if (!updated) return res.status(404).json({ error: "Campaign item not found" });
    res.json(updated);
  });

  // ==================== SEASONS API ====================

  const seasonManagerRoles = ["admin", "office", "chemical_manager"];

  app.get("/api/seasons", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!seasonManagerRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const allSeasons = await storage.getSeasons(user.activeCompanyId);
    res.json(allSeasons);
  });

  app.post("/api/seasons", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!seasonManagerRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { name, description, startDate, endDate } = req.body as {
      name?: string; description?: string; startDate?: string; endDate?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    const season = await storage.createSeason({
      companyId: user.activeCompanyId,
      name: name.trim(),
      description: description || null,
      startDate: startDate || null,
      endDate: endDate || null,
    });
    res.json(season);
  });

  app.patch("/api/seasons/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!seasonManagerRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const existing = await storage.getSeasonById(req.params.id, user.activeCompanyId);
    if (!existing) return res.status(404).json({ error: "Season not found" });
    const { name, description, startDate, endDate } = req.body as {
      name?: string; description?: string; startDate?: string | null; endDate?: string | null;
    };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    const updated = await storage.updateSeason(req.params.id, user.activeCompanyId, updates);
    res.json(updated);
  });

  app.delete("/api/seasons/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!seasonManagerRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const existing = await storage.getSeasonById(req.params.id, user.activeCompanyId);
    if (!existing) return res.status(404).json({ error: "Season not found" });
    await storage.deleteSeason(req.params.id, user.activeCompanyId);
    res.json({ success: true });
  });

  app.patch("/api/campaigns/:id/season", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!seasonManagerRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const campaign = await storage.getCampaignById(req.params.id, user.activeCompanyId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const { seasonId } = req.body as { seasonId?: string | null };
    if (seasonId) {
      const season = await storage.getSeasonById(seasonId, user.activeCompanyId);
      if (!season) return res.status(404).json({ error: "Season not found" });
    }
    const updated = await storage.updateCampaign(req.params.id, user.activeCompanyId, { seasonId: seasonId || null });
    res.json(updated);
  });

  app.get("/api/seasons/:id/report", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!seasonManagerRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const season = await storage.getSeasonById(req.params.id, user.activeCompanyId);
    if (!season) return res.status(404).json({ error: "Season not found" });
    const allCampaigns = await storage.getCampaigns(user.activeCompanyId);
    const seasonCampaigns = allCampaigns.filter(c => c.seasonId === season.id);
    const reportItems: Array<{
      campaignName: string; campaignId: string; customerName: string; customerCity: string;
      customerAddress: string;
      completedAt: string | null; notes: string | null; photoCount: number;
      weatherTemp: number | null; weatherWindSpeed: number | null; weatherWindDirection: number | null;
      weatherHumidity: number | null; weatherConditions: string | null; weatherRecordedAt: string | null;
    }> = [];
    for (const camp of seasonCampaigns) {
      const items = await storage.getCampaignItems(camp.id, user.activeCompanyId);
      for (const item of items) {
        if (item.status === "completed") {
          let customerAddress = "";
          if (item.customerId) {
            const cust = await storage.getCustomerById(item.customerId, user.activeCompanyId);
            if (cust) {
              customerAddress = [cust.street, cust.city, cust.state, cust.zip].filter(Boolean).join(", ");
            }
          }
          reportItems.push({
            campaignName: camp.title,
            campaignId: camp.id,
            customerName: item.customerName,
            customerCity: item.customerCity || "",
            customerAddress,
            completedAt: item.completedAt?.toISOString() || null,
            notes: item.notes,
            photoCount: item.photos?.length || 0,
            weatherTemp: item.weatherTemp,
            weatherWindSpeed: item.weatherWindSpeed,
            weatherWindDirection: item.weatherWindDirection,
            weatherHumidity: item.weatherHumidity,
            weatherConditions: item.weatherConditions,
            weatherRecordedAt: item.weatherRecordedAt?.toISOString() || null,
          });
        }
      }
    }
    res.json({ season, campaigns: seasonCampaigns, items: reportItems });
  });

  // ─── Communications API ──────────────────────────────────────────────────

  function resolveDatePreset(preset: string | undefined, startDate: string | undefined, endDate: string | undefined): { start: Date; end: Date } {
    const now = new Date();
    if (preset === "this_week") {
      const s = new Date(now); s.setDate(s.getDate() - 7); s.setHours(0, 0, 0, 0);
      const e = new Date(now); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    if (preset === "this_month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    if (preset === "last_30") {
      const s = new Date(now); s.setDate(s.getDate() - 30); s.setHours(0, 0, 0, 0);
      const e = new Date(now); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    const s = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const e = endDate ? new Date(endDate) : new Date(now);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }

  const commRoles = ["admin", "office"];

  app.get("/api/communications/analytics", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { preset, startDate, endDate } = req.query as { preset?: string; startDate?: string; endDate?: string };
    const { start, end } = resolveDatePreset(preset, startDate, endDate);
    const analytics = await storage.getCommunicationAnalytics(user.activeCompanyId, start, end);
    res.json(analytics);
  });

  // GET /api/communications
  app.get("/api/communications", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { view, customerId, type, sentById, search, startDate, endDate, status, threadId } = req.query as Record<string, string>;
    const filters: any = {};
    if (view) filters.view = view;
    if (customerId) filters.customerId = customerId;
    if (type) filters.type = type;
    if (sentById) filters.sentById = sentById;
    if (search) filters.search = search;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (status) filters.status = status;
    if (threadId) filters.threadId = threadId;

    const comms = await storage.getCommunications(user.activeCompanyId, filters);
    // Seed if empty
    if (comms.length === 0 && !view && !customerId && !type && !sentById && !search && !startDate && !endDate && !status && !threadId) {
      const custList = await storage.getCustomers(user.activeCompanyId);
      if (custList.length > 0) {
        await storage.seedCommunications(user.activeCompanyId, user.id, custList.map(c => c.id));
        const seeded = await storage.getCommunications(user.activeCompanyId, filters);
        return res.json(seeded);
      }
    }
    res.json(comms);
  });

  // GET /api/communications/:id
  app.get("/api/communications/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const comm = await storage.getCommunicationById(req.params.id, user.activeCompanyId);
    if (!comm) return res.status(404).json({ error: "Not found" });
    const links = await storage.getCommunicationLinks(req.params.id, user.activeCompanyId);
    res.json({ ...comm, links });
  });

  // POST /api/communications
  app.post("/api/communications", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { insertCommunicationSchema } = await import("@shared/schema");
    const parsed = insertCommunicationSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
      sentById: user.id,
      sentAt: req.body.status === "sent" ? new Date() : req.body.sentAt,
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    let threadId = parsed.data.threadId;
    const inReplyTo = parsed.data.inReplyTo;

    // If replying to a message and no thread exists yet, create one
    if (inReplyTo && !threadId) {
      const parent = await storage.getCommunicationById(inReplyTo, user.activeCompanyId);
      if (parent) {
        if (parent.threadId) {
          threadId = parent.threadId;
        } else {
          const thread = await storage.createCommunicationThread({
            companyId: user.activeCompanyId,
            customerId: parent.customerId ?? undefined,
            subjectRoot: parent.subject.replace(/^Re:\s*/i, ""),
          });
          threadId = thread.id;
          // Also link the parent to the thread
          await storage.updateCommunication(inReplyTo, user.activeCompanyId, { threadId: thread.id });
        }
      }
    }

    const comm = await storage.createCommunication({ ...parsed.data, threadId: threadId ?? null });
    res.status(201).json(comm);
  });

  // PATCH /api/communications/:id
  app.patch("/api/communications/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { insertCommunicationSchema } = await import("@shared/schema");
    const parsed = insertCommunicationSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const updates = { ...parsed.data };
    if (updates.scheduledFor) updates.scheduledFor = new Date(updates.scheduledFor as any);
    if (updates.followUpDueAt) updates.followUpDueAt = new Date(updates.followUpDueAt as any);
    if (updates.sentAt) updates.sentAt = new Date(updates.sentAt as any);

    const updated = await storage.updateCommunication(req.params.id, user.activeCompanyId, updates);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  // DELETE /api/communications/:id
  app.delete("/api/communications/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const existing = await storage.getCommunicationById(req.params.id, user.activeCompanyId);
    if (!existing) return res.status(404).json({ error: "Communication not found" });
    await storage.deleteCommunication(req.params.id, user.activeCompanyId);
    res.status(204).end();
  });

  // GET /api/communication-templates
  app.get("/api/communication-templates", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const templates = await storage.getCommunicationTemplates(user.activeCompanyId);
    res.json(templates);
  });

  // POST /api/communication-templates
  app.post("/api/communication-templates", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { insertCommunicationTemplateSchema } = await import("@shared/schema");
    const parsed = insertCommunicationTemplateSchema.safeParse({ ...req.body, companyId: user.activeCompanyId, createdById: user.id });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const template = await storage.createCommunicationTemplate(parsed.data);
    res.status(201).json(template);
  });

  // GET /api/communication-threads
  app.get("/api/communication-threads", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { customerId } = req.query;
    const threads = await storage.getCommunicationThreads(user.activeCompanyId, {
      customerId: customerId as string | undefined,
    });
    res.json(threads);
  });

  // POST /api/communication-threads
  app.post("/api/communication-threads", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const { insertCommunicationThreadSchema } = await import("@shared/schema");
    const parsed = insertCommunicationThreadSchema.safeParse({ ...req.body, companyId: user.activeCompanyId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const thread = await storage.createCommunicationThread(parsed.data);
    res.status(201).json(thread);
  });

  // GET /api/communication-threads/:id/messages
  app.get("/api/communication-threads/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const messages = await storage.getThreadMessages(req.params.id, user.activeCompanyId);
    res.json(messages);
  });

  app.get("/api/communication-templates", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const includeInactive = req.query.includeInactive === "true";
    const items = await storage.getCommunicationTemplates(user.activeCompanyId, includeInactive);
    res.json(items);
  });

  app.get("/api/communication-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const item = await storage.getCommunicationTemplateById(req.params.id, user.activeCompanyId);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });

  app.post("/api/communication-templates", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const parsed = insertCommunicationTemplateSchema.safeParse({ ...req.body, companyId: user.activeCompanyId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const item = await storage.createCommunicationTemplate(parsed.data);
    res.status(201).json(item);
  });

  app.patch("/api/communication-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!commRoles.includes(user.activeRole)) return res.status(403).send("Insufficient permissions");
    const parsed = insertCommunicationTemplateSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const item = await storage.updateCommunicationTemplate(req.params.id, user.activeCompanyId, parsed.data);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });

  const httpServer = createServer(app);

  return httpServer;
}
