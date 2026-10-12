import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  sessionStore: undefined as any,
  getUserById: vi.fn(), getUserByEmail: vi.fn(), getUserByPhone: vi.fn(),
  getCompanyUsersByUserId: vi.fn(), getCompanyUser: vi.fn(), getCompanyById: vi.fn(),
}));
vi.mock("./storage", () => ({ storage }));
vi.mock("@workspace/db", () => ({ hashPassword: vi.fn(), comparePasswords: vi.fn().mockResolvedValue(true) }));
import { setupAuth } from "./auth";

let app: ReturnType<typeof express>;
let memberships: any[];
let user: any;
beforeAll(() => {
  storage.sessionStore = new session.MemoryStore();
  app = express(); app.use(express.json());
  setupAuth(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "viewer", email: "viewer@example.test", passwordHash: "test-hash", isSuperAdmin: "false", defaultCompanyId: "one" };
  memberships = [
    { userId: "viewer", companyId: "one", role: "office", status: "active", tags: ["billing"] },
    { userId: "viewer", companyId: "two", role: "field_manager", status: "active", tags: [] },
    { userId: "viewer", companyId: "suspended", role: "office", status: "suspended", tags: ["billing"] },
  ];
  storage.getUserById.mockImplementation(async () => user);
  storage.getUserByEmail.mockImplementation(async () => user);
  storage.getCompanyUsersByUserId.mockImplementation(async () => memberships);
  storage.getCompanyUser.mockImplementation(async (_id, companyId) => memberships.find(m => m.companyId === companyId));
  storage.getCompanyById.mockImplementation(async (id: string) => ({ id, name: id }));
});

describe("active-company tags through real passport sessions", () => {
  it("returns tags at login/me and preserves switched company after deserialization without borrowing tags", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ username: "viewer@example.test", password: "test-password" });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ activeCompanyId: "one", activeRole: "office", activeTags: ["billing"] });
    expect(login.body).not.toHaveProperty("passwordHash");
    expect((await agent.get("/api/auth/me")).body.activeTags).toEqual(["billing"]);
    const switched = await agent.post("/api/user/switch-company").send({ companyId: "two" });
    expect(switched.body).toMatchObject({ activeCompanyId: "two", activeRole: "field_manager", activeTags: [] });
    const me = await agent.get("/api/auth/me");
    expect(me.body).toMatchObject({ activeCompanyId: "two", activeRole: "field_manager", activeTags: [] });
    memberships[1].tags = ["billing"];
    expect((await agent.get("/api/auth/me")).body.activeTags).toEqual(["billing"]);
    expect((await agent.post("/api/user/switch-company").send({ companyId: "suspended" })).status).toBe(403);
  });
  it("defaults missing active membership tags to []", async () => {
    memberships[0].tags = null;
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ username: "viewer@example.test", password: "test-password" });
    expect(login.body.activeTags).toEqual([]);
    expect((await agent.get("/api/auth/me")).body.activeTags).toEqual([]);
  });
  it("super-admin tags come only from active membership in selected company, never another company", async () => {
    user.isSuperAdmin = "true"; user.defaultCompanyId = "two";
    const agent = request.agent(app);
    expect((await agent.post("/api/auth/login").send({ username: "viewer@example.test", password: "test-password" })).body.activeTags).toEqual([]);
    expect((await agent.post("/api/user/switch-company").send({ companyId: "one" })).body.activeTags).toEqual(["billing"]);
    expect((await agent.get("/api/auth/me")).body).toMatchObject({ activeCompanyId: "one", activeTags: ["billing"], activeRole: "admin" });
    expect((await agent.post("/api/user/switch-company").send({ companyId: "suspended" })).body.activeTags).toEqual([]);
    expect((await agent.get("/api/auth/me")).body.activeTags).toEqual([]);
  });
});
