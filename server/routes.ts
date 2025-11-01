import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, type UserWithContext } from "./auth";
import { storage } from "./storage";
import { insertPropertySchema, insertContactSchema, insertCompanySchema, insertCompanyUserSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Properties routes
  app.get("/api/properties", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const properties = await storage.getProperties(user.activeCompanyId);
    res.json(properties);
  });

  app.get("/api/properties/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const property = await storage.getPropertyById(req.params.id, user.activeCompanyId);
    if (!property) {
      return res.status(404).send("Property not found");
    }
    res.json(property);
  });

  app.post("/api/properties", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "viewer" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertPropertySchema.safeParse({
      ...req.body,
      companyId: user.activeCompanyId,
    });
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const property = await storage.createProperty(result.data);
    res.json(property);
  });

  app.patch("/api/properties/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "viewer" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertPropertySchema.partial().omit({ companyId: true }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).send(result.error.message);
    }

    const property = await storage.updateProperty(req.params.id, user.activeCompanyId, result.data);
    if (!property) {
      return res.status(404).send("Property not found");
    }
    res.json(property);
  });

  app.delete("/api/properties/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "viewer" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions");
    }

    await storage.deleteProperty(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
  });

  // Contacts routes
  app.get("/api/properties/:propertyId/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    const contacts = await storage.getContactsByPropertyId(req.params.propertyId, user.activeCompanyId);
    res.json(contacts);
  });

  app.post("/api/properties/:propertyId/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user as UserWithContext;
    
    if (user.activeRole === "viewer" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertContactSchema.safeParse({
      ...req.body,
      propertyId: req.params.propertyId,
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
    
    if (user.activeRole === "viewer" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions");
    }

    const result = insertContactSchema.partial().omit({ propertyId: true, companyId: true }).safeParse(req.body);
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
    
    if (user.activeRole === "viewer" && !user.isSuperAdminBool) {
      return res.status(403).send("Insufficient permissions");
    }

    await storage.deleteContact(req.params.id, user.activeCompanyId);
    res.status(200).send("Deleted");
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

  const httpServer = createServer(app);

  return httpServer;
}
