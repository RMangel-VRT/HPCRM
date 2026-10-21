// @vitest-environment node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { transformSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { companies, ticketTypeFields, ticketTypeStatuses, ticketTypes } from "@workspace/db";
import { db, inTransaction } from "../db";
import { storage } from "../storage";
import { STATUS_KEY_BACKFILL, TICKET_TYPE_CAPABILITIES, TICKET_TYPE_KEYS, findSeededStatus, findSeededTicketType } from "../shared/ticketCapabilities";

// Execute the actual boot/seed functions without running unrelated route-registration DML.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const logger = { info: vi.fn() };
function load(name: string) {
  const start = source.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`Missing boot function ${name}`);
  const end = source.indexOf("\n}\n", start) + 2;
  const code = transformSync(source.slice(start, end).replace("export ", ""), { loader: "ts" }).code;
  return new Function("deps", `
    const { db, storage, sql, logger, STATUS_KEY_BACKFILL, TICKET_TYPE_CAPABILITIES,
      TICKET_TYPE_KEYS, findSeededStatus, findSeededTicketType } = deps;
    ${code}
    return ${name};
  `)({ db, storage, sql, logger, STATUS_KEY_BACKFILL, TICKET_TYPE_CAPABILITIES, TICKET_TYPE_KEYS, findSeededStatus, findSeededTicketType });
}
const rename = load("renameReadyForBillingStatusLabel");
const rollback = Symbol("rollback invoicing test data");
async function isolated(run: () => Promise<void>) {
  try {
    await db.transaction(tx => inTransaction(tx, async () => {
      await run();
      throw rollback;
    }));
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function newCompany() {
  const id = randomUUID();
  await db.insert(companies).values({ id, name: "Invoicing test", slug: `invoicing-test-${id}` });
  return id;
}

describe("Invoicing boot label update (real PostgreSQL, rolled back)", () => {
  it("is called immediately after the type rename in actual route registration", () => {
    expect(source).toMatch(/await migrateTicketTypeRename\(\);\s*await renameReadyForBillingStatusLabel\(\);/);
    expect(source.slice(source.indexOf("export async function runStartupMigrations"))).not.toContain("await renameReadyForBillingStatusLabel");
  });
  it("skips without issuing UPDATE when status_key is absent", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await rename({ execute })).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
  });
  it("renames only exact keyed seeded labels, preserves custom names and is idempotent", async () => {
    await isolated(async () => {
      const companyId = await newCompany();
      const [type] = await db.insert(ticketTypes).values({ companyId, name: "Test type" }).returning();
      const make = (name: string, statusKey: string | null) =>
        db.insert(ticketTypeStatuses).values({ ticketTypeId: type.id, name, statusKey, displayOrder: 0 });
      await make("Ready for Billing", "ready_for_billing");
      await make("Bill it", "ready_for_billing");
      await make("Ready for billing", "ready_for_billing"); // case must remain exact
      await make("Ready for Billing", null);
      await make("Ready for Billing", "work_completed");
      const before = await db.execute(sql`SELECT count(*)::int n FROM ticket_type_statuses
        WHERE status_key = 'ready_for_billing' AND name = 'Ready for Billing'`);
      expect(await rename()).toBe(before.rows[0].n);
      const rows = await storage.getTicketTypeStatuses(type.id);
      expect(rows.map(s => [s.name, s.statusKey])).toEqual(expect.arrayContaining([
        ["Ready to invoice", "ready_for_billing"], ["Bill it", "ready_for_billing"],
        ["Ready for billing", "ready_for_billing"], ["Ready for Billing", null],
        ["Ready for Billing", "work_completed"],
      ]));
      expect(await rename()).toBe(0);
      expect(logger.info).toHaveBeenLastCalledWith({ changedCount: 0 }, expect.any(String));
    });
  });
  it.each([
    ["EstimateRequest", "estimate_request", 11, "billing_confirmed"],
    ["Task", "task", 7, "completion_date"],
    ["Project", "project", 7, "pne_billing_confirmed"],
  ])("seeds %s with the new label and reruns without duplicates even after a custom rename", async (name, key, count, fieldKey) => {
    await isolated(async () => {
      const companyId = await newCompany();
      const ensure = load(`ensure${name}TicketType`);
      const first = await ensure(companyId);
      const statuses = await storage.getTicketTypeStatuses(first.typeId);
      const ready = findSeededStatus(statuses, "ready_for_billing")!;
      expect(ready.name).toBe("Ready to invoice");
      expect(statuses).toHaveLength(count);
      expect((await storage.getTicketTypes(companyId))[0].typeKey).toBe(key);
      await ensure(companyId);
      await db.update(ticketTypeStatuses).set({ name: "Bill it" }).where(eq(ticketTypeStatuses.id, ready.id));
      // Field association must still resolve by key, not the stored custom label.
      await db.delete(ticketTypeFields).where(and(eq(ticketTypeFields.ticketTypeId, first.typeId), eq(ticketTypeFields.fieldKey, fieldKey)));
      await ensure(companyId);
      const after = await storage.getTicketTypeStatuses(first.typeId);
      expect(after).toHaveLength(count);
      expect(new Set(after.map(s => s.statusKey)).size).toBe(count);
      expect(findSeededStatus(after, "ready_for_billing")).toMatchObject({ id: ready.id, name: "Bill it" });
      const fields = await storage.getTicketTypeFields(first.typeId);
      expect(fields.find(f => f.fieldKey === fieldKey)?.statusId).toBe(
        key === "task" ? findSeededStatus(after, "work_completed")!.id : ready.id,
      );
    });
  });
});
