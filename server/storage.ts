import { type User, type InsertUser, type Property, type InsertProperty, type Contact, type InsertContact, type Company, type InsertCompany, type CompanyUser, type InsertCompanyUser } from "@shared/schema";
import { db } from "./db";
import { users, properties, contacts, companies, companyUsers } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getCompanies(): Promise<Company[]>;
  getCompanyById(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;
  
  getCompanyUsersByUserId(userId: string): Promise<CompanyUser[]>;
  getCompanyUsersByCompanyId(companyId: string): Promise<CompanyUser[]>;
  getCompanyUser(userId: string, companyId: string): Promise<CompanyUser | undefined>;
  createCompanyUser(companyUser: InsertCompanyUser): Promise<CompanyUser>;
  updateCompanyUser(id: string, companyUser: Partial<InsertCompanyUser>): Promise<CompanyUser | undefined>;
  deleteCompanyUser(id: string): Promise<void>;
  
  getProperties(companyId: string): Promise<Property[]>;
  getPropertyById(id: string, companyId: string): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: string, companyId: string, property: Partial<InsertProperty>): Promise<Property | undefined>;
  deleteProperty(id: string, companyId: string): Promise<void>;
  
  getContactsByPropertyId(propertyId: string, companyId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, companyId: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string, companyId: string): Promise<void>;
  
  sessionStore: session.Store;
}

export class PgStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUserById(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values([insertUser]).returning();
    return result[0];
  }

  async getCompanies(): Promise<Company[]> {
    return await db.select().from(companies);
  }

  async getCompanyById(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return result[0];
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const result = await db.insert(companies).values([insertCompany]).returning();
    return result[0];
  }

  async updateCompany(id: string, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    const result = await db.update(companies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return result[0];
  }

  async deleteCompany(id: string): Promise<void> {
    await db.delete(companies).where(eq(companies.id, id));
  }

  async getCompanyUsersByUserId(userId: string): Promise<CompanyUser[]> {
    return await db.select().from(companyUsers).where(eq(companyUsers.userId, userId));
  }

  async getCompanyUsersByCompanyId(companyId: string): Promise<CompanyUser[]> {
    return await db.select().from(companyUsers).where(eq(companyUsers.companyId, companyId));
  }

  async getCompanyUser(userId: string, companyId: string): Promise<CompanyUser | undefined> {
    const result = await db.select().from(companyUsers)
      .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createCompanyUser(insertCompanyUser: InsertCompanyUser): Promise<CompanyUser> {
    const result = await db.insert(companyUsers).values([insertCompanyUser]).returning();
    return result[0];
  }

  async updateCompanyUser(id: string, updates: Partial<InsertCompanyUser>): Promise<CompanyUser | undefined> {
    const result = await db.update(companyUsers)
      .set(updates)
      .where(eq(companyUsers.id, id))
      .returning();
    return result[0];
  }

  async deleteCompanyUser(id: string): Promise<void> {
    await db.delete(companyUsers).where(eq(companyUsers.id, id));
  }

  async getProperties(companyId: string): Promise<Property[]> {
    return await db.select().from(properties).where(eq(properties.companyId, companyId));
  }

  async getPropertyById(id: string, companyId: string): Promise<Property | undefined> {
    const result = await db.select().from(properties)
      .where(and(eq(properties.id, id), eq(properties.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createProperty(insertProperty: InsertProperty): Promise<Property> {
    const result = await db.insert(properties).values([insertProperty]).returning();
    return result[0];
  }

  async updateProperty(id: string, companyId: string, updates: Partial<InsertProperty>): Promise<Property | undefined> {
    const result = await db.update(properties)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(properties.id, id), eq(properties.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteProperty(id: string, companyId: string): Promise<void> {
    await db.delete(properties).where(and(eq(properties.id, id), eq(properties.companyId, companyId)));
  }

  async getContactsByPropertyId(propertyId: string, companyId: string): Promise<Contact[]> {
    return await db.select().from(contacts)
      .where(and(eq(contacts.propertyId, propertyId), eq(contacts.companyId, companyId)));
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const result = await db.insert(contacts).values([insertContact]).returning();
    return result[0];
  }

  async updateContact(id: string, companyId: string, updates: Partial<InsertContact>): Promise<Contact | undefined> {
    const result = await db.update(contacts)
      .set(updates)
      .where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteContact(id: string, companyId: string): Promise<void> {
    await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)));
  }
}

export const storage = new PgStorage();
