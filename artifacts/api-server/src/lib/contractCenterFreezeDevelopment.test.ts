import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, users, companyUsers, customers, contracts, agreements, termLegacySources, contractDocuments, customerRateSheets, hashPassword, pool } from "@workspace/db";
import { PDFDocument } from "pdf-lib";
import type { File } from "@google-cloud/storage";
import { db } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAccessGroupType, ObjectPermission } from "../objectAcl";
import { hasFrozenLegacyRows } from "./legacyContractFreeze";

// Explicit opt-in; creates and removes ONLY disposable development records.
describe.skipIf(process.env.CC_FREEZE_VERIFY !== "yes")("frozen-source Copy development verification", () => {
  it("copies multiple legacy sources, preserves first provenance on repeat, and scopes status to company", async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Development verification cannot run in production");
    const companyIds: string[] = [];
    const fixtureFiles: File[] = [];
    let userId: string | undefined;
    try {
      for (const name of ["Disposable switch-over verification", "Disposable cross-company verification"]) {
        const [company] = await db.insert(companies).values({ name, slug: `cc-freeze-${randomUUID()}` }).returning();
        companyIds.push(company.id);
      }
      const password = randomUUID();
      const email = `cc-freeze-${randomUUID()}@example.invalid`;
      const [actor] = await db.insert(users).values({ name: "Disposable verifier", defaultCompanyId: companyIds[0], email,
        passwordHash: await hashPassword(password) }).returning();
      userId = actor.id;
      await db.insert(companyUsers).values({ companyId: companyIds[0], userId, role: "admin", status: "active" });
      const [customer] = await db.insert(customers).values({ companyId: companyIds[0], name: "Frozen-source verification",
        street: "Test address", city: "Denver", state: "CO", zip: "80000" }).returning();
      const sources = await db.insert(contracts).values(["Maintenance", "Chemical", "Snow"].map(serviceType => ({
        companyId: companyIds[0], customerId: customer.id, serviceType: serviceType as "Maintenance" | "Chemical" | "Snow",
        billingPattern: "monthly" as const, startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"),
      }))).returning();
      let activeCompanyId = companyIds[0];
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: actor.id, activeCompanyId, activeRole: "admin", isSuperAdminBool: false } });
        next();
      });
      registerContractCenterRoutes(app);
      const client = request(app);
      const status = () => client.get("/api/contract-center/copy-status");
      expect((await status()).body).toEqual({ firstCopiedAt: null, copiedContracts: 0 });
      expect((await client.post("/api/contract-center/rate-card/seed-defaults")).status).toBe(200);
      const preview = await client.post("/api/admin/contract-center/copy-legacy").send({ dryRun: true });
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect((await status()).body.copiedContracts).toBe(0);
      const copied = await client.post("/api/admin/contract-center/copy-legacy").send({ dryRun: false });
      expect(copied.status, JSON.stringify(copied.body)).toBe(200);
      const first = (await status()).body;
      expect(first.firstCopiedAt).toBeTruthy(); expect(first.copiedContracts).toBe(3);
      const links = await db.select().from(termLegacySources).where(eq(termLegacySources.companyId, companyIds[0]));
      expect(new Set(links.map(l => l.legacyContractId)).size).toBe(3);
      // Two landscape services combine into one copied term; the count must still be legacy contract IDs.
      expect(new Set(links.map(l => l.termId)).size).toBeLessThan(links.length);
      expect(new Set(links.map(l => l.legacyContractId))).toEqual(new Set(sources.map(s => s.id)));
      expect(new Date(first.firstCopiedAt).getTime()).toBe(Math.min(...links.map(l => new Date(l.createdAt).getTime())));
      const repeated = await client.post("/api/admin/contract-center/copy-legacy").send({ dryRun: false });
      expect(repeated.status).toBe(200); expect((await status()).body).toEqual(first);
      const cards = await client.get(`/api/contract-center/contracts?customerId=${customer.id}`);
      expect(cards.status).toBe(200); expect(cards.body.length).toBeGreaterThan(0);
      expect(cards.body.every((card: any) => card.customerId === customer.id)).toBe(true);
      expect((await db.select().from(contracts).where(eq(contracts.companyId, companyIds[0])))).toHaveLength(3);
      activeCompanyId = companyIds[1];
      expect((await status()).body).toEqual({ firstCopiedAt: null, copiedContracts: 0 });
      expect((await client.get(`/api/contract-center/contracts?customerId=${customer.id}`)).status).toBe(404);
      // FK company columns are independent: even malformed legacy ancestry must not bypass the freeze.
      const [edgeCustomer] = await db.insert(customers).values({ companyId: companyIds[1], name: "Disposable cascade verification",
        street: "Test address", city: "Denver", state: "CO", zip: "80000" }).returning();
      const [edgeContract] = await db.insert(contracts).values({ companyId: companyIds[0], customerId: edgeCustomer.id,
        serviceType: "Maintenance", billingPattern: "monthly", startDate: new Date("2026-01-01T00:00:00Z") }).returning();
      expect(await hasFrozenLegacyRows(companyIds[1], edgeCustomer.id)).toBe(true);
      expect(await hasFrozenLegacyRows(companyIds[1])).toBe(true);
      await db.delete(contracts).where(eq(contracts.id, edgeContract.id));
      await db.insert(customerRateSheets).values({ companyId: companyIds[0], customerId: edgeCustomer.id });
      expect(await hasFrozenLegacyRows(companyIds[1], edgeCustomer.id)).toBe(true);
      expect(await hasFrozenLegacyRows(companyIds[1])).toBe(true);

      // Finish the smoke gaps with cheaper real HTTP checks: history/current downloads and Revenue Audit.
      // The legacy metadata below is test-fixture setup only, not a user action or production correction.
      const domain = process.env.REPLIT_DEV_DOMAIN;
      if (!domain) throw new Error("Live development preview is required for document/audit smoke checks");
      const base = `https://${domain}`;
      const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
      expect(cookie).toBeTruthy();
      const objectStorage = new ObjectStorageService();
      for (const version of [1, 2]) {
        const pdf = await PDFDocument.create();
        pdf.addPage().drawText(`Disposable legacy version ${version}`);
        const bytes = await pdf.save();
        const upload = await objectStorage.getScopedUploadURL(`contract-freeze-verify/${companyIds[0]}/version-${version}.pdf`);
        const put = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: Buffer.from(bytes) });
        expect(put.status).toBe(200);
        const file = await objectStorage.getObjectEntityFile(upload.storagePath);
        fixtureFiles.push(file);
        await objectStorage.trySetObjectEntityAclPolicy(upload.storagePath, { owner: actor.id, visibility: "private",
          aclRules: [{ group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: companyIds[0] }, permission: ObjectPermission.READ }] });
        await db.insert(contractDocuments).values({ companyId: companyIds[0], contractId: sources[0].id, version,
          filename: `Disposable signed version ${version}.pdf`, uploadedBy: actor.id, fileSize: bytes.length,
          storageObjectPath: upload.storagePath, mimeType: "application/pdf" });
      }
      const get = (path: string) => fetch(`${base}${path}`, { headers: { Cookie: cookie } });
      const history = await get(`/api/contracts/${sources[0].id}/documents`);
      expect(history.status).toBe(200);
      const versions = await history.json() as Array<{ version: number; storageObjectPath: string }>;
      expect(versions.map(v => v.version).sort()).toEqual([1, 2]);
      const current = await get(`/api/contracts/${sources[0].id}/documents/current`);
      expect(current.status).toBe(200); expect((await current.json() as { version: number }).version).toBe(2);
      for (const document of versions) {
        const response = await get(document.storageObjectPath);
        expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toContain("application/pdf");
        expect((await PDFDocument.load(await response.arrayBuffer())).getPageCount()).toBe(1);
      }
      expect((await fetch(`${base}${versions[0].storageObjectPath}`)).status).toBe(401);
      const audit = await get("/api/revenue/contract-audit?year=2026");
      expect(audit.status).toBe(200);
      const auditData = await audit.json() as { year: number; rows: unknown[] };
      expect(auditData.year).toBe(2026); expect(Array.isArray(auditData.rows)).toBe(true);
      const blocked = await fetch(`${base}/api/contracts/${sources[0].id}/documents/upload-url`, {
        method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
      expect(blocked.status).toBe(409);
      expect(await blocked.json()).toEqual({ message: "Contracts are managed in the Contract Center now." });
    } finally {
      for (const file of fixtureFiles) await file.delete({ ignoreNotFound: true });
      for (const companyId of companyIds) {
        await db.delete(agreements).where(eq(agreements.companyId, companyId));
        await db.delete(companies).where(eq(companies.id, companyId));
      }
      if (userId) await db.delete(users).where(eq(users.id, userId));
      await pool.end();
    }
  }, 90000);
});
