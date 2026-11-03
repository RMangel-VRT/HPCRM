import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import { and, eq } from "drizzle-orm";
import { customers, insertCustomerSchema, propertyManagementCompanies } from "@workspace/db";
import { db } from "../db";
import { pickProvided } from "../lib/patchBody";
import { billingInputProblem, protectedBillingWrite } from "../services/customerBillingInput";
import { withCustomerSyncLock } from "../services/qboCustomerSync";
import { writeCustomer } from "../services/qboCustomerWrites";

// Run the actual PATCH handler against PostgreSQL without starting unrelated
// jobs or mounting the application's authentication/session bootstrap.
const source = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.patch("/api/customers/:id",');
const end = source.indexOf('  app.delete("/api/customers/:id",', start);
if (start < 0 || end < 0) throw new Error("Customer PATCH handler not found");
const mount = new Function("app", "storage", "insertCustomerSchema", "pickProvided",
  "billingInputProblem", "protectedBillingWrite", "storageBillingContext",
  transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code);

export function customerPatchApp(companyId: string) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { activeCompanyId: companyId, activeRole: "admin" } as Express.User;
    next();
  });
  const storage = {
    getCustomerById: async (id: string, company: string) => (await db.select().from(customers).where(and(
      eq(customers.id, id), eq(customers.companyId, company))))[0],
    getPropertyManagementCompanyById: async (id: string, company: string) => (await db.select().from(propertyManagementCompanies)
      .where(and(eq(propertyManagementCompanies.id, id), eq(propertyManagementCompanies.companyId, company))))[0],
    updateCustomer: (id: string, company: string, updates: Parameters<typeof writeCustomer>[3], expected?: Date) =>
      withCustomerSyncLock(company, tx => writeCustomer(tx, id, company, updates, expected)),
  };
  mount(app, storage, insertCustomerSchema, pickProvided, billingInputProblem, protectedBillingWrite,
    (company: string) => ({ companyId: company, ...storage }));
  return app;
}
