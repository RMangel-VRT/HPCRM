import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  findSeededTicketType, isSeededTicketType, isSeededStatus, taskWorkflowStatuses, typeHueVar,
} from "../../../highplains-crm/src/shared/ticketVisuals";
import {
  extractApiErrorMessage, parseApiValidationError, taskValidationMessage,
} from "../../../highplains-crm/src/lib/apiError";
import { createInsertSchema } from "../../../highplains-crm/src/shared/drizzle-stub";

describe("Task web client stable identity", () => {
  it("keeps delegation available after the default or custom scheduling label rename", () => {
    for (const status of [
      { name: "Needs scheduling", statusKey: "ready_to_schedule" },
      { name: "Dispatch queue", statusKey: "ready_to_schedule" },
      { name: "Ready to Schedule", statusKey: null },
      { name: "Needs scheduling", statusKey: null },
    ]) expect(isSeededStatus(status, "ready_to_schedule")).toBe(true);
    expect(isSeededStatus({ name: "Needs scheduling", statusKey: "custom" }, "ready_to_schedule")).toBe(false);
    expect(isSeededStatus({ name: "Booked", statusKey: "scheduled" }, "scheduled")).toBe(true);
  });
  it("uses keys even after renames, never overrides a non-null key", () => {
    expect(isSeededTicketType({ name: "Renamed work", typeKey: "task" }, "task")).toBe(true);
    expect(isSeededTicketType({ name: "Task", typeKey: "custom" }, "task")).toBe(false);
    expect(isSeededTicketType({ name: "Extra Billable", typeKey: "extra_billable" }, "task")).toBe(false);
  });
  it("preserves only server-equivalent unkeyed legacy aliases", () => {
    expect(isSeededTicketType({ name: "Extra Billable", typeKey: null }, "task")).toBe(true);
    expect(isSeededTicketType({ name: "invoice", typeKey: null }, "invoice")).toBe(true);
    expect(isSeededTicketType({ name: "My Task" }, "task")).toBe(false);
  });
  it("prefers a keyed row over an unkeyed duplicate", () => {
    const keyed = { id: "stable", name: "Renamed", typeKey: "task" };
    expect(findSeededTicketType([{ id: "legacy", name: "Task", typeKey: null }, keyed], "task")).toBe(keyed);
    expect(typeHueVar(keyed)).toBe("var(--tt-extra)");
  });
});

describe("Task web client workflow projection", () => {
  const statuses = [
    { id: "work", statusKey: "work_completed", name: "Renamed completion" },
    { id: "billing", statusKey: "ready_for_billing", name: "Renamed billing" },
    { id: "done", statusKey: "closed_won", name: "Renamed done" },
  ];
  it("skips the billing step for Contract Tasks regardless of display names", () => {
    expect(taskWorkflowStatuses(statuses, { name: "Renamed", typeKey: "task" }, "no_invoice")
      .map(s => s.statusKey)).toEqual(["work_completed", "closed_won"]);
  });
  it("keeps the Billable billing path and other workflows unchanged", () => {
    expect(taskWorkflowStatuses(statuses, { name: "Task", typeKey: "task" }, "invoice_required")).toEqual(statuses);
    expect(taskWorkflowStatuses(statuses, { name: "Project", typeKey: "project" }, "no_invoice")).toEqual(statuses);
  });
});

describe("Task web client validation messages", () => {
  it("returns status, code and readable server message", () => {
    const error = new Error('422: {"error":"CONTRACT_CANNOT_BILL","message":"Contract tasks do not need billing."}');
    expect(parseApiValidationError(error)).toEqual({
      status: 422, code: "CONTRACT_CANNOT_BILL", message: "Contract tasks do not need billing.",
    });
    expect(taskValidationMessage(error)).toBe("Contract tasks do not need billing.");
    // The global helper deliberately retains its previous precedence.
    expect(extractApiErrorMessage(error)).toBe("CONTRACT_CANNOT_BILL");
  });
  it.each([
    ["TASK_WORK_TYPE", "That work type can't be used on a Task."],
    ["BILLING_MISMATCH", "Billing and work type don't match. Refresh and try again."],
  ])("supplies missing-message copy for %s", (code, message) => {
    expect(taskValidationMessage(new Error(`422: ${JSON.stringify({ error: code })}`))).toBe(message);
  });
  it("does not intercept invoice conflicts or other HTTP errors", () => {
    expect(taskValidationMessage(new Error('409: {"error":"INVOICE_COMPLETED"}'))).toBeUndefined();
    expect(taskValidationMessage(new Error("500: Unexpected error"))).toBeUndefined();
  });
});

describe("frontend form payload preservation", () => {
  it("keeps fields not declared by the Drizzle stub across extend/omit", () => {
    const schema = createInsertSchema({}).omit({ id: true }).extend({});
    const payload = { ticketTypeId: "task-id", workType: "contract", billingBehavior: "no_invoice", title: "Work" };
    expect(schema.parse(payload)).toEqual(payload);
  });
});

describe("office ticket-creation entry points", () => {
  const source = (path: string) => readFileSync(new URL(`../../../highplains-crm/src/${path}`, import.meta.url), "utf8");
  it("opens the creation route and batch-creation container to office, not field roles", () => {
    const app = source("App.tsx");
    for (const path of ["/dashboard/tickets/new", "/dashboard/tickets"]) {
      expect(app.split("\n").find(line => line.includes(`path="${path}"`)))
        .toContain('allowedRoles={["admin", "office"]}');
    }
    expect(source("components/AppSidebar.tsx")).toContain(
      'if (userRole === "admin" || userRole === "office") {\n      items.push({ title: t("nav.tickets")',
    );
  });
  it("keeps selection and batch deletion admin-only while opening create buttons", () => {
    for (const path of ["pages/TicketsList.tsx", "components/TicketListView.tsx"]) {
      const content = source(path);
      expect(content).toContain('const canCreateTickets = isAdmin || user?.activeRole === "office";');
      expect(content).toContain("{isAdmin && (!selectionMode ? (");
      expect(content).toContain("if (!isAdmin || batchDeleteMutation.isPending) return;");
      expect(content).toContain("{canCreateTickets && (");
    }
    expect(source("components/QuickAddToDo.tsx")).toContain(
      'if (!user || !["admin", "office"].includes(user.activeRole)) return null;',
    );
  });
});