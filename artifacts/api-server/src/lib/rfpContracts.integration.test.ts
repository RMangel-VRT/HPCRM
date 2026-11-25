import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agreements, agreementTerms, customers, tickets, ticketTypes, ticketStatusHistory, termStatusHistory, ticketNotifications, ticketFieldValues, ticketTypeFields } from "@workspace/db";
import { db, pool, inTransaction } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { registerRfpLost } from "../routes/rfpLost";
import { registerTicketExpectedCompany } from "./ticketExpectedCompany";
import { createRfpFixture, removeRfpFixture } from "./rfpContractFixture";
import { guardManualRfpStatus, lockRfp } from "./rfpContracts";
import { applyTicketStatus } from "./ticketStatusChange";
import * as persistence from "./contractCenterPersistence";
import { companyToday } from "./companyDay";

const enabled = process.env.RFP_CONTRACT_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("RFP contracts in disposable development company", () => {
  // These are remote-Postgres transaction tests, not in-memory unit tests.
  vi.setConfig({ testTimeout: 20000 });
  let f: Awaited<ReturnType<typeof createRfpFixture>>;
  beforeAll(async () => { f = await createRfpFixture(); }, 30000);
  afterAll(async () => { if (f) await removeRfpFixture(f.companyId, f.userId); await pool.end(); });
  function api(companyId: string = f.companyId, role = "office", authenticated = true) {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => authenticated, user: {
        id: f.userId, activeCompanyId: companyId, activeRole: role, accessRole: role,
      } }); next();
    });
    registerTicketExpectedCompany(app);
    registerContractCenterRoutes(app);
    registerRfpLost(app);
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ message: error.message });
    });
    return request(app);
  }
  const base = "/api/contract-center";
  const payload = (bidTicketId?: string, customerId: string = f.customerId) => ({ bidTicketId, customerId, line: "both", form: "ours",
    separateReason: "Intentionally separate disposable RFP scenario",
    term: { seasonLabel: "2027", startDate: "2027-01-01", endDate: "2027-12-31", snowPricing: "time_and_materials" },
    scope: [], rates: [], payments: [] });
  async function create(id?: string, customerId?: string) {
    const res = await api().post(`${base}/contracts`).send(payload(id, customerId));
    expect(res.status, JSON.stringify(res.body)).toBe(201); return res.body;
  }
  const move = (termId: string, to: string) => api().post(`${base}/terms/${termId}/status`).send({ to });
  const ticket = async (id: string) => (await db.select().from(tickets).where(eq(tickets.id, id)))[0];
  const history = (id: string) => db.select().from(ticketStatusHistory).where(eq(ticketStatusHistory.ticketId, id));
  const lossPath = (id: string) => `/api/tickets/${id}/rfp/lost`;
  const answers = (id: string) => db.select().from(ticketFieldValues).where(eq(ticketFieldValues.ticketId, id));
  const lostField = (key: string) => f.fields.find(field => field.statusId === f.status("closed_lost").id && field.fieldKey === key)!;

  it("lets an admin close an RFP without a contract, using the actual Lost options and returning the committed ticket", async () => {
    const rfp = await f.createRfp("reviewing");
    const url = lossPath(rfp.id);
    const admin = api(f.companyId, "admin");
    for (const body of [{}, { lossReason: "" }, { lossReason: "Competitor" }, { lossReason: "Price", lossNotes: 123 }]) {
      expect((await admin.post(url).send(body)).status).toBe(400);
    }
    expect(await answers(rfp.id)).toEqual([]);
    expect(await history(rfp.id)).toEqual([]);
    const reason = lostField("loss_reason");
    const option = "Builder-defined reason";
    await db.update(ticketTypeFields).set({ options: [option] }).where(eq(ticketTypeFields.id, reason.id));
    try {
      expect((await admin.post(url).send({ lossReason: "Price" })).status).toBe(400);
      const result = await admin.post(url).send({ lossReason: option });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body).toMatchObject({ id: rfp.id, currentStatusId: f.status("closed_lost").id,
        companyId: f.companyId, completedByUserId: f.userId, completedAt: expect.any(String) });
      expect(await answers(rfp.id)).toEqual([expect.objectContaining({ fieldId: reason.id, value: option, capturedById: f.userId })]);
      expect((await admin.post(url).send({ lossReason: option })).status).toBe(409);
      expect(await history(rfp.id)).toHaveLength(1);
    } finally {
      await db.update(ticketTypeFields).set({ options: reason.options }).where(eq(ticketTypeFields.id, reason.id));
    }
  });
  it("rejects unauthenticated, non-office and foreign-company loss requests without writing", async () => {
    const rfp = await f.createRfp("new"), url = lossPath(rfp.id);
    const foreign = await createRfpFixture();
    try {
      for (const [client, expected] of [[api(f.companyId, "office", false), 401], [api(f.companyId, "field_manager"), 403], [api(foreign.companyId), 404]] as const) {
        expect((await client.post(url).send({ lossReason: "Price" })).status).toBe(expected);
      }
      expect((await api().post(url).set("X-Company-Id", foreign.companyId).send({ lossReason: "Price" })).status).toBe(409);
      expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("new").id);
      expect(await answers(rfp.id)).toEqual([]);
    } finally { await removeRfpFixture(foreign.companyId, foreign.userId); }
  });
  it.each(["onboarding", "closed_won", "closed_lost", "custom_final"])("blocks Mark lost at %s", async key => {
    const rfp = await f.createRfp(key);
    expect((await api().post(lossPath(rfp.id)).send({ lossReason: "Price" })).status).toBe(409);
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status(key).id);
    expect(await answers(rfp.id)).toEqual([]);
  });
  it("closes an RFP-linked sent renewal through the common lifecycle when its source is not renewing", async () => {
    const source = await create();
    await db.update(agreementTerms).set({ status: "signed" }).where(eq(agreementTerms.id, source.terms[0].id));
    const rfp = await f.createRfp(), pending = await create(rfp.id);
    await db.update(agreementTerms).set({ agreementId: source.id, renewedFromTermId: source.terms[0].id,
      startDate: "2028-01-01", endDate: "2028-12-31", seasonLabel: "2028" }).where(eq(agreementTerms.id, pending.terms[0].id));
    expect((await move(pending.terms[0].id, "sent")).status).toBe(200);
    const result = await api().post(`${base}/terms/${source.terms[0].id}/non-renewal`)
      .send({ decidedOn: companyToday(), reason: "board", deactivateCustomer: false });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("closed_lost").id);
    expect((await db.select().from(agreementTerms).where(eq(agreementTerms.id, pending.terms[0].id)))[0].status).toBe("lost");
    expect((await db.select().from(agreementTerms).where(eq(agreementTerms.id, source.terms[0].id)))[0].status).toBe("signed");
    expect((await history(rfp.id)).filter(h => h.toStatusId === f.status("closed_lost").id)).toHaveLength(1);
  });
  it("uses the ambient ticket PATCH transaction without installing the db proxy as its own connection", async () => {
    const rfp = await f.createRfp();
    await db.transaction(tx => inTransaction(tx, async () => {
      await applyTicketStatus(db as unknown as Parameters<typeof applyTicketStatus>[0], {
        ticket: rfp, userId: f.userId, updates: { title: "Edited in ambient transaction", currentStatusId: f.status("proposal_sent").id },
      });
    }));
    expect((await ticket(rfp.id)).title).toBe("Edited in ambient transaction");
    expect(await history(rfp.id)).toHaveLength(1);
  });

  it("creates ordinary linked drafts with attribution and multiple parent/direct-branch documents", async () => {
    const rfp = await f.createRfp(), first = await create(rfp.id), second = await create(rfp.id);
    expect(first.terms[0]).toMatchObject({ bidTicketId: rfp.id, status: "draft" });
    expect(first.terms[0].history[0]).toMatchObject({ changedBy: f.userId,
      note: `Created from RFP ${rfp.title}\nCreated as a separate contract: Intentionally separate disposable RFP scenario` });
    expect(second.id).not.toBe(first.id);
    const [branch] = await db.insert(customers).values({ companyId: f.companyId, parentCustomerId: f.customerId,
      name: "Branch", street: "2 Test", city: "Denver", state: "CO", zip: "80000" }).returning();
    await create(rfp.id, branch.id);
    await db.update(tickets).set({ customerId: branch.id }).where(eq(tickets.id, rfp.id));
    await create(rfp.id, f.customerId);
    expect((await api().get(`${base}/contracts?bidTicketId=${rfp.id}`)).body).toHaveLength(4);
  });
  it.each(["reviewing", "closed_lost", "closed_won", "custom_final"])("rejects %s with the specified conflict", async key => {
    const rfp = await f.createRfp(key), result = await api().post(`${base}/contracts`).send(payload(rfp.id));
    expect(result.status).toBe(409);
    expect(result.body.message).toBe(key === "reviewing" ? "Move the RFP to Drafting proposal first" : "This RFP is closed");
  });
  it("rejects Estimate Requests, display-name impostors, foreign RFPs and unrelated customers", async () => {
    const rfp = await f.createRfp();
    const [estimate] = await db.insert(ticketTypes).values({ companyId: f.companyId, name: "RFP Request", typeKey: "estimate_request" }).returning();
    await db.update(tickets).set({ ticketTypeId: estimate.id }).where(eq(tickets.id, rfp.id));
    const rejected = await api().post(`${base}/contracts`).send(payload(rfp.id));
    expect(rejected.status).toBe(400); expect(rejected.body.message).toBe("Only an RFP Request can produce a contract.");
    expect((await api().post(lossPath(rfp.id)).send({ lossReason: "Price" })).status).toBe(409);
    const ordinary = await f.createRfp();
    expect((await api("another-company").post(`${base}/contracts`).send(payload(ordinary.id))).status).toBe(404);
    const [other] = await db.insert(customers).values({ companyId: f.companyId, name: "Unrelated", street: "3 Test", city: "Denver", state: "CO", zip: "80000" }).returning();
    expect((await api().post(`${base}/contracts`).send(payload(ordinary.id, other.id))).status).toBe(400);
    expect((await api().post(`${base}/contracts`).send(payload("missing"))).status).toBe(400);
  });
  it("rejects a foreign-company RFP even with a valid active-company contract customer", async () => {
    const foreign = await createRfpFixture();
    try {
      const foreignRfp = await foreign.createRfp();
      const result = await api().post(`${base}/contracts`).send(payload(foreignRfp.id));
      expect(result.status).toBe(400);
      expect(result.body.message).toBe("Only an RFP Request can produce a contract.");
      expect((await api().get(`${base}/contracts?bidTicketId=${foreignRfp.id}`)).body).toEqual([]);
    } finally { await removeRfpFixture(foreign.companyId, foreign.userId); }
  });
  it("keeps the contract and clears only its relationship when the linked ticket is deleted", async () => {
    const rfp = await f.createRfp(), contract = await create(rfp.id);
    await db.delete(tickets).where(eq(tickets.id, rfp.id));
    const row = (await db.select().from(agreementTerms).where(eq(agreementTerms.id, contract.terms[0].id)))[0];
    expect(row.bidTicketId).toBeNull();
    expect(row.status).toBe("draft");
  });
  it("offers and accepts unsent bid draft → Lost, but rejects ordinary drafts", async () => {
    const rfp = await f.createRfp(), detail = await create(rfp.id), term = detail.terms[0];
    expect(term.allowedMoves).toContain("lost");
    expect((await move(term.id, "lost")).status).toBe(200);
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("closed_lost").id);
    const ordinary = await create();
    expect(ordinary.terms[0].allowedMoves).not.toContain("lost");
    expect((await move(ordinary.terms[0].id, "lost")).status).toBe(409);
  });
  it("Sent and Signed advance through separate Submitted, Awarded and Onboarding history once", async () => {
    const rfp = await f.createRfp(), detail = await create(rfp.id), termId = detail.terms[0].id;
    expect((await move(termId, "sent")).status).toBe(200);
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("proposal_sent").id);
    expect((await move(termId, "draft")).status).toBe(200);
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("proposal_sent").id);
    await move(termId, "sent"); await move(termId, "signed");
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("onboarding").id);
    const h = await history(rfp.id);
    expect(h.map(h => h.toStatusId)).toEqual([f.status("proposal_sent").id, f.status("awarded").id, f.status("onboarding").id]);
    await move(termId, "lost");
    expect(await history(rfp.id)).toHaveLength(3);
  });
  it("allows verbal Awarded and records only Onboarding on signature", async () => {
    const rfp = await f.createRfp(), { terms: [term] } = await create(rfp.id);
    await db.transaction(async tx => {
      const current = await lockRfp(tx, f.companyId, rfp.id);
      await guardManualRfpStatus(tx, current, f.status("awarded").id);
      await applyTicketStatus(tx, { ticket: current, toStatusKey: "awarded", userId: f.userId });
    });
    expect((await move(term.id, "sent")).status).toBe(200);
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("awarded").id);
    expect((await move(term.id, "signed")).status).toBe(200);
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("onboarding").id);
    expect((await history(rfp.id)).map(h => h.toStatusId)).toEqual([f.status("awarded").id, f.status("onboarding").id]);
  });
  it("mixed lost/sent does not close; concurrent sibling losses close exactly once", async () => {
    const rfp = await f.createRfp(), a = await create(rfp.id), b = await create(rfp.id);
    await move(b.terms[0].id, "sent"); await move(a.terms[0].id, "lost");
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("proposal_sent").id);
    await move(b.terms[0].id, "lost");
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("closed_lost").id);
    const other = await f.createRfp(), c = await create(other.id), d = await create(other.id);
    const responses = await Promise.all([move(c.terms[0].id, "lost"), move(d.terms[0].id, "lost")]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(await history(other.id)).toHaveLength(1);
  });
  it("lets office mark an RFP lost with notes, uses the normal lifecycle for draft/sent, and leaves signed untouched", async () => {
    const rfp = await f.createRfp(), a = await create(rfp.id), b = await create(rfp.id), c = await create(rfp.id);
    await move(b.terms[0].id, "sent");
    // A signed season may coexist with draft and sent siblings.
    await db.update(agreementTerms).set({ status: "signed" }).where(eq(agreementTerms.id, c.terms[0].id));
    const result = await api().post(lossPath(rfp.id)).send({ lossReason: "Timing", lossNotes: "Board delayed the work." });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(await answers(rfp.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: lostField("loss_reason").id, value: "Timing", capturedById: f.userId }),
      expect.objectContaining({ fieldId: lostField("loss_notes").id, value: "Board delayed the work.", capturedById: f.userId }),
    ]));
    for (const detail of [a, b]) expect((await persistence.getTerm(db, f.companyId, detail.terms[0].id)).status).toBe("lost");
    expect((await persistence.getTerm(db, f.companyId, c.terms[0].id)).status).toBe("signed");
    expect(await ticket(rfp.id)).toMatchObject({ currentStatusId: f.status("closed_lost").id, completedByUserId: f.userId });
    expect((await ticket(rfp.id)).completedAt).toBeInstanceOf(Date);
  });
  it("rolls back loss answers, ticket and contract histories when a later season update fails", async () => {
    const rfp = await f.createRfp("proposal_sent"), a = await create(rfp.id), b = await create(rfp.id);
    const [first, second] = [a, b].sort((left, right) => left.id.localeCompare(right.id));
    const original = persistence.writeTerm;
    const spy = vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      if (args[3]?.id === second.terms[0].id) throw new Error("Injected lifecycle failure");
      return original(...args);
    });
    try {
      const result = await api().post(lossPath(rfp.id)).send({ lossReason: "Price", lossNotes: "Must roll back" });
      expect(result.status).toBe(500);
      expect(result.body.message).toBe("Injected lifecycle failure");
      expect(spy.mock.calls.map(call => call[3]?.id)).toEqual([first.terms[0].id, second.terms[0].id]);
    } finally { spy.mockRestore(); }
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status("proposal_sent").id);
    expect((await ticket(rfp.id)).completedAt).toBeNull();
    expect(await answers(rfp.id)).toEqual([]);
    expect(await history(rfp.id)).toHaveLength(0);
    for (const d of [a, b]) {
      expect((await persistence.getTerm(db, f.companyId, d.terms[0].id)).status).toBe("draft");
      expect(await db.select().from(termStatusHistory).where(eq(termStatusHistory.termId, d.terms[0].id))).toHaveLength(1);
    }
  });
  it("guards unsigned Onboarding/Won and draft or sent Lost, but allows unlinked and signed cases", async () => {
    const rfp = await f.createRfp(), detail = await create(rfp.id);
    for (const key of ["onboarding", "closed_won"]) {
      await expect(db.transaction(tx => guardManualRfpStatus(tx, rfp, f.status(key).id)))
        .rejects.toMatchObject({ status: 409, message: "Mark the contract signed in the Contract Center; the RFP moves to Onboarding on its own." });
    }
    for (const status of ["draft", "sent"] as const) {
      await db.update(agreementTerms).set({ status }).where(eq(agreementTerms.id, detail.terms[0].id));
      await expect(db.transaction(tx => guardManualRfpStatus(tx, rfp, f.status("closed_lost").id)))
        .rejects.toMatchObject({ status: 409, message: "Use Mark lost so its contract is marked lost too." });
    }
    const legacy = await f.createRfp();
    await db.transaction(tx => guardManualRfpStatus(tx, legacy, f.status("onboarding").id));
    await db.transaction(tx => guardManualRfpStatus(tx, legacy, f.status("closed_lost").id));
    await db.update(agreementTerms).set({ status: "signed" }).where(eq(agreementTerms.id, detail.terms[0].id));
    await db.transaction(tx => guardManualRfpStatus(tx, rfp, f.status("onboarding").id));
    await db.transaction(tx => guardManualRfpStatus(tx, rfp, f.status("closed_lost").id));
  });
  it.each(["onboarding", "closed_won", "closed_lost", "custom_final"])("never signs an RFP forward from %s", async key => {
    const rfp = await f.createRfp(), detail = await create(rfp.id);
    await move(detail.terms[0].id, "sent");
    await db.update(tickets).set({ currentStatusId: f.status(key).id }).where(eq(tickets.id, rfp.id));
    await move(detail.terms[0].id, "signed");
    expect((await ticket(rfp.id)).currentStatusId).toBe(f.status(key).id);
    expect(await history(rfp.id)).toHaveLength(1);
  });
  it("renewals never inherit the relationship and precise linked reads never substitute the renewal", async () => {
    const rfp = await f.createRfp(), detail = await create(rfp.id), termId = detail.terms[0].id;
    await move(termId, "sent"); await move(termId, "signed");
    const renewed = await api().post(`${base}/contracts/${detail.id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    expect(renewed.status, JSON.stringify(renewed.body)).toBe(201);
    const renewal = renewed.body.terms.find((t: any) => t.id !== termId);
    expect(renewal.bidTicketId).toBeNull(); expect(renewal.allowedMoves).toContain("lost");
    expect((await move(renewal.id, "lost")).status).toBe(200);
    const linked = await api().get(`${base}/contracts?bidTicketId=${rfp.id}`);
    expect(linked.body.map((t: any) => t.termId)).toEqual([termId]);
    expect((await api("another-company").get(`${base}/contracts?bidTicketId=${rfp.id}`)).body).toEqual([]);
    const ordinary = await api().get(`${base}/contracts`);
    expect(ordinary.body.find((a: any) => a.id === detail.id)).toHaveProperty("current");
  });
  it("shared ticket persistence preserves scheduleBy and final notification dismissal", async () => {
    const rfp = await f.createRfp("proposal_sent");
    const [notification] = await db.insert(ticketNotifications).values({ companyId: f.companyId, ticketId: rfp.id, recipientId: f.userId,
      type: "overdue", message: "Fixture", isRead: false }).returning();
    const updated = await db.transaction(tx => applyTicketStatus(tx, { ticket: rfp, userId: f.userId, toStatusKey: "closed_lost", note: "Fixture closed" }));
    expect(updated.completedAt).toBeInstanceOf(Date); expect(updated.scheduleBy).toBe(rfp.scheduleBy);
    expect((await db.select().from(ticketNotifications).where(eq(ticketNotifications.id, notification.id)))[0].isRead).toBe(true);
    expect(await history(rfp.id)).toHaveLength(1);
  });
});
