import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertPropertySchema, insertContactSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Properties routes
  app.get("/api/properties", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const properties = await storage.getProperties();
    res.json(properties);
  });

  app.get("/api/properties/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const property = await storage.getPropertyById(req.params.id);
    if (!property) {
      return res.status(404).send("Property not found");
    }
    res.json(property);
  });

  app.post("/api/properties", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const result = insertPropertySchema.safeParse(req.body);
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

    const property = await storage.updateProperty(req.params.id, req.body);
    if (!property) {
      return res.status(404).send("Property not found");
    }
    res.json(property);
  });

  app.delete("/api/properties/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    await storage.deleteProperty(req.params.id);
    res.status(200).send("Deleted");
  });

  // Contacts routes
  app.get("/api/properties/:propertyId/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const contacts = await storage.getContactsByPropertyId(req.params.propertyId);
    res.json(contacts);
  });

  app.post("/api/properties/:propertyId/contacts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const result = insertContactSchema.safeParse({
      ...req.body,
      propertyId: req.params.propertyId,
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

    const contact = await storage.updateContact(req.params.id, req.body);
    if (!contact) {
      return res.status(404).send("Contact not found");
    }
    res.json(contact);
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    await storage.deleteContact(req.params.id);
    res.status(200).send("Deleted");
  });

  const httpServer = createServer(app);

  return httpServer;
}
