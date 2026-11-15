import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { companies, customers, agreements, agreementTerms, serviceCalendar, termScopeLines, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { STARTING_SERVICE_CALENDAR, CUSTOMER_CALENDAR_LABELS } from "../../../../lib/db/src/serviceCalendarContracts";
import { loadServiceFulfillmentInputs } from "../lib/customerServiceFulfillmentLoader";
import { buildContractedServicesModel } from "./contractedServicesDocument";
import { contractedServicesHtml } from "./documents/contractedServices";
import { closeDocumentBrowser, renderDocumentPdf } from "./documents/render";
const output = resolve("../../generated-artifacts/SC3");
const migration = readFileSync(resolve("../../.migration-backup/migrations/0087_service_calendar_customer_label.sql"), "utf8");
afterAll(async () => { await closeDocumentBrowser(); await Promise.all([pool.end(), schemaPool.end()]); });
describe("SC3 development migration and form evidence", () => {
  it("backfills all 13 exact matches twice, preserving custom, renamed and non-round rows", async () => {
    const evidence = await db.transaction(async tx => {
      // Session-local shadow table; no real company's calendar is edited.
      await tx.execute(sql.raw("CREATE TEMP TABLE service_calendar (service_key text, name text, kind text, customer_label text) ON COMMIT DROP"));
      const rows = Object.entries(CUSTOMER_CALENDAR_LABELS).flatMap(([serviceKey, labels]) => Object.keys(labels).map(name => ({ serviceKey, name, kind: "round", customerLabel: null as string | null })));
      rows.push({ serviceKey: "broadleaf", name: "Renamed by owner", kind: "round", customerLabel: null },
        { serviceKey: "broadleaf", name: "Broadleaf 2", kind: "recurring", customerLabel: null },
        { serviceKey: "broadleaf", name: "Broadleaf 2", kind: "checklist", customerLabel: null },
        { serviceKey: "broadleaf", name: "Broadleaf 2", kind: "round", customerLabel: "Existing customer label" });
      for (const row of rows) await tx.execute(sql`INSERT INTO service_calendar VALUES (${row.serviceKey},${row.name},${row.kind},${row.customerLabel})`);
      await tx.execute(sql.raw(migration));
      const first = await tx.execute(sql.raw("SELECT * FROM service_calendar ORDER BY service_key,name,kind,customer_label NULLS LAST"));
      await tx.execute(sql.raw(migration));
      const second = await tx.execute(sql.raw("SELECT * FROM service_calendar ORDER BY service_key,name,kind,customer_label NULLS LAST"));
      expect(second.rows).toEqual(first.rows);
      expect(second.rows.filter(r => r.customer_label === null)).toHaveLength(3);
      expect(second.rows.filter(r => r.customer_label !== null)).toHaveLength(14);
      for (const [serviceKey, names] of Object.entries(CUSTOMER_CALENDAR_LABELS))
        for (const [name, label] of Object.entries(names))
          expect(second.rows.some(r => r.service_key === serviceKey && r.name === name && r.kind === "round" && r.customer_label === label)).toBe(true);
      return second.rows;
    });
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/migration-evidence.json`, JSON.stringify(evidence, null, 2));
  });
  it("renders loaded High Plains-form and management-company-form seasons then rolls every fixture back", async () => {
    const rollback = new Error("SC3_ROLLBACK");
    const id = randomUUID();
    await expect(db.transaction(async tx => {
      await tx.insert(companies).values({ id, name: "SC3 development evidence", slug: id });
      await tx.insert(serviceCalendar).values(STARTING_SERVICE_CALENDAR.map(c => ({ ...c, companyId: id })));
      for (const form of ["ours", "theirs"] as const) {
        const cid = `${id}-${form}`, aid = `${cid}-a`, tid = `${cid}-t`;
        await tx.insert(customers).values({ id: cid, companyId: id, name: form === "ours" ? "High Plains Form — Development Example" : "Management Company Form — Development Example",
          street: "100 Example Lane", city: "Arvada", state: "CO", zip: "80005", managementCompany: form === "theirs" ? "Example Management" : null });
        await tx.insert(agreements).values({ id: aid, companyId: id, customerId: cid });
        await tx.insert(agreementTerms).values({ id: tid, companyId: id, agreementId: aid, form, line: "landscape", seasonLabel: "2025–26",
          startDate: "2025-11-01", endDate: "2026-10-31", status: "signed", billingType: "seasonal" });
        await tx.insert(termScopeLines).values({ companyId: id, termId: tid, serviceKey: "irrigation_inspection", line: "irrigation", included: true, quantity: null });
        const inputs = await loadServiceFulfillmentInputs(tx, id);
        const model = buildContractedServicesModel(inputs, cid, tid, { commercial: true });
        const bytes = await renderDocumentPdf({ html: contractedServicesHtml(model), footerLabel: `Contracted Services · ${model.season}`, shortHeaderNumber: model.season });
        mkdirSync(output, { recursive: true });
        writeFileSync(`${output}/${form === "ours" ? "high-plains-form" : "management-company-form"}.pdf`, bytes);
      }
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await db.select().from(companies).where(eq(companies.id, id))).toEqual([]);
  }, 90000);
});
