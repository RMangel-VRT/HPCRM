import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import { insertCompanyUserSchema } from "@workspace/db";
import { z } from "zod";
import { accessRole, ROLE_VALUES } from "../../../../lib/db/src/accessRole";
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
// Execute the production role-management handlers, not a duplicate implementation.
const sections = [
  source.slice(source.indexOf('  app.post("/api/companies/users/create",'), source.indexOf('  // Team Members endpoint')),
  source.slice(source.indexOf('  app.post("/api/companies/users",'), source.indexOf('  app.delete("/api/company-users/:id",')),
];
function mount(role: string) {
  const memberships = [{ id: "membership", userId: "candidate", companyId: "co", role: "office", status: "suspended", tags: ["billing"] }];
  const identities = new Map<string, any>([["candidate", { id: "candidate", isSuperAdmin: "false" }]]);
  const storage = {
    getUserByEmail: vi.fn().mockResolvedValue(undefined), getUserByPhone: vi.fn().mockResolvedValue(undefined),
    createUser: vi.fn(async (value: any) => { identities.set("new-user", { ...value, id: "new-user" }); return identities.get("new-user"); }),
    createCompanyUser: vi.fn(async (value: any) => ({ ...value, id: "new-member" })),
    getCompanyUserById: vi.fn(async (id: string) => memberships.find(m => m.id === id)),
    getUserById: vi.fn(async (id: string) => identities.get(id)),
    updateCompanyUser: vi.fn(async (id: string, updates: any) => {
      const m = memberships.find(m => m.id === id); if (m) Object.assign(m, updates); return m;
    }),
  };
  const app = express(); app.use(express.json()); app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { activeCompanyId: "co", activeRole: role, accessRole: accessRole(role), isSuperAdminBool: false } as Express.User;
    next();
  });
  for (const section of sections) new Function("app", "storage", "hashPassword", "ROLE_VALUES", "insertCompanyUserSchema", "z",
    transformSync(section, { loader: "ts", target: "es2022" }).code)(app, storage, async () => "synthetic-hash", ROLE_VALUES, insertCompanyUserSchema, z);
  return { app, storage, memberships };
}
describe("real membership role-management transports", () => {
  it("invites an existing user with real account_manager membership identity", async () => {
    const { app, storage } = mount("account_manager");
    expect((await request(app).post("/api/companies/users").send({ userId: "candidate", role: "account_manager" })).status).toBe(200);
    expect(storage.createCompanyUser).toHaveBeenCalledWith(expect.objectContaining({ role: "account_manager", companyId: "co" }));
  });
  it("creates an account manager without altering credentials or the real role of existing people", async () => {
    const { app, storage, memberships } = mount("account_manager");
    const response = await request(app).post("/api/companies/users/create").set("X-Company-Id", "co")
      .send({ name: "Synthetic candidate", email: "synthetic@example.invalid", password: "synthetic-test-only", role: "account_manager", language: "es" });
    expect(response.status).toBe(201);
    expect(storage.createCompanyUser).toHaveBeenCalledWith(expect.objectContaining({ role: "account_manager" }));
    expect(response.body).not.toHaveProperty("passwordHash"); expect(memberships[0].role).toBe("office");
  });
  it("changes the existing role without resetting suspended status/tags; rejects company-switch races and nonadmins", async () => {
    const { app, memberships } = mount("account_manager");
    expect((await request(app).patch("/api/company-users/membership").set("X-Company-Id", "co").send({ role: "account_manager" })).status).toBe(200);
    expect(memberships[0]).toMatchObject({ role: "account_manager", status: "suspended", tags: ["billing"] });
    expect((await request(app).patch("/api/company-users/membership").set("X-Company-Id", "other").send({ role: "admin" })).status).toBe(409);
    expect((await request(mount("field").app).patch("/api/company-users/membership").send({ role: "account_manager" })).status).toBe(403);
  });
});
