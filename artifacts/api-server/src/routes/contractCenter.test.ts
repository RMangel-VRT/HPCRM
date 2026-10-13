import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { rateCardItems } from "@workspace/db";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), values: vi.fn(),
  conflict: vi.fn(), set: vi.fn(), where: vi.fn(), order: vi.fn(), returning: vi.fn(),
}));
vi.mock("../db", () => ({ db: { select: mocks.select, insert: mocks.insert, update: mocks.update } }));
import { registerContractCenterRoutes } from "./contractCenter";

const URL = "/api/contract-center/rate-card";
const companyId = "company-1";
const custom = { rateKey: "custom_rate", line: "snow", category: "Custom", label: "Custom rate", priceCents: 100, priceText: null, unit: "per hour", minimum: null };

function app(options: { role?: string; authenticated?: boolean; superAdmin?: boolean; company?: string | null } = {}) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    (req as any).isAuthenticated = () => options.authenticated ?? true;
    (req as any).user = { activeRole: options.role ?? "admin", isSuperAdminBool: options.superAdmin ?? false, activeCompanyId: options.company === undefined ? companyId : options.company };
    next();
  });
  registerContractCenterRoutes(instance);
  return instance;
}

beforeEach(() => {
  vi.resetAllMocks();
  const builder: any = {
    from: vi.fn(() => builder),
    where: mocks.where.mockReturnValue(undefined),
    orderBy: mocks.order,
    values: mocks.values,
    onConflictDoNothing: mocks.conflict,
    returning: mocks.returning,
    set: mocks.set,
  };
  mocks.select.mockReturnValue(builder);
  mocks.insert.mockReturnValue(builder);
  mocks.update.mockReturnValue(builder);
  mocks.where.mockReturnValue(builder);
  mocks.order.mockResolvedValue([]);
  mocks.values.mockReturnValue(builder);
  mocks.conflict.mockReturnValue(builder);
  mocks.set.mockReturnValue(builder);
  mocks.returning.mockResolvedValue([{ id: "rate-1", ...custom }]);
});

describe("Contract Center rate card authorization", () => {
  it.each(["get", "seed", "create", "patch"])("rejects unauthenticated %s without DB access", async action => {
    const agent = request(app({ authenticated: false }));
    const response = action === "get" ? await agent.get(URL)
      : action === "seed" ? await agent.post(`${URL}/seed-defaults`)
      : action === "create" ? await agent.post(URL).send(custom)
      : await agent.patch(`${URL}/rate-1`).send({ priceCents: 200 });
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows office reads but forbids all writes", async () => {
    const agent = request(app({ role: "office" }));
    expect((await agent.get(URL)).status).toBe(200);
    expect((await agent.post(`${URL}/seed-defaults`)).status).toBe(403);
    expect((await agent.post(URL).send(custom)).status).toBe(403);
    expect((await agent.patch(`${URL}/rate-1`).send({ active: false })).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor", "unknown"])("denies role %s for all endpoints", async role => {
    const agent = request(app({ role }));
    expect((await agent.get(URL)).status).toBe(403);
    expect((await agent.post(`${URL}/seed-defaults`)).status).toBe(403);
    expect((await agent.post(URL).send(custom)).status).toBe(403);
    expect((await agent.patch(`${URL}/rate-1`).send({ active: false })).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["admin", "superadmin"])("allows %s reads and writes", async role => {
    const agent = request(app({ role: role === "superadmin" ? "field" : role, superAdmin: role === "superadmin" }));
    expect((await agent.get(URL)).status).toBe(200);
    expect((await agent.post(`${URL}/seed-defaults`)).status).toBe(200);
    expect((await agent.post(URL).send(custom)).status).toBe(201);
    expect((await agent.patch(`${URL}/rate-1`).send({ active: false })).status).toBe(200);
  });

  it("requires an active company even for superadmins", async () => {
    const agent = request(app({ superAdmin: true, company: null }));
    expect((await agent.get(URL)).status).toBe(403);
    expect((await agent.post(`${URL}/seed-defaults`)).status).toBe(403);
    expect((await agent.post(URL).send(custom)).status).toBe(403);
    expect((await agent.patch(`${URL}/rate-1`).send({ active: false })).status).toBe(403);
  });
});

describe("Rate card reads and seeding", () => {
  it("includes retired rates and scopes reads to the company in required order", async () => {
    mocks.order.mockResolvedValue([{ id: "retired", active: false }]);
    const response = await request(app()).get(URL);
    expect(response.body).toEqual([{ id: "retired", active: false }]);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain('"rate_card_items"."company_id"');
    expect(query.params).toEqual([companyId]);
    expect(query.sql).not.toContain("active");
    expect(mocks.order).toHaveBeenCalledWith(rateCardItems.line, rateCardItems.sortOrder, rateCardItems.label);
  });

  it("inserts exactly the 24 defaults, ordered by catalog index, ignoring company/key conflicts", async () => {
    mocks.returning.mockResolvedValue(RATE_CARD_DEFAULTS.map((_, index) => ({ id: `${index}` })));
    const response = await request(app()).post(`${URL}/seed-defaults`);
    expect(response.body).toEqual({ inserted: 24, skipped: 0 });
    expect(mocks.values).toHaveBeenCalledWith(RATE_CARD_DEFAULTS.map(({ key, ...rate }, sortOrder) => ({ ...rate, rateKey: key, companyId, sortOrder })));
    expect(mocks.values.mock.calls[0][0].map((rate: any) => rate.rateKey)).toEqual([
      "rate_general_labor", "rate_emergency_general_labor", "rate_operator_labor", "disposal_rate", "native_broadleaf_rate",
      "pet_station_rate", "winter_water_gallon_rate", "winter_water_hourly_rate", "rate_irrigation_labor",
      "rate_emergency_irrigation_labor", "backflow_rate", "irrigation_auto_limit", "irrigation_notify_cap",
      "rate_service_truck", "rate_plow_truck", "rate_skid_loader", "rate_atv", "rate_snowblower", "rate_hand_shovel",
      "rate_ice_melt_application", "rate_holiday", "rate_ice_melt", "rate_sand_salt", "rate_snow_stakes",
    ]);
    expect(mocks.conflict).toHaveBeenCalledWith({ target: [rateCardItems.companyId, rateCardItems.rateKey] });
  });

  it("reports only actually inserted rows, including a fully skipped repeat", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "new" }]).mockResolvedValueOnce([]);
    const agent = request(app());
    expect((await agent.post(`${URL}/seed-defaults`)).body).toEqual({ inserted: 1, skipped: 23 });
    expect((await agent.post(`${URL}/seed-defaults`)).body).toEqual({ inserted: 0, skipped: 24 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("adds only two missing keys to an edited/retired original card without relabeling ATV", async () => {
    const original = RATE_CARD_DEFAULTS.filter(r => !["rate_operator_labor", "rate_snowblower"].includes(r.key))
      .map(({ key, ...r }) => ({ ...r, rateKey: key, active: false, priceCents: 123, label: key === "rate_atv" ? "ATV / snowblower" : "Edited" }));
    const stored = new Map(original.map(r => [r.rateKey, r]));
    const before = JSON.stringify(original);
    mocks.returning.mockImplementation(async () => {
      const inserted = [];
      for (const r of mocks.values.mock.lastCall![0]) {
        if (stored.has(r.rateKey)) continue;
        stored.set(r.rateKey, r);
        inserted.push({ id: r.rateKey });
      }
      return inserted;
    });
    expect((await request(app()).post(`${URL}/seed-defaults`)).body).toEqual({ inserted: 2, skipped: 22 });
    expect(JSON.stringify(original.map(r => stored.get(r.rateKey)))).toBe(before);
    expect((await request(app()).post(`${URL}/seed-defaults`)).body).toEqual({ inserted: 0, skipped: 24 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("Rate card creation and PATCH safety", () => {
  it("owns company, timestamps and creation defaults; allows explicit null prices", async () => {
    const response = await request(app()).post(URL).send({
      ...custom, priceCents: null, companyId: "foreign", id: "injected", active: false, sortOrder: 999, updatedAt: "injected",
    });
    expect(response.status).toBe(201);
    expect(mocks.values.mock.calls[0][0]).toEqual({ ...custom, companyId, priceCents: null });
  });

  it("returns 409 on a duplicate company key using race-safe conflict handling", async () => {
    mocks.returning.mockResolvedValue([]);
    expect((await request(app()).post(URL).send(custom)).status).toBe(409);
    expect(mocks.conflict).toHaveBeenCalledWith({ target: [rateCardItems.companyId, rateCardItems.rateKey] });
  });

  it.each([
    { rateKey: "x" }, { rateKey: "Upper_case" }, { rateKey: "a".repeat(64) },
    { line: "bad" }, { priceCents: -1 }, { priceCents: 1.5 }, { priceCents: "100" },
    { priceCents: 2147483648 }, { priceText: "x".repeat(61) }, { unit: "" },
    { unit: "x".repeat(81) }, { minimum: "x".repeat(41) }, { label: "" }, { category: "" },
  ])("rejects invalid creation %j", async invalid => {
    expect((await request(app()).post(URL).send({ ...custom, ...invalid })).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("strips immutable identifiers and all absent defaults from PATCH", async () => {
    const response = await request(app()).patch(`${URL}/rate-1`).send({ rateKey: "x", line: "invalid", priceCents: 100, companyId: "foreign" });
    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith({ priceCents: 100, updatedAt: expect.any(Date) });
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain('"rate_card_items"."company_id"');
    expect(query.sql).toContain('"rate_card_items"."id"');
    expect(query.params).toEqual(["rate-1", companyId]);
  });

  it.each([{}, { rateKey: "x" }, { line: "snow" }, { rateKey: "x", line: "snow" }, { companyId: "foreign", activeUnknown: false }])("rejects empty or immutable-only writes %j", async body => {
    const response = await request(app()).patch(`${URL}/rate-1`).send(body);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Nothing to update");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves explicit nulls and false and allows all mutable fields", async () => {
    const update = { label: "New", category: "New group", priceCents: null, priceText: null, unit: "each", minimum: null, sortOrder: 7, active: false };
    expect((await request(app()).patch(`${URL}/rate-1`).send(update)).status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith({ ...update, updatedAt: expect.any(Date) });
  });

  it.each([{ priceCents: -1 }, { priceCents: 1.5 }, { active: "false" }, { sortOrder: 1.5 }, { unit: null }, { priceText: "x".repeat(61) }])("rejects invalid PATCH %j", async body => {
    expect((await request(app()).patch(`${URL}/rate-1`).send(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an ID outside the active company", async () => {
    mocks.returning.mockResolvedValue([]);
    expect((await request(app()).patch(`${URL}/foreign-id`).send({ priceCents: 200 })).status).toBe(404);
    expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual(["foreign-id", companyId]);
  });
});
