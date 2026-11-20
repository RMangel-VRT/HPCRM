import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import type { CommunicationTemplate, InsertCommunicationTemplate } from "@workspace/db";
import { requireCommPermission } from "../lib/communicationPermissions";
import { registerCommunicationTemplates } from "./communicationTemplates";
import type { storage } from "../storage";

it("uses view/manage permissions for every action, scopes records and keeps archive history", async () => {
  const dirty = { id: "retired", companyId: "co", type: "sms", name: "Snow Event Service Notice", isArchived: true,
    isActive: true, body: "Old" } as CommunicationTemplate;
  const rows = [dirty, { ...dirty, id: "foreign", companyId: "other", name: "Foreign", type: "email", isArchived: false }];
  const repo = {
    getCommunicationTemplates: async (company: string, includeArchived?: boolean) => rows.filter(r => r.companyId === company && (includeArchived || !r.isArchived)),
    getCommunicationTemplateById: async (id: string, company: string) => rows.find(r => r.companyId === company && r.id === id),
    createCommunicationTemplate: async (values: InsertCommunicationTemplate) => {
      const row = { ...values, id: "created" } as CommunicationTemplate;
      rows.push(row); return row;
    },
    updateCommunicationTemplate: async (id: string, company: string, values: Partial<InsertCommunicationTemplate>) => {
      const row = rows.find(r => r.companyId === company && r.id === id);
      if (row) Object.assign(row, values);
      return row;
    },
  };
  let role = "field";
  const app = express(), audit = vi.fn(async () => {});
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => role !== "guest", user: { id: "u", activeCompanyId: "co", accessRole: role } });
    next();
  });
  registerCommunicationTemplates(app, requireCommPermission("view"), requireCommPermission("manage_templates"), audit, repo as typeof storage);
  const client = request(app), root = "/api/communication-templates";
  const write = { companyId: "other", createdById: "other", name: "New template", type: "email", body: "Hi {{customer_name}}" };
  await client.get(root).expect(403);
  await client.get(`${root}/retired`).expect(403);
  for (const call of [client.post(root).send(write), client.patch(`${root}/retired`).send({ isActive: true }),
    client.delete(`${root}/retired`), client.post(`${root}/retired/archive`).send({})]) {
    const denied = await call.expect(403);
    expect(denied.body.requiredPermission).toBe("manage_templates");
  }
  expect(audit).not.toHaveBeenCalled();
  role = "guest";
  await client.get(root).expect(401);
  role = "office";
  await client.get(root).expect(200, []);
  await client.get(`${root}/foreign`).expect(404);
  await client.patch(`${root}/foreign`).send({ subject: "No" }).expect(404);
  await client.delete(`${root}/foreign`).expect(404);
  await client.post(`${root}/retired/archive`).send({ archive: false }).expect(422);
  const created = (await client.post(root).send(write).expect(201)).body;
  expect(created).toMatchObject({ companyId: "co", createdById: "u", body: "Hi {customerName}" });
  await client.patch(`${root}/created`).send({ subject: "{{property_name}}" }).expect(200);
  const updated = (await client.get(`${root}/created`).expect(200)).body;
  expect(updated).toMatchObject({ subject: "{propertyName}", body: "Hi {customerName}", isArchived: false });
  await client.delete(`${root}/created`).expect(204);
  await client.get(root).expect(200, []);
  expect((await client.get(`${root}?includeInactive=true`).expect(200)).body.map((r: CommunicationTemplate) => r.id)).toEqual(["retired", "created"]);
  await client.post(`${root}/created/archive`).send({ archive: false }).expect(200);
  expect((await client.get(root).expect(200)).body.map((r: CommunicationTemplate) => r.id)).toEqual(["created"]);
  expect(audit).toHaveBeenCalledTimes(4);
});
