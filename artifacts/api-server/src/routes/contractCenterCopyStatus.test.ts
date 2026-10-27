import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { termLegacySources } from "@workspace/db";
const mocks = vi.hoisted(() => ({ select: vi.fn(), where: vi.fn(), from: vi.fn() }));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("../objectStorage", () => ({ ObjectStorageService: vi.fn() }));
vi.mock("../objectAcl", () => ({ ObjectAccessGroupType: { COMPANY_MEMBER: "company_member" }, ObjectPermission: { READ: "read" } }));
vi.mock("../utils/parentGuard", () => ({ assertNotParentCustomer: vi.fn() }));
vi.mock("../storage", () => ({ storage: {} }));
import { registerContractCenterRoutes } from "./contractCenter";
function app(role = "admin", company: string | null = "company", authenticated = true, superadmin = false) {
  const instance = express();
  instance.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated,
      user: { activeRole: role, activeCompanyId: company, isSuperAdminBool: superadmin } });
    next();
  });
  registerContractCenterRoutes(instance); return instance;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockResolvedValue([{ firstCopiedAt: null, copiedContracts: 0 }]);
});
describe("copy provenance", () => {
  it("reports no copy without substituting a run timestamp", async () => {
    expect((await request(app()).get("/api/contract-center/copy-status")).body).toEqual({ firstCopiedAt: null, copiedContracts: 0 });
  });
  it.each(["admin", "office"])("allows %s and counts distinct source IDs, not terms", async role => {
    mocks.where.mockResolvedValue([{ firstCopiedAt: "2026-10-13 15:00:00", copiedContracts: 3 }]);
    const client = request(app(role));
    const first = await client.get("/api/contract-center/copy-status");
    const repeated = await client.get("/api/contract-center/copy-status");
    expect(first.body).toEqual({ firstCopiedAt: "2026-10-13 15:00:00", copiedContracts: 3 });
    expect(repeated.body).toEqual(first.body);
    expect(mocks.from).toHaveBeenCalledWith(termLegacySources);
    const fields = mocks.select.mock.calls[0][0];
    expect(new PgDialect().sqlToQuery(fields.firstCopiedAt).sql).toContain('min("term_legacy_sources"."created_at")');
    expect(new PgDialect().sqlToQuery(fields.copiedContracts).sql).toContain('count(distinct "term_legacy_sources"."legacy_contract_id")');
  });
  it("scopes the aggregation by active company", async () => {
    await request(app("office", "other")).get("/api/contract-center/copy-status");
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual(["other"]);
    expect(query.sql).toContain('"term_legacy_sources"."company_id"');
  });
  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor", "unknown"])("denies %s before reads", async role => {
    expect((await request(app(role)).get("/api/contract-center/copy-status")).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("requires authentication and company, even for superadmin", async () => {
    expect((await request(app("admin", "company", false)).get("/api/contract-center/copy-status")).status).toBe(401);
    expect((await request(app("field", null, true, true)).get("/api/contract-center/copy-status")).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
