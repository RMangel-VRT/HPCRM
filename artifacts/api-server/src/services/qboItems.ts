import { and, eq, inArray, sql } from "drizzle-orm";
import { qboItemCache, qboUmbrellaItems, UMBRELLA_DEFAULTS, type QboItemCache } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { qboRequest } from "./qboClient";

export class QboItemError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) { super(message); }
}
export const supportedItem = (type: string) => ["Service", "NonInventory"].includes(type);
type CachedItem = Pick<QboItemCache, "qboId" | "name" | "type" | "incomeAccountName" | "active">;
function parseItem(item: Record<string, unknown>): CachedItem {
  if (typeof item.Id !== "string" || !item.Id || typeof item.Name !== "string" || !item.Name || typeof item.Type !== "string") {
    throw new QboItemError(502, "QuickBooks returned an invalid item; the local cache was not changed");
  }
  return { qboId: item.Id, name: item.Name, type: item.Type, active: item.Active !== false,
    incomeAccountName: (item.IncomeAccountRef as { name?: string } | undefined)?.name ?? null };
}
async function query(companyId: string, text: string, entity: "Item" | "Account") {
  const response = await qboRequest(companyId, "GET", `/query?query=${encodeURIComponent(text)}`);
  if (!response.ok) throw new QboItemError(502, `QuickBooks ${entity} query failed (${response.status})`);
  const body = await response.json() as { QueryResponse?: Record<string, unknown>; Fault?: unknown };
  if (!body.QueryResponse || body.Fault) throw new QboItemError(502, "QuickBooks returned an invalid query response");
  const rows = body.QueryResponse[entity] ?? [];
  if (!Array.isArray(rows)) throw new QboItemError(502, "QuickBooks returned an invalid item list");
  return rows as Record<string, unknown>[];
}
/** All item pulls, links and creates share a cross-process company lock.
 * Network reads are inside the transaction so a delayed pull cannot overwrite a newer create.
 * No local writes occur until the entire remote operation has succeeded. */
async function serialized<T>(companyId: string, work: (tx: AppTransaction) => Promise<T>) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`qbo-items:${companyId}`},0))`);
    await provisionUmbrellas(companyId, tx);
    return work(tx);
  });
}
export async function provisionUmbrellas(companyId: string, tx: AppTransaction | typeof db = db) {
  await tx.insert(qboUmbrellaItems).values(UMBRELLA_DEFAULTS.map((row, sortOrder) => ({ ...row, companyId, sortOrder })))
    .onConflictDoNothing({ target: [qboUmbrellaItems.companyId, qboUmbrellaItems.key] });
}
async function upsert(tx: AppTransaction, companyId: string, row: CachedItem, fetchedAt: Date) {
  await tx.insert(qboItemCache).values({ ...row, companyId, fetchedAt })
    .onConflictDoUpdate({ target: [qboItemCache.companyId, qboItemCache.qboId], set: { ...row, fetchedAt } });
}
async function upsertBatch(tx: AppTransaction, companyId: string, rows: CachedItem[], fetchedAt: Date) {
  // Keep parameter counts bounded on large company item lists.
  for (let i = 0; i < rows.length; i += 500) {
    await tx.insert(qboItemCache).values(rows.slice(i, i + 500).map(row => ({ ...row, companyId, fetchedAt })))
      .onConflictDoUpdate({ target: [qboItemCache.companyId, qboItemCache.qboId], set: {
        name: sql`excluded.name`, type: sql`excluded.type`, incomeAccountName: sql`excluded.income_account_name`,
        active: sql`excluded.active`, fetchedAt,
      } });
  }
}
async function bind(tx: AppTransaction, companyId: string, key: string, item: CachedItem, now: Date) {
  await tx.update(qboUmbrellaItems).set({ qboItemId: item.qboId, qboItemName: item.name, qboItemType: item.type,
    qboSyncedAt: now, updatedAt: now }).where(and(eq(qboUmbrellaItems.companyId, companyId), eq(qboUmbrellaItems.key, key as typeof qboUmbrellaItems.$inferSelect.key)));
}
export async function listUmbrellas(companyId: string) {
  await provisionUmbrellas(companyId);
  const [items, cache] = await Promise.all([
    db.select().from(qboUmbrellaItems).where(eq(qboUmbrellaItems.companyId, companyId)).orderBy(qboUmbrellaItems.sortOrder),
    db.select().from(qboItemCache).where(eq(qboItemCache.companyId, companyId)),
  ]);
  const byId = new Map(cache.map(r => [r.qboId, r]));
  return items.map(row => ({ ...row, bindingStatus: !row.qboItemId ? "unlinked"
    : !byId.has(row.qboItemId) || !row.qboSyncedAt ? "missing"
    : !byId.get(row.qboItemId)!.active || !supportedItem(byId.get(row.qboItemId)!.type) ? "inactive" : "active" }));
}
export async function cachedItems(companyId: string, search = "", type?: string) {
  const rows = await db.select().from(qboItemCache).where(eq(qboItemCache.companyId, companyId)).orderBy(qboItemCache.name);
  const lastPulledAt = rows.reduce<Date | null>((last, row) => !last || row.fetchedAt > last ? row.fetchedAt : last, null);
  return { items: rows.filter(r => (!type || r.type === type) && r.name.toLowerCase().includes(search.toLowerCase())), lastPulledAt };
}
export async function pullItems(companyId: string) {
  return serialized(companyId, async tx => {
    const all = new Map<string, CachedItem>();
    const pageSize = 1000;
    for (let start = 1; ; start += pageSize) {
      const rows = await query(companyId, `SELECT * FROM Item WHERE Active IN (true,false) STARTPOSITION ${start} MAXRESULTS ${pageSize}`, "Item");
      for (const row of rows) { const item = parseItem(row); all.set(item.qboId, item); }
      if (rows.length < pageSize) break;
    }
    const old = await tx.select().from(qboItemCache).where(eq(qboItemCache.companyId, companyId));
    const oldIds = new Set(old.map(r => r.qboId));
    const now = new Date();
    await upsertBatch(tx, companyId, [...all.values()], now);
    const missing = old.filter(r => !all.has(r.qboId) && r.active);
    for (let i = 0; i < missing.length; i += 500) await tx.update(qboItemCache).set({ active: false })
      .where(and(eq(qboItemCache.companyId, companyId), inArray(qboItemCache.qboId, missing.slice(i, i + 500).map(r => r.qboId))));
    const umbrellas = await tx.select().from(qboUmbrellaItems).where(eq(qboUmbrellaItems.companyId, companyId));
    const missingUmbrellas: string[] = [], inactiveUmbrellas: string[] = [];
    for (const row of umbrellas) {
      if (!row.qboItemId) continue;
      const item = all.get(row.qboItemId);
      if (!item) {
        missingUmbrellas.push(row.key);
        await tx.update(qboUmbrellaItems).set({ qboSyncedAt: null, updatedAt: now })
          .where(and(eq(qboUmbrellaItems.companyId, companyId), eq(qboUmbrellaItems.id, row.id)));
      } else {
        if (!item.active || !supportedItem(item.type)) inactiveUmbrellas.push(row.key);
        // Unsupported remote type is not a valid binding; keep last supported type snapshot.
        await tx.update(qboUmbrellaItems).set({ qboItemName: item.name,
          ...(supportedItem(item.type) ? { qboItemType: item.type } : {}), qboSyncedAt: now, updatedAt: now })
          .where(and(eq(qboUmbrellaItems.companyId, companyId), eq(qboUmbrellaItems.id, row.id)));
      }
    }
    return { pulled: all.size, inserted: [...all.keys()].filter(id => !oldIds.has(id)).length,
      updated: [...all.keys()].filter(id => oldIds.has(id)).length, deactivated: missing.length,
      missingUmbrellas, inactiveUmbrellas, lastPulledAt: now.toISOString() };
  });
}
export async function linkItem(companyId: string, key: string, qboId: string) {
  return serialized(companyId, async tx => {
    const [item] = await tx.select().from(qboItemCache).where(and(eq(qboItemCache.companyId, companyId), eq(qboItemCache.qboId, qboId)));
    if (!item) throw new QboItemError(404, "Pull items first: this QuickBooks item is not cached for this company");
    if (!item.active || !supportedItem(item.type)) throw new QboItemError(400, "Choose an active Service or NonInventory item");
    await bind(tx, companyId, key, item, item.fetchedAt);
  });
}
export async function unlinkItem(companyId: string, key: string) {
  return serialized(companyId, async tx => {
    await tx.update(qboUmbrellaItems).set({ qboItemId: null, qboItemName: null, qboItemType: null, qboSyncedAt: null, updatedAt: new Date() })
      .where(and(eq(qboUmbrellaItems.companyId, companyId), eq(qboUmbrellaItems.key, key as typeof qboUmbrellaItems.$inferSelect.key)));
  });
}
export async function incomeAccounts(companyId: string) {
  const all: Array<{ id: string; name: string }> = [];
  for (let start = 1; ; start += 1000) {
    const rows = await query(companyId, `SELECT * FROM Account WHERE AccountType = 'Income' STARTPOSITION ${start} MAXRESULTS 1000`, "Account");
    all.push(...rows.filter(r => r.Active !== false).map(r => ({ id: String(r.Id), name: String(r.Name) })));
    if (rows.length < 1000) return all;
  }
}
export function defaultItemType(key: string) {
  return ["landscape_labor", "irrigation_labor", "fees_surcharges"].includes(key) ? "Service" as const : "NonInventory" as const;
}
export async function createItem(companyId: string, input: { key: string; name: string; type?: "Service" | "NonInventory"; incomeAccountId: string }) {
  let remoteCreated = false;
  try {
    return await serialized(companyId, async tx => {
      const escaped = input.name.replace(/'/g, "''");
      const matches = await query(companyId, `SELECT * FROM Item WHERE Name = '${escaped}' AND Active IN (true,false) MAXRESULTS 1000`, "Item");
      if (matches.length) {
        const candidate = parseItem(matches[0]);
        // No writes are committed on a conflict; pull then link is the recovery path.
        throw new QboItemError(409, "A QuickBooks item with this name already exists. Pull items and link it instead.", {
          candidate, canLink: candidate.active && supportedItem(candidate.type),
        });
      }
      const accounts = await incomeAccounts(companyId);
      if (!accounts.some(a => a.id === input.incomeAccountId)) throw new QboItemError(400, "Choose an active Income account");
      const response = await qboRequest(companyId, "POST", "/item", {
        Name: input.name, Type: input.type ?? defaultItemType(input.key), IncomeAccountRef: { value: input.incomeAccountId },
      });
      remoteCreated = response.ok;
      const body = await response.json() as { Item?: Record<string, unknown>; Fault?: { Error?: Array<{ code?: string; Detail?: string; Message?: string }> } };
      if (!response.ok || body.Fault) {
        remoteCreated = false;
        const errors = body.Fault?.Error ?? [];
        if (errors.some(e => String(e.code) === "6240")) throw new QboItemError(409, "A QuickBooks item with this name already exists. Pull items before linking it.", { canLink: false });
        throw new QboItemError(502, errors[0]?.Detail ?? errors[0]?.Message ?? "QuickBooks item creation failed");
      }
      if (!body.Item) throw new QboItemError(502, "QuickBooks returned no item. Pull items before retrying.");
      const item = parseItem(body.Item);
      if (!item.active || !supportedItem(item.type)) throw new QboItemError(502, "QuickBooks returned an unsupported item. Pull items before retrying.");
      const now = new Date();
      await upsert(tx, companyId, item, now);
      await bind(tx, companyId, input.key, item, now);
      return item;
    });
  } catch (error) {
    if (remoteCreated) throw new QboItemError(502, "QuickBooks may have created the item, but local linking failed. Pull items and link the existing item; do not create another.", { recoveryRequired: true });
    throw error;
  }
}
