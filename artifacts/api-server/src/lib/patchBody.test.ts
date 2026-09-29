// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  insertTicketSchema,
  insertCustomerSchema,
  insertContactSchema,
  insertCompanySchema,
  insertSettingsSchema,
  insertContractBuilderDocumentSchema,
  insertTicketTypeFieldSchema,
  insertCommunicationTemplateSchema,
  insertChemicalProductSchema,
  insertChemicalNotificationTemplateSchema,
  insertCrewSchema,
  insertPropertySiteNoteSchema,
  insertServiceTypeTemplateSchema,
  insertServiceTypeTemplateItemSchema,
  insertEmailTemplateSchema,
  insertEmailRuleSchema,
} from "@workspace/db";
import { pickProvided } from "./patchBody";

const ticketPatchSchema = insertTicketSchema.partial().omit({
  companyId: true,
  createdById: true,
});

function validatedTicketUpdate(body: unknown) {
  const result = ticketPatchSchema.safeParse(body);
  expect(result.success).toBe(true);
  if (!result.success) throw result.error;
  return pickProvided(result.data, body);
}

describe("pickProvided", () => {
  it.each([
    ["customer", insertCustomerSchema.partial().omit({ companyId: true }), { name: "Renamed" }, "isParent", "false"],
    ["contact", insertContactSchema.partial().omit({ customerId: true, companyId: true }), { name: "Renamed" }, "phones", []],
    ["company", insertCompanySchema.partial(), { name: "Renamed" }, "subscriptionPlan", "free"],
    ["settings", insertSettingsSchema.partial().omit({ companyId: true }), { companyName: "Renamed" }, "featureFlags", "{}"],
    ["document", insertContractBuilderDocumentSchema.partial().omit({ companyId: true, createdBy: true }), { documentTitle: "Updated", updatedBy: "user-1" }, "status", "draft"],
    ["ticket type field", insertTicketTypeFieldSchema.partial().omit({ ticketTypeId: true }), { fieldLabel: "Updated" }, "isRequired", "false"],
    ["communication template", insertCommunicationTemplateSchema.partial().omit({ companyId: true }), { name: "Updated" }, "isArchived", false],
    ["chemical product", insertChemicalProductSchema.partial(), { name: "Updated" }, "isActive", true],
    ["chemical notification template", insertChemicalNotificationTemplateSchema.partial(), { name: "Updated" }, "isDefault", false],
    ["crew", insertCrewSchema.omit({ companyId: true }).partial(), { name: "Updated" }, "isActive", true],
    ["site note", insertPropertySiteNoteSchema.omit({ companyId: true, customerId: true }).partial(), { label: "Updated" }, "sortOrder", 0],
    ["service template item", insertServiceTypeTemplateItemSchema.omit({ templateId: true }).partial(), { label: "Updated" }, "photoRequired", false],
  ] as const)("removes injected %s defaults but keeps supplied fields", (_name, schema, body, defaultKey, defaultValue) => {
    const empty = schema.parse({});
    expect(empty).toHaveProperty(defaultKey, defaultValue);
    expect(pickProvided(empty, {})).toEqual({});
    const parsed = schema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data).toHaveProperty(defaultKey, defaultValue);
    expect(pickProvided(parsed.data, body)).toEqual(body);
  });

  it("checks the adjacent service template schema's empty PATCH", () => {
    const schema = insertServiceTypeTemplateSchema.omit({ companyId: true }).partial();
    const parsed = schema.parse({});
    expect(pickProvided(parsed, {})).toEqual({});
    // This schema currently has no injected defaults.
    expect(parsed).toEqual({});
  });

  it("confirms email template and rule PATCH schemas do not inject defaults", () => {
    const templateSchema = insertEmailTemplateSchema.partial().omit({ companyId: true });
    const ruleSchema = insertEmailRuleSchema.partial().omit({ companyId: true });
    expect(templateSchema.parse({})).toEqual({});
    expect(ruleSchema.parse({})).toEqual({});
    expect(templateSchema.parse({ subject: "Revised" })).toEqual({ subject: "Revised" });
    expect(ruleSchema.parse({ conditionsJson: { event: "sent" } })).toEqual({
      conditionsJson: { event: "sent" },
    });
  });

  it("does not allow company reassignment through the communication-template PATCH schema used by both registrations", () => {
    const body = { name: "Updated", companyId: "other-company" };
    const schema = insertCommunicationTemplateSchema.partial().omit({ companyId: true });
    const parsed = schema.parse(body);
    expect(parsed).not.toHaveProperty("companyId");
    expect(pickProvided(parsed, body)).toEqual({ name: "Updated" });
  });

  it("keeps parsed values only for own keys provided in the body", () => {
    expect(pickProvided({ a: 1, b: 2 }, { a: 9 })).toEqual({ a: 1 });
    expect(pickProvided({ a: 1 }, Object.create({ a: 9 }))).toEqual({});
  });

  it("retains explicit null", () => {
    expect(pickProvided({ a: null }, { a: null })).toEqual({ a: null });
    expect(validatedTicketUpdate({ assignedToId: null })).toEqual({ assignedToId: null });
  });

  it.each([null, undefined, "text", 42, false])("returns an empty update for non-object body %s", (body) => {
    expect(pickProvided({ a: 1 }, body)).toEqual({});
  });

  it("documents default injection by the real ticket schema and removes it from PATCH", () => {
    const body = { assignedToId: "u1" };
    const result = ticketPatchSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;
    expect(result.data).toMatchObject({
      billingBehavior: "no_invoice",
      workType: "contract",
      priority: "normal",
      mobileStatus: "not_started",
    });
    expect(pickProvided(result.data, body)).toEqual({ assignedToId: "u1" });
  });

  it("preserves unrelated billable-ticket fields across reassignment, status move, and title edit", () => {
    const original = {
      assignedToId: "old-assignee",
      currentStatusId: "status-1",
      title: "Extra billable work",
      billingBehavior: "invoice_required",
      workType: "extra_work",
      priority: "high",
      mobileStatus: "in_progress",
    };
    const changes = [
      { assignedToId: "new-assignee" },
      { currentStatusId: "status-2" },
      { title: "Revised work" },
    ];
    for (const body of changes) {
      const updates = validatedTicketUpdate(body);
      expect(updates).toEqual(body);
      const ticket = { ...original, ...updates };
      expect(ticket).toMatchObject({
        billingBehavior: "invoice_required",
        workType: "extra_work",
        priority: "high",
        mobileStatus: "in_progress",
      });
      expect(ticket).toMatchObject(body);
    }
  });

  it("keeps server-added billing normalization and parsed date values", () => {
    const body = {
      currentStatusId: "ready-for-billing",
      billingBehavior: "invoice_required",
      dueDate: "2026-10-01T00:00:00.000Z",
    };
    expect(validatedTicketUpdate(body)).toEqual({
      currentStatusId: "ready-for-billing",
      billingBehavior: "invoice_required",
      dueDate: new Date(body.dueDate),
    });
    expect(validatedTicketUpdate({})).toEqual({});
  });
});