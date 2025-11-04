import { type User, type InsertUser, type Customer, type InsertCustomer, type Contact, type InsertContact, type Company, type InsertCompany, type CompanyUser, type InsertCompanyUser, type Settings, type InsertSettings, type Note, type InsertNote, type Contract, type InsertContract, type ContractStatusHistory, type InsertContractStatusHistory, type ContractDocument, type InsertContractDocument, type ContractMonthlyAmount, type InsertContractMonthlyAmount, type CustomerRateSheet, type InsertCustomerRateSheet, type ContractService, type InsertContractService } from "@shared/schema";
import { db } from "./db";
import { users, customers, contacts, companies, companyUsers, settings, notes, contracts, contractStatusHistory, contractDocuments, contractMonthlyAmounts, customerRateSheets, contractServices } from "@shared/schema";
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
  
  sessionStore: session.Store;
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
}

export const storage = new PgStorage();
