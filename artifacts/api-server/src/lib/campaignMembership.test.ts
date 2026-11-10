import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  years: [] as { companyId: string; year: number; enabledAt: Date }[],
  reconcile: vi.fn(), transaction: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock("../db", () => {
  const query = () => {
    const chain = { from: () => chain, where: () => chain, orderBy: async () => mocks.years,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.years).then(resolve) };
    return chain;
  };
  return { db: { select: query, selectDistinct: query,
    transaction: (work: (tx: unknown) => unknown) => mocks.transaction(work) } };
});
vi.mock("./campaignReconcile", () => ({ reconcileCampaigns: mocks.reconcile }));
vi.mock("./logger", () => ({ logger: { error: mocks.error, info: mocks.info } }));
import { campaignMembershipStatus, reconcileEnabledCampaignYears, registerCampaignMembershipReconciliation,
  scheduleCampaignMembership, runCampaignMembershipSweep, startCampaignMembershipSweep } from "./campaignMembership";

const report = () => ({ created: [], deleted: [], added: [], removed: [], keptNotOwed: [], missed: [], gaps: [], waitingOnSignature: 0 });
const year = 2027, enabledAt = new Date("2026-11-10T12:00:00Z");
beforeEach(() => {
  mocks.years = [{ companyId: "a", year, enabledAt }];
  mocks.reconcile.mockReset().mockResolvedValue(report());
  mocks.transaction.mockReset().mockImplementation(async work => work({
    execute: vi.fn(), select: () => ({ from: () => ({ where: async () => mocks.years }) }),
  }));
  mocks.error.mockClear(); mocks.info.mockClear();
});
describe("CG3 independent membership queue", () => {
  it("queues all rapid writes in order without overlapping one company's work", async () => {
    let release!: () => void;
    mocks.reconcile.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(report()); }));
    const first = scheduleCampaignMembership("serial", "2026-11-10");
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1));
    const second = scheduleCampaignMembership("serial", "2026-11-10");
    const third = scheduleCampaignMembership("serial", "2026-11-10");
    await Promise.resolve(); expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    release(); await Promise.all([first, second, third]);
    expect(mocks.reconcile).toHaveBeenCalledTimes(3);
  });
  it("does not block a second company behind the first", async () => {
    let release!: () => void;
    mocks.reconcile.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(report()); }));
    const a = scheduleCampaignMembership("slow", "2026-11-10");
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1));
    await scheduleCampaignMembership("fast", "2026-11-10");
    expect(mocks.reconcile).toHaveBeenCalledTimes(2); release(); await a;
  });
  it("records failure, continues other years, and recovers on a later queued retry", async () => {
    mocks.years.push({ companyId: "a", year: 2028, enabledAt });
    mocks.reconcile.mockRejectedValueOnce(new Error("fixture failure"));
    await scheduleCampaignMembership("retry", "2026-11-10");
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    expect((await campaignMembershipStatus("retry", year)).error).toContain("hourly");
    await scheduleCampaignMembership("retry", "2026-11-10");
    expect(await campaignMembershipStatus("retry", year)).toMatchObject({ error: null, changes: 0 });
    expect(mocks.error).toHaveBeenCalledTimes(1);
  });
  it("does nothing without enabled years and falls back to enabled time after restart", async () => {
    expect(await campaignMembershipStatus("fresh", year)).toMatchObject({ checkedAt: null, enabledAt: enabledAt.toISOString() });
    mocks.years = [];
    await reconcileEnabledCampaignYears("disabled", "2026-11-10");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect((await campaignMembershipStatus("disabled", year)).enabledAt).toBeNull();
  });
  it("sweeps through the same company queue rather than the contract-question queue", async () => {
    await runCampaignMembershipSweep("2026-11-10");
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.anything(), "a", year, { dryRun: false, today: "2026-11-10" });
  });
  it("runs at startup and hourly and cancels its interval on shutdown", async () => {
    vi.useFakeTimers();
    try {
      const stop = startCampaignMembershipSweep();
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.reconcile).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(mocks.reconcile).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it("captures company at entry and excludes failed writes, reads and campaign edits", async () => {
    const app = express();
    const user = { activeCompanyId: "entry-company" };
    app.use((req, _res, next) => { Object.assign(req, { user }); next(); });
    registerCampaignMembershipReconciliation(app);
    app.use((req, res) => {
      user.activeCompanyId = "changed-company";
      res.sendStatus(req.path.endsWith("fail") ? 400 : 204);
    });
    await request(app).patch("/api/contract-center/terms/one");
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1));
    expect(mocks.reconcile.mock.calls[0][1]).toBe("entry-company");
    for (const path of ["/api/campaigns/one", "/api/campaign-generation/2027", "/api/customers/fail"])
      await request(app).post(path);
    await request(app).get("/api/customers");
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    await request(app).put("/api/service-programs/chemical/1");
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(2));
  });
});
