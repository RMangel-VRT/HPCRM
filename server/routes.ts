import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, type UserWithContext } from "./auth";
import { storage } from "./storage";
import { insertCustomerSchema, insertContactSchema, insertCompanySchema, insertCompanyUserSchema, insertSettingsSchema, insertNoteSchema, insertContractSchema, insertContractDocumentSchema } from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission, ObjectAccessGroupType } from "./objectAcl";

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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "viewer") {
      return res.status(403).send("Insufficient permissions - viewer role cannot create notes");
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
    
    if (user.activeRole === "viewer") {
      return res.status(403).send("Insufficient permissions - viewer role cannot delete notes");
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
      return res.status(400).send(result.error.message);
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
    }

    const contract = await storage.updateContract(req.params.id, user.activeCompanyId, req.body);
    if (!contract) {
      return res.status(404).send("Contract not found");
    }

    if (req.body.status && req.body.status !== contract.status) {
      await storage.createContractStatusHistory({
        contractId: contract.id,
        oldStatus: contract.status as any,
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
      return res.status(403).send("Insufficient permissions - admin or office role required");
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
    
    if (user.activeRole === "ops" || user.activeRole === "viewer") {
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
        role: role as "admin" | "office" | "ops" | "viewer",
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

  const httpServer = createServer(app);

  return httpServer;
}
