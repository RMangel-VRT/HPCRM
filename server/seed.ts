import { storage } from "./storage";
import { hashPassword } from "./auth";

async function seed() {
  console.log("Seeding database with test users...");

  const testUsers = [
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

  for (const userData of testUsers) {
    const existingUser = await storage.getUserByEmail(userData.email);
    if (!existingUser) {
      const passwordHash = await hashPassword(userData.password);
      await storage.createUser({
        email: userData.email,
        passwordHash,
        name: userData.name,
        role: userData.role,
      });
      console.log(`✓ Created user: ${userData.email} (${userData.role})`);
    } else {
      console.log(`- User already exists: ${userData.email}`);
    }
  }

  // Seed sample properties
  console.log("\nSeeding sample properties...");

  const sampleProperties = [
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
    },
    {
      name: "Riverside Commons",
      street: "5620 River Road",
      city: "Salem",
      state: "OR",
      zip: "97301",
      propertyManagerName: "Maria Rodriguez",
      propertyManagerPhone: "(503) 555-0789",
      propertyManagerEmail: "maria.r@riversidecommons.org",
      notes: "Mixed-use development. Seasonal flower bed maintenance required.",
    },
  ];

  for (const propertyData of sampleProperties) {
    const property = await storage.createProperty(propertyData);
    console.log(`✓ Created property: ${propertyData.name}`);
  }

  console.log("\nSeed completed!");
  console.log("\nTest users:");
  console.log("  admin@greenscape.com / admin123 (Admin)");
  console.log("  office@greenscape.com / office123 (Office)");
  console.log("  ops@greenscape.com / ops123 (Operations)");
  console.log("  viewer@greenscape.com / viewer123 (Viewer)");
  console.log("\nSample properties:");
  console.log("  - Greenwood HOA (Portland)");
  console.log("  - Sunset Village Apartments (Eugene)");
  console.log("  - Riverside Commons (Salem)");
  
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
