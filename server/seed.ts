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

  console.log("\nSeed completed!");
  console.log("\nTest users:");
  console.log("  admin@greenscape.com / admin123 (Admin)");
  console.log("  office@greenscape.com / office123 (Office)");
  console.log("  ops@greenscape.com / ops123 (Operations)");
  console.log("  viewer@greenscape.com / viewer123 (Viewer)");
  
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
