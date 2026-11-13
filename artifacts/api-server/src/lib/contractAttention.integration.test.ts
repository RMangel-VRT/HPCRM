import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { companies, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { createAttentionFixture } from "./contractAttentionFixture";
import { removeNonRenewalFixture } from "./contractNonRenewalFixture";
import { loadContractAttention, loadContractList, fullDetail, contractsSection } from "./contractCenterPersistence";
import { applyContractStatus } from "./contractCenterStatusChange";
import { recordNonRenewal } from "./contractNonRenewal";
import { companyToday } from "./companyDay";
import { contractNeedsAction, contractSegment } from "@workspace/db/contract-attention";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { writeFile } from "node:fs/promises";
import { customerContractProjector, loadCustomerContractInputs } from "./customerContractSummary";

const enabled = process.env.CC_ATTN_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("CC-ATTN real disposable company", () => {
  let f: Awaited<ReturnType<typeof createAttentionFixture>>;
  beforeAll(async () => {
    const counts = [];
    for (const company of await db.select({ id: companies.id }).from(companies)) {
      const result = await loadContractAttention(db, company.id);
      counts.push({ company: counts.length + 1, total: result.total, counts: result.counts,
        sum: Object.values(result.counts).reduce((a, b) => a + b, 0), flagged: result.flagged });
    }
    await writeFile("../../generated-artifacts/cc-attn/development-counts.json", JSON.stringify({ day: companyToday(), companies: counts }, null, 2));
    f = await createAttentionFixture();
  }, 30000);
  afterAll(async () => {
    if (f) await removeNonRenewalFixture(f.companyId, f.userId);
    await pool.end(); await schemaPool.end();
  });
  it("uses the same states for list, detail, attention, customer summaries, dashboard and progress", async () => {
    const a = await loadContractAttention(db, f.companyId);
    expect(a.total).toBe(9); expect(Object.values(a.counts).reduce((a, b) => a + b, 0)).toBe(9);
    expect(a.counts.unclassified).toBe(0);
    for (const [state, count] of Object.entries(a.counts)) if (state !== "unclassified") expect(count).toBe(1);
    expect(a.flagged.active_no_contract).toBe(1);
    const list = await loadContractList(db, f.companyId);
    const customer = customerContractProjector(await loadCustomerContractInputs(db, f.companyId));
    for (const row of list) {
      expect(contractNeedsAction(row.state)).toBe(["decision", "due", "drafted"].includes(contractSegment(row.state)));
      const detail = await fullDetail(db, f.companyId, row.id);
      for (const key of ["state", "stateSince", "stateReason", "flags", "allowedActions", "actionTermId"] as const)
        expect(detail[key]).toEqual(row[key]);
      const summary = customer(row.customerId)!;
      for (const term of [...summary.current, ...summary.previous, ...summary.upcoming])
        expect(term.state).toBe(row.state);
    }
    const section = await contractsSection(db, f.companyId);
    expect(section.count).toBe(a.counts.ended_no_decision + a.counts.working_unsigned + a.counts.unclassified + a.counts.renewal_due);
    expect(section.count).toBe(3);
    expect(list.find(r => r.state === "serving_not_renewing")?.renewalProgress).toMatchObject({ due: true, notRenewing: true });
    expect(list.find(r => r.state === "ended_no_decision")?.current?.displayStatus).toBe("expired");
  });
  it("performs authorized signing and non-renewal only on disposable data and refreshes all projections", async () => {
    const target = f.ids.working_unsigned;
    const before = await fullDetail(db, f.companyId, target.agreementId);
    expect(before.allowedActions).toContain("mark_signed");
    await db.transaction(tx => applyContractStatus(tx, { companyId: f.companyId, userId: f.userId,
      termId: before.actionTermId!, to: "signed" }));
    expect((await fullDetail(db, f.companyId, target.agreementId)).state).toBe("renewal_due");
    const due = f.ids.renewal_due;
    await db.transaction(tx => recordNonRenewal(tx, f.companyId, f.userId, due.termId, {
      decidedOn: companyToday(), reason: "other", note: "Disposable test only", deactivateCustomer: false,
    }));
    const after = await loadContractAttention(db, f.companyId);
    expect(after.counts.working_unsigned).toBe(0);
    expect((await fullDetail(db, f.companyId, due.agreementId)).state).toBe("serving_not_renewing");
  });
  it("serves the actual serialized response while keeping the existing permission gate", async () => {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => true,
      user: { id: f.userId, activeCompanyId: f.companyId, accessRole: "office", activeRole: "office" } }); next(); });
    registerContractCenterRoutes(app);
    const response = await request(app).get("/api/contract-center/attention").expect(200);
    expect(response.body.total).toBe(9);
    expect(response.headers["cache-control"]).toContain("no-store");
  });
});
