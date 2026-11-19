import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { transformSync } from "esbuild";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agreements, agreementTerms, campaigns, campaignItems, companies, contracts, customers,
  estimates, insertTicketSchema, ticketFieldValues, ticketLinks, tickets, ticketTypeFields, ticketTypes,
  ticketTypeStatuses, users, visits, type TicketTypeKey,
} from "@workspace/db";
import { db, pool } from "../db";
import { storage } from "../storage";
import { guardTicketCustomerChange, ticketEditAvailability } from "../lib/guardedTicketEdit";
import { registerTicketExpectedCompany } from "../lib/ticketExpectedCompany";
import { registerTicketTypeChange } from "./ticketTypeChange";
import { transactionalTicketPatch } from "../lib/ticketPatchTransaction";
import { applyTicketStatus } from "../lib/ticketStatusChange";
import { applyVisitTicketEdit } from "../lib/visitTicketCompatibility";
import { applySchedulingTransition, assertSchedulingGate } from "../lib/schedulingTransition";
import { hasOpenTicketVisit, lockVisitCompany, lockVisitTickets } from "../lib/visitLocks";
import { maintainScheduleBy } from "../lib/scheduleByMaintenance";
import { pickProvided } from "../lib/patchBody";
import { canSeeBilling, isBillingInvoiceAction } from "../lib/billing";
import { findSeededStatus, isSeededStatus, isSeededTicketType } from "../shared/ticketCapabilities";
import { getBillingBehaviorForWorkType } from "../shared/workTypeCatalog";
import { assertNotParentCustomer } from "../utils/parentGuard";
import { TICKET_EDIT_REASONS } from "../../../../lib/db/src/ticketEditContracts";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
const companyId = randomUUID(), foreignCompanyId = randomUUID(), userId = randomUUID(), otherUser = randomUUID();
let oldCustomer: string, newCustomer: string, parent: string, foreignCustomer: string, legacyContract: string, round: string, agreement: string, foreignType: string;
const flows = new Map<TicketTypeKey, { id: string; first: string; later: string }>();
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const from = source.indexOf('  app.patch("/api/tickets/:id",');
const end = source.indexOf("  // Manual invoice ticket creation", from);
const patchCode = transformSync(source.slice(from, end), { loader: "ts", target: "es2022" }).code;
const notifyTicketAssignment = vi.fn();

function http(role = "admin", activeCompanyId = companyId, authenticated = true) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { id: userId, activeCompanyId, activeRole: role, accessRole: role, activeTags: [] } as unknown as Express.User;
    next();
  });
  registerTicketExpectedCompany(app);
  registerTicketTypeChange(app);
  const deps = {
    app, db, storage, transactionalTicketPatch, applyTicketStatus, applyVisitTicketEdit, applySchedulingTransition,
    assertSchedulingGate, hasOpenTicketVisit, maintainScheduleBy, pickProvided, canSeeBilling, isBillingInvoiceAction,
    findSeededStatus, isSeededStatus, isSeededTicketType, getBillingBehaviorForWorkType, assertNotParentCustomer,
    guardTicketCustomerChange, insertTicketSchema, notifyTicketAssignment, TICKET_EDIT_REASONS, sendPushToUser: async () => {},
  };
  new Function(...Object.keys(deps), patchCode)(...Object.values(deps));
  return request(app);
}

const path = (id: string) => `/api/tickets/${id}`;
const convert = (id: string, key: TicketTypeKey, workType?: string, role = "admin") =>
  http(role).post(`${path(id)}/change-type`).send({ ticketTypeId: flows.get(key)!.id, workType });
async function makeTicket(typeKey: TicketTypeKey = "estimate_request", extra: Partial<typeof tickets.$inferInsert> = {}) {
  const flow = flows.get(typeKey)!;
  const [row] = await db.insert(tickets).values({
    companyId, title: "Before edit", customerId: oldCustomer, createdById: userId, assignedToId: userId,
    priority: "urgent", workType: "estimate_request", billingBehavior: "internal",
    currentStatusId: flow.first, ticketTypeId: flow.id, locationLabel: "Back gate", locationLat: 40, locationLng: -105,
    ...extra,
  }).returning();
  return row;
}

beforeAll(async () => {
  await db.insert(companies).values([companyId, foreignCompanyId].map(id => ({ id, name: "Disposable guarded edit", slug: id })));
  await db.insert(users).values([userId, otherUser].map(id => ({ id, name: "Disposable guarded editor", passwordHash: "not-a-login" })));
  [oldCustomer, newCustomer, parent, foreignCustomer] = (await db.insert(customers).values([
    { companyId, name: "Old property" }, { companyId, name: "New property" },
    { companyId, name: "Parent management", isParent: "true" as const }, { companyId: foreignCompanyId, name: "Other company property" },
  ].map(c => ({ ...c, street: "", city: "", state: "CO", zip: "" }))).returning()).map(row => row.id);
  [legacyContract] = (await db.insert(contracts).values({ companyId, customerId: oldCustomer, serviceType: "Maintenance",
    billingPattern: "monthly", startDate: new Date("2026-01-01") }).returning()).map(row => row.id);
  [agreement] = (await db.insert(agreements).values({ companyId, customerId: oldCustomer }).returning()).map(row => row.id);
  [round] = (await db.insert(campaigns).values({ companyId, title: "Round", windowStart: "2026-01-01", windowEnd: "2026-02-01" }).returning()).map(row => row.id);
  const keys: TicketTypeKey[] = ["estimate_request", "task", "project", "invoice", "todo", "rfp_request"];
  const types = await db.insert(ticketTypes).values(keys.map(typeKey => ({ companyId, typeKey, name: `Renamed ${typeKey}`,
    requiresCustomer: ["todo", "rfp_request"].includes(typeKey) ? "false" as const : "true" as const }))).returning();
  for (const type of types) {
    // Insert later first: conversion is not based on row order or a status label.
    const [later, first] = await db.insert(ticketTypeStatuses).values([
      { ticketTypeId: type.id, name: "Later", statusKey: "scheduled", displayOrder: 20 },
      { ticketTypeId: type.id, name: "Intake", statusKey: "new", displayOrder: 10 },
    ]).returning();
    flows.set(type.typeKey!, { id: type.id, first: first.id, later: later.id });
  }
  [foreignType] = (await db.insert(ticketTypes).values({ companyId: foreignCompanyId, name: "Other company's project", typeKey: "project" }).returning()).map(row => row.id);
});

afterAll(async () => {
  await db.delete(tickets).where(eq(tickets.companyId, companyId));
  await db.delete(companies).where(inArray(companies.id, [companyId, foreignCompanyId]));
  await db.delete(users).where(inArray(users.id, [userId, otherUser]));
  await pool.end();
});

describe("guarded ticket edits", () => {
  it("changes the customer and records names without altering the original pin or values", async () => {
    const row = await makeTicket();
    const update = await http("office").patch(path(row.id)).send({ customerId: newCustomer }).expect(200);
    expect(update.body).toMatchObject({ customerId: newCustomer, locationLat: 40, locationLng: -105, locationLabel: "Back gate",
      priority: "urgent", workType: "estimate_request", billingBehavior: "internal" });
    expect((await storage.getTicketComments(row.id)).map(c => c.body)).toEqual(["Customer changed from Old property to New property"]);
    await http().patch(path(row.id)).send({ customerId: newCustomer, title: "Same customer" }).expect(200);
    expect(await storage.getTicketComments(row.id)).toHaveLength(1);
  });

  it("rejects parent, foreign and cleared customer IDs and an old-customer contract", async () => {
    const row = await makeTicket();
    for (const [id, code] of [[parent, "PARENT_CUSTOMER_NOT_ALLOWED"], [foreignCustomer, "TICKET_EDIT_INVALID_CUSTOMER"], [null, "TICKET_EDIT_INVALID_CUSTOMER"]]) {
      const result = await http().patch(path(row.id)).send({ customerId: id, title: "Never saved" }).expect(400);
      expect(result.body.error).toBe(code);
    }
    expect((await http().patch(path(row.id)).send({ customerId: newCustomer, contractId: legacyContract }).expect(409)).body.error)
      .toBe("TICKET_EDIT_CONTRACT");
    expect(await storage.getTicketById(row.id, companyId)).toEqual(row);
    expect(await storage.getTicketComments(row.id)).toEqual([]);
  });

  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor", "crew_supervisor"])(
    "does not grant %s customer or type writes", async role => {
      const row = await makeTicket();
      await http(role).patch(path(row.id)).send({ customerId: newCustomer }).expect(403);
      await convert(row.id, "task", "contract", role).expect(403);
      expect(await storage.getTicketById(row.id, companyId)).toEqual(row);
    });

  it("scopes type conversion to the ticket and target company, and rejects raw type PATCH", async () => {
    const row = await makeTicket();
    const post = `${path(row.id)}/change-type`;
    const body = { ticketTypeId: flows.get("task")!.id };
    await http("office", foreignCompanyId).post(post).send(body).expect(404);
    await http("admin", companyId, false).post(post).send(body).expect(401);
    await http().post(post).set("X-Company-Id", foreignCompanyId).send(body).expect(409);
    await http().post(post).send({ ticketTypeId: foreignType }).expect(400);
    for (const rawType of [row.ticketTypeId, null, body.ticketTypeId]) {
      const response = await http().patch(path(row.id)).send({ ticketTypeId: rawType, title: "Not saved" }).expect(400);
      expect(response.body).toMatchObject({ error: "USE_CHANGE_TYPE", message: expect.stringContaining("change-type") });
    }
    const stale = await http().patch(path(row.id)).set("X-Ticket-Type-Id", foreignType).send({ title: "Never saved" }).expect(409);
    expect(stale.body.error).toBe("TICKET_EDIT_TYPE_CHANGED");
    expect(await storage.getTicketById(row.id, companyId)).toEqual(row);
  });

  it("converts Estimate Request, Task and Project in either direction and preserves custom data", async () => {
    const row = await makeTicket();
    const [old, retained, next] = await db.insert(ticketTypeFields).values([
      { ticketTypeId: row.ticketTypeId, statusId: row.currentStatusId, fieldKey: "shared" },
      { ticketTypeId: row.ticketTypeId, statusId: row.currentStatusId, fieldKey: "estimate_only" },
      { ticketTypeId: flows.get("task")!.id, statusId: flows.get("task")!.first, fieldKey: "shared" },
    ].map(f => ({ ...f, fieldLabel: f.fieldKey, fieldType: "text" as const, displayOrder: 0 }))).returning();
    await db.insert(ticketFieldValues).values([
      { fieldId: old.id, value: "Copy me" }, { fieldId: retained.id, value: "Keep me" },
    ].map(f => ({ ...f, ticketId: row.id, capturedById: userId })));
    const result = await convert(row.id, "task", "extra_work", "office").expect(200);
    expect(result.body).toMatchObject({ ticketTypeId: flows.get("task")!.id, currentStatusId: flows.get("task")!.first,
      workType: "extra_work", billingBehavior: "invoice_required" });
    expect(await storage.getTicketFieldValues(row.id)).toHaveLength(3);
    expect(await storage.getTicketFieldValues(row.id, flows.get("task")!.id)).toEqual([expect.objectContaining({ fieldId: next.id, value: "Copy me" })]);
    expect(await storage.getTicketStatusHistory(row.id)).toEqual([expect.objectContaining({
      fromStatusId: row.currentStatusId, toStatusId: result.body.currentStatusId, notes: "Ticket type changed from Renamed estimate_request to Renamed task",
    })]);
    const changed = await http().patch(path(row.id)).send({ title: "Only title" }).expect(200);
    expect(changed.body).toMatchObject({ title: "Only title", priority: "urgent", workType: "extra_work", billingBehavior: "invoice_required" });
    await http().patch(path(row.id)).send({ workType: "contract" }).expect(200);
    expect(await storage.getTicketById(row.id, companyId)).toMatchObject({ workType: "contract", billingBehavior: "no_invoice" });

    for (const key of ["project", "task", "estimate_request", "project", "estimate_request"] as const) {
      const response = await convert(row.id, key).expect(200);
      expect(response.body).toMatchObject({ currentStatusId: flows.get(key)!.first, ticketTypeId: flows.get(key)!.id,
        workType: key === "task" ? "contract" : "estimate_request", billingBehavior: key === "task" ? "no_invoice" : "internal" });
    }
    expect(await storage.getTicketFieldValues(row.id, row.ticketTypeId)).toHaveLength(2);
    expect(await db.select().from(visits).where(eq(visits.ticketId, row.id))).toHaveLength(0);
  });

  it("blocks workflow progress, Invoice and shop conversions in both directions, and a scheduled first step", async () => {
    const started = await makeTicket("estimate_request", { currentStatusId: flows.get("estimate_request")!.later });
    const invoice = await makeTicket("invoice");
    const shop = await makeTicket("todo", { workType: "shop_todo", customerId: null });
    const clean = await makeTicket();
    for (const [promise, reason] of [
      [convert(started.id, "task"), "TICKET_EDIT_STARTED"], [convert(invoice.id, "task"), "TICKET_EDIT_INVOICE_TYPE"],
      [convert(clean.id, "invoice"), "TICKET_EDIT_INVOICE_TYPE"], [convert(shop.id, "task"), "TICKET_EDIT_SHOP_TYPE"],
      [convert(clean.id, "todo", "shop_todo"), "TICKET_EDIT_SHOP_TYPE"],
    ] as const) expect((await promise.expect(409)).body.error).toBe(reason);
    await convert(clean.id, "task", "admin").expect(422);
    const scheduled = flows.get("project")!.later;
    await db.update(ticketTypeStatuses).set({ displayOrder: 0 }).where(eq(ticketTypeStatuses.id, scheduled));
    try { expect((await convert(clean.id, "project").expect(422)).body.error).toBe("SCHEDULE_REQUIRED"); }
    finally { await db.update(ticketTypeStatuses).set({ displayOrder: 20 }).where(eq(ticketTypeStatuses.id, scheduled)); }
    expect(await storage.getTicketById(clean.id, companyId)).toEqual(clean);
    expect(await storage.getTicketStatusHistory(clean.id)).toHaveLength(0);
  });

  it("keeps the PATCH assignment and delegation paths independent of the guard", async () => {
    const row = await makeTicket("task", { delegatedById: userId });
    await http().patch(path(row.id)).send({ assignedToId: otherUser }).expect(200);
    expect(await storage.getTicketById(row.id, companyId)).toMatchObject({ assignedToId: otherUser, delegatedById: userId });
    await http().patch(path(row.id)).send({ assignedToId: null }).expect(200);
    await http("office").patch(path(row.id)).send({ assignedToId: otherUser, delegatedById: userId }).expect(200);
    expect(await storage.getTicketById(row.id, companyId)).toMatchObject({ assignedToId: otherUser, delegatedById: userId });
    expect(notifyTicketAssignment).toHaveBeenCalledWith(expect.objectContaining({ id: row.id }), otherUser, expect.anything());
  });

  it.each([
    ["estimate", "TICKET_EDIT_ESTIMATE"], ["incoming invoice", "TICKET_EDIT_INVOICE_LINK"], ["outgoing invoice", "TICKET_EDIT_INVOICE_LINK"],
    ["contract", "TICKET_EDIT_CONTRACT"], ["RFP", "TICKET_EDIT_CONTRACT_CENTER"], ["planned", "TICKET_EDIT_VISIT"],
    ["done", "TICKET_EDIT_VISIT"], ["campaign", "TICKET_EDIT_CAMPAIGN"],
  ] as const)("locks %s with the same reason in availability and guarded writes", async (dependency, code) => {
    const t = await makeTicket(dependency === "RFP" ? "rfp_request" : "estimate_request",
      dependency === "contract" ? { contractId: legacyContract } : {});
    if (dependency === "estimate") await db.insert(estimates).values({ companyId, customerId: oldCustomer, ticketId: t.id,
      title: "Draft", estimateNumber: `W2-${randomUUID()}`, createdById: userId });
    if (dependency.endsWith("invoice")) {
      const invoice = await makeTicket("invoice");
      await db.insert(ticketLinks).values({ linkType: "invoice_for",
        sourceTicketId: dependency === "incoming invoice" ? invoice.id : t.id,
        targetTicketId: dependency === "incoming invoice" ? t.id : invoice.id });
    }
    if (dependency === "RFP") await db.insert(agreementTerms).values({ companyId, agreementId: agreement, bidTicketId: t.id,
      line: "landscape", seasonLabel: "2026", startDate: "2026-01-01", endDate: "2026-12-31", billingType: "seasonal" });
    if (dependency === "planned" || dependency === "done") await db.insert(visits).values({ companyId, customerId: oldCustomer, ticketId: t.id, visitDate: "2026-01-06", status: dependency });
    if (dependency === "campaign") await db.insert(campaignItems).values({ companyId, campaignId: round, ticketId: t.id, customerId: oldCustomer, customerName: "Old property" });
    const type = await storage.getTicketTypeById(t.ticketTypeId, companyId);
    const statuses = await storage.getTicketTypeStatuses(t.ticketTypeId);
    expect(await ticketEditAvailability(db, { accessRole: "admin" }, t, type, statuses))
      .toEqual({ customer: code, type: dependency === "contract" ? null : code });
    expect((await http().patch(path(t.id)).send({ customerId: newCustomer, title: "Not saved" }).expect(409)).body.error).toBe(code);
    if (dependency !== "contract") expect((await convert(t.id, "task").expect(409)).body.error).toBe(code);
    expect(await storage.getTicketById(t.id, companyId)).toEqual(t);
    expect(await storage.getTicketComments(t.id)).toHaveLength(0);
  });

  it("ignores voided estimates, but only customer edits may ignore cancelled visits", async () => {
    const t = await makeTicket();
    await db.insert(estimates).values({ companyId, customerId: oldCustomer, ticketId: t.id, title: "Voided",
      estimateNumber: `W2-${randomUUID()}`, createdById: userId, voidedAt: new Date() });
    await convert(t.id, "task").expect(200);
    await db.insert(visits).values({ companyId, ticketId: t.id, customerId: oldCustomer, visitDate: "2026-01-01", status: "cancelled" });
    expect((await convert(t.id, "project").expect(409)).body.error).toBe("TICKET_EDIT_VISIT");
    await http().patch(path(t.id)).send({ customerId: newCustomer }).expect(200);
    expect((await db.select().from(visits).where(eq(visits.ticketId, t.id)))[0].customerId).toBe(oldCustomer);
    expect((await db.select().from(estimates).where(eq(estimates.ticketId, t.id)))[0].customerId).toBe(oldCustomer);
  });

  it("rechecks for a visit committed while a guarded edit is waiting for the write lock", async () => {
    const t = await makeTicket();
    let pending!: Promise<request.Response>;
    await db.transaction(async tx => {
      await lockVisitCompany(tx, companyId);
      await lockVisitTickets(tx, companyId, [t.id]);
      pending = http().patch(path(t.id)).send({ customerId: newCustomer }).then(response => response);
      await tx.insert(visits).values({ companyId, ticketId: t.id, customerId: oldCustomer, visitDate: "2026-01-02" });
    });
    expect(await pending).toMatchObject({ status: 409, body: { error: "TICKET_EDIT_VISIT" } });
    expect(await storage.getTicketById(t.id, companyId)).toEqual(t);
  });
});
