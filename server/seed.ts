import { storage } from "./storage";
import { hashPassword } from "./auth";

async function seed() {
  console.log("Seeding database for Landscaping CRM...\n");

  // Create company
  console.log("Creating company...");
  const company = await storage.createCompany({
    name: "GreenScape Landscaping",
    slug: "greenscape",
    subscriptionPlan: "pro",
    subscriptionStatus: "active",
    billingEmail: "billing@greenscape.com",
  });
  console.log(`✓ Created company: ${company.name}`);

  // Create super admin user
  console.log("\nCreating users...");
  const superAdminPasswordHash = await hashPassword("superadmin123");
  const superAdmin = await storage.createUser({
    email: "superadmin@replit.com",
    passwordHash: superAdminPasswordHash,
    name: "Super Admin",
    isSuperAdmin: "true",
    defaultCompanyId: company.id,
  });
  console.log(`✓ Created super admin: ${superAdmin.email}`);

  // Create users for GreenScape
  const greenScapeUsers = [
    {
      email: "admin@greenscape.com",
      password: "admin123",
      name: "Sarah Johnson",
      role: "admin" as const,
    },
    {
      email: "office@greenscape.com",
      password: "office123",
      name: "Mike Chen",
      role: "office" as const,
    },
    {
      email: "ops@greenscape.com",
      password: "ops123",
      name: "John Doe",
      role: "ops" as const,
    },
    {
      email: "viewer@greenscape.com",
      password: "viewer123",
      name: "Jane Smith",
      role: "viewer" as const,
    },
  ];

  for (const userData of greenScapeUsers) {
    const passwordHash = await hashPassword(userData.password);
    const user = await storage.createUser({
      email: userData.email,
      passwordHash,
      name: userData.name,
      isSuperAdmin: "false",
      defaultCompanyId: company.id,
    });

    // Add user to GreenScape company
    await storage.createCompanyUser({
      userId: user.id,
      companyId: company.id,
      role: userData.role,
      status: "active",
    });

    console.log(`✓ Created user: ${userData.email} (${userData.role})`);
  }

  // Get admin user for notes/contracts
  const adminUser = greenScapeUsers[0];
  const adminUserRecord = await storage.getUserByEmail(adminUser.email);

  // Create customers
  console.log("\nCreating customers...");
  const customer1 = await storage.createCustomer({
    name: "Greenwood HOA",
    street: "1500 Oak Ridge Drive",
    city: "Portland",
    state: "OR",
    zip: "97201",
    status: "active",
    tags: ["HOA", "High-Value"],
    acres: "12.5",
    complexityScore: "4",
    active: "true",
    companyId: company.id,
  });
  console.log(`✓ Created customer: ${customer1.name}`);

  const customer2 = await storage.createCustomer({
    name: "Sunset Village Apartments",
    street: "2847 Maple Street",
    city: "Eugene",
    state: "OR",
    zip: "97401",
    status: "active",
    tags: ["Apartments", "Weekly Service"],
    acres: "8.0",
    complexityScore: "3",
    active: "true",
    companyId: company.id,
  });
  console.log(`✓ Created customer: ${customer2.name}`);

  const customer3 = await storage.createCustomer({
    name: "Oak Hill Estates",
    street: "789 Highland Avenue",
    city: "Salem",
    state: "OR",
    zip: "97301",
    status: "prospect",
    tags: ["Residential", "Premium"],
    acres: "15.0",
    complexityScore: "5",
    active: "true",
    companyId: company.id,
  });
  console.log(`✓ Created customer: ${customer3.name}`);

  // Create contacts
  console.log("\nCreating contacts...");
  await storage.createContact({
    customerId: customer1.id,
    companyId: company.id,
    name: "Jennifer Martinez",
    phone: "(503) 555-0123",
    email: "j.martinez@greenwoodhoa.com",
    role: "Property Manager",
    isPrimary: "true",
  });
  console.log("✓ Created contact for Greenwood HOA");

  await storage.createContact({
    customerId: customer2.id,
    companyId: company.id,
    name: "David Chen",
    phone: "(541) 555-0456",
    email: "dchen@sunsetvillage.com",
    role: "Property Manager",
    isPrimary: "true",
  });
  console.log("✓ Created contact for Sunset Village");

  // Create notes
  console.log("\nCreating notes...");
  await storage.createNote({
    customerId: customer1.id,
    companyId: company.id,
    authorId: adminUserRecord!.id,
    body: "Discussed spring cleanup schedule. They want to start week of April 1st. Large community with pool and recreation center.",
  });
  console.log("✓ Created note for Greenwood HOA");

  // Create contracts
  console.log("\nCreating contracts...");
  const contract1 = await storage.createContract({
    customerId: customer1.id,
    companyId: company.id,
    serviceType: "Maintenance",
    billingPattern: "monthly",
    startDate: new Date("2024-01-01"),
    endDate: new Date("2024-12-31"),
    status: "active",
    po: "PO-2024-001",
    notes: "Annual maintenance contract with weekly mowing and bi-weekly trimming",
  });
  await storage.createContractStatusHistory({
    contractId: contract1.id,
    newStatus: "active",
    changedBy: adminUserRecord!.id,
  });
  console.log("✓ Created contract for Greenwood HOA");

  const contract2 = await storage.createContract({
    customerId: customer2.id,
    companyId: company.id,
    serviceType: "Maintenance",
    billingPattern: "12-of-12",
    startDate: new Date("2024-03-01"),
    endDate: new Date("2025-02-28"),
    status: "active",
    po: "PO-2024-002",
  });
  await storage.createContractStatusHistory({
    contractId: contract2.id,
    newStatus: "active",
    changedBy: adminUserRecord!.id,
  });
  console.log("✓ Created contract for Sunset Village")

  // Create default settings
  console.log("\nCreating settings...");
  await storage.createSettings({
    companyId: company.id,
    companyName: company.name,
    mowingSeasonMonths: ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
    cleanupSeasonMonths: ["Mar", "Nov"],
    hourlyRateBenchmarks: JSON.stringify({
      smallPad: 50,
      hoaStandard: 45,
      hoaComplex: 55,
    }),
    featureFlags: JSON.stringify({
      tickets_v2: false,
      forecast_v2: false,
      qbo_write: false,
    }),
  });
  console.log("✓ Created default settings");

  // Create default ticket types with workflows
  console.log("\nCreating ticket types...");
  
  // Onsite Maintenance Task - Simple workflow for field jobs
  const quickTask = await storage.createTicketType({
    companyId: company.id,
    name: "Onsite Maintenance Task",
    description: "Focused field work at customer properties",
    category: "quick_task",
    icon: "zap",
    color: "#22c55e",
    isActive: "true",
  });
  console.log(`✓ Created ticket type: ${quickTask.name}`);

  // Onsite Maintenance Task statuses
  const qtNew = await storage.createTicketTypeStatus({
    ticketTypeId: quickTask.id,
    name: "New",
    description: "Task is created and ready to be assigned",
    displayOrder: 0,
    color: "#6b7280",
    isFinal: "false",
  });
  
  const qtInProgress = await storage.createTicketTypeStatus({
    ticketTypeId: quickTask.id,
    name: "In Progress",
    description: "Crew is working on the task",
    displayOrder: 1,
    color: "#3b82f6",
    isFinal: "false",
  });

  const qtCompleted = await storage.createTicketTypeStatus({
    ticketTypeId: quickTask.id,
    name: "Completed",
    description: "Task is finished",
    displayOrder: 2,
    color: "#22c55e",
    isFinal: "true",
  });
  console.log("✓ Created Onsite Maintenance Task workflow (3 steps)");

  // Onsite Maintenance Task fields
  await storage.createTicketTypeField({
    ticketTypeId: quickTask.id,
    statusId: qtInProgress.id,
    fieldKey: "start_time",
    fieldLabel: "Start Time",
    fieldType: "text",
    isRequired: "false",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: quickTask.id,
    statusId: qtCompleted.id,
    fieldKey: "completion_notes",
    fieldLabel: "Completion Notes",
    fieldType: "textarea",
    isRequired: "false",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: quickTask.id,
    statusId: qtCompleted.id,
    fieldKey: "time_spent",
    fieldLabel: "Time Spent (minutes)",
    fieldType: "number",
    isRequired: "false",
    options: [],
    displayOrder: 1,
  });
  console.log("✓ Created Onsite Maintenance Task fields");

  // Project - Full 8-step workflow for larger jobs
  const project = await storage.createTicketType({
    companyId: company.id,
    name: "Project",
    description: "Large projects requiring multiple steps and approvals",
    category: "project",
    icon: "folder-kanban",
    color: "#8b5cf6",
    isActive: "true",
  });
  console.log(`✓ Created ticket type: ${project.name}`);

  // Project statuses
  const pNew = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "New",
    description: "Project is created and pending review",
    displayOrder: 0,
    color: "#6b7280",
    isFinal: "false",
  });

  const pEstimating = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "Estimating",
    description: "Creating estimate for the project",
    displayOrder: 1,
    color: "#f59e0b",
    isFinal: "false",
  });

  const pQuoted = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "Quoted",
    description: "Quote sent to customer awaiting approval",
    displayOrder: 2,
    color: "#ec4899",
    isFinal: "false",
  });

  const pApproved = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "Approved",
    description: "Customer approved, ready to schedule",
    displayOrder: 3,
    color: "#06b6d4",
    isFinal: "false",
  });

  const pScheduled = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "Scheduled",
    description: "Work is scheduled with crew",
    displayOrder: 4,
    color: "#3b82f6",
    isFinal: "false",
  });

  const pInProgress = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "In Progress",
    description: "Crew is actively working on project",
    displayOrder: 5,
    color: "#8b5cf6",
    isFinal: "false",
  });

  const pCompleted = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "Completed",
    description: "Work is finished, ready for invoicing",
    displayOrder: 6,
    color: "#22c55e",
    isFinal: "false",
  });

  const pInvoiced = await storage.createTicketTypeStatus({
    ticketTypeId: project.id,
    name: "Invoiced",
    description: "Invoice sent to customer",
    displayOrder: 7,
    color: "#10b981",
    isFinal: "true",
  });
  console.log("✓ Created Project workflow (8 steps)");

  // Project fields for each status
  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pEstimating.id,
    fieldKey: "estimated_hours",
    fieldLabel: "Estimated Hours",
    fieldType: "number",
    isRequired: "true",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pEstimating.id,
    fieldKey: "materials_needed",
    fieldLabel: "Materials Needed",
    fieldType: "textarea",
    isRequired: "false",
    options: [],
    displayOrder: 1,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pQuoted.id,
    fieldKey: "quote_amount",
    fieldLabel: "Quote Amount",
    fieldType: "currency",
    isRequired: "true",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pQuoted.id,
    fieldKey: "quote_sent_date",
    fieldLabel: "Quote Sent Date",
    fieldType: "date",
    isRequired: "false",
    options: [],
    displayOrder: 1,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pApproved.id,
    fieldKey: "approval_date",
    fieldLabel: "Approval Date",
    fieldType: "date",
    isRequired: "false",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pApproved.id,
    fieldKey: "po_number",
    fieldLabel: "PO Number",
    fieldType: "text",
    isRequired: "false",
    options: [],
    displayOrder: 1,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pScheduled.id,
    fieldKey: "scheduled_date",
    fieldLabel: "Scheduled Date",
    fieldType: "date",
    isRequired: "true",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pScheduled.id,
    fieldKey: "crew_size",
    fieldLabel: "Crew Size",
    fieldType: "number",
    isRequired: "false",
    options: [],
    displayOrder: 1,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pInProgress.id,
    fieldKey: "start_date",
    fieldLabel: "Actual Start Date",
    fieldType: "date",
    isRequired: "false",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pCompleted.id,
    fieldKey: "completion_date",
    fieldLabel: "Completion Date",
    fieldType: "date",
    isRequired: "false",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pCompleted.id,
    fieldKey: "actual_hours",
    fieldLabel: "Actual Hours",
    fieldType: "number",
    isRequired: "false",
    options: [],
    displayOrder: 1,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pCompleted.id,
    fieldKey: "completion_notes",
    fieldLabel: "Completion Notes",
    fieldType: "textarea",
    isRequired: "false",
    options: [],
    displayOrder: 2,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pInvoiced.id,
    fieldKey: "invoice_number",
    fieldLabel: "Invoice Number",
    fieldType: "text",
    isRequired: "true",
    options: [],
    displayOrder: 0,
  });

  await storage.createTicketTypeField({
    ticketTypeId: project.id,
    statusId: pInvoiced.id,
    fieldKey: "invoice_amount",
    fieldLabel: "Invoice Amount",
    fieldType: "currency",
    isRequired: "true",
    options: [],
    displayOrder: 1,
  });
  console.log("✓ Created Project fields");

  // Create a sample Onsite Maintenance Task ticket
  console.log("\nCreating sample tickets...");
  const opsUser = await storage.getUserByEmail("ops@greenscape.com");
  const sampleTicket = await storage.createTicket({
    companyId: company.id,
    customerId: customer1.id,
    ticketTypeId: quickTask.id,
    currentStatusId: qtNew.id,
    workType: "contract",
    billingBehavior: "no_invoice",
    title: "Fix sprinkler head near pool area",
    description: "Broken sprinkler head reported by property manager. Located near the north side of the pool area.",
    priority: "normal",
    assignedToId: opsUser?.id,
    createdById: adminUserRecord!.id,
  });
  console.log(`✓ Created sample ticket: ${sampleTicket.title}`);

  // Add a comment to the sample ticket
  await storage.createTicketComment({
    ticketId: sampleTicket.id,
    authorId: adminUserRecord!.id,
    body: "Spoke with Jennifer - she said the sprinkler was working last week. May just need a quick replacement.",
  });
  console.log("✓ Added comment to sample ticket");

  console.log("\n" + "=".repeat(60));
  console.log("SEED COMPLETED - Landscaping CRM Demo Data");
  console.log("=".repeat(60));
  
  console.log("\n🔑 SUPER ADMIN (Platform access):");
  console.log("  superadmin@replit.com / superadmin123");
  
  console.log("\n🏢 GREENSCAPE LANDSCAPING:");
  console.log("  admin@greenscape.com / admin123 (Admin - Full CRUD)");
  console.log("  office@greenscape.com / office123 (Office - Full CRUD)");
  console.log("  ops@greenscape.com / ops123 (Operations - Read Only)");
  console.log("  viewer@greenscape.com / viewer123 (Viewer - Read Only)");
  
  console.log("\n👥 CUSTOMERS:");
  console.log("  • Greenwood HOA (Active) - 12.5 acres, Complexity 4");
  console.log("  • Sunset Village Apartments (Active) - 8.0 acres, Complexity 3");
  console.log("  • Oak Hill Estates (Prospect) - 15.0 acres, Complexity 5");
  
  console.log("\n📋 SAMPLE DATA:");
  console.log("  • 2 contacts (property managers)");
  console.log("  • 1 note (customer communication)");
  console.log("  • 2 contracts (maintenance services)");
  console.log("  • 2 ticket types (Onsite Maintenance Task, Project)");
  console.log("  • 1 sample ticket (sprinkler repair)");
  
  console.log("\n✨ Super admin has platform access to the /admin portal");
  console.log("✨ Admin & Office can create/edit customers, contacts, contracts, notes, tickets");
  console.log("✨ Ops can view/progress their assigned tickets");
  console.log("✨ Viewer role is read-only for CRM");
  console.log("=".repeat(60) + "\n");
  
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
