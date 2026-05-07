/**
 * Test-only database seeding helpers.
 *
 * Each helper inserts a minimal valid row into the real (dev/test) PostgreSQL
 * database using a caller-supplied companyId so tests stay fully isolated.
 * Call cleanupTestCompany(companyId) in afterEach — CASCADE deletes everything.
 *
 * Usage:
 *   const companyId = await createTestCompany();
 *   const customerId = await createTestCustomer(companyId);
 *   const contactId  = await createTestContact(companyId, customerId, ["a@b.com"]);
 *   // ... test ...
 *   await cleanupTestCompany(companyId);
 */

import { randomUUID } from "crypto";
import { db } from "../../db";
import { companies, customers, contacts, communications } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Safety guard: refuse to run against a production database.
 * Checked once at module load time so no seed/cleanup call can slip through.
 *
 * Passes when:
 *   - NODE_ENV is not "production", AND
 *   - DATABASE_URL does not look like a production endpoint
 *     (i.e. does not contain "-prod", "production", or "neondb.net/prod")
 */
function assertNotProduction(): void {
  const env = process.env.NODE_ENV ?? "";
  const dbUrl = (process.env.DATABASE_URL ?? "").toLowerCase();

  if (env === "production") {
    throw new Error(
      "[dbSeed] Refused to run: NODE_ENV is 'production'. " +
        "Test helpers must not execute against a production database.",
    );
  }

  const prodPatterns = [/-prod[^a-z]/, /[/?]production/, /\/prod$/];
  if (prodPatterns.some((re) => re.test(dbUrl))) {
    throw new Error(
      "[dbSeed] Refused to run: DATABASE_URL appears to point to a production " +
        "database. Set a dedicated test DATABASE_URL before running tests.",
    );
  }
}

assertNotProduction();

export async function createTestCompany(): Promise<string> {
  const id = randomUUID();
  await db.insert(companies).values({
    id,
    name: `Test Company ${id}`,
    slug: `test-${id}`,
  });
  return id;
}

export interface TestCustomerOpts {
  name?: string;
  street?: string;
  customerNumber?: string;
  managementCompany?: string;
  active?: "true" | "false";
}

export async function createTestCustomer(
  companyId: string,
  opts: TestCustomerOpts = {},
): Promise<string> {
  const id = randomUUID();
  await db.insert(customers).values({
    id,
    companyId,
    name: opts.name ?? "Test Customer",
    street: opts.street ?? "123 Test Street",
    city: "Testville",
    state: "TX",
    zip: "79000",
    active: opts.active ?? "true",
    managementCompany: opts.managementCompany ?? null,
    customerNumber: opts.customerNumber ?? null,
  });
  return id;
}

export async function createTestContact(
  companyId: string,
  customerId: string,
  emails: string[],
): Promise<string> {
  const id = randomUUID();
  await db.insert(contacts).values({
    id,
    companyId,
    customerId,
    name: "Test Contact",
    emails,
  });
  return id;
}

export interface TestCommunicationOpts {
  providerMessageId?: string;
  providerThreadId?: string;
  subject?: string;
}

export async function createTestCommunication(
  companyId: string,
  customerId: string,
  opts: TestCommunicationOpts = {},
): Promise<string> {
  const id = randomUUID();
  await db.insert(communications).values({
    id,
    companyId,
    customerId,
    subject: opts.subject ?? "Test Subject",
    body: "",
    type: "email",
    direction: "inbound",
    status: "sent",
    providerMessageId: opts.providerMessageId ?? null,
    providerThreadId: opts.providerThreadId ?? null,
  });
  return id;
}

export async function cleanupTestCompany(companyId: string): Promise<void> {
  await db.delete(companies).where(eq(companies.id, companyId));
}
