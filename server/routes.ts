import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { promises as fs } from "fs";
import { setupAuth, type UserWithContext } from "./auth";
import { storage } from "./storage";
import { insertCustomerSchema, insertContactSchema, insertCompanySchema, insertCompanyUserSchema, insertSettingsSchema, insertNoteSchema, insertContractSchema, insertContractDocumentSchema, insertContractBuilderDocumentSchema, insertContractBuilderSectionSchema, insertContractBuilderVariableSchema, insertTicketTypeSchema, insertTicketTypeStatusSchema, insertTicketTypeFieldSchema, insertTicketSchema, insertTicketFieldValueSchema, insertTicketStatusHistorySchema, insertTicketCommentSchema, insertTicketLinkSchema, insertCustomerMapLayerSchema, insertCustomerMapDocumentSchema, insertMaintenanceCrewSchema, insertMaintenanceVisitConfigSchema, insertWeeklyScheduleTemplateSchema, insertScheduleBlockSchema } from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient, signObjectURL } from "./objectStorage";
import { ObjectPermission, ObjectAccessGroupType, setObjectAclPolicy } from "./objectAcl";

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
    res.json(customer);
  });

  app.post("/api/customers", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertCustomerSchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const customer = await storage.createCustomer(result.data);
    res.json(customer);
  });

  app.patch("/api/customers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertCustomerSchema.partial().omit({ companyId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const customer = await storage.updateCustomer(req.params.id, user.activeCompanyId, result.data);
    if (!customer) {
      return res.status(404).send("Customer not found");
    }
    res.json(customer);
  });

  app.delete("/api/customers/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertContactSchema.safeParse({
      ...req.body,
      customerId: req.params.customerId,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const contact = await storage.createContact(result.data);
    res.json(contact);
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const result = insertContactSchema.partial().omit({ customerId: true, companyId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const contact = await storage.updateContact(req.params.id, user.activeCompanyId, result.data);
    if (!contact) {
      return res.status(404).send("Contact not found");
    }
    res.json(contact);
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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

    const contract = await storage.updateContract(req.params.id, user.activeCompanyId, req.body);
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
        role: role as "admin" | "office" | "field_manager" | "field",
        status: "active",
      });

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
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

    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
        notes: `Created from Contract Builder document: ${document.documentTitle}`
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
    res.json(tickets);
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
    if (user.activeRole === "field_manager") {
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
    if (user.activeRole === "field_manager" && ticket.assignedToId !== user.id) {
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
      res.json({ uploadURL });
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

    res.json(ticket);
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
    if (user.activeRole === "field_manager" && existingTicket.assignedToId !== user.id) {
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
      const newStatus = await storage.getTicketTypeStatuses(existingTicket.ticketTypeId)
        .then(statuses => statuses.find(s => s.id === req.body.currentStatusId));
      
      if (newStatus?.isFinal === "true") {
        req.body.completedAt = new Date();
        
        // Auto-create Invoice ticket if billable work is completed
        if (existingTicket.billingBehavior === "invoice_required") {
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
      }
    }

    const result = insertTicketSchema.partial().omit({ companyId: true, createdById: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const ticket = await storage.updateTicket(req.params.id, user.activeCompanyId, result.data);
    res.json(ticket);
  });

  app.delete("/api/tickets/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin and office can delete tickets
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteTicket(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
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
    if (user.activeRole === "field_manager" && ticket.assignedToId !== user.id) {
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
    if (user.activeRole === "field_manager" && ticket.assignedToId !== user.id) {
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
    if (user.activeRole === "field_manager" && ticket.assignedToId !== user.id) {
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
    if (user.activeRole === "field_manager" && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied");
    }
    
    if (user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertTicketCommentSchema.safeParse({
      ticketId: req.params.ticketId,
      authorId: user.id,
      body: req.body.body,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const comment = await storage.createTicketComment(result.data);
    res.json(comment);
  });

  app.delete("/api/ticket-comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin/office can delete comments
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteTicketLink(req.params.id);
    res.status(200).send("Deleted");
  });

  // Pending Invoices dashboard endpoint
  app.get("/api/pending-invoices", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    // Only admin/office can see pending invoices
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    // Get all tickets and filter for Invoice tickets in "Pending Invoice" status
    const allTickets = await storage.getTickets(user.activeCompanyId, {});
    const ticketTypes = await storage.getTicketTypes(user.activeCompanyId);
    const invoiceType = ticketTypes.find(tt => tt.name === "Invoice");
    
    if (!invoiceType) {
      return res.json([]);
    }

    const invoiceStatuses = await storage.getTicketTypeStatuses(invoiceType.id);
    const pendingStatus = invoiceStatuses.find(s => s.name === "Pending Invoice");
    
    if (!pendingStatus) {
      return res.json([]);
    }

    const pendingInvoices = allTickets.filter(
      t => t.ticketTypeId === invoiceType.id && t.currentStatusId === pendingStatus.id
    );

    // Enrich with customer info and linked source ticket
    const enrichedInvoices = await Promise.all(
      pendingInvoices.map(async (invoice) => {
        const customer = await storage.getCustomerById(invoice.customerId, user.activeCompanyId);
        const links = await storage.getTicketLinks(invoice.id);
        
        // Find the source (billable) ticket
        let sourceTicket = null;
        const sourceLink = links.find(l => l.linkType === "invoice_for" && l.targetTicketId === invoice.id);
        if (sourceLink) {
          sourceTicket = await storage.getTicketById(sourceLink.sourceTicketId, user.activeCompanyId);
        }
        
        return {
          ...invoice,
          customer,
          sourceTicket,
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
    if (user.activeRole === "field_manager" && ticket.assignedToId !== user.id) {
      return res.status(403).send("Access denied");
    }

    const [ticketType, statuses, fieldValues, statusHistory, comments, customer] = await Promise.all([
      storage.getTicketTypeById(ticket.ticketTypeId, user.activeCompanyId),
      storage.getTicketTypeStatuses(ticket.ticketTypeId),
      storage.getTicketFieldValues(ticket.id),
      storage.getTicketStatusHistory(ticket.id),
      storage.getTicketComments(ticket.id),
      storage.getCustomerById(ticket.customerId, user.activeCompanyId),
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteWeeklyScheduleTemplate(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
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
    if (user.activeRole === "field_manager" || user.activeRole === "field") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    await storage.deleteScheduleBlock(req.params.id);
    res.status(200).send("Deleted");
  });

  const httpServer = createServer(app);

  return httpServer;
}
