import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRequiredSqlObjectsRoutes } from "./requiredSqlObjects";

const mocks = vi.hoisted(() => ({ status: vi.fn(), readFile: vi.fn(), log: vi.fn() }));
vi.mock("../db", () => ({ pool: {} }));
vi.mock("../lib/logger", () => ({ logger: { error: mocks.log } }));
vi.mock("@workspace/db/required-sql-objects", () => ({ readRequiredSqlObjects: mocks.status }));
vi.mock("node:fs/promises", async importActual => ({
  ...await importActual<object>(),
  readFile: mocks.readFile,
}));

const endpoint = "/api/settings/database/sql-objects";
const row = {
  id: "routes-retirement-trigger", label: "Routes customer-retirement trigger",
  kind: "trigger", sqlFile: "0062-routes-customer-retirement.sql",
};

function appFor(role: string | null, activeCompanyId: string | null = "company-a") {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      isAuthenticated: () => role !== null,
      user: role && { accessRole: role, activeCompanyId, isSuperAdminBool: false },
    });
    next();
  });
  registerRequiredSqlObjectsRoutes(app);
  return app;
}

describe("SQL-only object status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.status.mockResolvedValue([{ ...row, present: true }]);
  });

  it("rejects unauthenticated and non-admin callers before reading the catalog or SQL", async () => {
    for (const role of [null, "office", "account_manager", "crew_supervisor"]) {
      const response = await request(appFor(role)).get(endpoint);
      expect(response.status).toBe(role === null ? 401 : 403);
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(appFor("admin", null)).get(endpoint)).status).toBe(403);
    expect((await request(appFor("admin")).get(endpoint).set("X-Company-Id", "other")).status).toBe(409);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("returns admin status and serves only exact registry SQL for missing objects", async () => {
    expect((await request(appFor("admin")).get(endpoint)).body).toEqual({ objects: [{ ...row, present: true }] });
    expect(mocks.readFile).not.toHaveBeenCalled();
    mocks.status.mockResolvedValue([{ ...row, present: false }]);
    mocks.readFile.mockResolvedValue("BEGIN;\nCOMMIT;\n");
    const result = await request(appFor("admin")).get(endpoint).query({ file: "../outside.sql" });
    expect(result.body.objects[0]).toMatchObject({ ...row, present: false, remediationSql: "BEGIN;\nCOMMIT;\n" });
    const [url] = mocks.readFile.mock.calls[0]!;
    expect(String(url)).toMatch(/\/assets\/production-sql\/0062-routes-customer-retirement\.sql$/);
    expect((await request(appFor("admin")).post(endpoint)).status).toBe(404);
  });

  it("does not report a failed query as missing and does not expose the error", async () => {
    mocks.status.mockRejectedValue(new Error("sensitive connection detail"));
    const response = await request(appFor("admin")).get(endpoint);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: "Database object status could not be checked" });
    expect(mocks.log).toHaveBeenCalledWith("REQUIRED_SQL_OBJECT_STATUS_UNAVAILABLE");
  });
});
