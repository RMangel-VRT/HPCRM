import { type User, type InsertUser, type Customer, type InsertCustomer, type Contact, type InsertContact, type Company, type InsertCompany, type CompanyUser, type InsertCompanyUser, type Settings, type InsertSettings, type Note, type InsertNote, type Contract, type InsertContract, type ContractStatusHistory, type InsertContractStatusHistory, type ContractDocument, type InsertContractDocument, type ContractMonthlyAmount, type InsertContractMonthlyAmount, type CustomerRateSheet, type InsertCustomerRateSheet, type ContractService, type InsertContractService, type ContractTemplate, type InsertContractTemplate, type ContractBuilderDocument, type InsertContractBuilderDocument, type ContractBuilderSection, type InsertContractBuilderSection, type ContractBuilderVariable, type InsertContractBuilderVariable, type TicketType, type InsertTicketType, type TicketTypeStatus, type InsertTicketTypeStatus, type TicketTypeField, type InsertTicketTypeField, type Ticket, type InsertTicket, type TicketFieldValue, type InsertTicketFieldValue, type TicketStatusHistory, type InsertTicketStatusHistory, type TicketComment, type InsertTicketComment, type TicketCommentMention, type InsertTicketCommentMention, type TicketSource, type InsertTicketSource, type TicketLink, type InsertTicketLink, type TicketTypeCategory, type CustomerMapLayer, type InsertCustomerMapLayer, type CustomerMapDocument, type InsertCustomerMapDocument, type MaintenanceCrew, type InsertMaintenanceCrew, type MaintenanceVisitConfig, type InsertMaintenanceVisitConfig, type WeeklyScheduleTemplate, type InsertWeeklyScheduleTemplate, type ScheduleBlock, type InsertScheduleBlock, type TicketNotification, type InsertTicketNotification, type NotificationType, type PropertyManagementCompany, type InsertPropertyManagementCompany, type PropertyManager, type InsertPropertyManager, type PropertyManagerEmail, type InsertPropertyManagerEmail, type PropertyManagerPhone, type InsertPropertyManagerPhone, type PropertyManagerWithContacts, type Equipment, type InsertEquipment, type EquipmentFile, type InsertEquipmentFile, type EquipmentTicket, type InsertEquipmentTicket, type EquipmentTicketStatusHistory, type InsertEquipmentTicketStatusHistory, type EquipmentWithTicketCount, type SnowEvent, type InsertSnowEvent, type SnowEventAttachment, type InsertSnowEventAttachment, type SnowEventPropertyImpact, type InsertSnowEventPropertyImpact, type SnowEventWithDetails, type SnowEventPropertyImpactWithCustomer, type EmailTemplate, type InsertEmailTemplate, type EmailRule, type InsertEmailRule, type EmailLog, type InsertEmailLog, type EmailLogWithDetails, type Proposal, type InsertProposal, type ProposalFile, type InsertProposalFile, type ProposalWithDetails, type ProposalVersion, type InsertProposalVersion, type ProposalVersionWithUser, type VisualScopeSheet, type InsertVisualScopeSheet, type VisualScopeSheetWithCustomer, type Campaign, type InsertCampaign, type CampaignItem, type InsertCampaignItem, type CampaignWithProgress, type Season, type InsertSeason, type CampaignChecklistTask, type InsertCampaignChecklistTask, type CampaignItemTaskCompletion, type InsertCampaignItemTaskCompletion, type Communication, type InsertCommunication, type CommunicationTemplate, type InsertCommunicationTemplate, type CommunicationLink, type InsertCommunicationLink, type CommunicationWithDetails, type CommunicationAnalytics } from "@shared/schema";
import { db } from "./db";
import { users, customers, contacts, companies, companyUsers, settings, notes, contracts, contractStatusHistory, contractDocuments, contractMonthlyAmounts, customerRateSheets, contractServices, contractTemplates, contractBuilderDocuments, contractBuilderSections, contractBuilderVariables, ticketTypes, ticketTypeStatuses, ticketTypeFields, tickets, ticketFieldValues, ticketStatusHistory, ticketComments, ticketCommentMentions, ticketSources, ticketLinks, customerMapLayers, customerMapDocuments, maintenanceCrews, maintenanceVisitConfigs, weeklyScheduleTemplates, scheduleBlocks, ticketNotifications, propertyManagementCompanies, propertyManagers, propertyManagerEmails, propertyManagerPhones, equipment, equipmentFiles, equipmentTickets, equipmentTicketStatusHistory, snowEvents, snowEventAttachments, snowEventPropertyImpacts, emailTemplates, emailRules, emailLogs, proposals, proposalFiles, proposalVersions, visualScopeSheets, campaigns, campaignItems, campaignChecklistTasks, campaignItemTaskCompletions, seasons, communications, communicationTemplates, communicationLinks } from "@shared/schema";
import { eq, and, sql, desc, inArray, max } from "drizzle-orm";
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
  
  getTicketComments(ticketId: string): Promise<TicketComment[]>;
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
  getEquipmentTickets(companyId: string, filters?: { equipmentId?: string; status?: string; assignedToId?: string }): Promise<EquipmentTicket[]>;
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
  createCampaignItem(item: InsertCampaignItem): Promise<CampaignItem>;
  updateCampaignItem(id: string, companyId: string, updates: Partial<InsertCampaignItem & { updatedAt: Date }>): Promise<CampaignItem | undefined>;
  deleteCampaignItem(id: string, companyId: string): Promise<void>;
  createCampaignWithItems(campaign: InsertCampaign, items: InsertCampaignItem[]): Promise<Campaign>;
  getCampaignChecklistTasks(campaignId: string): Promise<CampaignChecklistTask[]>;
  createCampaignChecklistTask(task: InsertCampaignChecklistTask): Promise<CampaignChecklistTask>;
  getCampaignItemTaskCompletions(campaignItemId: string): Promise<CampaignItemTaskCompletion[]>;
  createCampaignItemTaskCompletion(completion: InsertCampaignItemTaskCompletion): Promise<CampaignItemTaskCompletion>;
  deleteCampaignItemTaskCompletion(campaignItemId: string, campaignChecklistTaskId: string): Promise<void>;

  getSeasons(companyId: string): Promise<Season[]>;
  getSeasonById(id: string, companyId: string): Promise<Season | undefined>;
  createSeason(season: InsertSeason): Promise<Season>;
  updateSeason(id: string, companyId: string, updates: Partial<InsertSeason>): Promise<Season | undefined>;
  deleteSeason(id: string, companyId: string): Promise<void>;

  // Communications
  getCommunications(companyId: string, filters?: { view?: string; customerId?: string; type?: string; sentById?: string; search?: string; startDate?: Date; endDate?: Date; status?: string; fromDate?: string; toDate?: string }): Promise<CommunicationWithDetails[]>;
  getCommunicationById(id: string, companyId: string): Promise<CommunicationWithDetails | undefined>;
  createCommunication(communication: InsertCommunication): Promise<Communication>;
  updateCommunication(id: string, companyId: string, updates: Partial<InsertCommunication>): Promise<Communication | undefined>;
  deleteCommunication(id: string, companyId: string): Promise<void>;
  getCommunicationTemplates(companyId: string, includeInactive?: boolean): Promise<CommunicationTemplate[]>;
  getCommunicationTemplateById(id: string, companyId: string): Promise<CommunicationTemplate | undefined>;
  createCommunicationTemplate(template: InsertCommunicationTemplate): Promise<CommunicationTemplate>;
  updateCommunicationTemplate(id: string, companyId: string, updates: Partial<InsertCommunicationTemplate>): Promise<CommunicationTemplate | undefined>;
  getCommunicationLinks(communicationId: string, companyId: string): Promise<CommunicationLink[]>;
  createCommunicationLink(link: InsertCommunicationLink): Promise<CommunicationLink>;
  getCommunicationAnalytics(companyId: string, startDate: Date, endDate: Date): Promise<CommunicationAnalytics>;
  seedCommunications(companyId: string, userId: string, customerIds: string[]): Promise<void>;

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
    const result = await db.insert(customers).values([insertCustomer]).returning();
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
      .orderBy(desc(contracts.createdAt));
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
      
      // Calculate mobilization fee per month (in dollars)
      const monthlyMobilization = (contract.hasMobilizationFee && contract.mobilizationFeeAmount) 
        ? contract.mobilizationFeeAmount / 100 
        : 0;
      
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
          // Include mobilization fee in monthly amount
          const amountInDollars = (amountRecord.amount / 100) + monthlyMobilization;
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
        const monthlyMobilization = (contract.hasMobilizationFee && contract.mobilizationFeeAmount)
          ? contract.mobilizationFeeAmount / 100
          : 0;

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
            const amountInDollars = (amountRecord.amount / 100) + monthlyMobilization;
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
    // Use the same calculation logic as getCustomerRevenue to ensure consistency
    // This includes mobilization fees, proper date filtering, and status handling
    const allCustomers = await this.getCustomers(companyId);
    
    // Initialize monthly totals (month 1-12)
    const monthlyTotals: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyTotals[m] = 0;
    }
    
    // Aggregate monthly revenue from all customers using the single source of truth
    for (const customer of allCustomers) {
      const revenueData = await this.getCustomerRevenue(customer.id, companyId, year);
      for (const monthData of revenueData.monthlyBreakdown) {
        monthlyTotals[monthData.month] += monthData.total;
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
      .orderBy(desc(tickets.createdAt));
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
  async getEquipmentTickets(companyId: string, filters?: { equipmentId?: string; status?: string; assignedToId?: string }): Promise<EquipmentTicket[]> {
    let query = db.select().from(equipmentTickets).where(eq(equipmentTickets.companyId, companyId));
    
    if (filters?.equipmentId) {
      query = db.select().from(equipmentTickets).where(and(
        eq(equipmentTickets.companyId, companyId),
        eq(equipmentTickets.equipmentId, filters.equipmentId)
      ));
    }
    if (filters?.status) {
      query = db.select().from(equipmentTickets).where(and(
        eq(equipmentTickets.companyId, companyId),
        sql`${equipmentTickets.status} = ${filters.status}`
      ));
    }
    if (filters?.assignedToId) {
      query = db.select().from(equipmentTickets).where(and(
        eq(equipmentTickets.companyId, companyId),
        eq(equipmentTickets.assignedToId, filters.assignedToId)
      ));
    }
    
    return await query.orderBy(desc(equipmentTickets.createdAt));
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
    
    const result: SnowEventWithDetails[] = [];
    for (const event of events) {
      const impacts = await db.select().from(snowEventPropertyImpacts)
        .where(and(
          eq(snowEventPropertyImpacts.snowEventId, event.id),
          eq(snowEventPropertyImpacts.companyId, companyId)
        ));
      const creator = await db.select().from(users).where(eq(users.id, event.createdByUserId));
      result.push({
        ...event,
        propertyCount: impacts.length,
        ticketCount: impacts.filter(i => i.ticketId).length,
        createdByName: creator[0]?.firstName ? `${creator[0].firstName} ${creator[0].lastName || ''}`.trim() : 'Unknown',
      });
    }
    return result;
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
    
    const result: SnowEventPropertyImpactWithCustomer[] = [];
    for (const impact of impacts) {
      const customer = await db.select().from(customers).where(eq(customers.id, impact.customerId));
      result.push({
        ...impact,
        customerName: customer[0]?.name || 'Unknown',
      });
    }
    return result;
  }

  async getSnowEventPropertyImpactsByCustomer(customerId: string, companyId: string): Promise<(SnowEventPropertyImpact & { snowEvent: SnowEvent })[]> {
    const impacts = await db.select().from(snowEventPropertyImpacts)
      .where(and(
        eq(snowEventPropertyImpacts.customerId, customerId),
        eq(snowEventPropertyImpacts.companyId, companyId)
      ))
      .orderBy(desc(snowEventPropertyImpacts.createdAt));
    
    const result: (SnowEventPropertyImpact & { snowEvent: SnowEvent })[] = [];
    for (const impact of impacts) {
      const event = await db.select().from(snowEvents).where(eq(snowEvents.id, impact.snowEventId));
      if (event[0]) {
        result.push({ ...impact, snowEvent: event[0] });
      }
    }
    return result;
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
    const result = await db.insert(emailTemplates).values([template]).returning();
    return result[0];
  }

  async updateEmailTemplate(id: string, companyId: string, updates: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined> {
    const result = await db.update(emailTemplates)
      .set({ ...updates, updatedAt: new Date() })
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
    if (filters?.status) conditions.push(eq(emailLogs.status, filters.status as any));

    const result = await db.select({
      id: emailLogs.id,
      companyId: emailLogs.companyId,
      customerId: emailLogs.customerId,
      ticketId: emailLogs.ticketId,
      templateId: emailLogs.templateId,
      toEmail: emailLogs.toEmail,
      subject: emailLogs.subject,
      htmlBody: emailLogs.htmlBody,
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
      .orderBy(desc(emailLogs.createdAt));

    return result as EmailLogWithDetails[];
  }

  async getEmailLogById(id: string, companyId: string): Promise<EmailLog | undefined> {
    const result = await db.select().from(emailLogs)
      .where(and(eq(emailLogs.id, id), eq(emailLogs.companyId, companyId)))
      .limit(1);
    return result[0];
  }

  async createEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const result = await db.insert(emailLogs).values([log]).returning();
    return result[0];
  }

  async updateEmailLog(id: string, updates: Partial<InsertEmailLog>): Promise<EmailLog | undefined> {
    const result = await db.update(emailLogs)
      .set(updates)
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
    const result = await db.insert(proposals).values([proposal]).returning();
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
      .select({ sheet: visualScopeSheets, customerName: customers.name })
      .from(visualScopeSheets)
      .leftJoin(customers, eq(visualScopeSheets.customerId, customers.id))
      .where(and(eq(visualScopeSheets.id, id), eq(visualScopeSheets.companyId, companyId)));
    if (!rows[0]) return undefined;
    return { ...rows[0].sheet, customerName: rows[0].customerName ?? "" };
  }

  async createVisualScopeSheet(data: InsertVisualScopeSheet): Promise<VisualScopeSheet> {
    const [row] = await db.insert(visualScopeSheets).values(data).returning();
    return row;
  }

  async updateVisualScopeSheet(id: string, companyId: string, data: Partial<InsertVisualScopeSheet>): Promise<VisualScopeSheet> {
    const [row] = await db
      .update(visualScopeSheets)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(visualScopeSheets.id, id), eq(visualScopeSheets.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteVisualScopeSheet(id: string, companyId: string): Promise<void> {
    await db.delete(visualScopeSheets).where(and(eq(visualScopeSheets.id, id), eq(visualScopeSheets.companyId, companyId)));
  }

  async getCampaigns(companyId: string, assignedToId?: string): Promise<CampaignWithProgress[]> {
    const whereClause = assignedToId
      ? and(eq(campaigns.companyId, companyId), eq(campaigns.assignedToId, assignedToId))
      : eq(campaigns.companyId, companyId);
    const rows = await db.select().from(campaigns).where(whereClause).orderBy(desc(campaigns.createdAt));
    const result: CampaignWithProgress[] = [];
    for (const c of rows) {
      const items = await db.select().from(campaignItems).where(eq(campaignItems.campaignId, c.id));
      const assignedUser = c.assignedToId ? await db.select().from(users).where(eq(users.id, c.assignedToId)) : [];
      const createdUser = c.createdById ? await db.select().from(users).where(eq(users.id, c.createdById)) : [];
      const seasonRow = c.seasonId ? await db.select().from(seasons).where(eq(seasons.id, c.seasonId)) : [];
      result.push({
        ...c,
        totalItems: items.length,
        completedItems: items.filter(i => i.status === "completed").length,
        skippedItems: items.filter(i => i.status === "skipped").length,
        assignedToName: assignedUser[0]?.name,
        createdByName: createdUser[0]?.name,
        seasonName: seasonRow[0]?.name,
      });
    }
    return result;
  }

  async getCampaignById(id: string, companyId: string): Promise<Campaign | undefined> {
    const [row] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)));
    return row;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [row] = await db.insert(campaigns).values(campaign).returning();
    return row;
  }

  async updateCampaign(id: string, companyId: string, updates: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const [row] = await db.update(campaigns).set({ ...updates, updatedAt: new Date() }).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))).returning();
    return row;
  }

  async deleteCampaign(id: string, companyId: string): Promise<void> {
    await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)));
  }

  async getCampaignItems(campaignId: string, companyId: string): Promise<CampaignItem[]> {
    return db.select().from(campaignItems).where(and(eq(campaignItems.campaignId, campaignId), eq(campaignItems.companyId, companyId)));
  }

  async createCampaignItem(item: InsertCampaignItem): Promise<CampaignItem> {
    const [row] = await db.insert(campaignItems).values(item as typeof campaignItems.$inferInsert).returning();
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
        await tx.insert(campaignItems).values({ ...item, campaignId: campaign.id } as typeof campaignItems.$inferInsert);
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

  // ─── Communications ───────────────────────────────────────────────────────

  async getCommunications(companyId: string, filters?: { view?: string; customerId?: string; type?: string; sentById?: string; search?: string; startDate?: Date; endDate?: Date; status?: string; fromDate?: string; toDate?: string }): Promise<CommunicationWithDetails[]> {
    const c = communications;
    const u = users;
    const cu = customers;
    const co = contacts;
    const ct = communicationTemplates;

    const now = new Date();

    const rows = await db
      .select({
        id: c.id,
        companyId: c.companyId,
        customerId: c.customerId,
        contactId: c.contactId,
        sentById: c.sentById,
        templateId: c.templateId,
        type: c.type,
        status: c.status,
        subject: c.subject,
        body: c.body,
        scheduledFor: c.scheduledFor,
        sentAt: c.sentAt,
        followUpDueAt: c.followUpDueAt,
        followUpStatus: c.followUpStatus,
        parentCommunicationId: c.parentCommunicationId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        customerName: cu.name,
        contactName: co.name,
        sentByName: u.name,
        templateName: ct.name,
      })
      .from(c)
      .leftJoin(u, eq(c.sentById, u.id))
      .leftJoin(cu, eq(c.customerId, cu.id))
      .leftJoin(co, eq(c.contactId, co.id))
      .leftJoin(ct, eq(c.templateId, ct.id))
      .where(eq(c.companyId, companyId))
      .orderBy(desc(c.createdAt));

    let result = rows.map(r => ({
      ...r,
      isOverdue: r.followUpStatus === "open" && r.followUpDueAt != null && r.followUpDueAt < now,
    })) as CommunicationWithDetails[];

    if (filters?.view === "drafts") {
      result = result.filter(r => r.status === "draft");
    } else if (filters?.view === "sent") {
      result = result.filter(r => r.status === "sent");
    } else if (filters?.view === "scheduled") {
      result = result.filter(r => r.status === "scheduled");
    } else if (filters?.view === "followups") {
      result = result.filter(r => r.followUpStatus === "open" || r.followUpStatus === "snoozed");
    }

    if (filters?.customerId) result = result.filter(r => r.customerId === filters.customerId);
    if (filters?.type) result = result.filter(r => r.type === filters.type);
    if (filters?.status) result = result.filter(r => r.status === filters.status);
    if (filters?.sentById) result = result.filter(r => r.sentById === filters.sentById);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(r =>
        (r.subject?.toLowerCase().includes(s)) ||
        (r.body?.toLowerCase().includes(s)) ||
        (r.customerName?.toLowerCase().includes(s))
      );
    }
    if (filters?.startDate) result = result.filter(r => (r.sentAt ?? r.createdAt) >= filters.startDate!);
    if (filters?.endDate) result = result.filter(r => (r.sentAt ?? r.createdAt) <= filters.endDate!);
    if (filters?.fromDate) {
      const from = new Date(filters.fromDate);
      result = result.filter(r => (r.sentAt ?? r.createdAt) >= from);
    }
    if (filters?.toDate) {
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      result = result.filter(r => (r.sentAt ?? r.createdAt) <= to);
    }

    return result;
  }

  async getCommunicationById(id: string, companyId: string): Promise<CommunicationWithDetails | undefined> {
    const c = communications;
    const u = users;
    const cu = customers;
    const co = contacts;
    const ct = communicationTemplates;
    const now = new Date();

    const [row] = await db
      .select({
        id: c.id,
        companyId: c.companyId,
        customerId: c.customerId,
        contactId: c.contactId,
        sentById: c.sentById,
        templateId: c.templateId,
        type: c.type,
        status: c.status,
        subject: c.subject,
        body: c.body,
        scheduledFor: c.scheduledFor,
        sentAt: c.sentAt,
        followUpDueAt: c.followUpDueAt,
        followUpStatus: c.followUpStatus,
        parentCommunicationId: c.parentCommunicationId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        customerName: cu.name,
        contactName: co.name,
        sentByName: u.name,
        templateName: ct.name,
      })
      .from(c)
      .leftJoin(u, eq(c.sentById, u.id))
      .leftJoin(cu, eq(c.customerId, cu.id))
      .leftJoin(co, eq(c.contactId, co.id))
      .leftJoin(ct, eq(c.templateId, ct.id))
      .where(and(eq(c.id, id), eq(c.companyId, companyId)));

    if (!row) return undefined;
    return {
      ...row,
      isOverdue: row.followUpStatus === "open" && row.followUpDueAt != null && row.followUpDueAt < now,
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

  async getCommunicationTemplates(companyId: string, includeInactive = false): Promise<CommunicationTemplate[]> {
    if (includeInactive) {
      return db.select().from(communicationTemplates).where(eq(communicationTemplates.companyId, companyId)).orderBy(communicationTemplates.name);
    }
    return db.select().from(communicationTemplates).where(and(eq(communicationTemplates.companyId, companyId), eq(communicationTemplates.isActive, true))).orderBy(communicationTemplates.name);
  }

  async getCommunicationTemplateById(id: string, companyId: string): Promise<CommunicationTemplate | undefined> {
    const [row] = await db.select().from(communicationTemplates).where(and(eq(communicationTemplates.id, id), eq(communicationTemplates.companyId, companyId)));
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
          gte(communications.sentAt, startOfMonth)
        )
      );

    const drafts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "draft")
        )
      );

    const overdueFollowUps = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.followUpStatus, "open"),
          lt(communications.followUpDueAt, now)
        )
      );

    const byType = await db
      .select({
        type: communications.type,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "sent"),
          gte(communications.sentAt, startDate),
          lte(communications.sentAt, endDate)
        )
      )
      .groupBy(communications.type)
      .orderBy(desc(sql`count(*)`));

    const byStaff = await db
      .select({
        userId: communications.sentById,
        userName: users.name,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .leftJoin(users, eq(communications.sentById, users.id))
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "sent"),
          gte(communications.sentAt, startDate),
          lte(communications.sentAt, endDate)
        )
      )
      .groupBy(communications.sentById, users.name)
      .orderBy(desc(sql`count(*)`));

    const byCustomer = await db
      .select({
        customerId: communications.customerId,
        customerName: customers.name,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .leftJoin(customers, eq(communications.customerId, customers.id))
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "sent"),
          gte(communications.sentAt, startDate),
          lte(communications.sentAt, endDate)
        )
      )
      .groupBy(communications.customerId, customers.name)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const byTemplate = await db
      .select({
        templateId: communications.templateId,
        templateName: communicationTemplates.name,
        count: sql<number>`count(*)::int`,
      })
      .from(communications)
      .leftJoin(communicationTemplates, eq(communications.templateId, communicationTemplates.id))
      .where(
        and(
          eq(communications.companyId, companyId),
          eq(communications.status, "sent"),
          gte(communications.sentAt, startDate),
          lte(communications.sentAt, endDate)
        )
      )
      .groupBy(communications.templateId, communicationTemplates.name)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return {
      totalSentPeriod: allSent[0]?.count ?? 0,
      totalSentThisWeek: sentThisWeek[0]?.count ?? 0,
      totalSentThisMonth: sentThisMonth[0]?.count ?? 0,
      draftsCount: drafts[0]?.count ?? 0,
      overdueFollowUpsCount: overdueFollowUps[0]?.count ?? 0,
      sentByType: byType.map(r => ({ type: r.type, count: r.count })),
      sentByStaff: byStaff.filter(r => r.userId != null).map(r => ({ userId: r.userId!, userName: r.userName ?? "Unknown", count: r.count })),
      topCustomers: byCustomer.filter(r => r.customerId != null).map(r => ({ customerId: r.customerId!, customerName: r.customerName ?? "Unknown", count: r.count })),
      topTemplates: byTemplate.filter(r => r.templateId != null).map(r => ({ templateId: r.templateId!, templateName: r.templateName ?? "Unknown", count: r.count })),
    };
  }

  async seedCommunications(companyId: string, userId: string, customerIds: string[]): Promise<void> {
    const existingCount = await db.select({ count: sql<number>`count(*)::int` }).from(communications).where(eq(communications.companyId, companyId));
    if ((existingCount[0]?.count ?? 0) > 0) return;

    const templateData = [
      { companyId, name: "Welcome Email", type: "email" as const, subject: "Welcome to High Plains Property Maintenance", body: "Dear valued customer,\n\nWelcome to High Plains! We are thrilled to have you as a client...", createdById: userId },
      { companyId, name: "Service Reminder SMS", type: "sms" as const, subject: null, body: "Hi! Your scheduled service is coming up this week. We'll be there bright and early!", createdById: userId },
      { companyId, name: "Seasonal Check-In", type: "email" as const, subject: "Seasonal Service Update", body: "As we head into the new season, we wanted to reach out about your property...", createdById: userId },
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
}

export const storage = new PgStorage();
