import { type User, type InsertUser, type Customer, type InsertCustomer, type Contact, type InsertContact, type Company, type InsertCompany, type CompanyUser, type InsertCompanyUser, type Settings, type InsertSettings, type Note, type InsertNote, type Contract, type InsertContract, type ContractStatusHistory, type InsertContractStatusHistory, type ContractDocument, type InsertContractDocument, type ContractMonthlyAmount, type InsertContractMonthlyAmount, type CustomerRateSheet, type InsertCustomerRateSheet, type ContractService, type InsertContractService, type ContractTemplate, type InsertContractTemplate, type ContractBuilderDocument, type InsertContractBuilderDocument, type ContractBuilderSection, type InsertContractBuilderSection, type ContractBuilderVariable, type InsertContractBuilderVariable, type TicketType, type InsertTicketType, type TicketTypeStatus, type InsertTicketTypeStatus, type TicketTypeField, type InsertTicketTypeField, type Ticket, type InsertTicket, type TicketFieldValue, type InsertTicketFieldValue, type TicketStatusHistory, type InsertTicketStatusHistory, type TicketComment, type InsertTicketComment, type TicketSource, type InsertTicketSource, type TicketLink, type InsertTicketLink, type TicketTypeCategory, type CustomerMapLayer, type InsertCustomerMapLayer, type CustomerMapDocument, type InsertCustomerMapDocument, type MaintenanceCrew, type InsertMaintenanceCrew, type MaintenanceVisitConfig, type InsertMaintenanceVisitConfig, type WeeklyScheduleTemplate, type InsertWeeklyScheduleTemplate, type ScheduleBlock, type InsertScheduleBlock } from "@shared/schema";
import { db } from "./db";
import { users, customers, contacts, companies, companyUsers, settings, notes, contracts, contractStatusHistory, contractDocuments, contractMonthlyAmounts, customerRateSheets, contractServices, contractTemplates, contractBuilderDocuments, contractBuilderSections, contractBuilderVariables, ticketTypes, ticketTypeStatuses, ticketTypeFields, tickets, ticketFieldValues, ticketStatusHistory, ticketComments, ticketSources, ticketLinks, customerMapLayers, customerMapDocuments, maintenanceCrews, maintenanceVisitConfigs, weeklyScheduleTemplates, scheduleBlocks } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  
  getCompanies(): Promise<Company[]>;
  getCompanyById(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;
  
  getCompanyUsersByUserId(userId: string): Promise<CompanyUser[]>;
  getCompanyUsersByCompanyId(companyId: string): Promise<CompanyUser[]>;
  getCompanyUser(userId: string, companyId: string): Promise<CompanyUser | undefined>;
  getCompanyUserById(id: string): Promise<CompanyUser | undefined>;
  createCompanyUser(companyUser: InsertCompanyUser): Promise<CompanyUser>;
  updateCompanyUser(id: string, companyUser: Partial<InsertCompanyUser>): Promise<CompanyUser | undefined>;
  deleteCompanyUser(id: string): Promise<void>;
  
  getCustomers(companyId: string): Promise<Customer[]>;
  getCustomerById(id: string, companyId: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, companyId: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string, companyId: string): Promise<void>;
  
  getContactsByCustomerId(customerId: string, companyId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, companyId: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string, companyId: string): Promise<void>;
  
  getNotesByCustomerId(customerId: string, companyId: string): Promise<Note[]>;
  createNote(note: InsertNote): Promise<Note>;
  deleteNote(id: string, companyId: string): Promise<void>;
  
  getContractsByCustomerId(customerId: string, companyId: string): Promise<Contract[]>;
  getContractById(id: string, companyId: string): Promise<Contract | undefined>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: string, companyId: string, contract: Partial<InsertContract>): Promise<Contract | undefined>;
  deleteContract(id: string, companyId: string): Promise<void>;
  
  createContractStatusHistory(history: InsertContractStatusHistory): Promise<ContractStatusHistory>;
  getContractStatusHistory(contractId: string): Promise<ContractStatusHistory[]>;
  
  getSettings(companyId: string): Promise<Settings | undefined>;
  createSettings(settings: InsertSettings): Promise<Settings>;
  updateSettings(companyId: string, updates: Partial<InsertSettings>): Promise<Settings | undefined>;
  
  createContractDocument(document: InsertContractDocument): Promise<ContractDocument>;
  getContractDocuments(contractId: string, companyId: string): Promise<ContractDocument[]>;
  getContractDocumentById(id: string, companyId: string): Promise<ContractDocument | undefined>;
  getCurrentContractDocument(contractId: string, companyId: string): Promise<ContractDocument | undefined>;
  deleteContractDocument(id: string, companyId: string): Promise<void>;
  
  getContractMonthlyAmounts(contractId: string, companyId: string): Promise<ContractMonthlyAmount[]>;
  upsertContractMonthlyAmounts(contractId: string, companyId: string, amounts: { month: number; amount: number }[]): Promise<ContractMonthlyAmount[]>;
  
  getCustomerRateSheet(customerId: string, companyId: string): Promise<CustomerRateSheet | undefined>;
  upsertCustomerRateSheet(customerId: string, companyId: string, rateSheet: Omit<InsertCustomerRateSheet, 'customerId' | 'companyId' | 'lastUpdatedBy' | 'lastUpdatedAt'>, userId: string): Promise<CustomerRateSheet>;
  
  getCustomerRevenue(customerId: string, companyId: string, year: number): Promise<CustomerRevenueData>;
  getRevenueOverview(companyId: string, month: number, year: number): Promise<RevenueOverviewData>;
  
  getContractServices(contractId: string, companyId: string): Promise<ContractService[]>;
  createContractService(service: InsertContractService): Promise<ContractService>;
  updateContractService(id: string, companyId: string, service: Partial<InsertContractService>): Promise<ContractService | undefined>;
  deleteContractService(id: string, companyId: string): Promise<void>;
  
  getDashboardStats(companyId: string, month: number, year: number): Promise<DashboardStats>;
  getCustomerGrowthData(companyId: string): Promise<CustomerGrowthData[]>;
  getMonthlyRevenueData(companyId: string, year: number): Promise<MonthlyRevenueData[]>;
  getTopCustomers(companyId: string, limit: number): Promise<TopCustomer[]>;
  getUpcomingRenewals(companyId: string, daysAhead: number): Promise<UpcomingRenewal[]>;
  
  getContractTemplates(): Promise<ContractTemplate[]>;
  
  getContractBuilderDocuments(companyId: string, customerId?: string): Promise<ContractBuilderDocument[]>;
  getContractBuilderDocumentById(id: string, companyId: string): Promise<ContractBuilderDocument | undefined>;
  createContractBuilderDocument(document: InsertContractBuilderDocument): Promise<ContractBuilderDocument>;
  updateContractBuilderDocument(id: string, companyId: string, document: Partial<InsertContractBuilderDocument>): Promise<ContractBuilderDocument | undefined>;
  deleteContractBuilderDocument(id: string, companyId: string): Promise<void>;
  
  getContractBuilderSections(documentId: string, companyId: string): Promise<ContractBuilderSection[]>;
  upsertContractBuilderSections(documentId: string, companyId: string, sections: InsertContractBuilderSection[]): Promise<ContractBuilderSection[]>;
  
  getContractBuilderVariables(documentId: string, companyId: string): Promise<ContractBuilderVariable[]>;
  upsertContractBuilderVariables(documentId: string, companyId: string, variables: { variableKey: string; variableValue: string }[]): Promise<ContractBuilderVariable[]>;
  
  // Ticketing System
  getTicketTypes(companyId: string): Promise<TicketType[]>;
  getTicketTypeById(id: string, companyId: string): Promise<TicketType | undefined>;
  createTicketType(ticketType: InsertTicketType): Promise<TicketType>;
  updateTicketType(id: string, companyId: string, updates: Partial<InsertTicketType>): Promise<TicketType | undefined>;
  deleteTicketType(id: string, companyId: string): Promise<void>;
  
  getTicketTypeStatuses(ticketTypeId: string): Promise<TicketTypeStatus[]>;
  createTicketTypeStatus(status: InsertTicketTypeStatus): Promise<TicketTypeStatus>;
  updateTicketTypeStatus(id: string, updates: Partial<InsertTicketTypeStatus>): Promise<TicketTypeStatus | undefined>;
  deleteTicketTypeStatus(id: string): Promise<void>;
  
  getTicketTypeFields(ticketTypeId: string): Promise<TicketTypeField[]>;
  getTicketTypeFieldsByStatus(statusId: string): Promise<TicketTypeField[]>;
  createTicketTypeField(field: InsertTicketTypeField): Promise<TicketTypeField>;
  updateTicketTypeField(id: string, updates: Partial<InsertTicketTypeField>): Promise<TicketTypeField | undefined>;
  deleteTicketTypeField(id: string): Promise<void>;
  
  getTickets(companyId: string, filters?: { customerId?: string; contractId?: string; assignedToId?: string; status?: string; category?: TicketTypeCategory }): Promise<Ticket[]>;
  getTicketById(id: string, companyId: string): Promise<Ticket | undefined>;
  getTicketsByCustomerId(customerId: string, companyId: string): Promise<Ticket[]>;
  getTicketsByContractId(contractId: string, companyId: string): Promise<Ticket[]>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: string, companyId: string, updates: Partial<InsertTicket>): Promise<Ticket | undefined>;
  deleteTicket(id: string, companyId: string): Promise<void>;
  
  getTicketFieldValues(ticketId: string): Promise<TicketFieldValue[]>;
  upsertTicketFieldValue(fieldValue: InsertTicketFieldValue): Promise<TicketFieldValue>;
  
  createTicketStatusHistory(history: InsertTicketStatusHistory): Promise<TicketStatusHistory>;
  getTicketStatusHistory(ticketId: string): Promise<TicketStatusHistory[]>;
  
  getTicketComments(ticketId: string): Promise<TicketComment[]>;
  createTicketComment(comment: InsertTicketComment): Promise<TicketComment>;
  deleteTicketComment(id: string): Promise<void>;
  
  createTicketSource(ticketSource: InsertTicketSource): Promise<TicketSource>;
  getTicketSource(ticketId: string): Promise<TicketSource | undefined>;
  
  // Ticket Links (connecting related tickets)
  getTicketLinks(ticketId: string): Promise<TicketLink[]>;
  createTicketLink(link: InsertTicketLink): Promise<TicketLink>;
  deleteTicketLink(id: string): Promise<void>;
  
  // Customer Map Layers (KML)
  getCustomerMapLayers(customerId: string, companyId: string): Promise<CustomerMapLayer[]>;
  getCustomerMapLayerById(id: string, companyId: string): Promise<CustomerMapLayer | undefined>;
  createCustomerMapLayer(layer: InsertCustomerMapLayer): Promise<CustomerMapLayer>;
  updateCustomerMapLayer(id: string, companyId: string, updates: Partial<InsertCustomerMapLayer>): Promise<CustomerMapLayer | undefined>;
  deleteCustomerMapLayer(id: string, companyId: string): Promise<void>;
  
  // Customer Map Documents (PDF)
  getCustomerMapDocuments(customerId: string, companyId: string): Promise<CustomerMapDocument[]>;
  getCustomerMapDocumentById(id: string, companyId: string): Promise<CustomerMapDocument | undefined>;
  createCustomerMapDocument(document: InsertCustomerMapDocument): Promise<CustomerMapDocument>;
  deleteCustomerMapDocument(id: string, companyId: string): Promise<void>;
  
  // Maintenance Scheduling
  getMaintenanceCrews(companyId: string): Promise<MaintenanceCrew[]>;
  getMaintenanceCrewById(id: string, companyId: string): Promise<MaintenanceCrew | undefined>;
  createMaintenanceCrew(crew: InsertMaintenanceCrew): Promise<MaintenanceCrew>;
  updateMaintenanceCrew(id: string, companyId: string, updates: Partial<InsertMaintenanceCrew>): Promise<MaintenanceCrew | undefined>;
  deleteMaintenanceCrew(id: string, companyId: string): Promise<void>;
  
  getMaintenanceVisitConfig(customerId: string, companyId: string): Promise<MaintenanceVisitConfig | undefined>;
  createMaintenanceVisitConfig(config: InsertMaintenanceVisitConfig): Promise<MaintenanceVisitConfig>;
  updateMaintenanceVisitConfig(id: string, companyId: string, updates: Partial<InsertMaintenanceVisitConfig>): Promise<MaintenanceVisitConfig | undefined>;
  getMaintenanceVisitConfigs(companyId: string): Promise<MaintenanceVisitConfig[]>;
  
  getWeeklyScheduleTemplates(companyId: string): Promise<WeeklyScheduleTemplate[]>;
  getWeeklyScheduleTemplateById(id: string, companyId: string): Promise<WeeklyScheduleTemplate | undefined>;
  createWeeklyScheduleTemplate(template: InsertWeeklyScheduleTemplate): Promise<WeeklyScheduleTemplate>;
  updateWeeklyScheduleTemplate(id: string, companyId: string, updates: Partial<InsertWeeklyScheduleTemplate>): Promise<WeeklyScheduleTemplate | undefined>;
  deleteWeeklyScheduleTemplate(id: string, companyId: string): Promise<void>;
  
  getScheduleBlocks(templateId: string): Promise<ScheduleBlock[]>;
  createScheduleBlock(block: InsertScheduleBlock): Promise<ScheduleBlock>;
  updateScheduleBlock(id: string, updates: Partial<InsertScheduleBlock>): Promise<ScheduleBlock | undefined>;
  deleteScheduleBlock(id: string): Promise<void>;
  deleteScheduleBlocksByTemplate(templateId: string): Promise<void>;
  
  sessionStore: session.Store;
}

export interface DashboardStats {
  customersCount: number;
  activeContractsCount: number;
  monthlyRevenue: number;
  ytdRevenue: number;
}

export interface CustomerGrowthData {
  month: string;
  count: number;
}

export interface MonthlyRevenueData {
  month: string;
  revenue: number;
}

export interface TopCustomer {
  id: string;
  name: string;
  totalRevenue: number;
  activeContracts: number;
}

export interface UpcomingRenewal {
  contractId: string;
  customerId: string;
  customerName: string;
  serviceType: string;
  endDate: Date;
  daysUntilExpiry: number;
}

export interface CustomerRevenueData {
  annualProjection: number;
  monthlyBreakdown: { month: number; total: number; byServiceType: { serviceType: string; amount: number }[] }[];
  contractBreakdown: { contractId: string; serviceType: string; status: string; startDate: Date; endDate: Date | null; annualTotal: number }[];
}

export interface RevenueOverviewData {
  selectedMonthTotal: number;
  yearToDateTotal: number;
  customers: { customerId: string; customerName: string; monthlyRevenue: number; annualProjection: number }[];
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

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
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

  async getCompanyUserById(id: string): Promise<CompanyUser | undefined> {
    const result = await db.select().from(companyUsers)
      .where(eq(companyUsers.id, id))
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

  async getCustomers(companyId: string): Promise<Customer[]> {
    return await db.select().from(customers).where(eq(customers.companyId, companyId));
  }

  async getCustomerById(id: string, companyId: string): Promise<Customer | undefined> {
    const result = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const result = await db.insert(customers).values([insertCustomer]).returning();
    return result[0];
  }

  async updateCustomer(id: string, companyId: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const result = await db.update(customers)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteCustomer(id: string, companyId: string): Promise<void> {
    await db.delete(customers).where(and(eq(customers.id, id), eq(customers.companyId, companyId)));
  }

  async getContactsByCustomerId(customerId: string, companyId: string): Promise<Contact[]> {
    return await db.select().from(contacts)
      .where(and(eq(contacts.customerId, customerId), eq(contacts.companyId, companyId)));
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

  async getNotesByCustomerId(customerId: string, companyId: string): Promise<Note[]> {
    return await db.select().from(notes)
      .where(and(eq(notes.customerId, customerId), eq(notes.companyId, companyId)))
      .orderBy(desc(notes.createdAt));
  }

  async createNote(insertNote: InsertNote): Promise<Note> {
    const result = await db.insert(notes).values([insertNote]).returning();
    return result[0];
  }

  async deleteNote(id: string, companyId: string): Promise<void> {
    await db.delete(notes).where(and(eq(notes.id, id), eq(notes.companyId, companyId)));
  }

  async getContractsByCustomerId(customerId: string, companyId: string): Promise<Contract[]> {
    return await db.select().from(contracts)
      .where(and(eq(contracts.customerId, customerId), eq(contracts.companyId, companyId)))
      .orderBy(desc(contracts.createdAt));
  }

  async getContractById(id: string, companyId: string): Promise<Contract | undefined> {
    const result = await db.select().from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createContract(insertContract: InsertContract): Promise<Contract> {
    const result = await db.insert(contracts).values([insertContract]).returning();
    return result[0];
  }

  async updateContract(id: string, companyId: string, updates: Partial<InsertContract>): Promise<Contract | undefined> {
    const result = await db.update(contracts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(contracts.id, id), eq(contracts.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteContract(id: string, companyId: string): Promise<void> {
    await db.delete(contracts).where(and(eq(contracts.id, id), eq(contracts.companyId, companyId)));
  }

  async createContractStatusHistory(insertHistory: InsertContractStatusHistory): Promise<ContractStatusHistory> {
    const result = await db.insert(contractStatusHistory).values([insertHistory]).returning();
    return result[0];
  }

  async getContractStatusHistory(contractId: string): Promise<ContractStatusHistory[]> {
    return await db.select().from(contractStatusHistory)
      .where(eq(contractStatusHistory.contractId, contractId))
      .orderBy(desc(contractStatusHistory.createdAt));
  }

  async getSettings(companyId: string): Promise<Settings | undefined> {
    const result = await db.select().from(settings).where(eq(settings.companyId, companyId)).limit(1);
    return result[0];
  }

  async createSettings(insertSettings: InsertSettings): Promise<Settings> {
    const result = await db.insert(settings).values([insertSettings]).returning();
    return result[0];
  }

  async updateSettings(companyId: string, updates: Partial<InsertSettings>): Promise<Settings | undefined> {
    const result = await db.update(settings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(settings.companyId, companyId))
      .returning();
    return result[0];
  }

  async createContractDocument(insertDocument: InsertContractDocument): Promise<ContractDocument> {
    const result = await db.insert(contractDocuments).values([insertDocument]).returning();
    return result[0];
  }

  async getContractDocuments(contractId: string, companyId: string): Promise<ContractDocument[]> {
    return await db.select().from(contractDocuments)
      .where(and(eq(contractDocuments.contractId, contractId), eq(contractDocuments.companyId, companyId)))
      .orderBy(desc(contractDocuments.version));
  }

  async getContractDocumentById(id: string, companyId: string): Promise<ContractDocument | undefined> {
    const result = await db.select().from(contractDocuments)
      .where(and(eq(contractDocuments.id, id), eq(contractDocuments.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async getCurrentContractDocument(contractId: string, companyId: string): Promise<ContractDocument | undefined> {
    const result = await db.select().from(contractDocuments)
      .where(and(eq(contractDocuments.contractId, contractId), eq(contractDocuments.companyId, companyId)))
      .orderBy(desc(contractDocuments.version))
      .limit(1);
    return result[0];
  }

  async deleteContractDocument(id: string, companyId: string): Promise<void> {
    await db.delete(contractDocuments).where(and(eq(contractDocuments.id, id), eq(contractDocuments.companyId, companyId)));
  }

  async getContractMonthlyAmounts(contractId: string, companyId: string): Promise<ContractMonthlyAmount[]> {
    return await db.select().from(contractMonthlyAmounts)
      .where(and(eq(contractMonthlyAmounts.contractId, contractId), eq(contractMonthlyAmounts.companyId, companyId)))
      .orderBy(contractMonthlyAmounts.month);
  }

  async upsertContractMonthlyAmounts(contractId: string, companyId: string, amounts: { month: number; amount: number }[]): Promise<ContractMonthlyAmount[]> {
    const result: ContractMonthlyAmount[] = [];
    
    for (const amount of amounts) {
      const upserted = await db.insert(contractMonthlyAmounts)
        .values({
          month: amount.month,
          amount: amount.amount,
          contractId,
          companyId,
        })
        .onConflictDoUpdate({
          target: [contractMonthlyAmounts.contractId, contractMonthlyAmounts.month],
          set: {
            amount: amount.amount,
            updatedAt: sql`NOW()`,
          },
        })
        .returning();
      
      result.push(upserted[0]);
    }
    
    return result;
  }

  async getCustomerRateSheet(customerId: string, companyId: string): Promise<CustomerRateSheet | undefined> {
    const result = await db.select().from(customerRateSheets)
      .where(and(eq(customerRateSheets.customerId, customerId), eq(customerRateSheets.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async upsertCustomerRateSheet(customerId: string, companyId: string, rateSheet: Omit<InsertCustomerRateSheet, 'customerId' | 'companyId' | 'lastUpdatedBy' | 'lastUpdatedAt'>, userId: string): Promise<CustomerRateSheet> {
    const result = await db.insert(customerRateSheets)
      .values({
        ...rateSheet,
        customerId,
        companyId,
        lastUpdatedBy: userId,
        lastUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerRateSheets.customerId,
        set: {
          ...rateSheet,
          lastUpdatedBy: userId,
          lastUpdatedAt: new Date(),
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
    
    return result[0];
  }

  async getCustomerRevenue(customerId: string, companyId: string, year: number): Promise<CustomerRevenueData> {
    const customerContracts = await this.getContractsByCustomerId(customerId, companyId);
    
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    
    let annualProjection = 0;
    const monthlyTotals: Record<number, number> = {};
    const monthlyByServiceType: Record<number, Record<string, number>> = {};
    const contractBreakdown: { contractId: string; serviceType: string; status: string; startDate: Date; endDate: Date | null; annualTotal: number }[] = [];
    
    for (let month = 1; month <= 12; month++) {
      monthlyTotals[month] = 0;
      monthlyByServiceType[month] = {};
    }
    
    for (const contract of customerContracts) {
      if (contract.status === 'paused') {
        contractBreakdown.push({
          contractId: contract.id,
          serviceType: contract.serviceType,
          status: contract.status,
          startDate: contract.startDate,
          endDate: contract.endDate,
          annualTotal: 0,
        });
        continue;
      }
      
      const amounts = await this.getContractMonthlyAmounts(contract.id, companyId);
      let contractAnnualTotal = 0;
      
      for (const amountRecord of amounts) {
        const monthDate = new Date(year, amountRecord.month - 1, 1);
        
        const isInRange = monthDate >= (contract.startDate < yearStart ? yearStart : contract.startDate) &&
                         (!contract.endDate || monthDate <= (contract.endDate > yearEnd ? yearEnd : contract.endDate));
        
        if (isInRange) {
          const amountInDollars = amountRecord.amount / 100;
          contractAnnualTotal += amountInDollars;
          monthlyTotals[amountRecord.month] += amountInDollars;
          
          if (!monthlyByServiceType[amountRecord.month][contract.serviceType]) {
            monthlyByServiceType[amountRecord.month][contract.serviceType] = 0;
          }
          monthlyByServiceType[amountRecord.month][contract.serviceType] += amountInDollars;
        }
      }
      
      annualProjection += contractAnnualTotal;
      contractBreakdown.push({
        contractId: contract.id,
        serviceType: contract.serviceType,
        status: contract.status,
        startDate: contract.startDate,
        endDate: contract.endDate,
        annualTotal: contractAnnualTotal,
      });
    }
    
    const monthlyBreakdown = [];
    for (let month = 1; month <= 12; month++) {
      const byServiceType = Object.entries(monthlyByServiceType[month]).map(([serviceType, amount]) => ({
        serviceType,
        amount,
      }));
      monthlyBreakdown.push({
        month,
        total: monthlyTotals[month],
        byServiceType,
      });
    }
    
    return {
      annualProjection,
      monthlyBreakdown,
      contractBreakdown,
    };
  }

  async getRevenueOverview(companyId: string, month: number, year: number): Promise<RevenueOverviewData> {
    const allCustomers = await this.getCustomers(companyId);
    
    let selectedMonthTotal = 0;
    let yearToDateTotal = 0;
    const customers: { customerId: string; customerName: string; monthlyRevenue: number; annualProjection: number }[] = [];
    
    for (const customer of allCustomers) {
      const revenueData = await this.getCustomerRevenue(customer.id, companyId, year);
      
      const monthlyRevenue = revenueData.monthlyBreakdown.find(m => m.month === month)?.total || 0;
      selectedMonthTotal += monthlyRevenue;
      
      for (let m = 1; m <= month; m++) {
        const monthRevenue = revenueData.monthlyBreakdown.find(mb => mb.month === m)?.total || 0;
        yearToDateTotal += monthRevenue;
      }
      
      customers.push({
        customerId: customer.id,
        customerName: customer.name,
        monthlyRevenue,
        annualProjection: revenueData.annualProjection,
      });
    }
    
    return {
      selectedMonthTotal,
      yearToDateTotal,
      customers,
    };
  }

  async getContractServices(contractId: string, companyId: string): Promise<ContractService[]> {
    return await db
      .select()
      .from(contractServices)
      .where(and(
        eq(contractServices.contractId, contractId),
        eq(contractServices.companyId, companyId)
      ))
      .orderBy(contractServices.createdAt);
  }

  async createContractService(service: InsertContractService): Promise<ContractService> {
    const annualCount = service.monthlyDistribution.reduce((sum, count) => sum + count, 0);
    const result = await db.insert(contractServices).values([{ ...service, annualCount }]).returning();
    return result[0];
  }

  async updateContractService(id: string, companyId: string, service: Partial<InsertContractService>): Promise<ContractService | undefined> {
    const updateData: Partial<InsertContractService> & { updatedAt: Date } = { 
      ...service, 
      updatedAt: new Date() 
    };
    
    if (service.monthlyDistribution) {
      updateData.annualCount = service.monthlyDistribution.reduce((sum, count) => sum + count, 0);
    }
    
    const result = await db
      .update(contractServices)
      .set(updateData)
      .where(and(
        eq(contractServices.id, id),
        eq(contractServices.companyId, companyId)
      ))
      .returning();
    return result[0];
  }

  async deleteContractService(id: string, companyId: string): Promise<void> {
    await db
      .delete(contractServices)
      .where(and(
        eq(contractServices.id, id),
        eq(contractServices.companyId, companyId)
      ));
  }

  async getDashboardStats(companyId: string, month: number, year: number): Promise<DashboardStats> {
    const allCustomers = await db
      .select()
      .from(customers)
      .where(eq(customers.companyId, companyId));
    
    const allContracts = await db
      .select()
      .from(contracts)
      .where(eq(contracts.companyId, companyId));
    
    const activeContracts = allContracts.filter(c => c.status === "active");
    
    const currentMonthRevenue = await db
      .select({
        total: sql<number>`COALESCE(SUM(${contractMonthlyAmounts.amount}), 0)::numeric`,
      })
      .from(contractMonthlyAmounts)
      .innerJoin(contracts, eq(contractMonthlyAmounts.contractId, contracts.id))
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.status, "active"),
          eq(contractMonthlyAmounts.month, month)
        )
      );
    
    const ytdRevenue = await db
      .select({
        total: sql<number>`COALESCE(SUM(${contractMonthlyAmounts.amount}), 0)::numeric`,
      })
      .from(contractMonthlyAmounts)
      .innerJoin(contracts, eq(contractMonthlyAmounts.contractId, contracts.id))
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.status, "active"),
          sql`${contractMonthlyAmounts.month} <= ${month}`
        )
      );
    
    return {
      customersCount: allCustomers.length,
      activeContractsCount: activeContracts.length,
      monthlyRevenue: Number(currentMonthRevenue[0]?.total || 0) / 100, // Convert cents to dollars
      ytdRevenue: Number(ytdRevenue[0]?.total || 0) / 100, // Convert cents to dollars
    };
  }

  async getCustomerGrowthData(companyId: string): Promise<CustomerGrowthData[]> {
    const result = await db
      .select({
        month: sql<string>`TO_CHAR(${customers.createdAt}, 'YYYY-MM')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          sql`${customers.createdAt} >= NOW() - INTERVAL '12 months'`
        )
      )
      .groupBy(sql`TO_CHAR(${customers.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${customers.createdAt}, 'YYYY-MM')`);
    
    return result.map(r => ({
      month: r.month,
      count: r.count,
    }));
  }

  async getMonthlyRevenueData(companyId: string, year: number): Promise<MonthlyRevenueData[]> {
    const result = await db
      .select({
        month: contractMonthlyAmounts.month,
        revenue: sql<number>`COALESCE(SUM(${contractMonthlyAmounts.amount}), 0)::numeric`,
      })
      .from(contractMonthlyAmounts)
      .innerJoin(contracts, eq(contractMonthlyAmounts.contractId, contracts.id))
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.status, "active")
        )
      )
      .groupBy(contractMonthlyAmounts.month)
      .orderBy(contractMonthlyAmounts.month);
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueByMonth = new Map(result.map(r => [r.month, Number(r.revenue) / 100])); // Convert cents to dollars
    
    return monthNames.map((name, index) => ({
      month: name,
      revenue: revenueByMonth.get(index + 1) || 0,
    }));
  }

  async getTopCustomers(companyId: string, limit: number): Promise<TopCustomer[]> {
    const result = await db
      .select({
        id: customers.id,
        name: customers.name,
        totalRevenue: sql<number>`COALESCE(SUM(${contractMonthlyAmounts.amount}), 0)::numeric`,
        activeContracts: sql<number>`COUNT(DISTINCT CASE WHEN ${contracts.status} = 'active' THEN ${contracts.id} END)::int`,
      })
      .from(customers)
      .leftJoin(contracts, eq(customers.id, contracts.customerId))
      .leftJoin(contractMonthlyAmounts, eq(contracts.id, contractMonthlyAmounts.contractId))
      .where(eq(customers.companyId, companyId))
      .groupBy(customers.id, customers.name)
      .orderBy(desc(sql`COALESCE(SUM(${contractMonthlyAmounts.amount}), 0)`))
      .limit(limit);
    
    return result.map(r => ({
      id: r.id,
      name: r.name,
      totalRevenue: Number(r.totalRevenue) / 100, // Convert cents to dollars
      activeContracts: r.activeContracts,
    }));
  }

  async getUpcomingRenewals(companyId: string, daysAhead: number): Promise<UpcomingRenewal[]> {
    const result = await db
      .select({
        contractId: contracts.id,
        customerId: customers.id,
        customerName: customers.name,
        serviceType: contracts.serviceType,
        endDate: contracts.endDate,
      })
      .from(contracts)
      .innerJoin(customers, eq(contracts.customerId, customers.id))
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.status, "active"),
          sql`${contracts.endDate} IS NOT NULL`,
          sql`${contracts.endDate} <= NOW() + INTERVAL '${sql.raw(daysAhead.toString())} days'`,
          sql`${contracts.endDate} >= NOW()`
        )
      )
      .orderBy(contracts.endDate);
    
    return result.map(r => ({
      contractId: r.contractId,
      customerId: r.customerId,
      customerName: r.customerName,
      serviceType: r.serviceType,
      endDate: r.endDate!,
      daysUntilExpiry: Math.ceil((r.endDate!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }

  async getContractTemplates(): Promise<ContractTemplate[]> {
    return await db.select().from(contractTemplates).orderBy(contractTemplates.displayOrder);
  }

  async getContractBuilderDocuments(companyId: string, customerId?: string): Promise<ContractBuilderDocument[]> {
    const conditions = customerId
      ? and(eq(contractBuilderDocuments.companyId, companyId), eq(contractBuilderDocuments.customerId, customerId))
      : eq(contractBuilderDocuments.companyId, companyId);
    
    return await db.select().from(contractBuilderDocuments)
      .where(conditions)
      .orderBy(desc(contractBuilderDocuments.createdAt));
  }

  async getContractBuilderDocumentById(id: string, companyId: string): Promise<ContractBuilderDocument | undefined> {
    const result = await db.select().from(contractBuilderDocuments)
      .where(and(eq(contractBuilderDocuments.id, id), eq(contractBuilderDocuments.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createContractBuilderDocument(insertDocument: InsertContractBuilderDocument): Promise<ContractBuilderDocument> {
    const result = await db.insert(contractBuilderDocuments).values([insertDocument]).returning();
    return result[0];
  }

  async updateContractBuilderDocument(id: string, companyId: string, updates: Partial<InsertContractBuilderDocument>): Promise<ContractBuilderDocument | undefined> {
    const result = await db.update(contractBuilderDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(contractBuilderDocuments.id, id), eq(contractBuilderDocuments.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteContractBuilderDocument(id: string, companyId: string): Promise<void> {
    await db.delete(contractBuilderDocuments)
      .where(and(eq(contractBuilderDocuments.id, id), eq(contractBuilderDocuments.companyId, companyId)));
  }

  async getContractBuilderSections(documentId: string, companyId: string): Promise<ContractBuilderSection[]> {
    const document = await this.getContractBuilderDocumentById(documentId, companyId);
    if (!document) return [];
    
    return await db.select().from(contractBuilderSections)
      .where(eq(contractBuilderSections.documentId, documentId))
      .orderBy(contractBuilderSections.displayOrder);
  }

  async upsertContractBuilderSections(documentId: string, companyId: string, sections: InsertContractBuilderSection[]): Promise<ContractBuilderSection[]> {
    const document = await this.getContractBuilderDocumentById(documentId, companyId);
    if (!document) throw new Error('Document not found');
    
    const result: ContractBuilderSection[] = [];
    
    for (const section of sections) {
      const upserted = await db.insert(contractBuilderSections)
        .values(section)
        .onConflictDoUpdate({
          target: [contractBuilderSections.documentId, contractBuilderSections.templateId],
          set: {
            customContent: section.customContent,
            isIncluded: section.isIncluded,
            displayOrder: section.displayOrder,
            updatedAt: sql`NOW()`,
          },
        })
        .returning();
      
      result.push(upserted[0]);
    }
    
    return result;
  }

  async getContractBuilderVariables(documentId: string, companyId: string): Promise<ContractBuilderVariable[]> {
    const document = await this.getContractBuilderDocumentById(documentId, companyId);
    if (!document) return [];
    
    return await db.select().from(contractBuilderVariables)
      .where(eq(contractBuilderVariables.documentId, documentId));
  }

  async upsertContractBuilderVariables(documentId: string, companyId: string, variables: { variableKey: string; variableValue: string }[]): Promise<ContractBuilderVariable[]> {
    const document = await this.getContractBuilderDocumentById(documentId, companyId);
    if (!document) throw new Error('Document not found');
    
    const result: ContractBuilderVariable[] = [];
    
    for (const variable of variables) {
      const upserted = await db.insert(contractBuilderVariables)
        .values({
          documentId,
          variableKey: variable.variableKey,
          variableValue: variable.variableValue,
        })
        .onConflictDoUpdate({
          target: [contractBuilderVariables.documentId, contractBuilderVariables.variableKey],
          set: {
            variableValue: variable.variableValue,
            updatedAt: sql`NOW()`,
          },
        })
        .returning();
      
      result.push(upserted[0]);
    }
    
    return result;
  }

  // Ticketing System implementations
  async getTicketTypes(companyId: string): Promise<TicketType[]> {
    return await db.select().from(ticketTypes)
      .where(eq(ticketTypes.companyId, companyId))
      .orderBy(ticketTypes.name);
  }

  async getTicketTypeById(id: string, companyId: string): Promise<TicketType | undefined> {
    const result = await db.select().from(ticketTypes)
      .where(and(eq(ticketTypes.id, id), eq(ticketTypes.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createTicketType(insertTicketType: InsertTicketType): Promise<TicketType> {
    const result = await db.insert(ticketTypes).values([insertTicketType]).returning();
    return result[0];
  }

  async updateTicketType(id: string, companyId: string, updates: Partial<InsertTicketType>): Promise<TicketType | undefined> {
    const result = await db.update(ticketTypes)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(ticketTypes.id, id), eq(ticketTypes.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteTicketType(id: string, companyId: string): Promise<void> {
    await db.delete(ticketTypes)
      .where(and(eq(ticketTypes.id, id), eq(ticketTypes.companyId, companyId)));
  }

  async getTicketTypeStatuses(ticketTypeId: string): Promise<TicketTypeStatus[]> {
    return await db.select().from(ticketTypeStatuses)
      .where(eq(ticketTypeStatuses.ticketTypeId, ticketTypeId))
      .orderBy(ticketTypeStatuses.displayOrder);
  }

  async createTicketTypeStatus(insertStatus: InsertTicketTypeStatus): Promise<TicketTypeStatus> {
    const result = await db.insert(ticketTypeStatuses).values([insertStatus]).returning();
    return result[0];
  }

  async updateTicketTypeStatus(id: string, updates: Partial<InsertTicketTypeStatus>): Promise<TicketTypeStatus | undefined> {
    const result = await db.update(ticketTypeStatuses)
      .set(updates)
      .where(eq(ticketTypeStatuses.id, id))
      .returning();
    return result[0];
  }

  async deleteTicketTypeStatus(id: string): Promise<void> {
    await db.delete(ticketTypeStatuses).where(eq(ticketTypeStatuses.id, id));
  }

  async getTicketTypeFields(ticketTypeId: string): Promise<TicketTypeField[]> {
    return await db.select().from(ticketTypeFields)
      .where(eq(ticketTypeFields.ticketTypeId, ticketTypeId))
      .orderBy(ticketTypeFields.displayOrder);
  }

  async getTicketTypeFieldsByStatus(statusId: string): Promise<TicketTypeField[]> {
    return await db.select().from(ticketTypeFields)
      .where(eq(ticketTypeFields.statusId, statusId))
      .orderBy(ticketTypeFields.displayOrder);
  }

  async createTicketTypeField(insertField: InsertTicketTypeField): Promise<TicketTypeField> {
    const result = await db.insert(ticketTypeFields).values([insertField]).returning();
    return result[0];
  }

  async updateTicketTypeField(id: string, updates: Partial<InsertTicketTypeField>): Promise<TicketTypeField | undefined> {
    const result = await db.update(ticketTypeFields)
      .set(updates)
      .where(eq(ticketTypeFields.id, id))
      .returning();
    return result[0];
  }

  async deleteTicketTypeField(id: string): Promise<void> {
    await db.delete(ticketTypeFields).where(eq(ticketTypeFields.id, id));
  }

  async getTickets(companyId: string, filters?: { customerId?: string; contractId?: string; assignedToId?: string; status?: string; category?: TicketTypeCategory }): Promise<Ticket[]> {
    let conditions = [eq(tickets.companyId, companyId)];
    
    if (filters?.customerId) {
      conditions.push(eq(tickets.customerId, filters.customerId));
    }
    if (filters?.contractId) {
      conditions.push(eq(tickets.contractId, filters.contractId));
    }
    if (filters?.assignedToId) {
      conditions.push(eq(tickets.assignedToId, filters.assignedToId));
    }
    
    return await db.select().from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt));
  }

  async getTicketById(id: string, companyId: string): Promise<Ticket | undefined> {
    const result = await db.select().from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async getTicketsByCustomerId(customerId: string, companyId: string): Promise<Ticket[]> {
    return await db.select().from(tickets)
      .where(and(eq(tickets.customerId, customerId), eq(tickets.companyId, companyId)))
      .orderBy(desc(tickets.createdAt));
  }

  async getTicketsByContractId(contractId: string, companyId: string): Promise<Ticket[]> {
    return await db.select().from(tickets)
      .where(and(eq(tickets.contractId, contractId), eq(tickets.companyId, companyId)))
      .orderBy(desc(tickets.createdAt));
  }

  async createTicket(insertTicket: InsertTicket): Promise<Ticket> {
    const result = await db.insert(tickets).values([insertTicket]).returning();
    return result[0];
  }

  async updateTicket(id: string, companyId: string, updates: Partial<InsertTicket>): Promise<Ticket | undefined> {
    const result = await db.update(tickets)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(tickets.id, id), eq(tickets.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteTicket(id: string, companyId: string): Promise<void> {
    await db.delete(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.companyId, companyId)));
  }

  async getTicketFieldValues(ticketId: string): Promise<TicketFieldValue[]> {
    return await db.select().from(ticketFieldValues)
      .where(eq(ticketFieldValues.ticketId, ticketId));
  }

  async upsertTicketFieldValue(insertFieldValue: InsertTicketFieldValue): Promise<TicketFieldValue> {
    const result = await db.insert(ticketFieldValues)
      .values([insertFieldValue])
      .onConflictDoUpdate({
        target: [ticketFieldValues.ticketId, ticketFieldValues.fieldId],
        set: {
          value: insertFieldValue.value,
          capturedAt: sql`NOW()`,
          capturedById: insertFieldValue.capturedById,
        },
      })
      .returning();
    return result[0];
  }

  async createTicketStatusHistory(insertHistory: InsertTicketStatusHistory): Promise<TicketStatusHistory> {
    const result = await db.insert(ticketStatusHistory).values([insertHistory]).returning();
    return result[0];
  }

  async getTicketStatusHistory(ticketId: string): Promise<TicketStatusHistory[]> {
    return await db.select().from(ticketStatusHistory)
      .where(eq(ticketStatusHistory.ticketId, ticketId))
      .orderBy(desc(ticketStatusHistory.createdAt));
  }

  async getTicketComments(ticketId: string): Promise<TicketComment[]> {
    return await db.select().from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(ticketComments.createdAt);
  }

  async createTicketComment(insertComment: InsertTicketComment): Promise<TicketComment> {
    const result = await db.insert(ticketComments).values([insertComment]).returning();
    return result[0];
  }

  async deleteTicketComment(id: string): Promise<void> {
    await db.delete(ticketComments).where(eq(ticketComments.id, id));
  }

  async createTicketSource(insertSource: InsertTicketSource): Promise<TicketSource> {
    const result = await db.insert(ticketSources).values([insertSource]).returning();
    return result[0];
  }

  async getTicketSource(ticketId: string): Promise<TicketSource | undefined> {
    const result = await db.select().from(ticketSources)
      .where(eq(ticketSources.ticketId, ticketId))
      .limit(1);
    return result[0];
  }

  // Ticket Links
  async getTicketLinks(ticketId: string): Promise<TicketLink[]> {
    const result = await db.select().from(ticketLinks)
      .where(sql`${ticketLinks.sourceTicketId} = ${ticketId} OR ${ticketLinks.targetTicketId} = ${ticketId}`)
      .orderBy(desc(ticketLinks.createdAt));
    return result;
  }

  async createTicketLink(insertLink: InsertTicketLink): Promise<TicketLink> {
    const result = await db.insert(ticketLinks).values([insertLink]).returning();
    return result[0];
  }

  async deleteTicketLink(id: string): Promise<void> {
    await db.delete(ticketLinks).where(eq(ticketLinks.id, id));
  }

  // Customer Map Layers (KML)
  async getCustomerMapLayers(customerId: string, companyId: string): Promise<CustomerMapLayer[]> {
    return await db.select().from(customerMapLayers)
      .where(and(eq(customerMapLayers.customerId, customerId), eq(customerMapLayers.companyId, companyId)))
      .orderBy(customerMapLayers.category, customerMapLayers.displayOrder);
  }

  async getCustomerMapLayerById(id: string, companyId: string): Promise<CustomerMapLayer | undefined> {
    const result = await db.select().from(customerMapLayers)
      .where(and(eq(customerMapLayers.id, id), eq(customerMapLayers.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createCustomerMapLayer(insertLayer: InsertCustomerMapLayer): Promise<CustomerMapLayer> {
    const result = await db.insert(customerMapLayers).values([insertLayer]).returning();
    return result[0];
  }

  async updateCustomerMapLayer(id: string, companyId: string, updates: Partial<InsertCustomerMapLayer>): Promise<CustomerMapLayer | undefined> {
    const result = await db.update(customerMapLayers)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(customerMapLayers.id, id), eq(customerMapLayers.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteCustomerMapLayer(id: string, companyId: string): Promise<void> {
    await db.delete(customerMapLayers)
      .where(and(eq(customerMapLayers.id, id), eq(customerMapLayers.companyId, companyId)));
  }

  // Customer Map Documents (PDF)
  async getCustomerMapDocuments(customerId: string, companyId: string): Promise<CustomerMapDocument[]> {
    return await db.select().from(customerMapDocuments)
      .where(and(eq(customerMapDocuments.customerId, customerId), eq(customerMapDocuments.companyId, companyId)))
      .orderBy(desc(customerMapDocuments.createdAt));
  }

  async getCustomerMapDocumentById(id: string, companyId: string): Promise<CustomerMapDocument | undefined> {
    const result = await db.select().from(customerMapDocuments)
      .where(and(eq(customerMapDocuments.id, id), eq(customerMapDocuments.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createCustomerMapDocument(insertDocument: InsertCustomerMapDocument): Promise<CustomerMapDocument> {
    const result = await db.insert(customerMapDocuments).values([insertDocument]).returning();
    return result[0];
  }

  async deleteCustomerMapDocument(id: string, companyId: string): Promise<void> {
    await db.delete(customerMapDocuments)
      .where(and(eq(customerMapDocuments.id, id), eq(customerMapDocuments.companyId, companyId)));
  }

  // Maintenance Scheduling
  async getMaintenanceCrews(companyId: string): Promise<MaintenanceCrew[]> {
    return await db.select().from(maintenanceCrews)
      .where(eq(maintenanceCrews.companyId, companyId))
      .orderBy(maintenanceCrews.name);
  }

  async getMaintenanceCrewById(id: string, companyId: string): Promise<MaintenanceCrew | undefined> {
    const result = await db.select().from(maintenanceCrews)
      .where(and(eq(maintenanceCrews.id, id), eq(maintenanceCrews.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createMaintenanceCrew(insertCrew: InsertMaintenanceCrew): Promise<MaintenanceCrew> {
    const result = await db.insert(maintenanceCrews).values([insertCrew]).returning();
    return result[0];
  }

  async updateMaintenanceCrew(id: string, companyId: string, updates: Partial<InsertMaintenanceCrew>): Promise<MaintenanceCrew | undefined> {
    const result = await db.update(maintenanceCrews)
      .set(updates)
      .where(and(eq(maintenanceCrews.id, id), eq(maintenanceCrews.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteMaintenanceCrew(id: string, companyId: string): Promise<void> {
    await db.delete(maintenanceCrews)
      .where(and(eq(maintenanceCrews.id, id), eq(maintenanceCrews.companyId, companyId)));
  }

  async getMaintenanceVisitConfig(customerId: string, companyId: string): Promise<MaintenanceVisitConfig | undefined> {
    const result = await db.select().from(maintenanceVisitConfigs)
      .where(and(eq(maintenanceVisitConfigs.customerId, customerId), eq(maintenanceVisitConfigs.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createMaintenanceVisitConfig(insertConfig: InsertMaintenanceVisitConfig): Promise<MaintenanceVisitConfig> {
    const result = await db.insert(maintenanceVisitConfigs).values([insertConfig]).returning();
    return result[0];
  }

  async updateMaintenanceVisitConfig(id: string, companyId: string, updates: Partial<InsertMaintenanceVisitConfig>): Promise<MaintenanceVisitConfig | undefined> {
    const result = await db.update(maintenanceVisitConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(maintenanceVisitConfigs.id, id), eq(maintenanceVisitConfigs.companyId, companyId)))
      .returning();
    return result[0];
  }

  async getMaintenanceVisitConfigs(companyId: string): Promise<MaintenanceVisitConfig[]> {
    return await db.select().from(maintenanceVisitConfigs)
      .where(eq(maintenanceVisitConfigs.companyId, companyId));
  }

  async getWeeklyScheduleTemplates(companyId: string): Promise<WeeklyScheduleTemplate[]> {
    return await db.select().from(weeklyScheduleTemplates)
      .where(eq(weeklyScheduleTemplates.companyId, companyId))
      .orderBy(desc(weeklyScheduleTemplates.createdAt));
  }

  async getWeeklyScheduleTemplateById(id: string, companyId: string): Promise<WeeklyScheduleTemplate | undefined> {
    const result = await db.select().from(weeklyScheduleTemplates)
      .where(and(eq(weeklyScheduleTemplates.id, id), eq(weeklyScheduleTemplates.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createWeeklyScheduleTemplate(insertTemplate: InsertWeeklyScheduleTemplate): Promise<WeeklyScheduleTemplate> {
    const result = await db.insert(weeklyScheduleTemplates).values([insertTemplate]).returning();
    return result[0];
  }

  async updateWeeklyScheduleTemplate(id: string, companyId: string, updates: Partial<InsertWeeklyScheduleTemplate>): Promise<WeeklyScheduleTemplate | undefined> {
    const result = await db.update(weeklyScheduleTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(weeklyScheduleTemplates.id, id), eq(weeklyScheduleTemplates.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteWeeklyScheduleTemplate(id: string, companyId: string): Promise<void> {
    await db.delete(weeklyScheduleTemplates)
      .where(and(eq(weeklyScheduleTemplates.id, id), eq(weeklyScheduleTemplates.companyId, companyId)));
  }

  async getScheduleBlocks(templateId: string): Promise<ScheduleBlock[]> {
    return await db.select().from(scheduleBlocks)
      .where(eq(scheduleBlocks.templateId, templateId))
      .orderBy(scheduleBlocks.dayOfWeek, scheduleBlocks.sortOrder);
  }

  async createScheduleBlock(insertBlock: InsertScheduleBlock): Promise<ScheduleBlock> {
    const result = await db.insert(scheduleBlocks).values([insertBlock]).returning();
    return result[0];
  }

  async updateScheduleBlock(id: string, updates: Partial<InsertScheduleBlock>): Promise<ScheduleBlock | undefined> {
    const result = await db.update(scheduleBlocks)
      .set(updates)
      .where(eq(scheduleBlocks.id, id))
      .returning();
    return result[0];
  }

  async deleteScheduleBlock(id: string): Promise<void> {
    await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id));
  }

  async deleteScheduleBlocksByTemplate(templateId: string): Promise<void> {
    await db.delete(scheduleBlocks).where(eq(scheduleBlocks.templateId, templateId));
  }
}

export const storage = new PgStorage();
