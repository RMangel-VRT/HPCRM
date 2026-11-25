import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, customers, users, estimates, estimateVersions, estimateSections, estimateLines,
  hardscapeCatalogItems, plantCatalogItems, tickets, ticketTypes, ticketTypeStatuses, pool as schemaPool, ESTIMATE_STATUSES } from "@workspace/db";
import { db, pool } from "../db";
import { createEstimate, createLine, createSection, patchLine, patchSection, patchVersion, deleteLine, deleteSection, retitleEstimate } from "./estimates";
import { transitionEstimate, type EstimateAction } from "./estimateLifecycle";
import { readEstimate, listEstimates } from "./estimateReads";

// These tests intentionally exercise many serialized round trips to remote PG.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
const a = `lifecycle-${randomUUID()}`, b = `lifecycle-${randomUUID()}`, actor = randomUUID();
let customer: string, foreignCustomer: string;
type Detail = Awaited<ReturnType<typeof createEstimate>>;
const act = (d: Detail, action: EstimateAction, body: unknown = {}, date?: Date) =>
  transitionEstimate(a, actor, d.id, d.version.id, action, body, date);
async function draft(withLine = true) {
  const d = await createEstimate(a, actor, { customerId: customer, title: "Lifecycle test" });
  return withLine ? createLine(a, d.id, d.version.id, { sectionId: d.version.sections[0].id, lineType: "custom",
    name: "Snapshot", unit: "EA", quantity: "2.5", unitPriceCents: 33, umbrellaKey: "landscape_materials" }) : d;
}
const lines = (d: Detail) => d.version.sections.flatMap(s => s.lines);
function snapshot(line: ReturnType<typeof lines>[number]) {
  const { id: _i, versionId: _v, sectionId: _s, createdAt: _c, updatedAt: _u, ...rest } = line;
  return rest;
}
async function invariant(id: string) {
  const d = await readEstimate(a, id);
  expect(d.currentVersionId).toBe(d.versions[0].id);
  expect(d.versions.filter(v => v.status === "draft").length).toBeLessThanOrEqual(1);
  expect(d.versions.filter(v => v.status === "accepted").length).toBeLessThanOrEqual(1);
  return d;
}
beforeAll(async () => {
  await db.insert(companies).values([{ id: a, name: "Disposable lifecycle A", slug: a }, { id: b, name: "Disposable lifecycle B", slug: b }]);
  await db.insert(users).values({ id: actor, name: "Disposable lifecycle actor", passwordHash: "not-a-login" });
  const base = { street: "Test", city: "Test", state: "CO", zip: "00000" };
  [customer, foreignCustomer] = (await db.insert(customers).values([
    { ...base, companyId: a, name: "Lifecycle A" }, { ...base, companyId: b, name: "Lifecycle B" },
  ]).returning()).map(c => c.id);
});
afterAll(async () => {
  await db.delete(tickets).where(inArray(tickets.companyId, [a, b]));
  await db.delete(companies).where(inArray(companies.id, [a, b]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
});

describe("real PostgreSQL lifecycle, frozen values and history", () => {
  it("accepted-on migration is guarded and rerunnable", async () => {
    const migration = await readFile(new URL("../../../../.migration-backup/migrations/0058_estimate_accepted_on.sql", import.meta.url), "utf8");
    await db.execute(sql.raw(migration)); await db.execute(sql.raw(migration));
    expect((await draft()).version.acceptedOn).toBeNull();
  });
  it("empty send rolls back, and manual zero lines do not require an override", async () => {
    const d = await draft(false);
    await expect(act(d, "send", { method: "email" })).rejects.toMatchObject({ error: "NO_LINES" });
    expect((await invariant(d.id)).version.status).toBe("draft");
    const priced = await createLine(a, d.id, d.version.id, { sectionId: d.version.sections[0].id, lineType: "custom", name: "Warranty",
      unit: "EA", quantity: "1", unitPriceCents: 0, umbrellaKey: "landscape_labor" });
    expect((await act(priced, "send", { method: "hard_copy" })).version.frozenSubtotalCents).toBe(0);
  });
  it("freezes totals and snapshots; zero confirmation does not alter lines", async () => {
    let d = await draft();
    const [item] = await db.insert(hardscapeCatalogItems).values({ companyId: a, name: "Text-priced stone", category: "Stone",
      sku: randomUUID(), unit: "sqft", retailPriceCents: null, wholesaleCostCents: 15 }).returning();
    d = await createLine(a, d.id, d.version.id, { sectionId: d.version.sections[0].id, lineType: "hardscape", hardscapeCatalogItemId: item.id, quantity: "1.25" });
    const original = lines(d);
    const needs = original.find(l => l.needsPrice)!;
    await expect(act(d, "send", { method: "email" })).rejects.toMatchObject({ status: 409, error: "LINES_NEED_PRICE", extra: { lineIds: [needs.id] } });
    expect((await readEstimate(a, d.id)).version.sentAt).toBeNull();
    const sent = await act(d, "send", { method: "email", confirmZeroPriced: true });
    expect(lines(sent)).toEqual(original);
    expect(sent.version).toMatchObject({ status: "sent", sentById: actor, sentMethod: "email",
      frozenSubtotalCents: d.version.totals.subtotalCents, frozenCostKnownCents: d.version.totals.costKnownCents,
      frozenCostUnknownLines: d.version.totals.costUnknownLines });
    await db.update(hardscapeCatalogItems).set({ retailPriceCents: 99999, wholesaleCostCents: 99999, name: "Changed" }).where(eq(hardscapeCatalogItems.id, item.id));
    const frozen = await readEstimate(a, d.id);
    expect(frozen.version.totals).toEqual(sent.version.totals);
    expect(lines(frozen)).toEqual(original);
    const accepted = await act(sent, "accept", { method: "signed_pdf", poNumber: "PO-12", acceptedOn: "2026-10-01" }, new Date("2026-10-30T01:00:00Z"));
    expect(accepted.version).toMatchObject({ status: "accepted", acceptedOn: "2026-10-01", poNumber: "PO-12", acceptanceMethod: "signed_pdf", acceptedById: actor });
    expect(accepted.version.acceptedAt?.toISOString()).toBe("2026-10-30T01:00:00.000Z");
    expect(accepted.version.totals).toEqual(sent.version.totals);
    expect(lines(accepted)).toEqual(original);
  });
  it("defaults accepted-on to Colorado today, separate from the audit instant (including DST)", async () => {
    for (const [instant, day] of [["2026-10-30T01:30:00Z", "2026-10-29"], ["2026-03-08T06:30:00Z", "2026-03-07"], ["2026-11-01T06:30:00Z", "2026-11-01"]]) {
      const sent = await act(await draft(), "send", { method: "portal" });
      const accepted = await act(sent, "accept", { method: "phone" }, new Date(instant));
      expect(accepted.version.acceptedOn).toBe(day);
      expect(accepted.version.acceptedAt?.toISOString()).toBe(new Date(instant).toISOString());
    }
  });
  it("revision deep-copies every commercial field, section and line with fresh IDs and reset lifecycle", async () => {
    let d = await draft();
    d = await createSection(a, d.id, d.version.id, "Plants");
    const [plant] = await db.insert(plantCatalogItems).values({ companyId: a, productCode: randomUUID(), varietyKey: "test-variety",
      rawDescription: "Shrub", commonName: "Shrub", category: "shrub", sizeLabel: "5 gal", wholesaleCost: "12.34", salePrice: "99.00" }).returning();
    d = await createLine(a, d.id, d.version.id, { sectionId: d.version.sections[1].id, lineType: "plant", plantCatalogItemId: plant.id, quantity: "3.75" });
    d = await patchLine(a, d.id, d.version.id, lines(d)[1].id, { paletteTypeLabel: "Evergreen", includeInPalette: true, sortOrder: -3 });
    const sent = await act(d, "send", { method: "other" });
    await db.update(plantCatalogItems).set({ wholesaleCost: "99.00" }).where(eq(plantCatalogItems.id, plant.id));
    const revised = await act(sent, "revise");
    expect(revised.version).toMatchObject({ versionNumber: 2, status: "draft", createdFromVersionId: sent.version.id,
      sentAt: null, sentById: null, sentMethod: null, acceptedAt: null, acceptedOn: null, acceptedById: null, acceptanceMethod: null,
      poNumber: null, declinedAt: null, declinedById: null, declineReason: null, supersededAt: null,
      frozenSubtotalCents: null, frozenCostKnownCents: null, frozenCostUnknownLines: null });
    expect(revised.version.sections.map(s => [s.name, s.sortOrder])).toEqual(sent.version.sections.map(s => [s.name, s.sortOrder]));
    expect(lines(revised).map(snapshot)).toEqual(lines(sent).map(snapshot));
    for (const section of revised.version.sections) {
      expect(sent.version.sections.some(s => s.id === section.id)).toBe(false);
      for (const line of section.lines) {
        expect(line.versionId).toBe(revised.version.id); expect(line.sectionId).toBe(section.id);
        expect(lines(sent).some(l => l.id === line.id)).toBe(false);
      }
    }
    expect((await readEstimate(a, d.id, 1)).version).toEqual(sent.version);
    await expect(act(sent, "revise")).rejects.toMatchObject({ error: "DRAFT_EXISTS", extra: { versionId: revised.version.id } });
    expect((await invariant(d.id)).version.totals).toEqual(revised.version.totals);
  });
  it("revises declined sources without changing their historical state or reason", async () => {
    const sent = await act(await draft(), "send", { method: "email" });
    const declined = await act(sent, "decline", { reason: "  Timing  " });
    expect(declined.version).toMatchObject({ status: "declined", declinedById: actor, declineReason: "Timing" });
    expect(declined.version.declinedAt).not.toBeNull();
    const revised = await act(declined, "revise");
    const sent2 = await act(revised, "send", { method: "other" });
    expect(sent2.versions.find(v => v.id === sent.version.id)).toMatchObject({ status: "declined", declineReason: "Timing", supersededAt: null });
  });
  it("reuses an exact copy map after a racing revision reorders identical rows", async () => {
    let d = await draft();
    const sectionId = d.version.sections[0].id;
    const firstId = lines(d)[0].id;
    d = await createLine(a, d.id, d.version.id, { sectionId, lineType: "custom", name: "Snapshot",
      unit: "EA", quantity: "2.5", unitPriceCents: 33, umbrellaKey: "landscape_materials" });
    const secondId = lines(d).find(l => l.id !== firstId)!.id;
    d = await patchLine(a, d.id, d.version.id, secondId, { sortOrder: -1 });
    d = await patchVersion(a, d.id, d.version.id, { scopeOfWork: "As-sent scope" });
    const sent = await act(d, "send", { method: "email" });
    const results = await Promise.allSettled([act(sent, "revise", { firstEdit: true }), act(sent, "revise", { firstEdit: true })]);
    const revised = results.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
    expect(revised).toHaveLength(1);
    const copy = revised[0];
    const map = copy.idMap!;
    expect(lines(copy).map(l => l.id)).toEqual([map.lines[secondId], map.lines[firstId]]);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { error: "DRAFT_EXISTS", extra: { versionId: copy.version.id, idMap: map } } });
    await patchLine(a, copy.id, copy.version.id, map.lines[firstId], { sortOrder: -2 });
    await expect(act(sent, "revise", { firstEdit: true })).rejects.toMatchObject({ error: "DRAFT_EXISTS", extra: { idMap: map } });
    await patchLine(a, copy.id, copy.version.id, map.lines[secondId], { quantity: "7" });
    await patchSection(a, copy.id, copy.version.id, map.sections[sectionId], { name: "Draft section" });
    await patchVersion(a, copy.id, copy.version.id, { scopeOfWork: "Draft scope" });
    const after = await readEstimate(a, d.id);
    expect(after.version.scopeOfWork).toBe("Draft scope");
    expect(after.version.sections[0].name).toBe("Draft section");
    expect(lines(after).map(l => [l.id, l.quantity])).toEqual([[map.lines[firstId], "2.50"], [map.lines[secondId], "7.00"]]);
    expect((await readEstimate(a, d.id, 1)).version).toEqual(sent.version);
  });
  it("rejects auto-revise for accepted or no-longer-current versions without changing manual transitions", async () => {
    const sent = await act(await draft(), "send", { method: "email" });
    const declined = await act(sent, "decline", { reason: "Timing" });
    const copy = await act(declined, "revise", { firstEdit: true });
    const sentCopy = await act(copy, "send", { method: "email" });
    await expect(act(declined, "revise", { firstEdit: true })).rejects.toMatchObject({ error: "INVALID_TRANSITION" });
    const accepted = await act(sentCopy, "accept", { method: "phone" });
    await expect(act(accepted, "revise", { firstEdit: true })).rejects.toMatchObject({ error: "INVALID_TRANSITION" });
    const changeOrder = await act(accepted, "revise");
    expect(changeOrder.version.createdFromVersionId).toBe(accepted.version.id);
    await expect(act(declined, "revise", { firstEdit: true })).rejects.toMatchObject({ error: "DRAFT_EXISTS", extra: { versionId: changeOrder.version.id } });
  });
  it("normalizes a new revision's unit without changing any frozen source bytes", async () => {
    const sent = await act(await draft(), "send", { method: "email" });
    await db.update(estimateLines).set({ unit: " visit " }).where(eq(estimateLines.versionId, sent.version.id));
    const before = (await db.select().from(estimateLines).where(eq(estimateLines.versionId, sent.version.id)))[0];
    const revised = await act(sent, "revise");
    expect(lines(revised)[0]).toMatchObject({ unit: "FLAT", quantity: before.quantity, unitPriceCents: before.unitPriceCents, extendedCents: before.extendedCents });
    const after = (await db.select().from(estimateLines).where(eq(estimateLines.versionId, sent.version.id)))[0];
    expect(after).toEqual(before);
  });
  it("send supersedes sent originals; acceptance alone replaces the accepted contract, not revision/send", async () => {
    const s1 = await act(await draft(), "send", { method: "email" });
    const v2 = await act(s1, "revise");
    expect(v2.versions.find(v => v.id === s1.version.id)?.status).toBe("sent");
    const s2 = await act(v2, "send", { method: "portal" });
    expect(s2.versions.find(v => v.id === s1.version.id)).toMatchObject({ status: "superseded", sentMethod: "email" });
    const a2 = await act(s2, "accept", { method: "phone" });
    const v3 = await act(a2, "revise");
    expect(v3.versions.find(v => v.id === a2.version.id)?.status).toBe("accepted");
    const s3 = await act(v3, "send", { method: "email" });
    expect(s3.versions.find(v => v.id === a2.version.id)?.status).toBe("accepted");
    const a3 = await act(s3, "accept", { method: "email_approval" });
    expect(a3.versions.find(v => v.id === a2.version.id)).toMatchObject({ status: "superseded", acceptanceMethod: "phone" });
    expect(a3.version.status).toBe("accepted");
  });
  it("discard removes only extra drafts/children and restores the highest remaining pointer", async () => {
    const d = await draft();
    await expect(act(d, "discard")).rejects.toMatchObject({ error: "INVALID_TRANSITION", extra: { from: "draft", action: "discard" } });
    const sent = await act(d, "send", { method: "email" });
    const revised = await act(sent, "revise");
    const sectionIds = revised.version.sections.map(s => s.id), lineIds = lines(revised).map(l => l.id);
    const discarded = await act(revised, "discard");
    expect(discarded.currentVersionId).toBe(sent.version.id); expect(discarded.version.id).toBe(sent.version.id);
    expect(await db.select().from(estimateSections).where(inArray(estimateSections.id, sectionIds))).toEqual([]);
    expect(await db.select().from(estimateLines).where(inArray(estimateLines.id, lineIds))).toEqual([]);
    await expect(act(sent, "discard")).rejects.toMatchObject({ error: "INVALID_TRANSITION" });
    await invariant(d.id);
  });
  it("send supersedes every sent sibling but not declined history or the accepted contract", async () => {
    const accepted = await act(await act(await draft(), "send", { method: "email" }), "accept", { method: "phone" });
    const revised = await act(accepted, "revise");
    const extra = await db.insert(estimateVersions).values([
      { companyId: a, estimateId: accepted.id, versionNumber: -2, status: "sent" },
      { companyId: a, estimateId: accepted.id, versionNumber: -1, status: "sent" },
      { companyId: a, estimateId: accepted.id, versionNumber: 0, status: "declined", declineReason: "Historical" },
    ]).returning();
    const sent = await act(revised, "send", { method: "portal" });
    for (const v of extra.slice(0, 2)) expect(sent.versions.find(s => s.id === v.id)).toMatchObject({ status: "superseded" });
    expect(sent.versions.find(v => v.id === accepted.version.id)?.status).toBe("accepted");
    expect(sent.versions.find(v => v.id === extra[2].id)).toMatchObject({ status: "declined", supersededAt: null });
  });
  it("accept supersedes a previous accepted version and every other sent sibling together", async () => {
    const accepted = await act(await act(await draft(), "send", { method: "email" }), "accept", { method: "phone" });
    const replacement = await act(await act(accepted, "revise"), "send", { method: "portal" });
    const extras = await db.insert(estimateVersions).values([-1, 0].map(versionNumber => ({
      companyId: a, estimateId: accepted.id, versionNumber, status: "sent" as const,
    }))).returning();
    const final = await act(replacement, "accept", { method: "signed_pdf" });
    for (const v of [...extras, accepted.version]) expect(final.versions.find(s => s.id === v.id)).toMatchObject({ status: "superseded" });
    expect(final.versions.filter(v => v.status === "accepted").map(v => v.id)).toEqual([replacement.version.id]);
  });
  it("void blocks accepted versions; otherwise retires open siblings and releases the ticket without changing its workflow", async () => {
    const accepted = await act(await act(await draft(), "send", { method: "email" }), "accept", { method: "phone" });
    const change = await act(accepted, "revise");
    await expect(act(change, "void", { reason: "No" })).rejects.toMatchObject({ error: "HAS_ACCEPTED_VERSION" });
    const [type] = await db.insert(ticketTypes).values({ companyId: a, name: "Estimate", typeKey: "estimate_request" }).returning();
    const [status] = await db.insert(ticketTypeStatuses).values({ ticketTypeId: type.id, name: "Open", displayOrder: 0 }).returning();
    const [ticket] = await db.insert(tickets).values({ companyId: a, customerId: customer, ticketTypeId: type.id,
      currentStatusId: status.id, title: "Lifecycle ticket", createdById: actor }).returning();
    const d = await createEstimate(a, actor, { customerId: customer, title: "Linked", ticketId: ticket.id });
    const before = (await db.select().from(tickets).where(eq(tickets.id, ticket.id)))[0];
    // A direct seeded sent sibling tests retiring every open version in one transaction.
    await db.insert(estimateVersions).values({ companyId: a, estimateId: d.id, versionNumber: 0, status: "sent" });
    const voided = await act(d, "void", { reason: "  Cancelled  " });
    expect(voided.voidReason).toBe("Cancelled"); expect(voided.versions.every(v => v.status === "void")).toBe(true);
    expect((await db.select().from(tickets).where(eq(tickets.id, ticket.id)))[0]).toEqual(before);
    const replacement = await createEstimate(a, actor, { customerId: customer, title: "Replacement", ticketId: ticket.id });
    expect(replacement.id).not.toBe(d.id);
    for (const action of ["send", "accept", "decline", "revise", "discard", "void"] as const) {
      const body = action === "send" ? { method: "email" } : action === "accept" ? { method: "phone" } : action === "void" || action === "decline" ? { reason: "X" } : {};
      await expect(act(voided, action, body)).rejects.toMatchObject({ error: "INVALID_TRANSITION", extra: { from: "void", action } });
    }
    await expect(retitleEstimate(a, d.id, "No")).rejects.toMatchObject({ error: "ESTIMATE_VOIDED" });
    await expect(createSection(a, d.id, d.version.id, "No")).rejects.toMatchObject({ error: "ESTIMATE_VOIDED" });
  });
  it("every frozen version content route rejects mutation", async () => {
    const d = await act(await draft(), "send", { method: "email" });
    const section = d.version.sections[0], line = section.lines[0];
    for (const work of [
      () => createSection(a, d.id, d.version.id, "No"),
      () => patchSection(a, d.id, d.version.id, section.id, { name: "No" }), () => deleteSection(a, d.id, d.version.id, section.id),
      () => patchLine(a, d.id, d.version.id, line.id, { unitPriceCents: 999 }), () => deleteLine(a, d.id, d.version.id, line.id),
      () => createLine(a, d.id, d.version.id, { lineType: "custom", sectionId: section.id, name: "No", quantity: "1", unit: "EA", unitPriceCents: 1, umbrellaKey: "plants" }),
    ]) await expect(work()).rejects.toMatchObject({ error: "VERSION_LOCKED" });
    expect((await readEstimate(a, d.id)).version).toEqual(d.version);
  });
  it("list filters intersect current-state, search, customer, ticket and Show void predictably with batched lifecycle history", async () => {
    const d = await draft(), sent = await act(await draft(), "send", { method: "email" });
    const accepted = await act(await act(await draft(), "send", { method: "email" }), "accept", { method: "phone", poNumber: "List PO" });
    const declined = await act(await act(await draft(), "send", { method: "email" }), "decline", { reason: "Price" });
    const voided = await act(await draft(), "void", { reason: "List void" });
    for (const [status, included, excluded] of [
      ["open", [d.id, sent.id], [accepted.id, declined.id, voided.id]], ["sent", [sent.id], [d.id, voided.id]],
      ["accepted", [accepted.id], [sent.id, declined.id]], ["declined", [declined.id], [accepted.id, voided.id]], ["void", [voided.id], [accepted.id, d.id]],
    ] as const) {
      for (const includeVoid of ["true", "false"] as const) {
        const rows = await listEstimates(a, { status, includeVoid, customerId: customer });
        for (const id of included) expect(rows.some(r => r.id === id)).toBe(true);
        for (const id of excluded) expect(rows.some(r => r.id === id)).toBe(false);
      }
    }
    expect((await listEstimates(a, { search: accepted.estimateNumber, status: "accepted" }))[0].versions[0]).toMatchObject({ poNumber: "List PO", acceptanceMethod: "phone" });
    expect(await listEstimates(a, { customerId: foreignCustomer })).toEqual([]);
    const change = await act(accepted, "revise");
    expect((await listEstimates(a, { status: "open", search: change.estimateNumber }))[0].versions.some(v => v.status === "accepted")).toBe(true);
    expect(await listEstimates(a, { status: "accepted", search: change.estimateNumber })).toEqual([]);
  });
});

describe("real PostgreSQL serialization and tenant isolation", () => {
  it("scopes both parent and version IDs for every lifecycle action", async () => {
    const d = await draft(), other = await createEstimate(b, actor, { customerId: foreignCustomer, title: "Foreign" });
    for (const action of ["send", "accept", "decline", "revise", "discard", "void"] as const) {
      const body = action === "send" ? { method: "email" } : action === "accept" ? { method: "phone" } : action === "void" || action === "decline" ? { reason: "X" } : {};
      await expect(transitionEstimate(b, actor, d.id, d.version.id, action, body)).rejects.toMatchObject({ status: 404 });
      if (action !== "void") {
        await expect(transitionEstimate(a, actor, d.id, other.version.id, action, body)).rejects.toMatchObject({ status: 404 });
        await expect(transitionEstimate(a, actor, d.id, randomUUID(), action, body)).rejects.toMatchObject({ status: 404 });
      }
    }
  });
  it("concurrent sibling accepts have exactly one winner and supersede the loser under the parent lock", async () => {
    const first = await act(await draft(), "send", { method: "email" });
    const [sibling] = await db.insert(estimateVersions).values({ companyId: a, estimateId: first.id, versionNumber: 2,
      status: "sent", sentAt: new Date(), sentMethod: "portal", frozenSubtotalCents: 0, frozenCostKnownCents: 0, frozenCostUnknownLines: 0 }).returning();
    await db.update(estimates).set({ currentVersionId: sibling.id }).where(eq(estimates.id, first.id));
    const result = await Promise.allSettled([act(first, "accept", { method: "phone" }),
      transitionEstimate(a, actor, first.id, sibling.id, "accept", { method: "signed_pdf" })]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = result.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ error: "INVALID_TRANSITION", extra: { from: "superseded", action: "accept" } });
    const final = await invariant(first.id);
    expect(final.currentVersionId).toBe(sibling.id);
    expect(final.versions.map(v => v.status).sort()).toEqual(["accepted", "superseded"]);
  });
  it("concurrent revisions allocate one complete draft and return DRAFT_EXISTS for the other", async () => {
    const sent = await act(await draft(), "send", { method: "email" });
    const results = await Promise.allSettled([act(sent, "revise"), act(sent, "revise")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ error: "DRAFT_EXISTS" });
    const final = await invariant(sent.id);
    expect(lines(final).map(snapshot)).toEqual(lines(sent).map(snapshot));
  });
  it("send, revise, discard, void and accept races preserve pointers and legal state", async () => {
    for (const race of ["send-discard", "revise-send", "revise-void", "accept-void", "discard-void", "send-void", "revise-discard"] as const) {
      const sent = await act(await draft(), "send", { method: "email" });
      const current = ["send-discard", "revise-send", "discard-void", "send-void", "revise-discard"].includes(race) ? await act(sent, "revise") : sent;
      const jobs = race === "send-discard" ? [act(current, "send", { method: "email" }), act(current, "discard")]
        : race === "revise-send" ? [act(sent, "revise"), act(current, "send", { method: "portal" })]
        : race === "revise-void" ? [act(sent, "revise"), act(sent, "void", { reason: "Race void" })]
        : race === "discard-void" ? [act(current, "discard"), act(current, "void", { reason: "Race void" })]
        : race === "send-void" ? [act(current, "send", { method: "email" }), act(current, "void", { reason: "Race void" })]
        : race === "revise-discard" ? [act(sent, "revise"), act(current, "discard")]
        : [act(sent, "accept", { method: "phone" }), act(sent, "void", { reason: "Race void" })];
      const results = await Promise.allSettled(jobs);
      expect(results.some(r => r.status === "fulfilled")).toBe(true);
      const final = await invariant(sent.id);
      if (final.voidedAt) expect(final.versions.every(v => !["draft", "sent", "accepted"].includes(v.status))).toBe(true);
      if (race === "accept-void") expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      if (race === "send-discard") expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      for (const v of final.versions) expect(ESTIMATE_STATUSES).toContain(v.status);
    }
  });
  it("a concurrent content edit either precedes the freeze or is rejected as locked", async () => {
    const d = await draft(), line = lines(d)[0];
    const results = await Promise.allSettled([
      act(d, "send", { method: "email" }),
      patchLine(a, d.id, d.version.id, line.id, { quantity: "3.25", unitPriceCents: 150 }),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const frozen = await readEstimate(a, d.id);
    expect(frozen.version.status).toBe("sent");
    expect(frozen.version.frozenSubtotalCents).toBe(lines(frozen).reduce((sum, l) => sum + l.extendedCents, 0));
    const edit = results[1];
    if (edit.status === "rejected") expect(edit.reason).toMatchObject({ error: "VERSION_LOCKED" });
    else expect(lines(frozen)[0]).toMatchObject({ quantity: "3.25", unitPriceCents: 150 });
  });
  it("every illegal state/action pair is rejected without writing", async () => {
    const valid: Record<string, string[]> = { send: ["draft"], accept: ["sent"], decline: ["sent"], revise: ["sent", "accepted", "declined"], discard: ["draft"] };
    const d = await draft();
    for (const status of ESTIMATE_STATUSES) {
      await db.update(estimateVersions).set({ status }).where(and(eq(estimateVersions.companyId, a), eq(estimateVersions.id, d.version.id)));
      for (const action of Object.keys(valid) as EstimateAction[]) {
        if (valid[action].includes(status)) continue;
        const body = action === "send" ? { method: "email" } : action === "accept" ? { method: "phone" } : action === "decline" ? { reason: "No" } : {};
        await expect(act(d, action, body)).rejects.toMatchObject({ error: "INVALID_TRANSITION", extra: { from: status, action } });
        expect((await readEstimate(a, d.id)).version.status).toBe(status);
      }
    }
  });
});

describe("real PostgreSQL estimate discounts", () => {
  async function discounted() {
    let d = await createEstimate(a, actor, { customerId: customer, title: "Discount test" });
    const section = d.version.sections[0].id;
    // Labor lines normally snapshot a rate; store a priced custom line, then mark it labor directly.
    d = await createLine(a, d.id, d.version.id, { sectionId: section, lineType: "custom", name: "Crew", unit: "HR", quantity: "10", unitPriceCents: 10000, umbrellaKey: "landscape_labor" });
    await db.update(estimateLines).set({ lineType: "labor" }).where(eq(estimateLines.id, lines(d)[0].id));
    d = await createLine(a, d.id, d.version.id, { sectionId: section, lineType: "custom", name: "Boulders", unit: "EA", quantity: "1", unitPriceCents: 200000, umbrellaKey: "landscape_materials" });
    return d;
  }
  const row = async (versionId: string) => (await db.select().from(estimateVersions).where(eq(estimateVersions.id, versionId)))[0];

  it("migration is guarded and rerunnable, and the database rejects malformed settings", async () => {
    const migration = await readFile(new URL("../../../../.migration-backup/migrations/0096_estimate_version_discounts.sql", import.meta.url), "utf8");
    await db.execute(sql.raw(migration)); await db.execute(sql.raw(migration));
    const d = await discounted();
    for (const bad of [
      { laborDiscountKind: "percent", laborDiscountValue: 10001 }, { laborDiscountKind: "amount", laborDiscountValue: 0 },
      { totalDiscountKind: "bogus", totalDiscountValue: 5 }, { totalDiscountKind: null, totalDiscountValue: null, totalDiscountLabel: "Orphan" }, { totalDiscountKind: null, totalDiscountValue: 5 },
      { laborDiscountKind: "percent", laborDiscountValue: null }, { frozenLaborDiscountCents: -1 },
      { frozenTotalCents: -1 },
    ]) await expect(db.update(estimateVersions).set(bad as never).where(eq(estimateVersions.id, d.version.id))).rejects.toThrow();
  });

  it("PATCH stores exact values, computes live totals, omitted keys leave the other discount alone, null clears", async () => {
    let d = await discounted();
    d = await patchVersion(a, d.id, d.version.id, { laborDiscount: { kind: "percent", value: "15", label: "  Winter labor discount " } });
    expect(await row(d.version.id)).toMatchObject({ laborDiscountKind: "percent", laborDiscountValue: 1500, laborDiscountLabel: "Winter labor discount" });
    d = await patchVersion(a, d.id, d.version.id, { totalDiscount: { kind: "amount", value: "500.00", label: " " } });
    expect(await row(d.version.id)).toMatchObject({ laborDiscountValue: 1500, totalDiscountKind: "amount", totalDiscountValue: 50000, totalDiscountLabel: null });
    expect(d.version.totals).toMatchObject({ subtotalCents: 300000, laborDiscountCents: 15000, totalDiscountCents: 50000, totalCents: 235000 });
    expect(d.version.totals.byUmbrellaNet.landscape_labor + d.version.totals.byUmbrellaNet.landscape_materials).toBe(235000);
    d = await patchVersion(a, d.id, d.version.id, { scopeOfWork: "Unrelated edit" });
    expect(d.version.totals.totalCents).toBe(235000);
    d = await patchVersion(a, d.id, d.version.id, { laborDiscount: null });
    expect(await row(d.version.id)).toMatchObject({ laborDiscountKind: null, laborDiscountValue: null, laborDiscountLabel: null, totalDiscountValue: 50000 });
    expect(d.version.totals.totalCents).toBe(250000);
    // Lists show the discounted current total while subtotal stays gross.
    const listed = (await listEstimates(a, { search: d.estimateNumber })).find(e => e.id === d.id)!;
    expect(listed).toMatchObject({ subtotalCents: 300000, totalCents: 250000 });
  });

  it("send freezes all three amounts; later line edits are impossible and the frozen total survives; revise copies settings", async () => {
    let d = await discounted();
    d = await patchVersion(a, d.id, d.version.id, { laborDiscount: { kind: "percent", value: "15" }, totalDiscount: { kind: "percent", value: "10", label: "Loyalty" } });
    const sent = await act(d, "send", { method: "other" });
    expect(await row(sent.version.id)).toMatchObject({ frozenSubtotalCents: 300000, frozenLaborDiscountCents: 15000, frozenTotalDiscountCents: 28500, frozenTotalCents: 256500 });
    expect(sent.version.totals).toMatchObject({ subtotalCents: 300000, totalCents: 256500 });
    await expect(patchVersion(a, sent.id, sent.version.id, { laborDiscount: null })).rejects.toBeTruthy();
    const revised = await act(sent, "revise");
    expect(revised.version.id).not.toBe(sent.version.id);
    expect(await row(revised.version.id)).toMatchObject({ laborDiscountKind: "percent", laborDiscountValue: 1500, laborDiscountLabel: null,
      totalDiscountKind: "percent", totalDiscountValue: 1000, totalDiscountLabel: "Loyalty", frozenTotalCents: null, frozenLaborDiscountCents: null });
    expect(revised.version.totals.totalCents).toBe(256500);
    const old = await readEstimate(a, sent.id, sent.version.versionNumber);
    expect(old.version.totals.totalCents).toBe(256500);
  });

  it("legacy frozen versions without frozen discount columns read their frozen subtotal as the total", async () => {
    const d = await discounted();
    const sent = await act(d, "send", { method: "other" });
    await db.update(estimateVersions).set({ frozenTotalCents: null, frozenLaborDiscountCents: null, frozenTotalDiscountCents: null })
      .where(eq(estimateVersions.id, sent.version.id));
    const read = await readEstimate(a, sent.id, sent.version.versionNumber);
    expect(read.version.totals).toMatchObject({ subtotalCents: 300000, totalCents: 300000, laborDiscountCents: 0, totalDiscountCents: 0 });
    const listed = (await listEstimates(a, { search: d.estimateNumber })).find(e => e.id === d.id)!;
    expect(listed.totalCents).toBe(300000);
  });
});
