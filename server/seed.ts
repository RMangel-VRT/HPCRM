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

  // Create properties
  console.log("\nCreating properties...");
  const properties = [
    {
      name: "Greenwood HOA",
      street: "1500 Oak Ridge Drive",
      city: "Portland",
      state: "OR",
      zip: "97201",
      propertyManagerName: "Jennifer Martinez",
      propertyManagerPhone: "(503) 555-0123",
      propertyManagerEmail: "j.martinez@greenwoodhoa.com",
      notes: "Large community with pool and recreation center. Service every Tuesday and Friday.",
      companyId: company.id,
    },
    {
      name: "Sunset Village Apartments",
      street: "2847 Maple Street",
      city: "Eugene",
      state: "OR",
      zip: "97401",
      propertyManagerName: "David Chen",
      propertyManagerPhone: "(541) 555-0456",
      propertyManagerEmail: "dchen@sunsetvillage.com",
      notes: "120-unit complex. Weekly lawn service, bi-weekly hedge trimming.",
      companyId: company.id,
    },
    {
      name: "Oak Hill Estates",
      street: "789 Highland Avenue",
      city: "Salem",
      state: "OR",
      zip: "97301",
      propertyManagerName: "Robert Johnson",
      propertyManagerPhone: "(503) 555-0789",
      propertyManagerEmail: "rjohnson@oakhillestates.com",
      notes: "Upscale residential community. Monthly full-service landscaping.",
      companyId: company.id,
    },
  ];

  for (const propertyData of properties) {
    await storage.createProperty(propertyData);
    console.log(`✓ Created property: ${propertyData.name}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SEED COMPLETED - Landscaping CRM Demo Data");
  console.log("=".repeat(60));
  
  console.log("\n🔑 SUPER ADMIN (Platform access):");
  console.log("  superadmin@replit.com / superadmin123");
  
  console.log("\n🏢 GREENSCAPE LANDSCAPING:");
  console.log("  admin@greenscape.com / admin123 (Admin)");
  console.log("  office@greenscape.com / office123 (Office)");
  console.log("  ops@greenscape.com / ops123 (Operations)");
  console.log("  viewer@greenscape.com / viewer123 (Viewer - Read Only)");
  
  console.log("\n📍 PROPERTIES:");
  console.log("  • Greenwood HOA");
  console.log("  • Sunset Village Apartments");
  console.log("  • Oak Hill Estates");
  
  console.log("\n✨ Super admin has platform access to the /admin portal");
  console.log("✨ Company users access the CRM dashboard and features");
  console.log("✨ Viewer role can read but cannot create/edit/delete");
  console.log("=".repeat(60) + "\n");
  
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
