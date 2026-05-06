import { type User, type InsertUser, type Customer, type InsertCustomer, type Contact, type InsertContact, type Company, type InsertCompany, type CompanyUser, type InsertCompanyUser, type Settings, type InsertSettings, type Note, type InsertNote, type Contract, type InsertContract, type ContractStatusHistory, type InsertContractStatusHistory, type ContractDocument, type InsertContractDocument, type ContractMonthlyAmount, type InsertContractMonthlyAmount, type CustomerRateSheet, type InsertCustomerRateSheet, type ContractService, type InsertContractService, type ContractTemplate, type InsertContractTemplate, type ContractBuilderDocument, type InsertContractBuilderDocument, type ContractBuilderSection, type InsertContractBuilderSection, type ContractBuilderVariable, type InsertContractBuilderVariable, type TicketType, type InsertTicketType, type TicketTypeStatus, type InsertTicketTypeStatus, type TicketTypeField, type InsertTicketTypeField, type Ticket, type InsertTicket, type TicketFieldValue, type InsertTicketFieldValue, type TicketStatusHistory, type InsertTicketStatusHistory, type TicketComment, type TicketCommentWithAuthor, type InsertTicketComment, type TicketCommentMention, type InsertTicketCommentMention, type TicketSource, type InsertTicketSource, type TicketLink, type InsertTicketLink, type TicketTypeCategory, type CustomerMapLayer, type InsertCustomerMapLayer, type CustomerMapDocument, type InsertCustomerMapDocument, type MaintenanceCrew, type InsertMaintenanceCrew, type MaintenanceVisitConfig, type InsertMaintenanceVisitConfig, type WeeklyScheduleTemplate, type InsertWeeklyScheduleTemplate, type ScheduleBlock, type InsertScheduleBlock, type TicketNotification, type InsertTicketNotification, type NotificationType, type PropertyManagementCompany, type InsertPropertyManagementCompany, type PropertyManager, type InsertPropertyManager, type PropertyManagerEmail, type InsertPropertyManagerEmail, type PropertyManagerPhone, type InsertPropertyManagerPhone, type PropertyManagerWithContacts, type Equipment, type InsertEquipment, type EquipmentFile, type InsertEquipmentFile, type EquipmentTicket, type InsertEquipmentTicket, type EquipmentTicketStatusHistory, type InsertEquipmentTicketStatusHistory, type EquipmentWithTicketCount, type SnowEvent, type InsertSnowEvent, type SnowEventAttachment, type InsertSnowEventAttachment, type SnowEventPropertyImpact, type InsertSnowEventPropertyImpact, type SnowEventWithDetails, type SnowEventPropertyImpactWithCustomer, type EmailTemplate, type InsertEmailTemplate, type EmailRule, type InsertEmailRule, type EmailLog, type InsertEmailLog, type EmailLogWithDetails, type Proposal, type InsertProposal, type ProposalFile, type InsertProposalFile, type ProposalWithDetails, type ProposalVersion, type InsertProposalVersion, type ProposalVersionWithUser, type VisualScopeSheet, type InsertVisualScopeSheet, type VisualScopeSheetWithCustomer, type Campaign, type InsertCampaign, type CampaignItem, type InsertCampaignItem, type CampaignWithProgress, type Season, type InsertSeason, type CampaignChecklistTask, type InsertCampaignChecklistTask, type CampaignItemTaskCompletion, type InsertCampaignItemTaskCompletion, type CampaignChecklistAuditLog, type InsertCampaignChecklistAuditLog, type CampaignChecklistAuditLogWithUser, type Communication, type InsertCommunication, type CommunicationTemplate, type InsertCommunicationTemplate, type CommunicationThread, type InsertCommunicationThread, type CommunicationLink, type InsertCommunicationLink, type CommunicationWithDetails, type CommunicationAnalytics, type InsertCommunicationAuditLog, type CommunicationAuditLog, type CommunicationAuditLogWithUser, type ChemicalProduct, type InsertChemicalProduct, type ChemicalNotificationTemplate, type InsertChemicalNotificationTemplate } from "@shared/schema";
import { db } from "./db";
import { users, customers, contacts, companies, companyUsers, settings, notes, contracts, contractStatusHistory, contractDocuments, contractMonthlyAmounts, customerRateSheets, contractServices, contractTemplates, contractBuilderDocuments, contractBuilderSections, contractBuilderVariables, ticketTypes, ticketTypeStatuses, ticketTypeFields, tickets, ticketFieldValues, ticketStatusHistory, ticketComments, ticketCommentMentions, ticketSources, ticketLinks, customerMapLayers, customerMapDocuments, maintenanceCrews, maintenanceVisitConfigs, weeklyScheduleTemplates, scheduleBlocks, ticketNotifications, propertyManagementCompanies, propertyManagers, propertyManagerEmails, propertyManagerPhones, equipment, equipmentFiles, equipmentTickets, equipmentTicketStatusHistory, snowEvents, snowEventAttachments, snowEventPropertyImpacts, emailTemplates, emailRules, emailLogs, proposals, proposalFiles, proposalVersions, visualScopeSheets, campaigns, campaignItems, campaignChecklistTasks, campaignItemTaskCompletions, campaignChecklistAuditLog as campaignChecklistAuditLogTable, seasons, communications, communicationTemplates, communicationThreads, communicationLinks, communicationAuditLog, communicationAutomationRules, servicePlanTemplates, servicePlanTemplateItems, customerServicePlans, stylePresets, sheetTemplates, chemicalProducts, chemicalNotificationTemplates } from "@shared/schema";
import type { StylePreset, InsertStylePreset, SheetTemplate, InsertSheetTemplate, StylePresetType, StylePresetConfig } from "@shared/schema";
import type { VisibleMailboxes } from "./services/mailboxScope";
import type { CommunicationAutomationRule, InsertCommunicationAutomationRule, ServicePlanTemplateWithItems, ServicePlanTemplate, InsertServicePlanTemplate, ServicePlanTemplateItem, ServicePlanCategory, CustomerServicePlan, InsertCustomerServicePlan, ServiceFulfillmentRow } from "@shared/schema";
import { eq, and, or, sql, desc, asc, inArray, max, type SQL, getTableColumns } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  updateUserLanguage(userId: string, language: "en" | "es"): Promise<void>;
  hasAnyUsers(): Promise<boolean>;
  deleteAllUsers(): Promise<void>;
  
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
  getCustomersPaginated(companyId: string, opts: { page: number; limit: number; search?: string }): Promise<{ customers: Customer[]; total: number }>;
  getCustomerSearch(companyId: string, query: string): Promise<Customer[]>;
  getCustomerSearchWithChildren(companyId: string, query: string): Promise<Customer[]>;
  getCustomerById(id: string, companyId: string): Promise<Customer | undefined>;
  getCustomersByIds(ids: string[], companyId: string): Promise<Map<string, Customer>>;
  getChildCustomers(parentId: string, companyId: string): Promise<Customer[]>;
  getParentCustomers(companyId: string): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, companyId: string, customer: Partial<InsertCustomer>, expectedUpdatedAt?: Date): Promise<Customer | undefined | { conflict: true; current: Customer }>;
  deleteCustomer(id: string, companyId: string): Promise<void>;
  
  getContactsByCustomerId(customerId: string, companyId: string): Promise<Contact[]>;
  getContactById(id: string, companyId: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, companyId: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string, companyId: string): Promise<void>;
  
  getNotesByCustomerId(customerId: string, companyId: string): Promise<Note[]>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: string, companyId: string, body: string): Promise<Note | undefined>;
  deleteNote(id: string, companyId: string): Promise<void>;
  
  getContractsByCustomerId(customerId: string, companyId: string): Promise<Contract[]>;
  getAllContracts(companyId: string): Promise<(Contract & { customerName: string })[]>;
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
  getRevenueExceptions(companyId: string, year: number): Promise<RevenueException[]>;
  
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
  getTicketTypesByIds(ids: string[], companyId: string): Promise<TicketType[]>;
  createTicketType(ticketType: InsertTicketType): Promise<TicketType>;
  updateTicketType(id: string, companyId: string, updates: Partial<InsertTicketType>): Promise<TicketType | undefined>;
  deleteTicketType(id: string, companyId: string): Promise<void>;
  
  getTicketTypeStatuses(ticketTypeId: string): Promise<TicketTypeStatus[]>;
  getTicketTypeStatusesByTypeIds(typeIds: string[]): Promise<TicketTypeStatus[]>;
  getAllTicketTypeStatuses(companyId: string): Promise<TicketTypeStatus[]>;
  createTicketTypeStatus(status: InsertTicketTypeStatus): Promise<TicketTypeStatus>;
  updateTicketTypeStatus(id: string, updates: Partial<InsertTicketTypeStatus>): Promise<TicketTypeStatus | undefined>;
  deleteTicketTypeStatus(id: string): Promise<void>;
  
  getTicketTypeFields(ticketTypeId: string): Promise<TicketTypeField[]>;
  getTicketTypeFieldsByStatus(statusId: string): Promise<TicketTypeField[]>;
  getTicketTypeFieldsByStatuses(statusIds: string[]): Promise<TicketTypeField[]>;
  getTicketTypeFieldById(fieldId: string): Promise<TicketTypeField | undefined>;
  createTicketTypeField(field: InsertTicketTypeField): Promise<TicketTypeField>;
  updateTicketTypeField(id: string, updates: Partial<InsertTicketTypeField>): Promise<TicketTypeField | undefined>;
  deleteTicketTypeField(id: string): Promise<void>;
  
  getTickets(companyId: string, filters?: { customerId?: string; contractId?: string; assignedToId?: string; status?: string; category?: TicketTypeCategory }): Promise<Ticket[]>;
  getTicketById(id: string, companyId: string): Promise<Ticket | undefined>;
  getTicketsByIds(ids: string[], companyId: string): Promise<Ticket[]>;
  getTicketsByCustomerId(customerId: string, companyId: string): Promise<Ticket[]>;
  getTicketsByContractId(contractId: string, companyId: string): Promise<Ticket[]>;
  getTicketsByEquipmentId(equipmentId: string, companyId: string): Promise<Ticket[]>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: string, companyId: string, updates: Partial<InsertTicket>): Promise<Ticket | undefined>;
  deleteTicket(id: string, companyId: string): Promise<void>;
  
  getTicketFieldValues(ticketId: string): Promise<TicketFieldValue[]>;
  upsertTicketFieldValue(fieldValue: InsertTicketFieldValue): Promise<TicketFieldValue>;
  deleteTicketFieldValuesByFieldIds(ticketId: string, fieldIds: string[]): Promise<void>;
  
  createTicketStatusHistory(history: InsertTicketStatusHistory): Promise<TicketStatusHistory>;
  getTicketStatusHistory(ticketId: string): Promise<TicketStatusHistory[]>;
  getTicketStatusHistoryForTickets(ticketIds: string[]): Promise<TicketStatusHistory[]>;
  
  getTicketComments(ticketId: string): Promise<TicketCommentWithAuthor[]>;
  createTicketComment(comment: InsertTicketComment): Promise<TicketComment>;
  deleteTicketComment(id: string): Promise<void>;
  createTicketCommentMention(mention: InsertTicketCommentMention): Promise<TicketCommentMention>;
  getTicketCommentMentions(commentId: string): Promise<TicketCommentMention[]>;
  
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
  duplicateWeeklyScheduleTemplate(id: string, companyId: string, newName: string): Promise<WeeklyScheduleTemplate>;
  
  getScheduleBlocks(templateId: string): Promise<ScheduleBlock[]>;
  createScheduleBlock(block: InsertScheduleBlock): Promise<ScheduleBlock>;
  updateScheduleBlock(id: string, updates: Partial<InsertScheduleBlock>): Promise<ScheduleBlock | undefined>;
  deleteScheduleBlock(id: string): Promise<void>;
  deleteScheduleBlocksByTemplate(templateId: string): Promise<void>;
  
  // Ticket Notifications
  getNotificationsByUser(userId: string, companyId: string): Promise<TicketNotification[]>;
  getUnreadNotificationCount(userId: string, companyId: string): Promise<number>;
  createNotification(notification: InsertTicketNotification): Promise<TicketNotification>;
  markNotificationRead(id: string, userId: string): Promise<TicketNotification | undefined>;
  markAllNotificationsRead(userId: string, companyId: string): Promise<void>;
  getNotificationsWithDueDateType(ticketId: string, type: NotificationType): Promise<TicketNotification[]>;
  dismissDueDateNotificationsForTicket(ticketId: string): Promise<void>;
  
  // Property Management Companies
  getPropertyManagementCompanies(companyId: string): Promise<PropertyManagementCompany[]>;
  getPropertyManagementCompanyById(id: string, companyId: string): Promise<PropertyManagementCompany | undefined>;
  createPropertyManagementCompany(company: InsertPropertyManagementCompany): Promise<PropertyManagementCompany>;
  updatePropertyManagementCompany(id: string, companyId: string, updates: Partial<InsertPropertyManagementCompany>): Promise<PropertyManagementCompany | undefined>;
  deletePropertyManagementCompany(id: string, companyId: string): Promise<void>;
  
  // Property Managers
  getPropertyManagers(companyId: string): Promise<PropertyManager[]>;
  getPropertyManagersByCompany(propertyManagementCompanyId: string, companyId: string): Promise<PropertyManager[]>;
  getPropertyManagerById(id: string, companyId: string): Promise<PropertyManager | undefined>;
  getPropertyManagerWithContacts(id: string, companyId: string): Promise<PropertyManagerWithContacts | undefined>;
  createPropertyManager(manager: InsertPropertyManager): Promise<PropertyManager>;
  updatePropertyManager(id: string, companyId: string, updates: Partial<InsertPropertyManager>): Promise<PropertyManager | undefined>;
  deletePropertyManager(id: string, companyId: string): Promise<void>;
  
  // Property Manager Emails
  getPropertyManagerEmails(propertyManagerId: string, companyId: string): Promise<PropertyManagerEmail[]>;
  createPropertyManagerEmail(email: InsertPropertyManagerEmail): Promise<PropertyManagerEmail>;
  updatePropertyManagerEmail(id: string, companyId: string, updates: Partial<InsertPropertyManagerEmail>): Promise<PropertyManagerEmail | undefined>;
  deletePropertyManagerEmail(id: string, companyId: string): Promise<void>;
  deletePropertyManagerEmailsByManager(propertyManagerId: string, companyId: string): Promise<void>;
  
  // Property Manager Phones
  getPropertyManagerPhones(propertyManagerId: string, companyId: string): Promise<PropertyManagerPhone[]>;
  createPropertyManagerPhone(phone: InsertPropertyManagerPhone): Promise<PropertyManagerPhone>;
  updatePropertyManagerPhone(id: string, companyId: string, updates: Partial<InsertPropertyManagerPhone>): Promise<PropertyManagerPhone | undefined>;
  deletePropertyManagerPhone(id: string, companyId: string): Promise<void>;
  deletePropertyManagerPhonesByManager(propertyManagerId: string, companyId: string): Promise<void>;
  
  // Equipment
  getEquipment(companyId: string): Promise<Equipment[]>;
  getEquipmentById(id: string, companyId: string): Promise<Equipment | undefined>;
  getEquipmentWithTicketCounts(companyId: string): Promise<EquipmentWithTicketCount[]>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: string, companyId: string, updates: Partial<InsertEquipment>): Promise<Equipment | undefined>;
  deleteEquipment(id: string, companyId: string): Promise<void>;
  
  // Equipment Files
  getEquipmentFiles(equipmentId: string, companyId: string): Promise<EquipmentFile[]>;
  getEquipmentFileById(id: string, companyId: string): Promise<EquipmentFile | undefined>;
  createEquipmentFile(file: InsertEquipmentFile): Promise<EquipmentFile>;
  deleteEquipmentFile(id: string, companyId: string): Promise<void>;
  
  // Equipment Tickets
  getEquipmentTickets(companyId: string, filters?: { equipmentId?: string; status?: string; assignedToId?: string; operatorUserId?: string }): Promise<EquipmentTicket[]>;
  getEquipmentTicketsWithEquipmentName(companyId: string, filters?: { equipmentId?: string; status?: string; assignedToId?: string; operatorUserId?: string }): Promise<(EquipmentTicket & { equipmentName: string; _type: "equipment" })[]>;
  getEquipmentTicketById(id: string, companyId: string): Promise<EquipmentTicket | undefined>;
  getEquipmentTicketsByEquipmentId(equipmentId: string, companyId: string): Promise<EquipmentTicket[]>;
  createEquipmentTicket(ticket: InsertEquipmentTicket): Promise<EquipmentTicket>;
  updateEquipmentTicket(id: string, companyId: string, updates: Partial<InsertEquipmentTicket>): Promise<EquipmentTicket | undefined>;
  deleteEquipmentTicket(id: string, companyId: string): Promise<void>;
  
  // Equipment Ticket Status History
  createEquipmentTicketStatusHistory(history: InsertEquipmentTicketStatusHistory): Promise<EquipmentTicketStatusHistory>;
  getEquipmentTicketStatusHistory(ticketId: string): Promise<EquipmentTicketStatusHistory[]>;
  
  // Snow Events
  getSnowEvents(companyId: string): Promise<SnowEventWithDetails[]>;
  getSnowEventById(id: string, companyId: string): Promise<SnowEvent | undefined>;
  createSnowEvent(event: InsertSnowEvent): Promise<SnowEvent>;
  updateSnowEvent(id: string, companyId: string, updates: Partial<InsertSnowEvent>): Promise<SnowEvent | undefined>;
  deleteSnowEvent(id: string, companyId: string): Promise<void>;
  
  // Snow Event Attachments
  getSnowEventAttachments(snowEventId: string, companyId: string): Promise<SnowEventAttachment[]>;
  createSnowEventAttachment(attachment: InsertSnowEventAttachment): Promise<SnowEventAttachment>;
  deleteSnowEventAttachment(id: string, companyId: string): Promise<void>;
  
  // Snow Event Property Impacts
  getSnowEventPropertyImpacts(snowEventId: string, companyId: string): Promise<SnowEventPropertyImpactWithCustomer[]>;
  getSnowEventPropertyImpactsByCustomer(customerId: string, companyId: string): Promise<(SnowEventPropertyImpact & { snowEvent: SnowEvent })[]>;
  createSnowEventPropertyImpact(impact: InsertSnowEventPropertyImpact): Promise<SnowEventPropertyImpact>;
  updateSnowEventPropertyImpact(id: string, companyId: string, updates: Partial<InsertSnowEventPropertyImpact>): Promise<SnowEventPropertyImpact | undefined>;
  deleteSnowEventPropertyImpact(id: string, companyId: string): Promise<void>;
  deleteSnowEventPropertyImpactsByEvent(snowEventId: string, companyId: string): Promise<void>;

  // Email Templates
  getEmailTemplates(companyId: string): Promise<EmailTemplate[]>;
  getEmailTemplateById(id: string, companyId: string): Promise<EmailTemplate | undefined>;
  getEmailTemplateByName(name: string, companyId: string): Promise<EmailTemplate | undefined>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, companyId: string, updates: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined>;
  
  // Email Rules
  getEmailRules(companyId: string): Promise<EmailRule[]>;
  getEmailRulesByEvent(eventKey: string, companyId: string): Promise<EmailRule[]>;
  createEmailRule(rule: InsertEmailRule): Promise<EmailRule>;
  updateEmailRule(id: string, companyId: string, updates: Partial<InsertEmailRule>): Promise<EmailRule | undefined>;
  
  // Email Logs
  getEmailLogs(companyId: string, filters?: { ticketId?: string; customerId?: string; status?: string }): Promise<EmailLogWithDetails[]>;
  getEmailLogById(id: string, companyId: string): Promise<EmailLog | undefined>;
  createEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  updateEmailLog(id: string, updates: Partial<InsertEmailLog>): Promise<EmailLog | undefined>;

  // Proposals
  getProposals(companyId: string): Promise<ProposalWithDetails[]>;
  getProposalsByCustomer(customerId: string, companyId: string): Promise<ProposalWithDetails[]>;
  getProposalsForTicket(ticketId: string, companyId: string): Promise<ProposalWithDetails[]>;
  getProposalById(id: string, companyId: string): Promise<ProposalWithDetails | undefined>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, companyId: string, updates: Partial<InsertProposal>): Promise<Proposal | undefined>;
  deleteProposal(id: string, companyId: string): Promise<void>;
  getProposalFiles(proposalId: string, companyId: string): Promise<ProposalFile[]>;
  getProposalFileById(id: string, companyId: string): Promise<ProposalFile | undefined>;
  getProposalEstimatePdf(proposalId: string, companyId: string): Promise<ProposalFile | undefined>;
  createProposalFile(file: InsertProposalFile): Promise<ProposalFile>;
  updateProposalFile(id: string, companyId: string, updates: { caption?: string | null }): Promise<ProposalFile | undefined>;
  deleteProposalFile(id: string, companyId: string): Promise<void>;
  createProposalVersion(v: InsertProposalVersion): Promise<ProposalVersion>;
  getProposalVersions(proposalId: string, companyId: string): Promise<ProposalVersionWithUser[]>;
  getProposalVersionById(id: string, companyId: string): Promise<ProposalVersionWithUser | undefined>;
  getNextVersionNumber(proposalId: string, companyId: string): Promise<number>;

  // Visual Scope Sheets
  getVisualScopeSheets(companyId: string): Promise<VisualScopeSheetWithCustomer[]>;
  getVisualScopeSheetsForCustomer(customerId: string, companyId: string): Promise<VisualScopeSheetWithCustomer[]>;
  getVisualScopeSheet(id: string, companyId: string): Promise<VisualScopeSheetWithCustomer | undefined>;
  createVisualScopeSheet(data: InsertVisualScopeSheet): Promise<VisualScopeSheet>;
  updateVisualScopeSheet(id: string, companyId: string, data: Partial<InsertVisualScopeSheet>): Promise<VisualScopeSheet>;
  deleteVisualScopeSheet(id: string, companyId: string): Promise<void>;

  getCampaigns(companyId: string, assignedToId?: string): Promise<CampaignWithProgress[]>;
  getCampaignById(id: string, companyId: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, companyId: string, updates: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string, companyId: string): Promise<void>;
  getCampaignItems(campaignId: string, companyId: string): Promise<CampaignItem[]>;
  getCampaignItemById(itemId: string, companyId: string): Promise<CampaignItem | undefined>;
  getCampaignItemsByCustomer(customerId: string, companyId: string): Promise<(CampaignItem & { campaignTitle: string; campaignCategory: string; campaignSubtype: string | null; campaignStatus: string; campaignWindowStart: string; campaignWindowEnd: string; seasonId: string | null })[]>;
  getCampaignItemsByProperty(propertyId: string, companyId: string): Promise<(CampaignItem & { campaignTitle: string; campaignCategory: string; campaignSubtype: string | null; campaignStatus: string; campaignWindowStart: string; campaignWindowEnd: string; seasonId: string | null })[]>;
  getCampaignItemsByCustomerId(customerId: string, companyId: string): Promise<(CampaignItem & { campaign: Campaign })[]>;
  getCampaignItemsGlobal(companyId: string): Promise<(CampaignItem & { campaignTitle: string; campaignWindowStart: string; campaignWindowEnd: string; campaignCategory: string })[]>;
  createCampaignItem(item: InsertCampaignItem): Promise<CampaignItem>;
  updateCampaignItem(id: string, companyId: string, updates: Partial<InsertCampaignItem & { updatedAt: Date }>): Promise<CampaignItem | undefined>;
  deleteCampaignItem(id: string, companyId: string): Promise<void>;
  createCampaignWithItems(campaign: InsertCampaign, items: InsertCampaignItem[]): Promise<Campaign>;
  getCampaignChecklistTasks(campaignId: string): Promise<CampaignChecklistTask[]>;
  createCampaignChecklistTask(task: InsertCampaignChecklistTask): Promise<CampaignChecklistTask>;
  getCampaignItemTaskCompletions(campaignItemId: string): Promise<CampaignItemTaskCompletion[]>;
  createCampaignItemTaskCompletion(completion: InsertCampaignItemTaskCompletion): Promise<CampaignItemTaskCompletion>;
  deleteCampaignItemTaskCompletion(campaignItemId: string, campaignChecklistTaskId: string): Promise<void>;
  createCampaignChecklistAuditLog(entry: InsertCampaignChecklistAuditLog): Promise<CampaignChecklistAuditLog>;
  getCampaignChecklistAuditLog(campaignItemId: string): Promise<CampaignChecklistAuditLogWithUser[]>;
  toggleCampaignChecklistTaskTx(params: {
    campaignItemId: string;
    taskId: string;
    userId: string;
    currentlyCompleted: boolean;
  }): Promise<{ action: "completed" | "uncompleted" }>;

  getSeasons(companyId: string): Promise<Season[]>;
  getSeasonById(id: string, companyId: string): Promise<Season | undefined>;
  createSeason(season: InsertSeason): Promise<Season>;
  updateSeason(id: string, companyId: string, updates: Partial<InsertSeason>): Promise<Season | undefined>;
  deleteSeason(id: string, companyId: string): Promise<void>;

  // Communications
  getCommunications(companyId: string, filters?: { view?: string; customerId?: string; type?: string; sentById?: string; search?: string; startDate?: Date; endDate?: Date; status?: string; fromDate?: string; toDate?: string; threadId?: string }, scope?: VisibleMailboxes): Promise<CommunicationWithDetails[]>;
  getCommunicationById(id: string, companyId: string): Promise<CommunicationWithDetails | undefined>;
  getCommunicationByProviderMessageId(companyId: string, providerMessageId: string): Promise<Communication | null>;
  createCommunication(communication: InsertCommunication): Promise<Communication>;
  updateCommunication(id: string, companyId: string, updates: Partial<InsertCommunication>): Promise<Communication | undefined>;
  deleteCommunication(id: string, companyId: string): Promise<void>;
  getCommunicationStats(companyId: string): Promise<{ drafts: number; scheduledToday: number; openFollowUps: number; overdueFollowUps: number }>;
  getCommunicationTemplates(companyId: string, includeArchived?: boolean): Promise<CommunicationTemplate[]>;
  getCommunicationTemplateById(id: string, companyId: string): Promise<CommunicationTemplate | undefined>;
  createCommunicationTemplate(template: InsertCommunicationTemplate): Promise<CommunicationTemplate>;
  updateCommunicationTemplate(id: string, companyId: string, updates: Partial<InsertCommunicationTemplate>): Promise<CommunicationTemplate | undefined>;
  getCommunicationThreads(companyId: string, filters?: { customerId?: string }): Promise<CommunicationThread[]>;
  getCommunicationThreadById(id: string, companyId: string): Promise<CommunicationThread | undefined>;
  createCommunicationThread(thread: InsertCommunicationThread): Promise<CommunicationThread>;
  getThreadMessages(threadId: string, companyId: string): Promise<CommunicationWithDetails[]>;
  getCommunicationLinks(communicationId: string, companyId: string): Promise<CommunicationLink[]>;
  createCommunicationLink(link: InsertCommunicationLink): Promise<CommunicationLink>;
  getCommunicationAnalytics(companyId: string, startDate: Date, endDate: Date): Promise<CommunicationAnalytics>;
  seedCommunications(companyId: string, userId: string, customerIds: string[]): Promise<void>;

  // Communication Audit Log
  createCommunicationAuditLog(entry: InsertCommunicationAuditLog): Promise<CommunicationAuditLog>;
  getCommunicationAuditLogs(companyId: string, limit?: number): Promise<CommunicationAuditLogWithUser[]>;

  // Communication Automation Rules
  getCommunicationAutomationRules(companyId: string): Promise<CommunicationAutomationRule[]>;
  getCommunicationAutomationRuleById(id: string, companyId: string): Promise<CommunicationAutomationRule | undefined>;
  createCommunicationAutomationRule(rule: InsertCommunicationAutomationRule): Promise<CommunicationAutomationRule>;
  updateCommunicationAutomationRule(id: string, companyId: string, updates: Partial<InsertCommunicationAutomationRule>): Promise<CommunicationAutomationRule | undefined>;
  deleteCommunicationAutomationRule(id: string, companyId: string): Promise<void>;
  updateCommunicationAutomationRuleLastRun(id: string, companyId: string): Promise<void>;

  // Service Plan Templates
  getServicePlanTemplates(companyId: string): Promise<ServicePlanTemplateWithItems[]>;
  getServicePlanTemplateById(id: string, companyId: string): Promise<ServicePlanTemplateWithItems | undefined>;
  createServicePlanTemplate(template: InsertServicePlanTemplate): Promise<ServicePlanTemplate>;
  updateServicePlanTemplate(id: string, companyId: string, updates: Partial<InsertServicePlanTemplate>): Promise<ServicePlanTemplate | undefined>;
  deleteServicePlanTemplate(id: string, companyId: string): Promise<void>;
  upsertServicePlanTemplateItems(templateId: string, items: Array<{ serviceCategory: ServicePlanCategory; defaultAnnualQuantity: number }>): Promise<ServicePlanTemplateItem[]>;

  // Customer Service Plans
  getCustomerServicePlans(customerId: string, companyId: string, year?: number): Promise<CustomerServicePlan[]>;
  createCustomerServicePlan(plan: InsertCustomerServicePlan): Promise<CustomerServicePlan>;
  updateCustomerServicePlan(id: string, customerId: string, companyId: string, updates: Partial<InsertCustomerServicePlan>): Promise<CustomerServicePlan | undefined>;
  deleteCustomerServicePlan(id: string, customerId: string, companyId: string): Promise<void>;
  getServiceFulfillment(customerId: string, companyId: string, year: number): Promise<ServiceFulfillmentRow[]>;

  // Style Presets
  getStylePresets(companyId: string): Promise<StylePreset[]>;
  createStylePreset(data: InsertStylePreset): Promise<StylePreset>;
  updateStylePreset(id: string, companyId: string, data: Partial<InsertStylePreset>): Promise<StylePreset | undefined>;
  deleteStylePreset(id: string, companyId: string): Promise<void>;
  seedDefaultStylePresets(companyId: string): Promise<void>;

  // Sheet Templates
  getSheetTemplates(companyId: string): Promise<SheetTemplate[]>;
  createSheetTemplate(data: InsertSheetTemplate): Promise<SheetTemplate>;
  updateSheetTemplate(id: string, companyId: string, data: Partial<InsertSheetTemplate>): Promise<SheetTemplate | undefined>;
  deleteSheetTemplate(id: string, companyId: string): Promise<void>;

  getChemicalProducts(companyId: string): Promise<ChemicalProduct[]>;
  getChemicalProductById(id: string, companyId: string): Promise<ChemicalProduct | undefined>;
  createChemicalProduct(product: InsertChemicalProduct): Promise<ChemicalProduct>;
  updateChemicalProduct(id: string, companyId: string, updates: Partial<InsertChemicalProduct>): Promise<ChemicalProduct | undefined>;
  deleteChemicalProduct(id: string, companyId: string): Promise<void>;

  // Chemical Notification Templates
  getChemicalNotificationTemplates(companyId: string): Promise<ChemicalNotificationTemplate[]>;
  getChemicalNotificationTemplate(id: string, companyId: string): Promise<ChemicalNotificationTemplate | undefined>;
  createChemicalNotificationTemplate(data: InsertChemicalNotificationTemplate): Promise<ChemicalNotificationTemplate>;
  updateChemicalNotificationTemplate(id: string, companyId: string, updates: Partial<InsertChemicalNotificationTemplate>): Promise<ChemicalNotificationTemplate | undefined>;
  setChemicalNotificationTemplateLabel(id: string, companyId: string, storageKey: string, filename: string): Promise<ChemicalNotificationTemplate | undefined>;
  clearChemicalNotificationTemplateLabel(id: string, companyId: string): Promise<ChemicalNotificationTemplate | undefined>;
  deleteChemicalNotificationTemplate(id: string, companyId: string): Promise<void>;
  getCampaignsByTemplate(templateId: string, companyId: string): Promise<{ id: string; title: string; status: string }[]>;
  getCampaignNotificationTemplate(campaignId: string, companyId: string): Promise<ChemicalNotificationTemplate | undefined>;

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

export interface ServiceTypeRevenue {
  month: number;
  ytd: number;
  annual: number;
}

export interface RevenueOverviewData {
  selectedMonthTotal: number;
  yearToDateTotal: number;
  fullYearTotal: number;
  maintenanceRevenue: ServiceTypeRevenue;
  chemicalRevenue: ServiceTypeRevenue;
  customers: { customerId: string; customerName: string; monthlyRevenue: number; annualProjection: number }[];
}

export interface RevenueException {
  customerId: string;
  customerName: string;
  contractId: string;
  serviceType: string;
  contractStatus: string;
  flags: string[];
  missingMonthsCount: number;
  storedTotal: number;
  calculatedTotal: number;
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

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const normalized = phone.replace(/\D/g, "");
    const result = await db.select().from(users).where(eq(users.phone, normalized)).limit(1);
    return result[0];
  }

  async hasAnyUsers(): Promise<boolean> {
    const result = await db.select({ id: users.id }).from(users).limit(1);
    return result.length > 0;
  }

  async deleteAllUsers(): Promise<void> {
    // Complete reset - delete ALL data in proper order for foreign key constraints
    // This enables a fresh first-time setup
    // Uses table names exactly as defined in schema.ts
    
    // 1. Delete ticket-related data
    await db.execute(sql`DELETE FROM ticket_notifications`);
    await db.execute(sql`DELETE FROM ticket_links`);
    await db.execute(sql`DELETE FROM ticket_comments`);
    await db.execute(sql`DELETE FROM ticket_field_values`);
    await db.execute(sql`DELETE FROM ticket_status_history`);
    await db.execute(sql`DELETE FROM tickets`);
    
    // 2. Delete ticket type configuration
    await db.execute(sql`DELETE FROM ticket_type_fields`);
    await db.execute(sql`DELETE FROM ticket_type_statuses`);
    await db.execute(sql`DELETE FROM ticket_types`);
    
    // 3. Delete scheduling data
    await db.execute(sql`DELETE FROM schedule_blocks`);
    await db.execute(sql`DELETE FROM weekly_schedule_templates`);
    await db.execute(sql`DELETE FROM maintenance_visit_configs`);
    await db.execute(sql`DELETE FROM maintenance_crews`);
    
    // 4. Delete customer data
    await db.execute(sql`DELETE FROM customer_map_documents`);
    await db.execute(sql`DELETE FROM customer_map_layers`);
    await db.execute(sql`DELETE FROM notes`);
    await db.execute(sql`DELETE FROM contract_services`);
    await db.execute(sql`DELETE FROM contract_status_history`);
    await db.execute(sql`DELETE FROM contract_documents`);
    await db.execute(sql`DELETE FROM contracts`);
    await db.execute(sql`DELETE FROM contacts`);
    await db.execute(sql`DELETE FROM customers`);
    
    // 5. Delete contract builder data
    await db.execute(sql`DELETE FROM contract_builder_variables`);
    await db.execute(sql`DELETE FROM contract_builder_sections`);
    await db.execute(sql`DELETE FROM contract_builder_documents`);
    
    // 6. Delete company data
    await db.execute(sql`DELETE FROM settings`);
    await db.execute(sql`DELETE FROM company_users`);
    await db.execute(sql`DELETE FROM companies`);
    
    // 7. Delete sessions and users
    await db.execute(sql`DELETE FROM session`);
    await db.execute(sql`DELETE FROM users`);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const normalized = {
      ...insertUser,
      phone: insertUser.phone ? insertUser.phone.replace(/\D/g, "") : insertUser.phone,
    };
    const result = await db.insert(users).values([normalized]).returning();
    return result[0];
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
  }

  async updateUserLanguage(userId: string, language: "en" | "es"): Promise<void> {
    await db.update(users)
      .set({ language })
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

  async getCustomersPaginated(companyId: string, opts: { page: number; limit: number; search?: string }): Promise<{ customers: Customer[]; total: number }> {
    const { page, limit, search } = opts;
    const offset = (page - 1) * limit;
    const baseCondition = eq(customers.companyId, companyId);
    const whereClause = search
      ? and(baseCondition, sql`lower(${customers.name}) like ${'%' + search.toLowerCase() + '%'}`)
      : baseCondition;
    const [rows, countRows] = await Promise.all([
      db.select().from(customers).where(whereClause).orderBy(customers.name).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(customers).where(whereClause),
    ]);
    return { customers: rows, total: countRows[0]?.count ?? 0 };
  }

  async getCustomerSearch(companyId: string, query: string): Promise<Customer[]> {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    return await db.select().from(customers)
      .where(and(
        eq(customers.companyId, companyId),
        or(
          sql`lower(${customers.name}) like ${'%' + q + '%'}`,
          sql`lower(COALESCE(${customers.street}, '')) like ${'%' + q + '%'}`
        )
      ))
      .orderBy(customers.name)
      .limit(20);
  }

  async getCustomerSearchWithChildren(companyId: string, query: string): Promise<Customer[]> {
    const base = await this.getCustomerSearch(companyId, query);
    const seen = new Set<string>(base.map(c => c.id));
    const extra: Customer[] = [];
    for (const c of base) {
      if (c.isParent === "true") {
        const children = await this.getChildCustomers(c.id, companyId);
        for (const child of children) {
          if (!seen.has(child.id)) {
            seen.add(child.id);
            extra.push(child);
          }
        }
      }
    }
    return [...base, ...extra];
  }

  async getCustomerById(id: string, companyId: string): Promise<Customer | undefined> {
    const result = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async getCustomersByIds(ids: string[], companyId: string): Promise<Map<string, Customer>> {
    if (ids.length === 0) return new Map();
    const rows = await db.select().from(customers)
      .where(and(inArray(customers.id, ids), eq(customers.companyId, companyId)));
    return new Map(rows.map(c => [c.id, c]));
  }

  async getChildCustomers(parentId: string, companyId: string): Promise<Customer[]> {
    return await db.select().from(customers)
      .where(and(eq(customers.parentCustomerId, parentId), eq(customers.companyId, companyId)));
  }

  async getParentCustomers(companyId: string): Promise<Customer[]> {
    return await db.select().from(customers)
      .where(and(eq(customers.isParent, "true"), eq(customers.companyId, companyId)));
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const result = await db.insert(customers).values([insertCustomer] as (typeof customers.$inferInsert)[]).returning();
    return result[0];
  }

  async updateCustomer(id: string, companyId: string, updates: Partial<InsertCustomer>, expectedUpdatedAt?: Date): Promise<Customer | undefined | { conflict: true; current: Customer }> {
    // If expectedUpdatedAt is provided, check for conflicts
    if (expectedUpdatedAt) {
      const current = await db.select().from(customers)
        .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
        .limit(1);
      
      if (current.length === 0) {
        return undefined;
      }
      
      // Compare timestamps (allow 1 second tolerance for rounding)
      const currentTime = current[0].updatedAt.getTime();
      const expectedTime = expectedUpdatedAt.getTime();
      if (Math.abs(currentTime - expectedTime) > 1000) {
        return { conflict: true, current: current[0] };
      }
    }
    
    const result = await db.update(customers)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof customers.$inferInsert>)
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

  async getContactById(id: string, companyId: string): Promise<Contact | undefined> {
    const result = await db.select().from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)));
    return result[0];
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

  async updateNote(id: string, companyId: string, body: string): Promise<Note | undefined> {
    const result = await db.update(notes)
      .set({ body })
      .where(and(eq(notes.id, id), eq(notes.companyId, companyId)))
      .returning();
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

  async getAllContracts(companyId: string): Promise<(Contract & { customerName: string })[]> {
    const result = await db
      .select({
        id: contracts.id,
        companyId: contracts.companyId,
        customerId: contracts.customerId,
        serviceType: contracts.serviceType,
        billingPattern: contracts.billingPattern,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        status: contracts.status,
        po: contracts.po,
        notes: contracts.notes,
        hasMobilizationFee: contracts.hasMobilizationFee,
        mobilizationFeeAmount: contracts.mobilizationFeeAmount,
        createdAt: contracts.createdAt,
        updatedAt: contracts.updatedAt,
        customerName: customers.name,
      })
      .from(contracts)
      .innerJoin(customers, eq(contracts.customerId, customers.id))
      .where(eq(contracts.companyId, companyId))
      .orderBy(desc(contracts.createdAt))
      .limit(500); // PERF: hard cap to prevent unbounded payload
    return result as (Contract & { customerName: string })[];
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
      // Skip paused and ended contracts - they don't contribute to revenue
      if (contract.status === 'paused' || contract.status === 'ended') {
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
      
      // Extract contract date boundaries once (outside the loop for efficiency)
      // Use UTC methods since dates are stored in UTC
      const contractStartYear = contract.startDate.getUTCFullYear();
      const contractStartMonth = contract.startDate.getUTCMonth() + 1; // 1-indexed
      const contractEndYear = contract.endDate ? contract.endDate.getUTCFullYear() : null;
      const contractEndMonth = contract.endDate ? contract.endDate.getUTCMonth() + 1 : null;
      
      const startMonthYear = contractStartYear * 100 + contractStartMonth;
      const endMonthYear = contractEndYear && contractEndMonth ? contractEndYear * 100 + contractEndMonth : null;
      
      for (const amountRecord of amounts) {
        // Check if the month/year falls within contract period
        const monthYear = year * 100 + amountRecord.month; // e.g., 202601 for Jan 2026
        
        const isInRange = monthYear >= startMonthYear && 
                         (!endMonthYear || monthYear <= endMonthYear);
        
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
    // Bulk fetch all customers, contracts, and monthly amounts in 3 queries instead of N+1
    const [allCustomers, allContracts, allAmounts] = await Promise.all([
      this.getCustomers(companyId),
      db.select().from(contracts).where(eq(contracts.companyId, companyId)),
      db.select().from(contractMonthlyAmounts).where(eq(contractMonthlyAmounts.companyId, companyId)),
    ]);

    // Index amounts by contractId for fast lookup
    const amountsByContract = new Map<string, typeof allAmounts>();
    for (const amt of allAmounts) {
      if (!amountsByContract.has(amt.contractId)) amountsByContract.set(amt.contractId, []);
      amountsByContract.get(amt.contractId)!.push(amt);
    }

    // Index contracts by customerId
    const contractsByCustomer = new Map<string, typeof allContracts>();
    for (const contract of allContracts) {
      if (!contractsByCustomer.has(contract.customerId)) contractsByCustomer.set(contract.customerId, []);
      contractsByCustomer.get(contract.customerId)!.push(contract);
    }

    let selectedMonthTotal = 0;
    let yearToDateTotal = 0;
    let fullYearTotal = 0;
    const maintenanceRevenue = { month: 0, ytd: 0, annual: 0 };
    const chemicalRevenue = { month: 0, ytd: 0, annual: 0 };

    const customers: {
      customerId: string;
      customerName: string;
      monthlyRevenue: number;
      annualProjection: number;
      maintenanceMonth: number;
      maintenanceYtd: number;
      maintenanceAnnual: number;
      chemicalMonth: number;
      chemicalYtd: number;
      chemicalAnnual: number;
    }[] = [];

    for (const customer of allCustomers) {
      const customerContracts = contractsByCustomer.get(customer.id) || [];

      // Per-month totals for this customer
      const monthlyTotals: Record<number, number> = {};
      const monthlyByServiceType: Record<number, Record<string, number>> = {};
      for (let m = 1; m <= 12; m++) {
        monthlyTotals[m] = 0;
        monthlyByServiceType[m] = {};
      }

      let annualProjection = 0;

      for (const contract of customerContracts) {
        if (contract.status === 'paused' || contract.status === 'ended') continue;

        const amounts = amountsByContract.get(contract.id) || [];

        const contractStartYear = contract.startDate.getUTCFullYear();
        const contractStartMonth = contract.startDate.getUTCMonth() + 1;
        const contractEndYear = contract.endDate ? contract.endDate.getUTCFullYear() : null;
        const contractEndMonth = contract.endDate ? contract.endDate.getUTCMonth() + 1 : null;
        const startMonthYear = contractStartYear * 100 + contractStartMonth;
        const endMonthYear = contractEndYear && contractEndMonth ? contractEndYear * 100 + contractEndMonth : null;

        let contractAnnualTotal = 0;
        for (const amountRecord of amounts) {
          const monthYear = year * 100 + amountRecord.month;
          const isInRange = monthYear >= startMonthYear && (!endMonthYear || monthYear <= endMonthYear);
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
      }

      const monthlyRevenue = monthlyTotals[month] || 0;
      selectedMonthTotal += monthlyRevenue;

      let customerMaintenanceMonth = 0;
      let customerMaintenanceYtd = 0;
      let customerMaintenanceAnnual = 0;
      let customerChemicalMonth = 0;
      let customerChemicalYtd = 0;
      let customerChemicalAnnual = 0;

      for (let m = 1; m <= 12; m++) {
        const monthTotal = monthlyTotals[m] || 0;
        fullYearTotal += monthTotal;
        if (m <= month) yearToDateTotal += monthTotal;

        for (const [serviceType, amount] of Object.entries(monthlyByServiceType[m])) {
          if (serviceType === 'Maintenance') {
            if (m === month) { maintenanceRevenue.month += amount; customerMaintenanceMonth += amount; }
            if (m <= month) { maintenanceRevenue.ytd += amount; customerMaintenanceYtd += amount; }
            maintenanceRevenue.annual += amount;
            customerMaintenanceAnnual += amount;
          } else if (serviceType === 'Chemical') {
            if (m === month) { chemicalRevenue.month += amount; customerChemicalMonth += amount; }
            if (m <= month) { chemicalRevenue.ytd += amount; customerChemicalYtd += amount; }
            chemicalRevenue.annual += amount;
            customerChemicalAnnual += amount;
          }
        }
      }

      customers.push({
        customerId: customer.id,
        customerName: customer.name,
        monthlyRevenue,
        annualProjection,
        maintenanceMonth: customerMaintenanceMonth,
        maintenanceYtd: customerMaintenanceYtd,
        maintenanceAnnual: customerMaintenanceAnnual,
        chemicalMonth: customerChemicalMonth,
        chemicalYtd: customerChemicalYtd,
        chemicalAnnual: customerChemicalAnnual,
      });
    }

    return {
      selectedMonthTotal,
      yearToDateTotal,
      fullYearTotal,
      maintenanceRevenue,
      chemicalRevenue,
      customers,
    };
  }

  async getRevenueExceptions(companyId: string, year: number): Promise<RevenueException[]> {
    const [allCustomers, allContracts, allAmounts] = await Promise.all([
      this.getCustomers(companyId),
      db.select().from(contracts).where(eq(contracts.companyId, companyId)),
      db.select().from(contractMonthlyAmounts).where(eq(contractMonthlyAmounts.companyId, companyId)),
    ]);

    const customerMap = new Map<string, { id: string; name: string }>();
    for (const c of allCustomers) customerMap.set(c.id, { id: c.id, name: c.name });

    const amountsByContract = new Map<string, typeof allAmounts>();
    for (const amt of allAmounts) {
      if (!amountsByContract.has(amt.contractId)) amountsByContract.set(amt.contractId, []);
      amountsByContract.get(amt.contractId)!.push(amt);
    }

    // Group contracts by (customerId, serviceType) to detect duplicates
    const contractsByCustomerService = new Map<string, typeof allContracts>();
    for (const contract of allContracts) {
      if (contract.status === 'ended') continue;
      const key = `${contract.customerId}::${contract.serviceType}`;
      if (!contractsByCustomerService.has(key)) contractsByCustomerService.set(key, []);
      contractsByCustomerService.get(key)!.push(contract);
    }

    const exceptions: RevenueException[] = [];

    for (const contract of allContracts) {
      const customer = customerMap.get(contract.customerId);
      if (!customer) continue;

      const amounts = amountsByContract.get(contract.id) || [];
      const flags: string[] = [];

      // Determine the active window for this contract in the given year
      const contractStartYear = contract.startDate.getUTCFullYear();
      const contractStartMonth = contract.startDate.getUTCMonth() + 1;
      const contractEndYear = contract.endDate ? contract.endDate.getUTCFullYear() : null;
      const contractEndMonth = contract.endDate ? contract.endDate.getUTCMonth() + 1 : null;
      const startMonthYear = contractStartYear * 100 + contractStartMonth;
      const endMonthYear = contractEndYear && contractEndMonth ? contractEndYear * 100 + contractEndMonth : null;

      // Determine how many months in the given year are within the contract window
      let expectedMonths = 0;
      const monthsInWindow: number[] = [];
      for (let m = 1; m <= 12; m++) {
        const my = year * 100 + m;
        if (my >= startMonthYear && (!endMonthYear || my <= endMonthYear)) {
          expectedMonths++;
          monthsInWindow.push(m);
        }
      }

      // Months that actually have amount records
      const recordedMonths = new Set(amounts.map((a) => a.month));
      const missingMonths = monthsInWindow.filter((m) => !recordedMonths.has(m));
      const missingMonthsCount = missingMonths.length;

      // Flag 1: Missing months
      if (expectedMonths > 0 && missingMonthsCount > 0) {
        flags.push('missing_months');
      }

      // Stored total (annualValue field on contract does not exist; derive from amounts)
      // calculatedTotal = sum of monthly amounts for months in window (in dollars)
      let calculatedTotal = 0;
      let storedTotal = 0;
      const outsideAmounts: number[] = [];

      for (const amt of amounts) {
        const my = year * 100 + amt.month;
        const inWindow = my >= startMonthYear && (!endMonthYear || my <= endMonthYear);
        if (inWindow) {
          calculatedTotal += amt.amount / 100;
        } else {
          outsideAmounts.push(amt.month);
        }
        storedTotal += amt.amount / 100;
      }

      // Flag 2: Annual mismatch — sum of all monthly entries != storedTotal (compare calculatedTotal vs storedTotal)
      // We define this as: sum of in-window months (calculatedTotal) differs from sum of all months (storedTotal)
      // which means there are outside-window amounts. Flag 5 will catch those; let's define mismatch as
      // expectedMonths > 0, calculatedTotal != storedTotal when there are no outside months
      // Actually per spec: "sum of monthly amounts ≠ stored annual contract value"
      // The contract table doesn't have a stored annual value, so we define mismatch as:
      // calculatedTotal (in-window) differs from storedTotal (all months) due to outside amounts.
      // We'll do this as: storedTotal != calculatedTotal (i.e. there are outside months contributing)
      // Flag 5 handles outside term, so let's define flag 2 as rounding/partial mismatch:
      // Since there's no separate "annual contract value" stored, we treat this as:
      // the sum of recorded months in the active year window doesn't equal exactly what's expected
      // i.e., some months in-window are zero while others are non-zero (inconsistent pricing).
      // More practically: detect if the amounts are unequal across months (which may indicate a data error)
      // Per spec intent, use: storedTotal != calculatedTotal (outside amounts exist)
      if (outsideAmounts.length > 0) {
        // This means amounts exist outside the contract term — flagged as flag 5 below
      }

      // Flag 3: Duplicate candidates — more than one contract of same serviceType for this customer (non-ended)
      const dupKey = `${contract.customerId}::${contract.serviceType}`;
      const sameCategoryContracts = contractsByCustomerService.get(dupKey) || [];
      if (sameCategoryContracts.length > 1) {
        flags.push('duplicate_candidates');
      }

      // Flag 4: Zero-value rows — all monthly amounts sum to zero (but there are records)
      if (amounts.length > 0 && storedTotal === 0) {
        flags.push('zero_value');
      }

      // Flag 5: Outside contract term — monthly amounts outside the start/end date range
      if (outsideAmounts.length > 0) {
        flags.push('outside_term');
      }

      // Flag 2 revisited: annual mismatch — if expected months > 0 but in-window months have
      // unequal amounts (some zero, some non-zero), that may indicate a mismatch.
      // Since we have no "stored annual contract value" field, define mismatch as:
      // there are records in window but calculatedTotal == 0 while expectedMonths > 0 (already covered by zero_value)
      // OR some in-window months have very different amounts suggesting data error.
      // Best available: flag if storedTotal != calculatedTotal (exists outside amounts that don't belong)
      // This is already captured by outside_term. So for annual_mismatch, detect if any in-window month has
      // amount != the mode/average — simplified: skip this for now as we have no baseline annual value.
      // We'll mark annual_mismatch if there are in-window amounts and some months are zero, others non-zero.
      if (expectedMonths > 0 && amounts.length > 0) {
        const inWindowAmounts = amounts.filter((a) => {
          const my = year * 100 + a.month;
          return my >= startMonthYear && (!endMonthYear || my <= endMonthYear);
        });
        const nonZeroInWindow = inWindowAmounts.filter((a) => a.amount > 0);
        const zeroInWindow = inWindowAmounts.filter((a) => a.amount === 0);
        // Annual mismatch: has both zero and non-zero amounts in-window (inconsistent data)
        if (nonZeroInWindow.length > 0 && zeroInWindow.length > 0) {
          flags.push('annual_mismatch');
        }
      }

      if (flags.length > 0) {
        exceptions.push({
          customerId: customer.id,
          customerName: customer.name,
          contractId: contract.id,
          serviceType: contract.serviceType,
          contractStatus: contract.status,
          flags,
          missingMonthsCount,
          storedTotal,
          calculatedTotal,
        });
      }
    }

    return exceptions;
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
    
    // Use getRevenueOverview as the single source of truth for revenue calculations
    // This ensures consistency with mobilization fees, proper date filtering, and status handling
    const revenueData = await this.getRevenueOverview(companyId, month, year);
    
    return {
      customersCount: allCustomers.length,
      activeContractsCount: activeContracts.length,
      monthlyRevenue: revenueData.selectedMonthTotal,
      ytdRevenue: revenueData.yearToDateTotal,
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
    // PERF: replace per-customer N+1 loop with 2 bulk queries — mirrors getRevenueOverview pattern
    const [allContracts, allAmounts] = await Promise.all([
      db.select().from(contracts).where(eq(contracts.companyId, companyId)),
      db.select().from(contractMonthlyAmounts).where(eq(contractMonthlyAmounts.companyId, companyId)),
    ]);

    const amountsByContractId = new Map<string, typeof allAmounts>();
    for (const amt of allAmounts) {
      if (!amountsByContractId.has(amt.contractId)) amountsByContractId.set(amt.contractId, []);
      amountsByContractId.get(amt.contractId)!.push(amt);
    }

    const monthlyTotals: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) monthlyTotals[m] = 0;

    for (const contract of allContracts) {
      if (contract.status === "paused" || contract.status === "ended") continue;
      const amounts = amountsByContractId.get(contract.id) ?? [];
      const startYear = contract.startDate ? new Date(contract.startDate).getUTCFullYear() : year;
      const startMonth = contract.startDate ? new Date(contract.startDate).getUTCMonth() + 1 : 1;
      const endYear = contract.endDate ? new Date(contract.endDate).getUTCFullYear() : null;
      const endMonth = contract.endDate ? new Date(contract.endDate).getUTCMonth() + 1 : null;
      const startMonthYear = startYear * 100 + startMonth;
      const endMonthYear = endYear && endMonth ? endYear * 100 + endMonth : null;

      for (const amt of amounts) {
        const monthYear = year * 100 + amt.month;
        const inRange = monthYear >= startMonthYear && (!endMonthYear || monthYear <= endMonthYear);
        if (inRange) monthlyTotals[amt.month] += amt.amount / 100;
      }
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNames.map((name, index) => ({
      month: name,
      revenue: monthlyTotals[index + 1] || 0,
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

  async getTicketTypesByIds(ids: string[], companyId: string): Promise<TicketType[]> {
    if (ids.length === 0) return [];
    return await db.select().from(ticketTypes)
      .where(and(inArray(ticketTypes.id, ids), eq(ticketTypes.companyId, companyId)));
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

  async getTicketTypeStatusesByTypeIds(typeIds: string[]): Promise<TicketTypeStatus[]> {
    if (typeIds.length === 0) return [];
    return await db.select().from(ticketTypeStatuses)
      .where(inArray(ticketTypeStatuses.ticketTypeId, typeIds))
      .orderBy(ticketTypeStatuses.displayOrder);
  }

  async getAllTicketTypeStatuses(companyId: string): Promise<TicketTypeStatus[]> {
    const types = await db.select({ id: ticketTypes.id }).from(ticketTypes).where(eq(ticketTypes.companyId, companyId));
    if (types.length === 0) return [];
    const typeIds = types.map(t => t.id);
    return await db.select().from(ticketTypeStatuses)
      .where(inArray(ticketTypeStatuses.ticketTypeId, typeIds))
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

  async getTicketTypeFieldsByStatuses(statusIds: string[]): Promise<TicketTypeField[]> {
    if (statusIds.length === 0) return [];
    return await db.select().from(ticketTypeFields)
      .where(inArray(ticketTypeFields.statusId, statusIds))
      .orderBy(ticketTypeFields.displayOrder);
  }

  async getTicketTypeFieldById(fieldId: string): Promise<TicketTypeField | undefined> {
    const result = await db.select().from(ticketTypeFields)
      .where(eq(ticketTypeFields.id, fieldId))
      .limit(1);
    return result[0];
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
      .orderBy(desc(tickets.createdAt))
      .limit(500); // PERF: hard cap to prevent unbounded payload
  }

  async getTicketById(id: string, companyId: string): Promise<Ticket | undefined> {
    const result = await db.select().from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async getTicketsByIds(ids: string[], companyId: string): Promise<Ticket[]> {
    if (ids.length === 0) return [];
    return await db.select().from(tickets)
      .where(and(inArray(tickets.id, ids), eq(tickets.companyId, companyId)));
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

  async getTicketsByEquipmentId(equipmentId: string, companyId: string): Promise<Ticket[]> {
    return await db.select().from(tickets)
      .where(and(eq(tickets.equipmentId, equipmentId), eq(tickets.companyId, companyId)))
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

  async deleteTicketFieldValuesByFieldIds(ticketId: string, fieldIds: string[]): Promise<void> {
    if (fieldIds.length === 0) return;
    await db.delete(ticketFieldValues)
      .where(and(
        eq(ticketFieldValues.ticketId, ticketId),
        inArray(ticketFieldValues.fieldId, fieldIds)
      ));
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

  async getTicketStatusHistoryForTickets(ticketIds: string[]): Promise<TicketStatusHistory[]> {
    if (ticketIds.length === 0) return [];
    return await db.select().from(ticketStatusHistory)
      .where(inArray(ticketStatusHistory.ticketId, ticketIds))
      .orderBy(desc(ticketStatusHistory.createdAt));
  }

  async getTicketComments(ticketId: string): Promise<TicketCommentWithAuthor[]> {
    const rows = await db
      .select({
        id: ticketComments.id,
        ticketId: ticketComments.ticketId,
        authorId: ticketComments.authorId,
        parentCommentId: ticketComments.parentCommentId,
        body: ticketComments.body,
        createdAt: ticketComments.createdAt,
        authorName: users.name,
      })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.authorId, users.id))
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(ticketComments.createdAt);
    return rows.map(r => ({ ...r, authorName: r.authorName ?? "Unknown" }));
  }

  async createTicketComment(insertComment: InsertTicketComment): Promise<TicketComment> {
    const result = await db.insert(ticketComments).values([insertComment]).returning();
    return result[0];
  }

  async deleteTicketComment(id: string): Promise<void> {
    await db.delete(ticketComments).where(eq(ticketComments.id, id));
  }

  async createTicketCommentMention(insertMention: InsertTicketCommentMention): Promise<TicketCommentMention> {
    const result = await db.insert(ticketCommentMentions).values([insertMention]).returning();
    return result[0];
  }

  async getTicketCommentMentions(commentId: string): Promise<TicketCommentMention[]> {
    return await db.select().from(ticketCommentMentions)
      .where(eq(ticketCommentMentions.commentId, commentId));
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
    const result = await db.insert(customerMapLayers).values([insertLayer] as (typeof customerMapLayers.$inferInsert)[]).returning();
    return result[0];
  }

  async updateCustomerMapLayer(id: string, companyId: string, updates: Partial<InsertCustomerMapLayer>): Promise<CustomerMapLayer | undefined> {
    const result = await db.update(customerMapLayers)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof customerMapLayers.$inferInsert>)
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

  async duplicateWeeklyScheduleTemplate(id: string, companyId: string, newName: string): Promise<WeeklyScheduleTemplate> {
    const original = await this.getWeeklyScheduleTemplateById(id, companyId);
    if (!original) throw new Error("Template not found");
    
    const newTemplate = await this.createWeeklyScheduleTemplate({
      companyId,
      name: newName,
      seasonStartMonth: original.seasonStartMonth ?? 4,
      seasonEndMonth: original.seasonEndMonth ?? 10,
      seasonStartWeek: original.seasonStartWeek ?? 2,
      seasonEndWeek: original.seasonEndWeek ?? 2,
      isActive: true,
    });
    
    const blocks = await this.getScheduleBlocks(id);
    for (const block of blocks) {
      await this.createScheduleBlock({
        templateId: newTemplate.id,
        visitConfigId: block.visitConfigId,
        crewId: block.crewId,
        dayOfWeek: block.dayOfWeek,
        sortOrder: block.sortOrder ?? 0,
        startTime: block.startTime ?? undefined,
      });
    }
    
    return newTemplate;
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

  // Ticket Notifications
  async getNotificationsByUser(userId: string, companyId: string): Promise<TicketNotification[]> {
    return await db.select().from(ticketNotifications)
      .where(and(eq(ticketNotifications.recipientId, userId), eq(ticketNotifications.companyId, companyId)))
      .orderBy(desc(ticketNotifications.createdAt));
  }

  async getUnreadNotificationCount(userId: string, companyId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`COUNT(*)::int` })
      .from(ticketNotifications)
      .where(and(
        eq(ticketNotifications.recipientId, userId),
        eq(ticketNotifications.companyId, companyId),
        eq(ticketNotifications.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  async createNotification(insertNotification: InsertTicketNotification): Promise<TicketNotification> {
    const result = await db.insert(ticketNotifications).values([insertNotification]).returning();
    return result[0];
  }

  async markNotificationRead(id: string, userId: string): Promise<TicketNotification | undefined> {
    const result = await db.update(ticketNotifications)
      .set({ isRead: true })
      .where(and(eq(ticketNotifications.id, id), eq(ticketNotifications.recipientId, userId)))
      .returning();
    return result[0];
  }

  async markAllNotificationsRead(userId: string, companyId: string): Promise<void> {
    await db.update(ticketNotifications)
      .set({ isRead: true })
      .where(and(eq(ticketNotifications.recipientId, userId), eq(ticketNotifications.companyId, companyId)));
  }

  async getNotificationsWithDueDateType(ticketId: string, type: NotificationType): Promise<TicketNotification[]> {
    return await db.select().from(ticketNotifications)
      .where(and(eq(ticketNotifications.ticketId, ticketId), eq(ticketNotifications.type, type)));
  }

  async dismissDueDateNotificationsForTicket(ticketId: string): Promise<void> {
    await db.update(ticketNotifications)
      .set({ isRead: true })
      .where(and(
        eq(ticketNotifications.ticketId, ticketId),
        inArray(ticketNotifications.type, ["overdue", "due_today", "due_tomorrow"]),
        eq(ticketNotifications.isRead, false)
      ));
  }

  // Property Management Companies
  async getPropertyManagementCompanies(companyId: string): Promise<PropertyManagementCompany[]> {
    return await db.select().from(propertyManagementCompanies)
      .where(eq(propertyManagementCompanies.companyId, companyId))
      .orderBy(propertyManagementCompanies.name);
  }

  async getPropertyManagementCompanyById(id: string, companyId: string): Promise<PropertyManagementCompany | undefined> {
    const result = await db.select().from(propertyManagementCompanies)
      .where(and(eq(propertyManagementCompanies.id, id), eq(propertyManagementCompanies.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createPropertyManagementCompany(insertCompany: InsertPropertyManagementCompany): Promise<PropertyManagementCompany> {
    const result = await db.insert(propertyManagementCompanies).values([insertCompany]).returning();
    return result[0];
  }

  async updatePropertyManagementCompany(id: string, companyId: string, updates: Partial<InsertPropertyManagementCompany>): Promise<PropertyManagementCompany | undefined> {
    const result = await db.update(propertyManagementCompanies)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(propertyManagementCompanies.id, id), eq(propertyManagementCompanies.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deletePropertyManagementCompany(id: string, companyId: string): Promise<void> {
    await db.delete(propertyManagementCompanies)
      .where(and(eq(propertyManagementCompanies.id, id), eq(propertyManagementCompanies.companyId, companyId)));
  }

  // Property Managers
  async getPropertyManagers(companyId: string): Promise<PropertyManager[]> {
    return await db.select().from(propertyManagers)
      .where(eq(propertyManagers.companyId, companyId))
      .orderBy(propertyManagers.name);
  }

  async getPropertyManagersByCompany(propertyManagementCompanyId: string, companyId: string): Promise<PropertyManager[]> {
    return await db.select().from(propertyManagers)
      .where(and(
        eq(propertyManagers.propertyManagementCompanyId, propertyManagementCompanyId),
        eq(propertyManagers.companyId, companyId)
      ))
      .orderBy(propertyManagers.name);
  }

  async getPropertyManagerById(id: string, companyId: string): Promise<PropertyManager | undefined> {
    const result = await db.select().from(propertyManagers)
      .where(and(eq(propertyManagers.id, id), eq(propertyManagers.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createPropertyManager(insertManager: InsertPropertyManager): Promise<PropertyManager> {
    const result = await db.insert(propertyManagers).values([insertManager]).returning();
    return result[0];
  }

  async updatePropertyManager(id: string, companyId: string, updates: Partial<InsertPropertyManager>): Promise<PropertyManager | undefined> {
    const result = await db.update(propertyManagers)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(propertyManagers.id, id), eq(propertyManagers.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deletePropertyManager(id: string, companyId: string): Promise<void> {
    await db.delete(propertyManagers)
      .where(and(eq(propertyManagers.id, id), eq(propertyManagers.companyId, companyId)));
  }

  async getPropertyManagerWithContacts(id: string, companyId: string): Promise<PropertyManagerWithContacts | undefined> {
    const manager = await this.getPropertyManagerById(id, companyId);
    if (!manager) return undefined;
    
    const emails = await this.getPropertyManagerEmails(id, companyId);
    const phones = await this.getPropertyManagerPhones(id, companyId);
    
    return { ...manager, emails, phones };
  }

  // Property Manager Emails
  async getPropertyManagerEmails(propertyManagerId: string, companyId: string): Promise<PropertyManagerEmail[]> {
    return await db.select().from(propertyManagerEmails)
      .where(and(
        eq(propertyManagerEmails.propertyManagerId, propertyManagerId),
        eq(propertyManagerEmails.companyId, companyId)
      ));
  }

  async createPropertyManagerEmail(insertEmail: InsertPropertyManagerEmail): Promise<PropertyManagerEmail> {
    const result = await db.insert(propertyManagerEmails).values([insertEmail]).returning();
    return result[0];
  }

  async updatePropertyManagerEmail(id: string, companyId: string, updates: Partial<InsertPropertyManagerEmail>): Promise<PropertyManagerEmail | undefined> {
    const result = await db.update(propertyManagerEmails)
      .set(updates)
      .where(and(eq(propertyManagerEmails.id, id), eq(propertyManagerEmails.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deletePropertyManagerEmail(id: string, companyId: string): Promise<void> {
    await db.delete(propertyManagerEmails)
      .where(and(eq(propertyManagerEmails.id, id), eq(propertyManagerEmails.companyId, companyId)));
  }

  async deletePropertyManagerEmailsByManager(propertyManagerId: string, companyId: string): Promise<void> {
    await db.delete(propertyManagerEmails)
      .where(and(
        eq(propertyManagerEmails.propertyManagerId, propertyManagerId),
        eq(propertyManagerEmails.companyId, companyId)
      ));
  }

  // Property Manager Phones
  async getPropertyManagerPhones(propertyManagerId: string, companyId: string): Promise<PropertyManagerPhone[]> {
    return await db.select().from(propertyManagerPhones)
      .where(and(
        eq(propertyManagerPhones.propertyManagerId, propertyManagerId),
        eq(propertyManagerPhones.companyId, companyId)
      ));
  }

  async createPropertyManagerPhone(insertPhone: InsertPropertyManagerPhone): Promise<PropertyManagerPhone> {
    const result = await db.insert(propertyManagerPhones).values([insertPhone]).returning();
    return result[0];
  }

  async updatePropertyManagerPhone(id: string, companyId: string, updates: Partial<InsertPropertyManagerPhone>): Promise<PropertyManagerPhone | undefined> {
    const result = await db.update(propertyManagerPhones)
      .set(updates)
      .where(and(eq(propertyManagerPhones.id, id), eq(propertyManagerPhones.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deletePropertyManagerPhone(id: string, companyId: string): Promise<void> {
    await db.delete(propertyManagerPhones)
      .where(and(eq(propertyManagerPhones.id, id), eq(propertyManagerPhones.companyId, companyId)));
  }

  async deletePropertyManagerPhonesByManager(propertyManagerId: string, companyId: string): Promise<void> {
    await db.delete(propertyManagerPhones)
      .where(and(
        eq(propertyManagerPhones.propertyManagerId, propertyManagerId),
        eq(propertyManagerPhones.companyId, companyId)
      ));
  }

  // Equipment
  async getEquipment(companyId: string): Promise<Equipment[]> {
    return await db.select().from(equipment)
      .where(eq(equipment.companyId, companyId))
      .orderBy(desc(equipment.createdAt));
  }

  async getEquipmentById(id: string, companyId: string): Promise<Equipment | undefined> {
    const result = await db.select().from(equipment)
      .where(and(eq(equipment.id, id), eq(equipment.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async getEquipmentWithTicketCounts(companyId: string): Promise<EquipmentWithTicketCount[]> {
    const equipmentList = await this.getEquipment(companyId);
    if (equipmentList.length === 0) return [];

    const ticketCounts = await db
      .select({
        equipmentId: equipmentTickets.equipmentId,
        count: sql<number>`count(*)::int`,
      })
      .from(equipmentTickets)
      .where(and(
        eq(equipmentTickets.companyId, companyId),
        sql`${equipmentTickets.status} NOT IN ('completed', 'closed')`
      ))
      .groupBy(equipmentTickets.equipmentId);

    const countMap = new Map<string, number>();
    for (const row of ticketCounts) {
      countMap.set(row.equipmentId, row.count);
    }

    return equipmentList.map(eq => ({
      ...eq,
      openTicketCount: countMap.get(eq.id) ?? 0,
    }));
  }

  async createEquipment(insertEquipment: InsertEquipment): Promise<Equipment> {
    const result = await db.insert(equipment).values([insertEquipment]).returning();
    return result[0];
  }

  async updateEquipment(id: string, companyId: string, updates: Partial<InsertEquipment>): Promise<Equipment | undefined> {
    const result = await db.update(equipment)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(equipment.id, id), eq(equipment.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteEquipment(id: string, companyId: string): Promise<void> {
    await db.delete(equipment)
      .where(and(eq(equipment.id, id), eq(equipment.companyId, companyId)));
  }

  // Equipment Files
  async getEquipmentFiles(equipmentId: string, companyId: string): Promise<EquipmentFile[]> {
    return await db.select().from(equipmentFiles)
      .where(and(
        eq(equipmentFiles.equipmentId, equipmentId),
        eq(equipmentFiles.companyId, companyId)
      ))
      .orderBy(desc(equipmentFiles.createdAt));
  }

  async getEquipmentFileById(id: string, companyId: string): Promise<EquipmentFile | undefined> {
    const result = await db.select().from(equipmentFiles)
      .where(and(eq(equipmentFiles.id, id), eq(equipmentFiles.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createEquipmentFile(insertFile: InsertEquipmentFile): Promise<EquipmentFile> {
    const result = await db.insert(equipmentFiles).values([insertFile]).returning();
    return result[0];
  }

  async deleteEquipmentFile(id: string, companyId: string): Promise<void> {
    await db.delete(equipmentFiles)
      .where(and(eq(equipmentFiles.id, id), eq(equipmentFiles.companyId, companyId)));
  }

  // Equipment Tickets
  async getEquipmentTickets(companyId: string, filters?: { equipmentId?: string; status?: string; assignedToId?: string; operatorUserId?: string }): Promise<EquipmentTicket[]> {
    const conditions: SQL<unknown>[] = [eq(equipmentTickets.companyId, companyId)];
    
    if (filters?.equipmentId) {
      conditions.push(eq(equipmentTickets.equipmentId, filters.equipmentId));
    }
    if (filters?.status) {
      conditions.push(sql`${equipmentTickets.status} = ${filters.status}`);
    }
    if (filters?.assignedToId) {
      conditions.push(eq(equipmentTickets.assignedToId, filters.assignedToId));
    }
    
    if (filters?.operatorUserId) {
      // Include tickets for equipment the user operates OR directly assigned to the user
      const operatedEquipment = await db.select({ id: equipment.id })
        .from(equipment)
        .where(and(
          eq(equipment.companyId, companyId),
          eq(equipment.assignedToId, filters.operatorUserId)
        ));
      const operatedEquipmentIds = operatedEquipment.map(e => e.id);
      
      const baseConditions = [...conditions];
      if (operatedEquipmentIds.length > 0) {
        const results = await db.select().from(equipmentTickets)
          .where(and(
            ...baseConditions,
            or(
              eq(equipmentTickets.assignedToId, filters.operatorUserId),
              inArray(equipmentTickets.equipmentId, operatedEquipmentIds)
            )
          ))
          .orderBy(desc(equipmentTickets.createdAt));
        return results;
      } else {
        conditions.push(eq(equipmentTickets.assignedToId, filters.operatorUserId));
      }
    }
    
    return await db.select().from(equipmentTickets)
      .where(and(...conditions))
      .orderBy(desc(equipmentTickets.createdAt));
  }

  async getEquipmentTicketsWithEquipmentName(companyId: string, filters?: { equipmentId?: string; status?: string; assignedToId?: string; operatorUserId?: string }): Promise<(EquipmentTicket & { equipmentName: string; _type: "equipment" })[]> {
    const conditions: SQL<unknown>[] = [eq(equipmentTickets.companyId, companyId)];
    
    if (filters?.equipmentId) {
      conditions.push(eq(equipmentTickets.equipmentId, filters.equipmentId));
    }
    if (filters?.status) {
      conditions.push(sql`${equipmentTickets.status} = ${filters.status}`);
    }
    if (filters?.assignedToId) {
      conditions.push(eq(equipmentTickets.assignedToId, filters.assignedToId));
    }
    if (filters?.operatorUserId) {
      const operatedEquipment = await db.select({ id: equipment.id })
        .from(equipment)
        .where(and(
          eq(equipment.companyId, companyId),
          eq(equipment.assignedToId, filters.operatorUserId)
        ));
      const operatedEquipmentIds = operatedEquipment.map(e => e.id);
      
      if (operatedEquipmentIds.length > 0) {
        conditions.push(or(
          eq(equipmentTickets.assignedToId, filters.operatorUserId),
          inArray(equipmentTickets.equipmentId, operatedEquipmentIds)
        )!);
      } else {
        conditions.push(eq(equipmentTickets.assignedToId, filters.operatorUserId));
      }
    }
    
    const rows = await db
      .select({
        ticket: equipmentTickets,
        equipmentName: equipment.name,
      })
      .from(equipmentTickets)
      .innerJoin(equipment, eq(equipmentTickets.equipmentId, equipment.id))
      .where(and(...conditions))
      .orderBy(desc(equipmentTickets.createdAt));
    
    return rows.map(row => ({
      ...row.ticket,
      equipmentName: row.equipmentName,
      _type: "equipment" as const,
    }));
  }

  async getEquipmentTicketById(id: string, companyId: string): Promise<EquipmentTicket | undefined> {
    const result = await db.select().from(equipmentTickets)
      .where(and(eq(equipmentTickets.id, id), eq(equipmentTickets.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async getEquipmentTicketsByEquipmentId(equipmentId: string, companyId: string): Promise<EquipmentTicket[]> {
    return await db.select().from(equipmentTickets)
      .where(and(
        eq(equipmentTickets.equipmentId, equipmentId),
        eq(equipmentTickets.companyId, companyId)
      ))
      .orderBy(desc(equipmentTickets.createdAt));
  }

  async createEquipmentTicket(insertTicket: InsertEquipmentTicket): Promise<EquipmentTicket> {
    const result = await db.insert(equipmentTickets).values([insertTicket]).returning();
    return result[0];
  }

  async updateEquipmentTicket(id: string, companyId: string, updates: Partial<InsertEquipmentTicket>): Promise<EquipmentTicket | undefined> {
    const result = await db.update(equipmentTickets)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(equipmentTickets.id, id), eq(equipmentTickets.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteEquipmentTicket(id: string, companyId: string): Promise<void> {
    await db.delete(equipmentTickets)
      .where(and(eq(equipmentTickets.id, id), eq(equipmentTickets.companyId, companyId)));
  }

  // Equipment Ticket Status History
  async createEquipmentTicketStatusHistory(history: InsertEquipmentTicketStatusHistory): Promise<EquipmentTicketStatusHistory> {
    const result = await db.insert(equipmentTicketStatusHistory).values([history]).returning();
    return result[0];
  }

  async getEquipmentTicketStatusHistory(ticketId: string): Promise<EquipmentTicketStatusHistory[]> {
    return await db.select().from(equipmentTicketStatusHistory)
      .where(eq(equipmentTicketStatusHistory.ticketId, ticketId))
      .orderBy(desc(equipmentTicketStatusHistory.createdAt));
  }

  // Snow Events
  async getSnowEvents(companyId: string): Promise<SnowEventWithDetails[]> {
    const events = await db.select().from(snowEvents)
      .where(eq(snowEvents.companyId, companyId))
      .orderBy(desc(snowEvents.eventStartDateTime));

    if (events.length === 0) return [];

    // PERF: bulk-fetch impacts and creators in parallel instead of N×2 per-event queries
    const eventIds = events.map(e => e.id);
    const userIds = Array.from(new Set(events.map(e => e.createdByUserId).filter(Boolean) as string[]));

    const [allImpacts, allCreators] = await Promise.all([
      db.select({ snowEventId: snowEventPropertyImpacts.snowEventId, ticketId: snowEventPropertyImpacts.ticketId })
        .from(snowEventPropertyImpacts)
        .where(and(inArray(snowEventPropertyImpacts.snowEventId, eventIds), eq(snowEventPropertyImpacts.companyId, companyId))),
      userIds.length > 0
        ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
        : Promise.resolve([]),
    ]);

    const impactsByEventId = new Map<string, typeof allImpacts>();
    for (const imp of allImpacts) {
      if (!impactsByEventId.has(imp.snowEventId)) impactsByEventId.set(imp.snowEventId, []);
      impactsByEventId.get(imp.snowEventId)!.push(imp);
    }
    const creatorById = new Map(allCreators.map(u => [u.id, u]));

    return events.map(event => {
      const impacts = impactsByEventId.get(event.id) ?? [];
      const creator = creatorById.get(event.createdByUserId);
      return {
        ...event,
        propertyCount: impacts.length,
        ticketCount: impacts.filter(i => i.ticketId).length,
        createdByName: creator?.name ?? 'Unknown',
      };
    });
  }

  async getSnowEventById(id: string, companyId: string): Promise<SnowEvent | undefined> {
    const result = await db.select().from(snowEvents)
      .where(and(eq(snowEvents.id, id), eq(snowEvents.companyId, companyId)));
    return result[0];
  }

  async createSnowEvent(event: InsertSnowEvent): Promise<SnowEvent> {
    const result = await db.insert(snowEvents).values([event]).returning();
    return result[0];
  }

  async updateSnowEvent(id: string, companyId: string, updates: Partial<InsertSnowEvent>): Promise<SnowEvent | undefined> {
    const result = await db.update(snowEvents)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(snowEvents.id, id), eq(snowEvents.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteSnowEvent(id: string, companyId: string): Promise<void> {
    await db.delete(snowEvents)
      .where(and(eq(snowEvents.id, id), eq(snowEvents.companyId, companyId)));
  }

  // Snow Event Attachments
  async getSnowEventAttachments(snowEventId: string, companyId: string): Promise<SnowEventAttachment[]> {
    return await db.select().from(snowEventAttachments)
      .where(and(
        eq(snowEventAttachments.snowEventId, snowEventId),
        eq(snowEventAttachments.companyId, companyId)
      ))
      .orderBy(desc(snowEventAttachments.createdAt));
  }

  async createSnowEventAttachment(attachment: InsertSnowEventAttachment): Promise<SnowEventAttachment> {
    const result = await db.insert(snowEventAttachments).values([attachment]).returning();
    return result[0];
  }

  async deleteSnowEventAttachment(id: string, companyId: string): Promise<void> {
    await db.delete(snowEventAttachments)
      .where(and(eq(snowEventAttachments.id, id), eq(snowEventAttachments.companyId, companyId)));
  }

  // Snow Event Property Impacts
  async getSnowEventPropertyImpacts(snowEventId: string, companyId: string): Promise<SnowEventPropertyImpactWithCustomer[]> {
    const impacts = await db.select().from(snowEventPropertyImpacts)
      .where(and(
        eq(snowEventPropertyImpacts.snowEventId, snowEventId),
        eq(snowEventPropertyImpacts.companyId, companyId)
      ))
      .orderBy(desc(snowEventPropertyImpacts.createdAt));

    if (impacts.length === 0) return [];

    // PERF: bulk-fetch customer names with one query instead of N per-impact queries
    const customerIds = Array.from(new Set(impacts.map(i => i.customerId)));
    const allCustomerRows = await db.select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(inArray(customers.id, customerIds));
    const customerNameById = new Map<string, string>(allCustomerRows.map(c => [c.id, c.name]));

    return impacts.map(impact => ({
      ...impact,
      customerName: customerNameById.get(impact.customerId) ?? 'Unknown',
    }));
  }

  async getSnowEventPropertyImpactsByCustomer(customerId: string, companyId: string): Promise<(SnowEventPropertyImpact & { snowEvent: SnowEvent })[]> {
    const impacts = await db.select().from(snowEventPropertyImpacts)
      .where(and(
        eq(snowEventPropertyImpacts.customerId, customerId),
        eq(snowEventPropertyImpacts.companyId, companyId)
      ))
      .orderBy(desc(snowEventPropertyImpacts.createdAt));

    if (impacts.length === 0) return [];

    // PERF: bulk-fetch snow events with one query instead of N per-impact queries
    const eventIds = Array.from(new Set(impacts.map(i => i.snowEventId)));
    const allEventRows = await db.select().from(snowEvents).where(inArray(snowEvents.id, eventIds));
    const eventById = new Map<string, SnowEvent>(allEventRows.map(e => [e.id, e]));

    return impacts
      .filter(impact => eventById.has(impact.snowEventId))
      .map(impact => ({ ...impact, snowEvent: eventById.get(impact.snowEventId)! }));
  }

  async createSnowEventPropertyImpact(impact: InsertSnowEventPropertyImpact): Promise<SnowEventPropertyImpact> {
    const result = await db.insert(snowEventPropertyImpacts).values([impact]).returning();
    return result[0];
  }

  async updateSnowEventPropertyImpact(id: string, companyId: string, updates: Partial<InsertSnowEventPropertyImpact>): Promise<SnowEventPropertyImpact | undefined> {
    const result = await db.update(snowEventPropertyImpacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(snowEventPropertyImpacts.id, id), eq(snowEventPropertyImpacts.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteSnowEventPropertyImpact(id: string, companyId: string): Promise<void> {
    await db.delete(snowEventPropertyImpacts)
      .where(and(eq(snowEventPropertyImpacts.id, id), eq(snowEventPropertyImpacts.companyId, companyId)));
  }

  async deleteSnowEventPropertyImpactsByEvent(snowEventId: string, companyId: string): Promise<void> {
    await db.delete(snowEventPropertyImpacts)
      .where(and(
        eq(snowEventPropertyImpacts.snowEventId, snowEventId),
        eq(snowEventPropertyImpacts.companyId, companyId)
      ));
  }

  async getEmailTemplates(companyId: string): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates)
      .where(eq(emailTemplates.companyId, companyId))
      .orderBy(desc(emailTemplates.createdAt));
  }

  async getEmailTemplateById(id: string, companyId: string): Promise<EmailTemplate | undefined> {
    const result = await db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async getEmailTemplateByName(name: string, companyId: string): Promise<EmailTemplate | undefined> {
    const result = await db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.name, name), eq(emailTemplates.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const result = await db.insert(emailTemplates).values([template] as (typeof emailTemplates.$inferInsert)[]).returning();
    return result[0];
  }

  async updateEmailTemplate(id: string, companyId: string, updates: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined> {
    const result = await db.update(emailTemplates)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof emailTemplates.$inferInsert>)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.companyId, companyId)))
      .returning();
    return result[0];
  }

  async getEmailRules(companyId: string): Promise<EmailRule[]> {
    return await db.select().from(emailRules)
      .where(eq(emailRules.companyId, companyId));
  }

  async getEmailRulesByEvent(eventKey: string, companyId: string): Promise<EmailRule[]> {
    return await db.select().from(emailRules)
      .where(and(
        eq(emailRules.eventKey, eventKey),
        eq(emailRules.companyId, companyId),
        eq(emailRules.isEnabled, true)
      ));
  }

  async createEmailRule(rule: InsertEmailRule): Promise<EmailRule> {
    const result = await db.insert(emailRules).values([rule]).returning();
    return result[0];
  }

  async updateEmailRule(id: string, companyId: string, updates: Partial<InsertEmailRule>): Promise<EmailRule | undefined> {
    const result = await db.update(emailRules)
      .set(updates)
      .where(and(eq(emailRules.id, id), eq(emailRules.companyId, companyId)))
      .returning();
    return result[0];
  }

  async getEmailLogs(companyId: string, filters?: { ticketId?: string; customerId?: string; status?: string }): Promise<EmailLogWithDetails[]> {
    const conditions = [eq(emailLogs.companyId, companyId)];
    if (filters?.ticketId) conditions.push(eq(emailLogs.ticketId, filters.ticketId));
    if (filters?.customerId) conditions.push(eq(emailLogs.customerId, filters.customerId));
    if (filters?.status) conditions.push(eq(emailLogs.status, filters.status as "pending" | "sent" | "delivered" | "bounced" | "failed" | "dropped"));

    const result = await db.select({
      id: emailLogs.id,
      companyId: emailLogs.companyId,
      customerId: emailLogs.customerId,
      ticketId: emailLogs.ticketId,
      templateId: emailLogs.templateId,
      toEmail: emailLogs.toEmail,
      subject: emailLogs.subject,
      // htmlBody omitted from list — fetch via getEmailLogById for the full body
      status: emailLogs.status,
      providerMessageId: emailLogs.providerMessageId,
      errorJson: emailLogs.errorJson,
      sentById: emailLogs.sentById,
      sentAt: emailLogs.sentAt,
      createdAt: emailLogs.createdAt,
      customerName: customers.name,
      ticketTitle: tickets.title,
      templateName: emailTemplates.name,
    }).from(emailLogs)
      .leftJoin(customers, eq(emailLogs.customerId, customers.id))
      .leftJoin(tickets, eq(emailLogs.ticketId, tickets.id))
      .leftJoin(emailTemplates, eq(emailLogs.templateId, emailTemplates.id))
      .where(and(...conditions))
      .orderBy(desc(emailLogs.createdAt))
      .limit(500); // PERF: hard cap to prevent unbounded payload

    return result as EmailLogWithDetails[];
  }

  async getEmailLogById(id: string, companyId: string): Promise<EmailLog | undefined> {
    const result = await db.select().from(emailLogs)
      .where(and(eq(emailLogs.id, id), eq(emailLogs.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const result = await db.insert(emailLogs).values([log] as (typeof emailLogs.$inferInsert)[]).returning();
    return result[0];
  }

  async updateEmailLog(id: string, updates: Partial<InsertEmailLog>): Promise<EmailLog | undefined> {
    const result = await db.update(emailLogs)
      .set(updates as Partial<typeof emailLogs.$inferInsert>)
      .where(eq(emailLogs.id, id))
      .returning();
    return result[0];
  }

  // ==================== PROPOSALS ====================

  private async _getVersionsForProposals(proposalIds: string[]): Promise<{ [proposalId: string]: ProposalVersionWithUser[] }> {
    if (proposalIds.length === 0) return {};
    const versionRows = await db
      .select({
        version: proposalVersions,
        finalizedByName: users.name,
      })
      .from(proposalVersions)
      .leftJoin(users, eq(proposalVersions.finalizedById, users.id))
      .where(inArray(proposalVersions.proposalId, proposalIds))
      .orderBy(proposalVersions.versionNumber);
    const map: { [proposalId: string]: ProposalVersionWithUser[] } = {};
    for (const row of versionRows) {
      const v: ProposalVersionWithUser = { ...row.version, finalizedByName: row.finalizedByName ?? null };
      if (!map[row.version.proposalId]) map[row.version.proposalId] = [];
      map[row.version.proposalId].push(v);
    }
    return map;
  }

  private async _getVsSheetMap(vsIds: string[]): Promise<Record<string, import("@shared/schema").VisualScopeSheetWithCustomer>> {
    if (vsIds.length === 0) return {};
    const vsRows = await db
      .select({ sheet: visualScopeSheets, customerName: customers.name })
      .from(visualScopeSheets)
      .leftJoin(customers, eq(visualScopeSheets.customerId, customers.id))
      .where(inArray(visualScopeSheets.id, vsIds));
    return Object.fromEntries(vsRows.map(r => [r.sheet.id, { ...r.sheet, customerName: r.customerName ?? "" }]));
  }

  async getProposals(companyId: string): Promise<ProposalWithDetails[]> {
    const rows = await db
      .select({
        proposal: proposals,
        customerName: customers.name,
      })
      .from(proposals)
      .leftJoin(customers, eq(proposals.customerId, customers.id))
      .where(eq(proposals.companyId, companyId))
      .orderBy(desc(proposals.createdAt))
      .limit(500); // PERF: hard cap to prevent unbounded payload

    const proposalIds = rows.map(r => r.proposal.id);
    const files = proposalIds.length > 0
      ? await db.select().from(proposalFiles).where(inArray(proposalFiles.proposalId, proposalIds)).orderBy(proposalFiles.displayOrder)
      : [];
    const versionsMap = await this._getVersionsForProposals(proposalIds);
    const vsIds = rows.map(r => r.proposal.visualScopeSheetId).filter(Boolean) as string[];
    const vsMap = await this._getVsSheetMap(vsIds);

    return rows.map(r => ({
      ...r.proposal,
      customerName: r.customerName ?? "",
      files: files.filter(f => f.proposalId === r.proposal.id),
      versions: versionsMap[r.proposal.id] ?? [],
      visualScopeSheet: r.proposal.visualScopeSheetId ? (vsMap[r.proposal.visualScopeSheetId] ?? null) : null,
    }));
  }

  async getProposalsByCustomer(customerId: string, companyId: string): Promise<ProposalWithDetails[]> {
    const rows = await db
      .select({
        proposal: proposals,
        customerName: customers.name,
      })
      .from(proposals)
      .leftJoin(customers, eq(proposals.customerId, customers.id))
      .where(and(eq(proposals.customerId, customerId), eq(proposals.companyId, companyId)))
      .orderBy(desc(proposals.createdAt));

    const proposalIds = rows.map(r => r.proposal.id);
    const files = proposalIds.length > 0
      ? await db.select().from(proposalFiles).where(inArray(proposalFiles.proposalId, proposalIds)).orderBy(proposalFiles.displayOrder)
      : [];
    const versionsMap = await this._getVersionsForProposals(proposalIds);
    const vsIds = rows.map(r => r.proposal.visualScopeSheetId).filter(Boolean) as string[];
    const vsMap = await this._getVsSheetMap(vsIds);

    return rows.map(r => ({
      ...r.proposal,
      customerName: r.customerName ?? "",
      files: files.filter(f => f.proposalId === r.proposal.id),
      versions: versionsMap[r.proposal.id] ?? [],
      visualScopeSheet: r.proposal.visualScopeSheetId ? (vsMap[r.proposal.visualScopeSheetId] ?? null) : null,
    }));
  }

  async getProposalsForTicket(ticketId: string, companyId: string): Promise<ProposalWithDetails[]> {
    const rows = await db
      .select({
        proposal: proposals,
        customerName: customers.name,
      })
      .from(proposals)
      .leftJoin(customers, eq(proposals.customerId, customers.id))
      .where(and(eq(proposals.ticketId, ticketId), eq(proposals.companyId, companyId)))
      .orderBy(desc(proposals.createdAt));

    const proposalIds = rows.map(r => r.proposal.id);
    const files = proposalIds.length > 0
      ? await db.select().from(proposalFiles).where(inArray(proposalFiles.proposalId, proposalIds)).orderBy(proposalFiles.displayOrder)
      : [];
    const versionsMap = await this._getVersionsForProposals(proposalIds);
    const vsIds = rows.map(r => r.proposal.visualScopeSheetId).filter(Boolean) as string[];
    const vsMap = await this._getVsSheetMap(vsIds);

    return rows.map(r => ({
      ...r.proposal,
      customerName: r.customerName ?? "",
      files: files.filter(f => f.proposalId === r.proposal.id),
      versions: versionsMap[r.proposal.id] ?? [],
      visualScopeSheet: r.proposal.visualScopeSheetId ? (vsMap[r.proposal.visualScopeSheetId] ?? null) : null,
    }));
  }

  async getProposalById(id: string, companyId: string): Promise<ProposalWithDetails | undefined> {
    const rows = await db
      .select({
        proposal: proposals,
        customerName: customers.name,
      })
      .from(proposals)
      .leftJoin(customers, eq(proposals.customerId, customers.id))
      .where(and(eq(proposals.id, id), eq(proposals.companyId, companyId)));

    if (!rows[0]) return undefined;

    const files = await db.select().from(proposalFiles)
      .where(and(eq(proposalFiles.proposalId, id), eq(proposalFiles.companyId, companyId)))
      .orderBy(proposalFiles.displayOrder);

    const versionsMap = await this._getVersionsForProposals([id]);
    const vsId = rows[0].proposal.visualScopeSheetId;
    const vsMap = vsId ? await this._getVsSheetMap([vsId]) : {};

    return {
      ...rows[0].proposal,
      customerName: rows[0].customerName ?? "",
      files,
      versions: versionsMap[id] ?? [],
      visualScopeSheet: vsId ? (vsMap[vsId] ?? null) : null,
    };
  }

  async createProposal(proposal: InsertProposal): Promise<Proposal> {
    const result = await db.insert(proposals).values([proposal] as (typeof proposals.$inferInsert)[]).returning();
    return result[0];
  }

  async updateProposal(id: string, companyId: string, updates: Partial<InsertProposal>): Promise<Proposal | undefined> {
    const result = await db.update(proposals)
      .set(updates)
      .where(and(eq(proposals.id, id), eq(proposals.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteProposal(id: string, companyId: string): Promise<void> {
    await db.delete(proposals).where(and(eq(proposals.id, id), eq(proposals.companyId, companyId)));
  }

  async getProposalFiles(proposalId: string, companyId: string): Promise<ProposalFile[]> {
    return db.select().from(proposalFiles)
      .where(and(eq(proposalFiles.proposalId, proposalId), eq(proposalFiles.companyId, companyId)))
      .orderBy(proposalFiles.displayOrder);
  }

  async getProposalFileById(id: string, companyId: string): Promise<ProposalFile | undefined> {
    const result = await db.select().from(proposalFiles)
      .where(and(eq(proposalFiles.id, id), eq(proposalFiles.companyId, companyId)));
    return result[0];
  }

  async getProposalEstimatePdf(proposalId: string, companyId: string): Promise<ProposalFile | undefined> {
    const result = await db.select().from(proposalFiles)
      .where(and(
        eq(proposalFiles.proposalId, proposalId),
        eq(proposalFiles.companyId, companyId),
        eq(proposalFiles.fileType, "estimate_pdf")
      ));
    return result[0];
  }

  async createProposalFile(file: InsertProposalFile): Promise<ProposalFile> {
    const result = await db.insert(proposalFiles).values([file]).returning();
    return result[0];
  }

  async updateProposalFile(id: string, companyId: string, updates: { caption?: string | null }): Promise<ProposalFile | undefined> {
    const result = await db.update(proposalFiles)
      .set(updates)
      .where(and(eq(proposalFiles.id, id), eq(proposalFiles.companyId, companyId)))
      .returning();
    return result[0];
  }

  async deleteProposalFile(id: string, companyId: string): Promise<void> {
    await db.delete(proposalFiles).where(and(eq(proposalFiles.id, id), eq(proposalFiles.companyId, companyId)));
  }

  async createProposalVersion(v: InsertProposalVersion): Promise<ProposalVersion> {
    const result = await db.insert(proposalVersions).values([v]).returning();
    return result[0];
  }

  async getProposalVersions(proposalId: string, companyId: string): Promise<ProposalVersionWithUser[]> {
    const rows = await db
      .select({ version: proposalVersions, finalizedByName: users.name })
      .from(proposalVersions)
      .leftJoin(users, eq(proposalVersions.finalizedById, users.id))
      .where(and(eq(proposalVersions.proposalId, proposalId), eq(proposalVersions.companyId, companyId)))
      .orderBy(proposalVersions.versionNumber);
    return rows.map(r => ({ ...r.version, finalizedByName: r.finalizedByName ?? null }));
  }

  async getProposalVersionById(id: string, companyId: string): Promise<ProposalVersionWithUser | undefined> {
    const rows = await db
      .select({ version: proposalVersions, finalizedByName: users.name })
      .from(proposalVersions)
      .leftJoin(users, eq(proposalVersions.finalizedById, users.id))
      .where(and(eq(proposalVersions.id, id), eq(proposalVersions.companyId, companyId)));
    if (!rows[0]) return undefined;
    return { ...rows[0].version, finalizedByName: rows[0].finalizedByName ?? null };
  }

  async getNextVersionNumber(proposalId: string, companyId: string): Promise<number> {
    const result = await db
      .select({ maxVersion: max(proposalVersions.versionNumber) })
      .from(proposalVersions)
      .where(and(eq(proposalVersions.proposalId, proposalId), eq(proposalVersions.companyId, companyId)));
    return (result[0]?.maxVersion ?? 0) + 1;
  }

  // Visual Scope Sheets
  async getVisualScopeSheets(companyId: string): Promise<VisualScopeSheetWithCustomer[]> {
    const rows = await db
      .select({ sheet: visualScopeSheets, customerName: customers.name })
      .from(visualScopeSheets)
      .leftJoin(customers, eq(visualScopeSheets.customerId, customers.id))
      .where(eq(visualScopeSheets.companyId, companyId))
      .orderBy(desc(visualScopeSheets.createdAt));
    return rows.map(r => ({ ...r.sheet, customerName: r.customerName ?? "" }));
  }

  async getVisualScopeSheetsForCustomer(customerId: string, companyId: string): Promise<VisualScopeSheetWithCustomer[]> {
    const rows = await db
      .select({ sheet: visualScopeSheets, customerName: customers.name })
      .from(visualScopeSheets)
      .leftJoin(customers, eq(visualScopeSheets.customerId, customers.id))
      .where(and(eq(visualScopeSheets.customerId, customerId), eq(visualScopeSheets.companyId, companyId)))
      .orderBy(desc(visualScopeSheets.createdAt));
    return rows.map(r => ({ ...r.sheet, customerName: r.customerName ?? "" }));
  }

  async getVisualScopeSheet(id: string, companyId: string): Promise<VisualScopeSheetWithCustomer | undefined> {
    const rows = await db
      .select({
        sheet: visualScopeSheets,
        customerName: customers.name,
        customerStreet: customers.street,
        customerCity: customers.city,
        customerState: customers.state,
      })
      .from(visualScopeSheets)
      .leftJoin(customers, eq(visualScopeSheets.customerId, customers.id))
      .where(and(eq(visualScopeSheets.id, id), eq(visualScopeSheets.companyId, companyId)));
    if (!rows[0]) return undefined;
    return {
      ...rows[0].sheet,
      customerName: rows[0].customerName ?? "",
      customerStreet: rows[0].customerStreet,
      customerCity: rows[0].customerCity,
      customerState: rows[0].customerState,
    };
  }

  async createVisualScopeSheet(data: InsertVisualScopeSheet): Promise<VisualScopeSheet> {
    const [row] = await db.insert(visualScopeSheets).values(data as typeof visualScopeSheets.$inferInsert).returning();
    return row;
  }

  async updateVisualScopeSheet(id: string, companyId: string, data: Partial<InsertVisualScopeSheet>): Promise<VisualScopeSheet> {
    const [row] = await db
      .update(visualScopeSheets)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof visualScopeSheets.$inferInsert>)
      .where(and(eq(visualScopeSheets.id, id), eq(visualScopeSheets.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteVisualScopeSheet(id: string, companyId: string): Promise<void> {
    await db.delete(visualScopeSheets).where(and(eq(visualScopeSheets.id, id), eq(visualScopeSheets.companyId, companyId)));
  }

  async getCampaigns(companyId: string, assignedToId?: string): Promise<CampaignWithProgress[]> {
    const whereClause = assignedToId
      ? and(eq(campaigns.companyId, companyId), or(eq(campaigns.assignedToId, assignedToId), eq(campaigns.assignedToId2, assignedToId)))
      : eq(campaigns.companyId, companyId);
    const rows = await db.select().from(campaigns).where(whereClause).orderBy(desc(campaigns.createdAt));

    if (rows.length === 0) return [];

    // PERF: bulk-fetch all related data in 3 parallel queries instead of N×4 per-campaign queries
    const campaignIds = rows.map(c => c.id);
    const userIds = Array.from(new Set([
      ...rows.map(c => c.assignedToId).filter(Boolean),
      ...rows.map(c => c.assignedToId2).filter(Boolean),
      ...rows.map(c => c.createdById).filter(Boolean),
    ] as string[]));
    const seasonIds = Array.from(new Set(rows.map(c => c.seasonId).filter(Boolean) as string[]));

    const [allItems, allUsers, allSeasons] = await Promise.all([
      db.select().from(campaignItems).where(inArray(campaignItems.campaignId, campaignIds)),
      userIds.length > 0 ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
      seasonIds.length > 0 ? db.select({ id: seasons.id, name: seasons.name }).from(seasons).where(inArray(seasons.id, seasonIds)) : Promise.resolve([]),
    ]);

    const itemsByCampaignId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      if (!itemsByCampaignId.has(item.campaignId)) itemsByCampaignId.set(item.campaignId, []);
      itemsByCampaignId.get(item.campaignId)!.push(item);
    }
    const userNameById = new Map<string, string>(allUsers.map(u => [u.id, u.name]));
    const seasonNameById = new Map<string, string>(allSeasons.map(s => [s.id, s.name]));

    return rows.map(c => {
      const items = itemsByCampaignId.get(c.id) ?? [];
      return {
        ...c,
        totalItems: items.length,
        completedItems: items.filter(i => i.status === "completed").length,
        skippedItems: items.filter(i => i.status === "skipped").length,
        assignedToName: c.assignedToId ? userNameById.get(c.assignedToId) : undefined,
        assignedToName2: c.assignedToId2 ? userNameById.get(c.assignedToId2) : undefined,
        createdByName: c.createdById ? userNameById.get(c.createdById) : undefined,
        seasonName: c.seasonId ? seasonNameById.get(c.seasonId) : undefined,
      };
    });
  }

  async getCampaignById(id: string, companyId: string): Promise<Campaign | undefined> {
    const [row] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)));
    return row;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [row] = await db.insert(campaigns).values(campaign as typeof campaigns.$inferInsert).returning();
    return row;
  }

  async updateCampaign(id: string, companyId: string, updates: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const [row] = await db.update(campaigns).set({ ...updates, updatedAt: new Date() } as Partial<typeof campaigns.$inferInsert>).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))).returning();
    return row;
  }

  async deleteCampaign(id: string, companyId: string): Promise<void> {
    await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)));
  }

  async getCampaignItems(campaignId: string, companyId: string): Promise<CampaignItem[]> {
    return db.select().from(campaignItems).where(and(eq(campaignItems.campaignId, campaignId), eq(campaignItems.companyId, companyId)));
  }

  async getCampaignItemById(itemId: string, companyId: string): Promise<CampaignItem | undefined> {
    const rows = await db.select().from(campaignItems).where(and(eq(campaignItems.id, itemId), eq(campaignItems.companyId, companyId)));
    return rows[0];
  }

  async getCampaignItemsByCustomer(customerId: string, companyId: string): Promise<(CampaignItem & { campaignTitle: string; campaignCategory: string; campaignSubtype: string | null; campaignStatus: string; campaignWindowStart: string; campaignWindowEnd: string; seasonId: string | null })[]> {
    type Row = CampaignItem & { campaignTitle: string; campaignCategory: string; campaignSubtype: string | null; campaignStatus: string; campaignWindowStart: string; campaignWindowEnd: string; seasonId: string | null };
    const rows = await db
      .select({
        id: campaignItems.id,
        campaignId: campaignItems.campaignId,
        companyId: campaignItems.companyId,
        customerId: campaignItems.customerId,
        propertyId: campaignItems.propertyId,
        customerName: campaignItems.customerName,
        customerCity: campaignItems.customerCity,
        status: campaignItems.status,
        notes: campaignItems.notes,
        skipReason: campaignItems.skipReason,
        photos: campaignItems.photos,
        completedById: campaignItems.completedById,
        completedAt: campaignItems.completedAt,
        workflowStep: campaignItems.workflowStep,
        preCommSentAt: campaignItems.preCommSentAt,
        preCommSentById: campaignItems.preCommSentById,
        workCompletedAt: campaignItems.workCompletedAt,
        workCompletedById: campaignItems.workCompletedById,
        postCommSentAt: campaignItems.postCommSentAt,
        postCommSentById: campaignItems.postCommSentById,
        preCommEmailLogId: campaignItems.preCommEmailLogId,
        postCommEmailLogId: campaignItems.postCommEmailLogId,
        weatherTemp: campaignItems.weatherTemp,
        weatherWindSpeed: campaignItems.weatherWindSpeed,
        weatherWindDirection: campaignItems.weatherWindDirection,
        weatherHumidity: campaignItems.weatherHumidity,
        weatherConditions: campaignItems.weatherConditions,
        weatherRecordedAt: campaignItems.weatherRecordedAt,
        finishedWithoutComms: campaignItems.finishedWithoutComms,
        createdAt: campaignItems.createdAt,
        updatedAt: campaignItems.updatedAt,
        campaignTitle: campaigns.title,
        campaignCategory: campaigns.category,
        campaignSubtype: campaigns.subtype,
        campaignStatus: campaigns.status,
        campaignWindowStart: campaigns.windowStart,
        campaignWindowEnd: campaigns.windowEnd,
        seasonId: campaigns.seasonId,
      })
      .from(campaignItems)
      .innerJoin(campaigns, eq(campaignItems.campaignId, campaigns.id))
      .where(and(eq(campaignItems.customerId, customerId), eq(campaignItems.companyId, companyId)))
      .orderBy(desc(campaigns.windowStart));
    return rows as Row[];
  }

  async getCampaignItemsByProperty(propertyId: string, companyId: string): Promise<(CampaignItem & { campaignTitle: string; campaignCategory: string; campaignSubtype: string | null; campaignStatus: string; campaignWindowStart: string; campaignWindowEnd: string; seasonId: string | null })[]> {
    type Row = CampaignItem & { campaignTitle: string; campaignCategory: string; campaignSubtype: string | null; campaignStatus: string; campaignWindowStart: string; campaignWindowEnd: string; seasonId: string | null };
    const rows = await db
      .select({
        id: campaignItems.id,
        campaignId: campaignItems.campaignId,
        companyId: campaignItems.companyId,
        customerId: campaignItems.customerId,
        propertyId: campaignItems.propertyId,
        customerName: campaignItems.customerName,
        customerCity: campaignItems.customerCity,
        status: campaignItems.status,
        notes: campaignItems.notes,
        skipReason: campaignItems.skipReason,
        photos: campaignItems.photos,
        completedById: campaignItems.completedById,
        completedAt: campaignItems.completedAt,
        workflowStep: campaignItems.workflowStep,
        preCommSentAt: campaignItems.preCommSentAt,
        preCommSentById: campaignItems.preCommSentById,
        workCompletedAt: campaignItems.workCompletedAt,
        workCompletedById: campaignItems.workCompletedById,
        postCommSentAt: campaignItems.postCommSentAt,
        postCommSentById: campaignItems.postCommSentById,
        preCommEmailLogId: campaignItems.preCommEmailLogId,
        postCommEmailLogId: campaignItems.postCommEmailLogId,
        weatherTemp: campaignItems.weatherTemp,
        weatherWindSpeed: campaignItems.weatherWindSpeed,
        weatherWindDirection: campaignItems.weatherWindDirection,
        weatherHumidity: campaignItems.weatherHumidity,
        weatherConditions: campaignItems.weatherConditions,
        weatherRecordedAt: campaignItems.weatherRecordedAt,
        finishedWithoutComms: campaignItems.finishedWithoutComms,
        createdAt: campaignItems.createdAt,
        updatedAt: campaignItems.updatedAt,
        campaignTitle: campaigns.title,
        campaignCategory: campaigns.category,
        campaignSubtype: campaigns.subtype,
        campaignStatus: campaigns.status,
        campaignWindowStart: campaigns.windowStart,
        campaignWindowEnd: campaigns.windowEnd,
        seasonId: campaigns.seasonId,
      })
      .from(campaignItems)
      .innerJoin(campaigns, eq(campaignItems.campaignId, campaigns.id))
      .where(and(eq(campaignItems.propertyId, propertyId), eq(campaignItems.companyId, companyId)))
      .orderBy(desc(campaigns.windowStart));
    return rows as Row[];
  }

  async getCampaignItemsByCustomerId(customerId: string, companyId: string): Promise<(CampaignItem & { campaign: Campaign })[]> {
    const rows = await db
      .select({
        item: campaignItems,
        campaign: campaigns,
      })
      .from(campaignItems)
      .innerJoin(campaigns, and(eq(campaignItems.campaignId, campaigns.id), eq(campaigns.companyId, companyId)))
      .where(and(eq(campaignItems.customerId, customerId), eq(campaignItems.companyId, companyId)))
      .orderBy(desc(campaigns.windowStart));
    return rows.map(r => ({ ...r.item, campaign: r.campaign }));
  }

  async getCampaignItemsGlobal(companyId: string): Promise<(CampaignItem & { campaignTitle: string; campaignWindowStart: string; campaignWindowEnd: string; campaignCategory: string })[]> {
    const rows = await db
      .select({
        ...getTableColumns(campaignItems),
        campaignTitle: campaigns.title,
        campaignWindowStart: campaigns.windowStart,
        campaignWindowEnd: campaigns.windowEnd,
        campaignCategory: campaigns.category,
      })
      .from(campaignItems)
      .innerJoin(campaigns, eq(campaignItems.campaignId, campaigns.id))
      .where(and(eq(campaignItems.companyId, companyId), eq(campaigns.status, "active")))
      .orderBy(desc(campaigns.windowStart), asc(campaignItems.customerName));
    return rows;
  }

  async createCampaignItem(item: InsertCampaignItem): Promise<CampaignItem> {
    const dbItem: typeof campaignItems.$inferInsert = {
      ...item,
      status: item.status ?? "pending",
      workflowStep: item.workflowStep ?? null,
      wasBumpedToBackup: item.wasBumpedToBackup ?? false,
      weatherWindDirection: item.weatherWindDirection != null ? String(item.weatherWindDirection) : null,
    };
    const [row] = await db.insert(campaignItems).values(dbItem).returning();
    return row;
  }

  async updateCampaignItem(id: string, companyId: string, updates: Partial<InsertCampaignItem & { updatedAt: Date }>): Promise<CampaignItem | undefined> {
    const [row] = await db.update(campaignItems).set(updates as Partial<typeof campaignItems.$inferInsert>).where(and(eq(campaignItems.id, id), eq(campaignItems.companyId, companyId))).returning();
    return row;
  }

  async deleteCampaignItem(id: string, companyId: string): Promise<void> {
    await db.delete(campaignItems).where(and(eq(campaignItems.id, id), eq(campaignItems.companyId, companyId)));
  }

  async createCampaignWithItems(campaignData: InsertCampaign, itemsData: InsertCampaignItem[]): Promise<Campaign> {
    return db.transaction(async (tx) => {
      const [campaign] = await tx.insert(campaigns).values(campaignData as typeof campaigns.$inferInsert).returning();
      for (const item of itemsData) {
        const dbItem: typeof campaignItems.$inferInsert = {
          ...item,
          campaignId: campaign.id,
          status: item.status ?? "pending",
          workflowStep: item.workflowStep ?? null,
          wasBumpedToBackup: item.wasBumpedToBackup ?? false,
          weatherWindDirection: item.weatherWindDirection != null ? String(item.weatherWindDirection) : null,
        };
        await tx.insert(campaignItems).values(dbItem);
      }
      return campaign;
    });
  }

  async getSeasons(companyId: string): Promise<Season[]> {
    return db.select().from(seasons).where(eq(seasons.companyId, companyId)).orderBy(desc(seasons.createdAt));
  }

  async getSeasonById(id: string, companyId: string): Promise<Season | undefined> {
    const [row] = await db.select().from(seasons).where(and(eq(seasons.id, id), eq(seasons.companyId, companyId)));
    return row;
  }

  async createSeason(season: InsertSeason): Promise<Season> {
    const [row] = await db.insert(seasons).values(season as typeof seasons.$inferInsert).returning();
    return row;
  }

  async updateSeason(id: string, companyId: string, updates: Partial<InsertSeason>): Promise<Season | undefined> {
    const [row] = await db.update(seasons).set({ ...updates, updatedAt: new Date() } as Partial<typeof seasons.$inferInsert>).where(and(eq(seasons.id, id), eq(seasons.companyId, companyId))).returning();
    return row;
  }

  async deleteSeason(id: string, companyId: string): Promise<void> {
    await db.delete(seasons).where(and(eq(seasons.id, id), eq(seasons.companyId, companyId)));
  }

  async getCampaignChecklistTasks(campaignId: string): Promise<CampaignChecklistTask[]> {
    return db.select().from(campaignChecklistTasks).where(eq(campaignChecklistTasks.campaignId, campaignId)).orderBy(campaignChecklistTasks.order);
  }

  async createCampaignChecklistTask(task: InsertCampaignChecklistTask): Promise<CampaignChecklistTask> {
    const [row] = await db.insert(campaignChecklistTasks).values(task as typeof campaignChecklistTasks.$inferInsert).returning();
    return row;
  }

  async getCampaignItemTaskCompletions(campaignItemId: string): Promise<CampaignItemTaskCompletion[]> {
    return db.select().from(campaignItemTaskCompletions).where(eq(campaignItemTaskCompletions.campaignItemId, campaignItemId));
  }

  async createCampaignItemTaskCompletion(completion: InsertCampaignItemTaskCompletion): Promise<CampaignItemTaskCompletion> {
    const [row] = await db.insert(campaignItemTaskCompletions).values(completion as typeof campaignItemTaskCompletions.$inferInsert).returning();
    return row;
  }

  async deleteCampaignItemTaskCompletion(campaignItemId: string, campaignChecklistTaskId: string): Promise<void> {
    await db.delete(campaignItemTaskCompletions).where(
      and(
        eq(campaignItemTaskCompletions.campaignItemId, campaignItemId),
        eq(campaignItemTaskCompletions.campaignChecklistTaskId, campaignChecklistTaskId)
      )
    );
  }

  async createCampaignChecklistAuditLog(entry: InsertCampaignChecklistAuditLog): Promise<CampaignChecklistAuditLog> {
    const [row] = await db.insert(campaignChecklistAuditLogTable).values(entry as typeof campaignChecklistAuditLogTable.$inferInsert).returning();
    return row;
  }

  async getCampaignChecklistAuditLog(campaignItemId: string): Promise<CampaignChecklistAuditLogWithUser[]> {
    const rows = await db.select({
      log: campaignChecklistAuditLogTable,
      userName: users.name,
      taskLabel: campaignChecklistTasks.label,
    })
      .from(campaignChecklistAuditLogTable)
      .leftJoin(users, eq(campaignChecklistAuditLogTable.userId, users.id))
      .leftJoin(campaignChecklistTasks, eq(campaignChecklistAuditLogTable.campaignChecklistTaskId, campaignChecklistTasks.id))
      .where(eq(campaignChecklistAuditLogTable.campaignItemId, campaignItemId))
      .orderBy(desc(campaignChecklistAuditLogTable.timestamp));
    return rows.map(r => ({
      ...r.log,
      userName: r.userName ?? undefined,
      taskLabel: r.taskLabel ?? undefined,
    }));
  }

  async toggleCampaignChecklistTaskTx(params: {
    campaignItemId: string;
    taskId: string;
    userId: string;
    currentlyCompleted: boolean;
  }): Promise<{ action: "completed" | "uncompleted" }> {
    const { campaignItemId, taskId, userId, currentlyCompleted } = params;
    const action: "completed" | "uncompleted" = currentlyCompleted ? "uncompleted" : "completed";

    await db.transaction(async (tx) => {
      if (currentlyCompleted) {
        await tx.delete(campaignItemTaskCompletions).where(
          and(
            eq(campaignItemTaskCompletions.campaignItemId, campaignItemId),
            eq(campaignItemTaskCompletions.campaignChecklistTaskId, taskId)
          )
        );
      } else {
        await tx.insert(campaignItemTaskCompletions).values({
          campaignItemId,
          campaignChecklistTaskId: taskId,
          completedById: userId,
        } as typeof campaignItemTaskCompletions.$inferInsert);
      }
      await tx.insert(campaignChecklistAuditLogTable).values({
        campaignItemId,
        campaignChecklistTaskId: taskId,
        userId,
        action,
      } as typeof campaignChecklistAuditLogTable.$inferInsert);
    });

    return { action };
  }

  async getCommunications(companyId: string, filters?: { view?: string; customerId?: string; type?: string; sentById?: string; search?: string; startDate?: Date; endDate?: Date; status?: string; fromDate?: string; toDate?: string; threadId?: string }, scope?: VisibleMailboxes): Promise<CommunicationWithDetails[]> {
    // Build SQL WHERE conditions — push as many filters to the DB as possible
    const conditions: (ReturnType<typeof eq> | ReturnType<typeof and> | ReturnType<typeof or> | ReturnType<typeof sql> | undefined)[] = [
      eq(communications.companyId, companyId),
    ];

    if (filters?.status) {
      conditions.push(eq(communications.status, filters.status as "draft" | "sent" | "failed" | "scheduled"));
    }
    if (filters?.type) {
      conditions.push(eq(communications.type, filters.type as "email" | "note" | "sms" | "letter"));
    }
    if (filters?.customerId) {
      conditions.push(eq(communications.customerId, filters.customerId));
    }
    if (filters?.threadId) {
      conditions.push(eq(communications.threadId, filters.threadId));
    }

    // Push view filter to SQL
    if (filters?.view === "drafts") {
      conditions.push(eq(communications.status, "draft"));
    } else if (filters?.view === "sent") {
      conditions.push(eq(communications.status, "sent"));
    } else if (filters?.view === "scheduled") {
      conditions.push(
        and(
          eq(communications.status, "scheduled"),
          sql`(${communications.scheduledFor} IS NULL OR ${communications.scheduledFor} > NOW())`
        )
      );
    } else if (filters?.view === "followups") {
      conditions.push(
        or(eq(communications.followUpStatus, "open"), eq(communications.followUpStatus, "snoozed"))
      );
    }

    // Push sentById filter to SQL
    if (filters?.sentById) {
      conditions.push(eq(communications.sentById, filters.sentById));
    }

    // Push date range filters to SQL
    if (filters?.startDate) {
      conditions.push(sql`COALESCE(${communications.sentAt}, ${communications.receivedAt}, ${communications.createdAt}) >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`COALESCE(${communications.sentAt}, ${communications.receivedAt}, ${communications.createdAt}) <= ${filters.endDate}`);
    }
    if (filters?.fromDate) {
      const from = new Date(filters.fromDate);
      conditions.push(sql`COALESCE(${communications.sentAt}, ${communications.receivedAt}, ${communications.createdAt}) >= ${from}`);
    }
    if (filters?.toDate) {
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      conditions.push(sql`COALESCE(${communications.sentAt}, ${communications.receivedAt}, ${communications.createdAt}) <= ${to}`);
    }

    // Push content search to SQL (subject, body, address); customer-name search stays in JS post-fetch
    if (filters?.search) {
      const s = '%' + filters.search.toLowerCase() + '%';
      conditions.push(
        or(
          sql`lower(${communications.subject}) like ${s}`,
          sql`lower(${communications.body}) like ${s}`,
          sql`lower(COALESCE(${communications.bodyText}, '')) like ${s}`,
          sql`lower(COALESCE(${communications.fromAddress}, '')) like ${s}`
        )
      );
    }

    // Mailbox scope filter
    if (scope) {
      const { mailboxIds, includeNullMailbox, nullMailboxSentByUserId } = scope;
      if (mailboxIds !== null) {
        const nullPart = includeNullMailbox
          ? sql`${communications.mailboxAccountId} IS NULL`
          : nullMailboxSentByUserId
            ? sql`(${communications.mailboxAccountId} IS NULL AND ${communications.sentById} = ${nullMailboxSentByUserId})`
            : null;

        if (mailboxIds.length === 0 && !nullPart) {
          return [];
        }

        const parts: (ReturnType<typeof sql> | ReturnType<typeof inArray>)[] = [];
        if (mailboxIds.length > 0) parts.push(inArray(communications.mailboxAccountId, mailboxIds));
        if (nullPart) parts.push(nullPart);

        if (parts.length === 1) {
          conditions.push(parts[0]);
        } else if (parts.length > 1) {
          conditions.push(or(...parts));
        }
      }
    }

    const rows = await db.select({
      comm: communications,
      customerName: customers.name,
      contactName: contacts.name,
      sentByName: users.name,
      templateName: communicationTemplates.name,
    })
      .from(communications)
      .leftJoin(customers, eq(communications.customerId, customers.id))
      .leftJoin(contacts, eq(communications.contactId, contacts.id))
      .leftJoin(users, eq(communications.sentById, users.id))
      .leftJoin(communicationTemplates, eq(communications.templateId, communicationTemplates.id))
      .where(and(...conditions.filter((c): c is Exclude<typeof c, undefined> => c !== undefined)))
      .orderBy(desc(sql`COALESCE(${communications.sentAt}, ${communications.receivedAt}, ${communications.createdAt})`))
      .limit(500); // PERF: hard cap to prevent unbounded payload

    const threadIds = Array.from(new Set(rows.map(r => r.comm.threadId).filter(Boolean)));
    const replyCounts = new Map<string, number>();
    if (threadIds.length > 0) {
      const allThreadComms = await db.select({ threadId: communications.threadId, count: sql<number>`count(*)` })
        .from(communications)
        .where(and(eq(communications.companyId, companyId), inArray(communications.threadId, threadIds as string[])))
        .groupBy(communications.threadId);
      for (const row of allThreadComms) {
        if (row.threadId) replyCounts.set(row.threadId, Number(row.count));
      }
    }

    const now = new Date();
    let result = rows.map(r => ({
      ...r.comm,
      customerName: r.customerName ?? undefined,
      contactName: r.contactName ?? undefined,
      sentByName: r.sentByName ?? undefined,
      templateName: r.templateName ?? undefined,
      replyCount: r.comm.threadId ? (replyCounts.get(r.comm.threadId) ?? 1) - 1 : 0,
      isOverdue: r.comm.followUpStatus === "open" && r.comm.followUpDueAt != null && r.comm.followUpDueAt < now,
    })) as CommunicationWithDetails[];

    // Customer-name search stays in JS (not pushed to SQL) per phase-3 spec
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(c =>
        c.customerName?.toLowerCase().includes(s) ||
        c.subject?.toLowerCase().includes(s) ||
        c.body?.toLowerCase().includes(s) ||
        c.bodyText?.toLowerCase().includes(s) ||
        c.fromAddress?.toLowerCase().includes(s)
      );
    }

    return result;
  }

  async getCommunicationByProviderMessageId(companyId: string, providerMessageId: string): Promise<Communication | null> {
    const [row] = await db.select()
      .from(communications)
      .where(and(eq(communications.companyId, companyId), eq(communications.providerMessageId, providerMessageId)))
      .limit(1);
    return row ?? null;
  }

  async getCommunicationById(id: string, companyId: string): Promise<CommunicationWithDetails | undefined> {
    const rows = await db.select({
      comm: communications,
      customerName: customers.name,
      contactName: contacts.name,
      sentByName: users.name,
      templateName: communicationTemplates.name,
    })
      .from(communications)
      .leftJoin(customers, eq(communications.customerId, customers.id))
      .leftJoin(contacts, eq(communications.contactId, contacts.id))
      .leftJoin(users, eq(communications.sentById, users.id))
      .leftJoin(communicationTemplates, eq(communications.templateId, communicationTemplates.id))
      .where(and(eq(communications.id, id), eq(communications.companyId, companyId)));
    if (!rows[0]) return undefined;
    const row = rows[0];
    const now = new Date();
    return {
      ...row.comm,
      customerName: row.customerName ?? undefined,
      contactName: row.contactName ?? undefined,
      sentByName: row.sentByName ?? undefined,
      templateName: row.templateName ?? undefined,
      isOverdue: row.comm.followUpStatus === "open" && row.comm.followUpDueAt != null && row.comm.followUpDueAt < now,
    };
  }

  async createCommunication(communication: InsertCommunication): Promise<Communication> {
    const [row] = await db.insert(communications).values(communication as typeof communications.$inferInsert).returning();
    return row;
  }

  async updateCommunication(id: string, companyId: string, updates: Partial<InsertCommunication>): Promise<Communication | undefined> {
    const [row] = await db.update(communications)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof communications.$inferInsert>)
      .where(and(eq(communications.id, id), eq(communications.companyId, companyId)))
      .returning();
    return row;
  }
  async deleteCommunication(id: string, companyId: string): Promise<void> {
    await db.delete(communications).where(and(eq(communications.id, id), eq(communications.companyId, companyId)));
  }

  async getCommunicationStats(companyId: string): Promise<{ drafts: number; scheduledToday: number; openFollowUps: number; overdueFollowUps: number }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [draftsResult, scheduledTodayResult, openFollowUpsResult, overdueFollowUpsResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(communications).where(and(
        eq(communications.companyId, companyId),
        sql`${communications.status} = 'draft'`
      )),
      db.select({ count: sql<number>`count(*)::int` }).from(communications).where(and(
        eq(communications.companyId, companyId),
        sql`${communications.status} = 'scheduled'`,
        sql`${communications.scheduledFor} >= ${todayStart} AND ${communications.scheduledFor} < ${todayEnd}`
      )),
      db.select({ count: sql<number>`count(*)::int` }).from(communications).where(and(
        eq(communications.companyId, companyId),
        sql`${communications.followUpStatus} = 'open'`
      )),
      db.select({ count: sql<number>`count(*)::int` }).from(communications).where(and(
        eq(communications.companyId, companyId),
        sql`${communications.followUpStatus} IN ('open', 'snoozed')`,
        sql`${communications.followUpDueAt} < ${now}`
      )),
    ]);

    return {
      drafts: draftsResult[0]?.count ?? 0,
      scheduledToday: scheduledTodayResult[0]?.count ?? 0,
      openFollowUps: openFollowUpsResult[0]?.count ?? 0,
      overdueFollowUps: overdueFollowUpsResult[0]?.count ?? 0,
    };
  }

  async getCommunicationTemplates(companyId: string, includeArchived = false): Promise<CommunicationTemplate[]> {
    const conditions = [eq(communicationTemplates.companyId, companyId)];
    if (!includeArchived) {
      conditions.push(eq(communicationTemplates.isArchived, false));
    }
    return db.select().from(communicationTemplates).where(and(...conditions)).orderBy(communicationTemplates.name);
  }

  async getCommunicationTemplateById(id: string, companyId: string): Promise<CommunicationTemplate | undefined> {
    const [row] = await db.select().from(communicationTemplates)
      .where(and(eq(communicationTemplates.id, id), eq(communicationTemplates.companyId, companyId)));
    return row;
  }

  async createCommunicationTemplate(template: InsertCommunicationTemplate): Promise<CommunicationTemplate> {
    const [row] = await db.insert(communicationTemplates).values(template as typeof communicationTemplates.$inferInsert).returning();
    return row;
  }

  async updateCommunicationTemplate(id: string, companyId: string, updates: Partial<InsertCommunicationTemplate>): Promise<CommunicationTemplate | undefined> {
    const [row] = await db.update(communicationTemplates)
      .set({ ...updates, updatedAt: new Date() } as typeof communicationTemplates.$inferInsert)
      .where(and(eq(communicationTemplates.id, id), eq(communicationTemplates.companyId, companyId)))
      .returning();
    return row;
  }

  async getCommunicationLinks(communicationId: string, companyId: string): Promise<CommunicationLink[]> {
    return db.select().from(communicationLinks).where(and(eq(communicationLinks.communicationId, communicationId), eq(communicationLinks.companyId, companyId)));
  }

  async createCommunicationLink(link: InsertCommunicationLink): Promise<CommunicationLink> {
    const [row] = await db.insert(communicationLinks).values(link as typeof communicationLinks.$inferInsert).returning();
    return row;
  }
  async getCommunicationAnalytics(companyId: string, startDate: Date, endDate: Date): Promise<CommunicationAnalytics> {
    const { count, gte, lte, lt } = await import("drizzle-orm");
    const now = new Date();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const allSent = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "sent"),
          gte(communications.sentAt, startDate),
          lte(communications.sentAt, endDate)
        )
      );

    const sentThisWeek = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "sent"),
          gte(communications.sentAt, weekAgo)
        )
      );

    const sentThisMonth = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "sent"),
          gte(communications.sentAt, monthAgo)
        )
      );

    const scheduled = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "scheduled")
        )
      );

    const openFollowUps = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.followUpStatus, "open")
        )
      );

    const followUpsDueThisWeek = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.followUpStatus, "open"),
          gte(communications.followUpDueAt, now),
          lte(communications.followUpDueAt, weekAgo)
        )
      );

    const byType = await db
      .select({
        type: communications.type,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .where(and(eq(communications.companyId, companyId), eq(communications.status, "sent")))
      .groupBy(communications.type);

    const byStaff = await db
      .select({
        userId: communications.sentById,
        userName: users.name,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .leftJoin(users, eq(communications.sentById, users.id))
      .where(and(eq(communications.companyId, companyId), eq(communications.status, "sent")))
      .groupBy(communications.sentById, users.name)
      .orderBy(desc(sql`count`))
      .limit(5);

    const byCustomer = await db
      .select({
        customerId: communications.customerId,
        customerName: customers.name,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .leftJoin(customers, eq(communications.customerId, customers.id))
      .where(and(eq(communications.companyId, companyId), eq(communications.status, "sent")))
      .groupBy(communications.customerId, customers.name)
      .orderBy(desc(sql`count`))
      .limit(5);

    const byTemplate = await db
      .select({
        templateId: communications.templateId,
        templateName: communicationTemplates.name,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .leftJoin(communicationTemplates, eq(communications.templateId, communicationTemplates.id))
      .where(and(eq(communications.companyId, companyId), eq(communications.status, "sent")))
      .groupBy(communications.templateId, communicationTemplates.name)
      .orderBy(desc(sql`count`))
      .limit(5);

    return {
      totalSentPeriod: allSent[0].count,
      totalSentThisWeek: sentThisWeek[0].count,
      totalSentThisMonth: sentThisMonth[0].count,
      draftsCount: scheduled[0].count,
      overdueFollowUpsCount: openFollowUps[0].count,
      sentByType: byType.map(r => ({ type: r.type || "unknown", count: r.count })),
      sentByStaff: byStaff.map(r => ({ userId: r.userId || "unknown", userName: r.userName || "Unknown", count: r.count })),
      topCustomers: byCustomer.map(r => ({ customerId: r.customerId || "unknown", customerName: r.customerName || "Unknown", count: r.count })),
      topTemplates: byTemplate.map(r => ({ templateId: r.templateId || "unknown", templateName: r.templateName || "Unknown", count: r.count })),
    };
  }

  async seedCommunications(companyId: string, userId: string, customerIds: string[]): Promise<void> {
    const templates = await this.getCommunicationTemplates(companyId);
    if (templates.length === 0) return;

    const templateData = [
      { companyId, name: "Welcome Email", type: "email" as const, category: "general_outreach" as const, isActive: true, isArchived: false, defaultCommunicationType: "email" as const, subject: "Welcome to High Plains Property Maintenance", body: "Dear valued customer,\n\nWelcome to High Plains! We are thrilled to have you as a client..." },
      { companyId, name: "Service Reminder SMS", type: "sms" as const, category: "general_outreach" as const, isActive: true, isArchived: false, defaultCommunicationType: "sms" as const, subject: null, body: "Hi! Your scheduled service is coming up this week. We'll be there bright and early!" },
      { companyId, name: "Seasonal Check-In", type: "email" as const, category: "general_outreach" as const, isActive: true, isArchived: false, defaultCommunicationType: "email" as const, subject: "Seasonal Service Update", body: "As we head into the new season, we wanted to reach out about your property..." },
    ];

    const insertedTemplates: CommunicationTemplate[] = [];
    for (const t of templateData) {
      const tmpl = await this.createCommunicationTemplate(t);
      insertedTemplates.push(tmpl);
    }

    const now = new Date();
    const daysAgo = (d: number) => { const dt = new Date(now); dt.setDate(dt.getDate() - d); return dt; };

    const seedData = customerIds.slice(0, 6).map((custId, i) => ({
      companyId,
      customerId: custId,
      sentById: userId,
      templateId: i < insertedTemplates.length ? insertedTemplates[i % insertedTemplates.length].id : null,
      type: (["email", "email", "sms", "note", "email", "letter"] as const)[i],
      status: (["sent", "sent", "sent", "sent", "draft", "sent"] as const)[i],
      subject: ["Service Update", "Spring Services Ready", null, null, "Follow-up needed", "Service Agreement"][i],
      body: ["Your property maintenance has been scheduled for next week.", "Spring services are ready to begin — please confirm.", "Reminder: service visit tomorrow at 8am.", "Called customer — no answer. Will follow up.", "Need to follow up on proposal.", "Please find attached your service agreement for the upcoming season."][i],
      sentAt: [daysAgo(3), daysAgo(7), daysAgo(1), daysAgo(10), null, daysAgo(14)][i],
      followUpStatus: (["none", "open", "none", "none", "none", "done"] as const)[i],
      followUpDueAt: [null, daysAgo(-2), null, null, null, daysAgo(5)][i],
    }));

    for (const comm of seedData) {
      await this.createCommunication(comm as InsertCommunication);
    }
  }

  async getCommunicationThreads(companyId: string, filters?: { customerId?: string }): Promise<CommunicationThread[]> {
    return db.select().from(communicationThreads)
      .where(and(
        eq(communicationThreads.companyId, companyId),
        filters?.customerId ? eq(communicationThreads.customerId, filters.customerId) : undefined,
      ))
      .orderBy(desc(communicationThreads.updatedAt));
  }

  async getCommunicationThreadById(id: string, companyId: string): Promise<CommunicationThread | undefined> {
    const [row] = await db.select().from(communicationThreads)
      .where(and(eq(communicationThreads.id, id), eq(communicationThreads.companyId, companyId)));
    return row;
  }

  async createCommunicationThread(thread: InsertCommunicationThread): Promise<CommunicationThread> {
    const [row] = await db.insert(communicationThreads).values(thread as typeof communicationThreads.$inferInsert).returning();
    return row;
  }

  async getThreadMessages(threadId: string, companyId: string): Promise<CommunicationWithDetails[]> {
    const rows = await db.select({
      comm: communications,
      customerName: customers.name,
      contactName: contacts.name,
      sentByName: users.name,
    })
      .from(communications)
      .leftJoin(customers, eq(communications.customerId, customers.id))
      .leftJoin(contacts, eq(communications.contactId, contacts.id))
      .leftJoin(users, eq(communications.sentById, users.id))
      .where(and(eq(communications.threadId, threadId), eq(communications.companyId, companyId)))
      .orderBy(communications.createdAt);

    return rows.map(row => ({
      ...row.comm,
      customerName: row.customerName ?? undefined,
      contactName: row.contactName ?? undefined,
      sentByName: row.sentByName ?? undefined,
    }));
  }

  async createCommunicationAuditLog(entry: InsertCommunicationAuditLog): Promise<CommunicationAuditLog> {
    const [row] = await db.insert(communicationAuditLog).values(entry as typeof communicationAuditLog.$inferInsert).returning();
    return row;
  }

  async getCommunicationAuditLogs(companyId: string, limit = 200): Promise<CommunicationAuditLogWithUser[]> {
    const rows = await db
      .select({
        id: communicationAuditLog.id,
        companyId: communicationAuditLog.companyId,
        communicationId: communicationAuditLog.communicationId,
        templateId: communicationAuditLog.templateId,
        actionType: communicationAuditLog.actionType,
        actionByUserId: communicationAuditLog.actionByUserId,
        actionDetails: communicationAuditLog.actionDetails,
        createdAt: communicationAuditLog.createdAt,
        actionByUserName: users.name,
      })
      .from(communicationAuditLog)
      .leftJoin(users, eq(communicationAuditLog.actionByUserId, users.id))
      .where(eq(communicationAuditLog.companyId, companyId))
      .orderBy(desc(communicationAuditLog.createdAt))
      .limit(limit);
    return rows;
  }

  async getCommunicationAutomationRules(companyId: string): Promise<CommunicationAutomationRule[]> {
    return db.select().from(communicationAutomationRules)
      .where(eq(communicationAutomationRules.companyId, companyId))
      .orderBy(communicationAutomationRules.createdAt);
  }

  async getCommunicationAutomationRuleById(id: string, companyId: string): Promise<CommunicationAutomationRule | undefined> {
    const [row] = await db.select().from(communicationAutomationRules)
      .where(and(eq(communicationAutomationRules.id, id), eq(communicationAutomationRules.companyId, companyId)));
    return row;
  }

  async createCommunicationAutomationRule(rule: InsertCommunicationAutomationRule): Promise<CommunicationAutomationRule> {
    const [row] = await db.insert(communicationAutomationRules).values(rule as typeof communicationAutomationRules.$inferInsert).returning();
    return row;
  }

  async updateCommunicationAutomationRule(id: string, companyId: string, updates: Partial<InsertCommunicationAutomationRule>): Promise<CommunicationAutomationRule | undefined> {
    const [row] = await db.update(communicationAutomationRules)
      .set(updates as Partial<typeof communicationAutomationRules.$inferInsert>)
      .where(and(eq(communicationAutomationRules.id, id), eq(communicationAutomationRules.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteCommunicationAutomationRule(id: string, companyId: string): Promise<void> {
    await db.delete(communicationAutomationRules)
      .where(and(eq(communicationAutomationRules.id, id), eq(communicationAutomationRules.companyId, companyId)));
  }

  async updateCommunicationAutomationRuleLastRun(id: string, companyId: string): Promise<void> {
    await db.update(communicationAutomationRules)
      .set({ lastRunAt: new Date() })
      .where(and(eq(communicationAutomationRules.id, id), eq(communicationAutomationRules.companyId, companyId)));
  }

  async getServicePlanTemplates(companyId: string): Promise<ServicePlanTemplateWithItems[]> {
    const templates = await db.select().from(servicePlanTemplates)
      .where(eq(servicePlanTemplates.companyId, companyId))
      .orderBy(servicePlanTemplates.name);
    const allItems = templates.length > 0
      ? await db.select().from(servicePlanTemplateItems)
          .where(inArray(servicePlanTemplateItems.templateId, templates.map(t => t.id)))
      : [];
    const customerCounts = templates.length > 0
      ? await db.select({
          templateId: customerServicePlans.sourceTemplateId,
          count: sql<number>`cast(count(distinct ${customerServicePlans.customerId}) as integer)`,
        })
        .from(customerServicePlans)
        .where(and(
          eq(customerServicePlans.companyId, companyId),
          inArray(customerServicePlans.sourceTemplateId, templates.map(t => t.id)),
        ))
        .groupBy(customerServicePlans.sourceTemplateId)
      : [];
    const countMap = new Map(customerCounts.map(r => [r.templateId, r.count]));
    return templates.map(t => ({
      ...t,
      items: allItems.filter(i => i.templateId === t.id),
      customerCount: countMap.get(t.id) ?? 0,
    }));
  }

  async getServicePlanTemplateById(id: string, companyId: string): Promise<ServicePlanTemplateWithItems | undefined> {
    const [template] = await db.select().from(servicePlanTemplates)
      .where(and(eq(servicePlanTemplates.id, id), eq(servicePlanTemplates.companyId, companyId)));
    if (!template) return undefined;
    const items = await db.select().from(servicePlanTemplateItems)
      .where(eq(servicePlanTemplateItems.templateId, id));
    const [countRow] = await db.select({
      count: sql<number>`cast(count(distinct ${customerServicePlans.customerId}) as integer)`,
    })
    .from(customerServicePlans)
    .where(and(
      eq(customerServicePlans.companyId, companyId),
      eq(customerServicePlans.sourceTemplateId, id),
    ));
    return { ...template, items, customerCount: countRow?.count ?? 0 };
  }

  async createServicePlanTemplate(template: InsertServicePlanTemplate): Promise<ServicePlanTemplate> {
    const [row] = await db.insert(servicePlanTemplates).values(template as typeof servicePlanTemplates.$inferInsert).returning();
    return row;
  }

  async updateServicePlanTemplate(id: string, companyId: string, updates: Partial<InsertServicePlanTemplate>): Promise<ServicePlanTemplate | undefined> {
    const [row] = await db.update(servicePlanTemplates)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof servicePlanTemplates.$inferInsert>)
      .where(and(eq(servicePlanTemplates.id, id), eq(servicePlanTemplates.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteServicePlanTemplate(id: string, companyId: string): Promise<void> {
    await db.delete(servicePlanTemplates)
      .where(and(eq(servicePlanTemplates.id, id), eq(servicePlanTemplates.companyId, companyId)));
  }

  async upsertServicePlanTemplateItems(templateId: string, items: Array<{ serviceCategory: ServicePlanCategory; defaultAnnualQuantity: number }>): Promise<ServicePlanTemplateItem[]> {
    await db.delete(servicePlanTemplateItems)
      .where(eq(servicePlanTemplateItems.templateId, templateId));
    if (items.length === 0) return [];
    const rows = await db.insert(servicePlanTemplateItems).values(
      items.map(i => ({ templateId, serviceCategory: i.serviceCategory, defaultAnnualQuantity: i.defaultAnnualQuantity }))
    ).returning();
    return rows;
  }

  async getCustomerServicePlans(customerId: string, companyId: string, year?: number): Promise<CustomerServicePlan[]> {
    const conditions = [
      eq(customerServicePlans.customerId, customerId),
      eq(customerServicePlans.companyId, companyId),
    ];
    if (year !== undefined) {
      conditions.push(eq(customerServicePlans.year, year));
    }
    return db.select().from(customerServicePlans).where(and(...conditions));
  }

  async createCustomerServicePlan(plan: InsertCustomerServicePlan): Promise<CustomerServicePlan> {
    const [row] = await db.insert(customerServicePlans).values(plan as typeof customerServicePlans.$inferInsert).returning();
    return row;
  }

  async updateCustomerServicePlan(id: string, customerId: string, companyId: string, updates: Partial<InsertCustomerServicePlan>): Promise<CustomerServicePlan | undefined> {
    const [row] = await db.update(customerServicePlans)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof customerServicePlans.$inferInsert>)
      .where(and(
        eq(customerServicePlans.id, id),
        eq(customerServicePlans.customerId, customerId),
        eq(customerServicePlans.companyId, companyId),
      ))
      .returning();
    return row;
  }

  async deleteCustomerServicePlan(id: string, customerId: string, companyId: string): Promise<void> {
    await db.delete(customerServicePlans)
      .where(and(
        eq(customerServicePlans.id, id),
        eq(customerServicePlans.customerId, customerId),
        eq(customerServicePlans.companyId, companyId),
      ));
  }

  async getServiceFulfillment(customerId: string, companyId: string, year: number): Promise<ServiceFulfillmentRow[]> {
    const plans = await db.select().from(customerServicePlans)
      .where(and(
        eq(customerServicePlans.customerId, customerId),
        eq(customerServicePlans.companyId, companyId),
        eq(customerServicePlans.year, year),
      ));
    if (plans.length === 0) return [];

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Campaign items are the primary source for scheduled/completed counts.
    // Explicit service_plan_category takes precedence; falls back to campaign type+subtype inference.
    // "general" campaigns produce a NULL category and are excluded.
    const campaignItemCounts = await db.execute(sql`
      SELECT
        COALESCE(ci.service_plan_category, (
          CASE
            WHEN c.category = 'chemical'                                       THEN 'chemical'
            WHEN c.category = 'irrigation' AND COALESCE(c.subtype,'') = 'spring_turn_on'  THEN 'irrigation_open'
            WHEN c.category = 'irrigation' AND COALESCE(c.subtype,'') = 'winterization'   THEN 'irrigation_winterization'
            WHEN c.category = 'irrigation'                                     THEN 'irrigation_close'
            ELSE NULL
          END
        )) as service_category,
        COUNT(*) FILTER (WHERE ci.status != 'skipped') as scheduled_count,
        COUNT(*) FILTER (WHERE ci.status = 'completed') as completed_count
      FROM campaign_items ci
      JOIN campaigns c ON ci.campaign_id = c.id
      WHERE ci.customer_id = ${customerId}
        AND ci.company_id = ${companyId}
        AND c.window_start <= ${yearEnd}::date
        AND c.window_end >= ${yearStart}::date
      GROUP BY 1
    `);

    // Tickets supplement completed counts for ticket-tracked categories.
    // Only completed_at (year-filtered) contributes; tickets do not affect scheduledCount.
    const ticketCounts = await db.execute(sql`
      SELECT
        t.service_type,
        COUNT(*) FILTER (
          WHERE t.completed_at IS NOT NULL
            AND EXTRACT(YEAR FROM t.completed_at) = ${year}
        ) as completed_count
      FROM tickets t
      WHERE t.customer_id = ${customerId}
        AND t.company_id = ${companyId}
        AND t.service_type IS NOT NULL
      GROUP BY t.service_type
    `);

    type CampaignAggRow = { service_category: string | null; scheduled_count: string | number; completed_count: string | number };
    type TicketAggRow = { service_type: string; completed_count: string | number };

    const campaignRows: CampaignAggRow[] = (campaignItemCounts.rows ?? campaignItemCounts) as CampaignAggRow[];
    const ticketRows: TicketAggRow[] = (ticketCounts.rows ?? ticketCounts) as TicketAggRow[];

    // Build campaign lookup: service_category -> { scheduled, completed }
    // Null service_category rows (general campaigns without explicit tagging) are skipped.
    const campaignMap: Record<string, { scheduled: number; completed: number }> = {};
    for (const row of campaignRows) {
      if (!row.service_category) continue;
      const cat = row.service_category;
      campaignMap[cat] = {
        scheduled: (campaignMap[cat]?.scheduled ?? 0) + Number(row.scheduled_count),
        completed: (campaignMap[cat]?.completed ?? 0) + Number(row.completed_count),
      };
    }

    // Build ticket lookup: service_type -> completed count (tickets only affect completedCount)
    const ticketMap: Record<string, { completed: number }> = {};
    for (const row of ticketRows) {
      ticketMap[row.service_type] = {
        completed: Number(row.completed_count),
      };
    }

    return plans.map(plan => {
      const cat = plan.serviceCategory as ServicePlanCategory;

      // scheduled = campaign items (not skipped) mapped to this service category
      const scheduledCount = campaignMap[cat]?.scheduled ?? 0;

      // completed = completed campaign items + tickets with completedAt in the target year
      const completedCount = (campaignMap[cat]?.completed ?? 0) + (ticketMap[cat]?.completed ?? 0);

      return {
        serviceCategory: cat,
        expectedQuantity: plan.expectedQuantity,
        scheduledCount,
        completedCount,
        notes: plan.notes,
        planId: plan.id,
      };
    });
  }

  // ─── Style Presets ──────────────────────────────────────────────────────────

  async getStylePresets(companyId: string): Promise<StylePreset[]> {
    const rows = await db
      .select()
      .from(stylePresets)
      .where(
        or(
          eq(stylePresets.companyId, companyId),
          sql`${stylePresets.companyId} IS NULL`
        )
      )
      .orderBy(asc(stylePresets.type), asc(stylePresets.name));
    return rows;
  }

  async createStylePreset(data: InsertStylePreset): Promise<StylePreset> {
    const [row] = await db.insert(stylePresets).values(data as typeof stylePresets.$inferInsert).returning();
    return row;
  }

  async updateStylePreset(id: string, companyId: string, data: Partial<InsertStylePreset>): Promise<StylePreset | undefined> {
    const [row] = await db
      .update(stylePresets)
      .set(data as Partial<typeof stylePresets.$inferInsert>)
      .where(and(eq(stylePresets.id, id), eq(stylePresets.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteStylePreset(id: string, companyId: string): Promise<void> {
    await db
      .delete(stylePresets)
      .where(and(eq(stylePresets.id, id), eq(stylePresets.companyId, companyId)));
  }

  async seedDefaultStylePresets(companyId: string): Promise<void> {
    const existing = await db
      .select({ id: stylePresets.id })
      .from(stylePresets)
      .where(and(eq(stylePresets.companyId, companyId), eq(stylePresets.isDefault, true)));
    if (existing.length > 0) return;

    const HIGH_PLAINS_PRESETS = [
      // Area presets
      { type: "area", name: "Bark Mulch Refresh", category: "mulch", styleConfig: { strokeColor: "#8B4513", fillColor: "rgba(139,69,19,0.18)", strokeWidth: 2, fillType: "texture", textureId: "bark-mulch", textureScale: "medium", textureOpacity: 0.6, materialLabel: "Bark Mulch" } },
      { type: "area", name: "Decorative Rock Refresh", category: "rock", styleConfig: { strokeColor: "#808080", fillColor: "rgba(128,128,128,0.18)", strokeWidth: 2, fillType: "texture", textureId: "decorative-rock", textureScale: "medium", textureOpacity: 0.6, materialLabel: "Decorative Rock" } },
      { type: "area", name: "2-4\" Cobble Install", category: "rock", styleConfig: { strokeColor: "#696969", fillColor: "rgba(105,105,105,0.18)", strokeWidth: 2, fillType: "texture", textureId: "cobble", textureScale: "large", textureOpacity: 0.7, materialLabel: "2-4\" Cobble" } },
      { type: "area", name: "Turf Conversion Area", category: "lawn", styleConfig: { strokeColor: "#228B22", fillColor: "rgba(34,139,34,0.18)", strokeWidth: 2, fillType: "solid", materialLabel: "Turf Conversion" } },
      { type: "area", name: "Native Area Conversion", category: "planting", styleConfig: { strokeColor: "#556B2F", fillColor: "rgba(85,107,47,0.18)", strokeWidth: 2, fillType: "solid", materialLabel: "Native Area" } },
      { type: "area", name: "Demo / Removal Area", category: "demo", styleConfig: { strokeColor: "#dc2626", fillColor: "rgba(220,38,38,0.12)", strokeWidth: 2, dashStyle: "dashed", materialLabel: "Demo/Removal" } },
      // Line presets
      { type: "line", name: "Proposed Edging", category: "edging", styleConfig: { strokeColor: "#f59e0b", strokeWidth: 3, dashStyle: "solid" } },
      { type: "line", name: "Drip Line Install", category: "irrigation", styleConfig: { strokeColor: "#3b82f6", strokeWidth: 2, dashStyle: "dashed" } },
      { type: "line", name: "Plow Route", category: "snow", styleConfig: { strokeColor: "#6366f1", strokeWidth: 3, dashStyle: "solid" } },
      { type: "line", name: "Boundary of Work", category: "scope", styleConfig: { strokeColor: "#ef4444", strokeWidth: 2, dashStyle: "dotted" } },
      { type: "line", name: "Demo Line", category: "demo", styleConfig: { strokeColor: "#dc2626", strokeWidth: 2, dashStyle: "dashed" } },
      // Symbol presets
      { type: "symbol", name: "Tree Install", category: "trees", styleConfig: { symbolTypeId: "deciduous-tree", strokeColor: "#2d6a2d", scale: 1 } },
      { type: "symbol", name: "Tree Removal", category: "trees", styleConfig: { symbolTypeId: "remove-marker", strokeColor: "#dc2626", scale: 1 } },
      { type: "symbol", name: "Boulder Placement", category: "rock-hardscape", styleConfig: { symbolTypeId: "boulder", strokeColor: "#9ca3af", scale: 1 } },
      { type: "symbol", name: "Valve Box", category: "irrigation", styleConfig: { symbolTypeId: "valve-box", strokeColor: "#3b82f6", scale: 1 } },
      { type: "symbol", name: "Drain Inlet", category: "irrigation", styleConfig: { symbolTypeId: "drain-inlet", strokeColor: "#6366f1", scale: 1 } },
    ];

    await db.insert(stylePresets).values(
      HIGH_PLAINS_PRESETS.map(p => ({
        companyId,
        type: p.type as StylePresetType,
        name: p.name,
        category: p.category,
        styleConfig: p.styleConfig as StylePresetConfig,
        isDefault: true,
      }))
    );
  }

  // ─── Sheet Templates ─────────────────────────────────────────────────────────

  async getSheetTemplates(companyId: string): Promise<SheetTemplate[]> {
    return db
      .select()
      .from(sheetTemplates)
      .where(eq(sheetTemplates.companyId, companyId))
      .orderBy(asc(sheetTemplates.name));
  }

  async createSheetTemplate(data: InsertSheetTemplate): Promise<SheetTemplate> {
    const [row] = await db.insert(sheetTemplates).values(data as typeof sheetTemplates.$inferInsert).returning();
    return row;
  }

  async updateSheetTemplate(id: string, companyId: string, data: Partial<InsertSheetTemplate>): Promise<SheetTemplate | undefined> {
    const [row] = await db
      .update(sheetTemplates)
      .set(data as Partial<typeof sheetTemplates.$inferInsert>)
      .where(and(eq(sheetTemplates.id, id), eq(sheetTemplates.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteSheetTemplate(id: string, companyId: string): Promise<void> {
    await db
      .delete(sheetTemplates)
      .where(and(eq(sheetTemplates.id, id), eq(sheetTemplates.companyId, companyId)));
  }

  async getChemicalProducts(companyId: string): Promise<ChemicalProduct[]> {
    return db
      .select()
      .from(chemicalProducts)
      .where(eq(chemicalProducts.companyId, companyId))
      .orderBy(asc(chemicalProducts.name));
  }

  async getChemicalProductById(id: string, companyId: string): Promise<ChemicalProduct | undefined> {
    const [row] = await db
      .select()
      .from(chemicalProducts)
      .where(and(eq(chemicalProducts.id, id), eq(chemicalProducts.companyId, companyId)));
    return row;
  }

  async createChemicalProduct(product: InsertChemicalProduct): Promise<ChemicalProduct> {
    const [row] = await db.insert(chemicalProducts).values(product).returning();
    return row;
  }

  async updateChemicalProduct(id: string, companyId: string, updates: Partial<InsertChemicalProduct>): Promise<ChemicalProduct | undefined> {
    const [row] = await db
      .update(chemicalProducts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(chemicalProducts.id, id), eq(chemicalProducts.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteChemicalProduct(id: string, companyId: string): Promise<void> {
    await db
      .delete(chemicalProducts)
      .where(and(eq(chemicalProducts.id, id), eq(chemicalProducts.companyId, companyId)));
  }

  async getChemicalNotificationTemplates(companyId: string): Promise<ChemicalNotificationTemplate[]> {
    return db
      .select()
      .from(chemicalNotificationTemplates)
      .where(eq(chemicalNotificationTemplates.companyId, companyId))
      .orderBy(asc(chemicalNotificationTemplates.name));
  }

  async getChemicalNotificationTemplate(id: string, companyId: string): Promise<ChemicalNotificationTemplate | undefined> {
    const [row] = await db
      .select()
      .from(chemicalNotificationTemplates)
      .where(and(eq(chemicalNotificationTemplates.id, id), eq(chemicalNotificationTemplates.companyId, companyId)));
    return row;
  }

  async createChemicalNotificationTemplate(data: InsertChemicalNotificationTemplate): Promise<ChemicalNotificationTemplate> {
    const [row] = await db.insert(chemicalNotificationTemplates).values(data).returning();
    return row;
  }

  async updateChemicalNotificationTemplate(id: string, companyId: string, updates: Partial<InsertChemicalNotificationTemplate>): Promise<ChemicalNotificationTemplate | undefined> {
    const [row] = await db
      .update(chemicalNotificationTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(chemicalNotificationTemplates.id, id), eq(chemicalNotificationTemplates.companyId, companyId)))
      .returning();
    return row;
  }

  async setChemicalNotificationTemplateLabel(id: string, companyId: string, storageKey: string, filename: string): Promise<ChemicalNotificationTemplate | undefined> {
    const [row] = await db
      .update(chemicalNotificationTemplates)
      .set({ defaultLabelPdfStorageKey: storageKey, defaultLabelPdfFilename: filename, updatedAt: new Date() })
      .where(and(eq(chemicalNotificationTemplates.id, id), eq(chemicalNotificationTemplates.companyId, companyId)))
      .returning();
    return row;
  }

  async clearChemicalNotificationTemplateLabel(id: string, companyId: string): Promise<ChemicalNotificationTemplate | undefined> {
    const [row] = await db
      .update(chemicalNotificationTemplates)
      .set({ defaultLabelPdfStorageKey: null, defaultLabelPdfFilename: null, updatedAt: new Date() })
      .where(and(eq(chemicalNotificationTemplates.id, id), eq(chemicalNotificationTemplates.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteChemicalNotificationTemplate(id: string, companyId: string): Promise<void> {
    await db
      .delete(chemicalNotificationTemplates)
      .where(and(eq(chemicalNotificationTemplates.id, id), eq(chemicalNotificationTemplates.companyId, companyId)));
  }

  async getCampaignsByTemplate(templateId: string, companyId: string): Promise<{ id: string; title: string; status: string }[]> {
    const rows = await db
      .select({ id: campaigns.id, title: campaigns.title, status: campaigns.status })
      .from(campaigns)
      .where(and(eq(campaigns.notificationTemplateId, templateId), eq(campaigns.companyId, companyId)));
    return rows;
  }

  async getCampaignNotificationTemplate(campaignId: string, companyId: string): Promise<ChemicalNotificationTemplate | undefined> {
    const [campaignRow] = await db
      .select({ notificationTemplateId: campaigns.notificationTemplateId })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)));
    if (!campaignRow?.notificationTemplateId) return undefined;
    const [tpl] = await db
      .select()
      .from(chemicalNotificationTemplates)
      .where(eq(chemicalNotificationTemplates.id, campaignRow.notificationTemplateId));
    return tpl;
  }
}

export const storage = new PgStorage();
