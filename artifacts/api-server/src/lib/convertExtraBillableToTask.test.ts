// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import {
  companies,
  ticketFieldValues,
  ticketStatusHistory,
  ticketTypeFields,
  ticketTypeStatuses,
  ticketTypes,
  tickets,
  users,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { convertExtraBillableToTask } from "./convertExtraBillableToTask";

type TestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const rollback = Symbol("rollback test fixtures");

async function withRollback(run: (transaction: TestTransaction) => Promise<void>) {
  try {
    await db.transaction(async (transaction) => {
      await run(transaction);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function seedCompany(transaction: TestTransaction) {
  const companyId = randomUUID();
  const userId = randomUUID();
  await transaction.insert(companies).values({
    id: companyId,
    name: `Conversion test ${companyId}`,
    slug: `conversion-${companyId}`,
  });
  await transaction.insert(users).values({
    id: userId,
    name: "Conversion test user",
    passwordHash: "not-used",
    defaultCompanyId: companyId,
  });
  return { companyId, userId };
}

async function seedType(
  transaction: TestTransaction,
  companyId: string,
  values: {
    id?: string;
    name: string;
    typeKey?: string | null;
    description?: string | null;
    capabilities?: {
      requiresCustomer?: "true" | "false";
      requiresScheduling?: "true" | "false";
      requiresCompletion?: "true" | "false";
      requiresInvoicing?: "true" | "false";
      terminalBehavior?: "close" | "invoice" | "handoff";
    };
  },
) {
  const id = values.id ?? randomUUID();
  await transaction.insert(ticketTypes).values({
    id,
    companyId,
    name: values.name,
    // `task` is deliberately not yet part of the shared schema union, while the
    // database column is text and the conversion writes this new key as DML.
    typeKey: values.typeKey as never,
    description: values.description,
    ...values.capabilities,
  });
  return id;
}

async function seedTicket(
  transaction: TestTransaction,
  args: {
    companyId: string;
    userId: string;
    typeId: string;
    workType: "contract" | "extra_work" | "admin";
    billingBehavior: "invoice_required" | "no_invoice";
  },
) {
  const statusId = randomUUID();
  const ticketId = randomUUID();
  const historyId = randomUUID();
  await transaction.insert(ticketTypeStatuses).values({
    id: statusId,
    ticketTypeId: args.typeId,
    name: "In Progress",
    displayOrder: 1,
  });
  await transaction.insert(tickets).values({
    id: ticketId,
    companyId: args.companyId,
    ticketTypeId: args.typeId,
    currentStatusId: statusId,
    title: "Existing work",
    description: "Original ticket description",
    workType: args.workType,
    billingBehavior: args.billingBehavior,
    priority: "high",
    dueDate: new Date("2024-04-05T00:00:00.000Z"),
    createdById: args.userId,
  });
  await transaction.insert(ticketStatusHistory).values({
    id: historyId,
    ticketId,
    toStatusId: statusId,
    changedById: args.userId,
    notes: "Original status history",
  });
  return { ticketId, statusId, historyId };
}

describe("convertExtraBillableToTask", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a renamed keyed type in preference to the unkeyed legacy fallback", async () => {
    await withRollback(async (transaction) => {
      const { companyId } = await seedCompany(transaction);
      const keyedId = await seedType(transaction, companyId, {
        name: "Billable Field Work",
        typeKey: "extra_billable",
      });
      const legacyId = await seedType(transaction, companyId, {
        name: "Extra Billable",
        typeKey: null,
      });

      const counts = await convertExtraBillableToTask(transaction, { companyIds: [companyId] });
      const types = await transaction.select().from(ticketTypes)
        .where(eq(ticketTypes.companyId, companyId));

      expect(counts).toMatchObject({ companies: 1, types: 1, conflicts: 0 });
      expect(types.find((type) => type.id === keyedId)).toMatchObject({
        name: "Task",
        typeKey: "task",
        description: "Used for contract and billable field work.",
        requiresCustomer: "true",
        requiresScheduling: "true",
        requiresCompletion: "true",
        requiresInvoicing: "false",
        terminalBehavior: "close",
      });
      expect(types.find((type) => type.id === legacyId)).toMatchObject({
        name: "Extra Billable",
        typeKey: null,
      });
    });
  });

  it("converts an unkeyed exact legacy name and updates all its tickets to billable field work", async () => {
    await withRollback(async (transaction) => {
      const { companyId, userId } = await seedCompany(transaction);
      const typeId = await seedType(transaction, companyId, {
        name: "Extra Billable",
        typeKey: null,
      });
      const matching = await seedTicket(transaction, {
        companyId, userId, typeId,
        workType: "extra_work",
        billingBehavior: "invoice_required",
      });
      const contractTicket = await seedTicket(transaction, {
        companyId, userId, typeId,
        workType: "contract",
        billingBehavior: "no_invoice",
      });

      const counts = await convertExtraBillableToTask(transaction, { companyIds: [companyId] });
      const persistedTickets = await transaction.select().from(tickets)
        .where(eq(tickets.ticketTypeId, typeId));

      expect(counts).toMatchObject({ companies: 1, types: 1, tickets: 2, conflicts: 0 });
      expect(persistedTickets).toHaveLength(2);
      expect(persistedTickets.find((ticket) => ticket.id === matching.ticketId)).toMatchObject({
        workType: "extra_work",
        billingBehavior: "invoice_required",
      });
      expect(persistedTickets.find((ticket) => ticket.id === contractTicket.ticketId)).toMatchObject({
        currentStatusId: contractTicket.statusId,
        workType: "extra_work",
        billingBehavior: "invoice_required",
      });
    });
  });

  it("updates legacy tickets once and leaves new contract/no-invoice tickets untouched on repeat", async () => {
    await withRollback(async (transaction) => {
      const { companyId, userId } = await seedCompany(transaction);
      const typeId = await seedType(transaction, companyId, {
        name: "Extra Billable",
        typeKey: "extra_billable",
      });
      const { ticketId } = await seedTicket(transaction, {
        companyId, userId, typeId,
        workType: "contract",
        billingBehavior: "no_invoice",
      });

      const first = await convertExtraBillableToTask(transaction, { companyIds: [companyId] });
      const taskBeforeRepeat = (await transaction.select().from(ticketTypes)
        .where(eq(ticketTypes.id, typeId)))[0];
      const newTicket = await seedTicket(transaction, {
        companyId, userId, typeId,
        workType: "contract",
        billingBehavior: "no_invoice",
      });
      const newTicketBeforeRepeat = (await transaction.select().from(tickets)
        .where(eq(tickets.id, newTicket.ticketId)))[0];
      const second = await convertExtraBillableToTask(transaction, { companyIds: [companyId] });
      const taskAfterRepeat = (await transaction.select().from(ticketTypes)
        .where(eq(ticketTypes.id, typeId)))[0];
      const originalAfterRepeat = (await transaction.select().from(tickets)
        .where(eq(tickets.id, ticketId)))[0];
      const newTicketAfterRepeat = (await transaction.select().from(tickets)
        .where(eq(tickets.id, newTicket.ticketId)))[0];

      expect(first).toMatchObject({ companies: 1, types: 1, tickets: 1 });
      expect(originalAfterRepeat).toMatchObject({
        workType: "extra_work",
        billingBehavior: "invoice_required",
      });
      expect(second).toEqual({ companies: 0, types: 0, tickets: 0, conflicts: 0 });
      expect(newTicketAfterRepeat).toEqual(newTicketBeforeRepeat);
      expect(newTicketAfterRepeat).toMatchObject({
        workType: "contract",
        billingBehavior: "no_invoice",
      });
      expect(taskAfterRepeat).toEqual(taskBeforeRepeat);
      expect(taskAfterRepeat).toMatchObject({
        name: "Task",
        typeKey: "task",
        description: "Used for contract and billable field work.",
        requiresCustomer: "true",
        requiresScheduling: "true",
        requiresCompletion: "true",
        requiresInvoicing: "false",
        terminalBehavior: "close",
      });
    });
  });

  it.each([
    { taskKey: "task", taskName: "Custom Task" },
    { taskKey: null, taskName: "Task" },
  ])("reports a conflict when a competing $taskName type already exists", async ({ taskKey, taskName }) => {
    await withRollback(async (transaction) => {
      const { companyId } = await seedCompany(transaction);
      const extraId = await seedType(transaction, companyId, {
        name: "Extra Billable",
        typeKey: "extra_billable",
      });
      const existingTaskId = await seedType(transaction, companyId, {
        name: taskName,
        typeKey: taskKey,
      });

      const counts = await convertExtraBillableToTask(transaction, { companyIds: [companyId] });
      const extraType = (await transaction.select().from(ticketTypes)
        .where(eq(ticketTypes.id, extraId)))[0];
      const existingTask = (await transaction.select().from(ticketTypes)
        .where(eq(ticketTypes.id, existingTaskId)))[0];

      expect(counts).toMatchObject({ companies: 1, types: 0, conflicts: 1 });
      expect(extraType).toMatchObject({ name: "Extra Billable", typeKey: "extra_billable" });
      expect(existingTask).toMatchObject({ name: taskName, typeKey: taskKey });
    });
  });

  it("leaves a user-created Quick Task and its tickets untouched", async () => {
    await withRollback(async (transaction) => {
      const { companyId, userId } = await seedCompany(transaction);
      const quickTaskId = await seedType(transaction, companyId, {
        name: "Quick Task",
        typeKey: null,
      });
      const ticket = await seedTicket(transaction, {
        companyId, userId, typeId: quickTaskId,
        workType: "admin",
        billingBehavior: "no_invoice",
      });

      const counts = await convertExtraBillableToTask(transaction, { companyIds: [companyId] });
      const quickTask = (await transaction.select().from(ticketTypes)
        .where(eq(ticketTypes.id, quickTaskId)))[0];
      const persistedTicket = (await transaction.select().from(tickets)
        .where(and(eq(tickets.id, ticket.ticketId), eq(tickets.companyId, companyId))))[0];

      expect(counts).toEqual({ companies: 0, types: 0, tickets: 0, conflicts: 0 });
      expect(quickTask).toMatchObject({ name: "Quick Task", typeKey: null });
      expect(persistedTicket).toMatchObject({
        ticketTypeId: quickTaskId,
        workType: "admin",
        billingBehavior: "no_invoice",
      });
    });
  });

  it("does not claim an unkeyed exact Task when no legacy Extra Billable exists", async () => {
    await withRollback(async (transaction) => {
      const { companyId, userId } = await seedCompany(transaction);
      const taskId = await seedType(transaction, companyId, {
        name: "Task",
        typeKey: null,
        description: "Custom task definition",
      });
      const ticket = await seedTicket(transaction, {
        companyId, userId, typeId: taskId,
        workType: "contract",
        billingBehavior: "no_invoice",
      });

      const counts = await convertExtraBillableToTask(transaction, { companyIds: [companyId] });
      const taskAfter = (await transaction.select().from(ticketTypes)
        .where(eq(ticketTypes.id, taskId)))[0];
      const ticketAfter = (await transaction.select().from(tickets)
        .where(eq(tickets.id, ticket.ticketId)))[0];

      expect(counts).toEqual({ companies: 0, types: 0, tickets: 0, conflicts: 0 });
      expect(taskAfter).toMatchObject({
        name: "Task",
        typeKey: null,
        description: "Custom task definition",
      });
      expect(ticketAfter).toMatchObject({
        workType: "contract",
        billingBehavior: "no_invoice",
      });
    });
  });

  it("preserves ticket status, custom fields, dates, and status-history rows", async () => {
    await withRollback(async (transaction) => {
      const { companyId, userId } = await seedCompany(transaction);
      const typeId = await seedType(transaction, companyId, {
        name: "Extra Billable",
        typeKey: "extra_billable",
      });
      const seeded = await seedTicket(transaction, {
        companyId, userId, typeId,
        workType: "contract",
        billingBehavior: "no_invoice",
      });
      const fieldId = randomUUID();
      await transaction.insert(ticketTypeFields).values({
        id: fieldId,
        ticketTypeId: typeId,
        fieldKey: "site_note",
        fieldLabel: "Site note",
        fieldType: "text",
        displayOrder: 1,
      });
      await transaction.insert(ticketFieldValues).values({
        ticketId: seeded.ticketId,
        fieldId,
        value: "Do not alter this value",
        capturedById: userId,
      });
      const before = (await transaction.select().from(tickets)
        .where(eq(tickets.id, seeded.ticketId)))[0];
      const fieldBefore = (await transaction.select().from(ticketTypeFields)
        .where(eq(ticketTypeFields.id, fieldId)))[0];
      const fieldValueBefore = (await transaction.select().from(ticketFieldValues)
        .where(eq(ticketFieldValues.ticketId, seeded.ticketId)))[0];
      const historyBefore = await transaction.select().from(ticketStatusHistory)
        .where(eq(ticketStatusHistory.ticketId, seeded.ticketId));

      await convertExtraBillableToTask(transaction, { companyIds: [companyId] });

      const after = (await transaction.select().from(tickets)
        .where(eq(tickets.id, seeded.ticketId)))[0];
      const fieldAfter = (await transaction.select().from(ticketTypeFields)
        .where(eq(ticketTypeFields.id, fieldId)))[0];
      const fieldValueAfter = (await transaction.select().from(ticketFieldValues)
        .where(eq(ticketFieldValues.ticketId, seeded.ticketId)))[0];
      const historyAfter = await transaction.select().from(ticketStatusHistory)
        .where(eq(ticketStatusHistory.ticketId, seeded.ticketId));
      const { workType: beforeWorkType, billingBehavior: beforeBillingBehavior, ...otherBefore } = before;
      const { workType: afterWorkType, billingBehavior: afterBillingBehavior, ...otherAfter } = after;
      expect(otherAfter).toEqual(otherBefore);
      expect(beforeWorkType).toBe("contract");
      expect(beforeBillingBehavior).toBe("no_invoice");
      expect(afterWorkType).toBe("extra_work");
      expect(afterBillingBehavior).toBe("invoice_required");
      expect(fieldAfter).toEqual(fieldBefore);
      expect(fieldValueAfter).toEqual(fieldValueBefore);
      expect(historyAfter).toEqual(historyBefore);
      expect(after.currentStatusId).toBe(seeded.statusId);
      expect(after.dueDate).toEqual(new Date("2024-04-05T00:00:00.000Z"));
    });
  });
});