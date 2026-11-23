import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { companies, tickets, ticketFieldValues, ticketStatusHistory, ticketTypeFields,
  ticketTypeStatuses, ticketTypes, users } from "@workspace/db";
import { db, pool } from "../db";
import { migrateRfpWorkflow } from "./rfpWorkflowMigration";
import { ensureRFPRequestTicketType } from "./rfpWorkflowSeeder";

const enabled = process.env.RFP_WORKFLOW_DB_TEST === "1";
const expectedLadder = [
  ["new", "Received"], ["reviewing", "Reviewing"], ["waiting_info", "Waiting on info"], ["site_visit", "Site walk"],
  ["proposal_draft", "Drafting proposal"], ["proposal_sent", "Submitted"], ["awarded", "Awarded"],
  ["onboarding", "Onboarding"], ["closed_won", "Won"], ["closed_lost", "Lost"],
];
const movedKeys = [
  ["awaiting_response", "proposal_sent"], ["decision_received", "proposal_sent"], ["contract_executed", "onboarding"],
  ["crm_setup", "onboarding"], ["maps_requested", "onboarding"], ["maps_uploaded", "onboarding"],
  ["contacts_collected", "onboarding"], ["kickoff", "onboarding"], ["handoff_ops", "onboarding"],
];
const checklist = [
  ["customer_setup", "Customer set up in CRM", "select", "true", ["Yes", "No"]],
  ["maps_created", "Maps in", "select", "true", ["Yes", "No"]],
  ["board_contacts_collected", "Contacts collected", "select", "true", ["Yes", "No", "Partial"]],
  ["kickoff_date", "Kickoff date", "date", "true", []],
  ["kickoff_notes", "Kickoff notes", "textarea", "false", []],
  ["handoff_notes", "Handoff notes", "textarea", "false", []],
];

describe.skipIf(!enabled)("RFP workflow conversion on a disposable PostgreSQL database", () => {
  afterAll(() => pool.end());

  it("rolls back unexpected references, preserves identities, migrates all keyed types, and reruns without writes", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/rfp_r1_test") {
      throw new Error("The RFP workflow suite requires a local disposable rfp_r1_test database");
    }
    const identity = await db.execute(sql`SELECT current_database() AS db,
      current_setting('neon.endpoint_id', true) AS managed, inet_server_addr()::text AS address`);
    expect(identity.rows).toEqual([{ db: "rfp_r1_test", managed: null, address: "127.0.0.1/32" }]);
    const [a, b, fresh] = await db.insert(companies).values(["a", "b", "fresh"].map(key => ({
      name: `RFP conversion ${key}`, slug: `rfp-conversion-${key}`,
    }))).returning();
    const [actor, serviceActor] = await db.insert(users).values([
      { name: "Original actor", email: "original@example.invalid", passwordHash: "not-a-login" },
      { name: "Services actor", email: "services@example.invalid", passwordHash: "not-a-login" },
    ]).returning();
    const [first, second, other, estimate, unkeyed] = await db.insert(ticketTypes).values([
      { companyId: a.id, name: "Renamed RFP Request", typeKey: "rfp_request" },
      { companyId: a.id, name: "Second RFP workflow", typeKey: "rfp_request" },
      { companyId: b.id, name: "RFP Request", typeKey: "rfp_request" },
      { companyId: a.id, name: "Estimate Request", typeKey: "estimate_request" },
      { companyId: b.id, name: "RFP Request", typeKey: null },
    ]).returning();
    const createTicket = async (type: typeof first, statusId: string, title: string) => (await db.insert(tickets).values({
      companyId: type.companyId, ticketTypeId: type.id, currentStatusId: statusId, createdById: actor.id, title,
    }).returning())[0];
    const legacy = async (type: typeof first, alreadyOnboarding = false) => {
      const keys = [...expectedLadder.map(([key]) => key).filter(key => key !== "onboarding" || alreadyOnboarding),
        ...movedKeys.map(([key]) => key)];
      const statuses = await db.insert(ticketTypeStatuses).values(keys.map((statusKey, index) => ({
        ticketTypeId: type.id, statusKey, name: `Legacy ${statusKey}`, color: "#010203", displayOrder: 90 + index,
      }))).returning();
      const status = (key: string) => statuses.find(row => row.statusKey === key)!;
      const [custom] = await db.insert(ticketTypeStatuses).values({
        ticketTypeId: type.id, name: "Submitted", displayOrder: 91, color: "#090807",
      }).returning();
      const current = await Promise.all(movedKeys.map(([key]) => createTicket(type, status(key).id, key)));
      const customTicket = await createTicket(type, custom.id, "Custom step ticket");
      return { type, statuses, status, custom, customTicket, current };
    };
    const source = await legacy(first);
    const extra = await legacy(second, true);
    const foreign = await legacy(other);
    const get = (rows: typeof source.statuses, key: string) => rows.find(row => row.statusKey === key)!;
    const [estimateDecision, otherDecision] = await db.insert(ticketTypeStatuses).values([estimate, unkeyed].map(type => ({
      ticketTypeId: type.id, statusKey: "decision_received", name: "Decision Received", displayOrder: 4,
    }))).returning();
    const est = await createTicket(estimate, estimateDecision.id, "Estimate");
    const nonSystem = await createTicket(unkeyed, otherDecision.id, "Unkeyed RFP type");
    const fieldSpecs = [
      ["maps_uploaded", "maps_created"], ["contacts_collected", "board_contacts_collected"], ["kickoff", "kickoff_date"],
      ["kickoff", "kickoff_notes"], ["handoff_ops", "handoff_notes"],
      ["decision_received", "decision_outcome"], ["contract_executed", "contract_signed_date"], ["kickoff", "local_custom"],
      ["crm_setup", "contract_dates_entered"], ["crm_setup", "monthly_amounts_entered"], ["crm_setup", "services_configured"],
      ["onboarding", "customer_setup"],
    ];
    const legacyFields = await db.insert(ticketTypeFields).values(fieldSpecs.map(([key, fieldKey]) => ({
      ticketTypeId: first.id, statusId: key === "onboarding" ? null : source.status(key).id,
      fieldKey, fieldLabel: `Legacy ${fieldKey}`, fieldType: "text" as const, displayOrder: 91,
    }))).returning();
    const [estimateField] = await db.insert(ticketTypeFields).values({
      ticketTypeId: estimate.id, statusId: estimateDecision.id, fieldKey: "decision_outcome",
      fieldLabel: "Estimate decision", fieldType: "select", options: ["Approved", "Denied"], displayOrder: 0,
    }).returning();
    const [qualified, overridden, negative, missing] = source.current;
    const field = (key: string) => legacyFields.find(f => f.fieldKey === key)!;
    const checkKeys = ["contract_dates_entered", "monthly_amounts_entered", "services_configured"];
    const valuesBefore = await db.insert(ticketFieldValues).values([
      ...[qualified, overridden, negative, missing].flatMap(t => checkKeys
        .filter(key => t !== missing || key !== "services_configured").map(key => ({
          ticketId: t.id, fieldId: field(key).id, value: t === negative && key === "monthly_amounts_entered" ? "No" : "Yes",
          capturedById: key === "services_configured" ? serviceActor.id : actor.id,
        }))),
      ...legacyFields.slice(0, 8).map(f => ({ ticketId: qualified.id, fieldId: f.id, value: `kept ${f.fieldKey}`, capturedById: actor.id })),
      { ticketId: overridden.id, fieldId: field("customer_setup").id, value: "No", capturedById: actor.id },
      { ticketId: est.id, fieldId: estimateField.id, value: "Approved", capturedById: actor.id },
    ]).returning();
    const originalNotes = "Original note\non a second line";
    const history = (ticketId: string, fromStatusId: string | null, toStatusId: string, notes: string | null) =>
      ({ ticketId, fromStatusId, toStatusId, changedById: actor.id, notes });
    const [both, fromOnly, toOnly, unaffected, unrelated, unsafe] = await db.insert(ticketStatusHistory).values([
      history(qualified.id, source.status("awaiting_response").id, source.status("contract_executed").id, originalNotes),
      history(qualified.id, source.status("decision_received").id, source.status("awarded").id, null),
      history(qualified.id, null, source.status("crm_setup").id, ""),
      history(source.customTicket.id, source.status("reviewing").id, source.custom.id, "Untouched"),
      history(est.id, null, estimateDecision.id, "Estimate decision"),
      // A historical cross-type edge cannot be rewritten inside the RFP
      // scope. Its SET NULL FK must cause a rollback rather than lose the edge.
      history(est.id, foreign.status("decision_received").id, estimateDecision.id, "Out of scope"),
    ]).returning();
    const snapshot = async () => Promise.all([
      db.select().from(ticketTypeStatuses).orderBy(ticketTypeStatuses.id),
      db.select().from(ticketTypeFields).orderBy(ticketTypeFields.id),
      db.select().from(ticketStatusHistory).orderBy(ticketStatusHistory.id),
      db.select().from(tickets).orderBy(tickets.id),
      db.select().from(ticketFieldValues).orderBy(ticketFieldValues.id),
    ] as const);
    const beforeFailedConversion = await snapshot();
    await expect(migrateRfpWorkflow()).rejects.toThrow(/reference remains in public\.ticket_status_history/);
    expect(await snapshot()).toEqual(beforeFailedConversion);
    await db.delete(ticketStatusHistory).where(eq(ticketStatusHistory.id, unsafe.id));

    const reports = await Promise.all([migrateRfpWorkflow(), migrateRfpWorkflow()]);
    const report = reports.find(result => result?.statusesRetired);
    const rerun = reports.find(result => result?.statusesRetired === 0);
    expect(report).toMatchObject({
      ticketsMoved: Object.fromEntries(movedKeys.map(([key]) => [key, 3])),
      historyRowsMoved: 3, fieldsArchived: 6, valuesBackfilled: 1, statusesCreated: 2, statusesRetired: 27,
    });
    expect(report?.customStatuses).toEqual(expect.arrayContaining([source, extra, foreign].map(({ type, custom }) => ({
      companyId: type.companyId, typeId: type.id, id: custom.id, name: "Submitted",
    }))));
    expect(rerun).toMatchObject({
      ticketsMoved: Object.fromEntries(movedKeys.map(([key]) => [key, 0])),
      historyRowsMoved: 0, fieldsArchived: 0, valuesBackfilled: 0,
      statusesCreated: 0, statusesRetired: 0, statusesUpdated: 0, checklistFieldsWritten: 0,
    });
    const [allStatuses, allFields, allHistory, allTickets, allValues] = await snapshot();
    for (const fixture of [source, extra, foreign]) {
      const group = allStatuses.filter(row => row.ticketTypeId === fixture.type.id && row.statusKey !== null)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      expect(group.map(row => [row.statusKey, row.name])).toEqual(expectedLadder);
      for (const [index, row] of group.entries()) {
        const old = fixture.status(row.statusKey!);
        if (old) expect(row).toMatchObject({ id: old.id, color: old.color });
        else expect(row).toMatchObject({ color: "#14b8a6", description: "Contract signed — setting up the new customer" });
        const waiting = [2, 5, 6].includes(index);
        expect(row).toMatchObject({ displayOrder: index, isFinal: index >= 8 ? "true" : "false",
          actionType: waiting ? "waiting" : "needs_action", waitingCategory: waiting ? "customer" : null });
      }
      expect(allStatuses.find(row => row.id === fixture.custom.id)).toEqual(fixture.custom);
      expect(allTickets.find(row => row.id === fixture.customTicket.id)).toEqual(fixture.customTicket);
      for (const [index, [, destination]] of movedKeys.entries()) {
        expect(allTickets.find(row => row.id === fixture.current[index].id))
          .toEqual({ ...fixture.current[index], currentStatusId: get(group, destination).id });
      }
      const onboarding = get(group, "onboarding");
      const fields = allFields.filter(row => row.statusId === onboarding.id).sort((a, b) => a.displayOrder - b.displayOrder);
      expect(fields.map(f => [f.fieldKey, f.fieldLabel, f.fieldType, f.isRequired, f.options])).toEqual(checklist);
      if (fixture === source) for (const f of fields) expect(f.id).toBe(field(f.fieldKey).id);
    }
    const setup = allFields.find(f => f.id === field("customer_setup").id)!;
    const onboarding = allStatuses.find(s => s.ticketTypeId === first.id && s.statusKey === "onboarding")!;
    const submitted = source.status("proposal_sent").id;
    expect(allHistory).toHaveLength(5);
    expect(allHistory).toEqual(expect.arrayContaining([
      { ...both, fromStatusId: submitted, toStatusId: onboarding.id, notes: `[was Legacy awaiting_response] [was Legacy contract_executed] ${originalNotes}` },
      { ...fromOnly, fromStatusId: submitted, notes: "[was Legacy decision_received] " },
      { ...toOnly, toStatusId: onboarding.id, notes: "[was Legacy crm_setup] " },
      unaffected, unrelated,
    ]));
    expect(allValues).toHaveLength(valuesBefore.length + 1);
    expect(allValues).toEqual(expect.arrayContaining(valuesBefore));
    expect(allValues.filter(v => v.fieldId === setup.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: qualified.id, value: "Yes", capturedById: serviceActor.id }),
      expect.objectContaining({ ticketId: overridden.id, value: "No", capturedById: actor.id }),
    ]));
    expect(allValues.some(v => v.fieldId === setup.id && [negative.id, missing.id].includes(v.ticketId))).toBe(false);
    for (const f of legacyFields.slice(5, 11)) expect(allFields.find(row => row.id === f.id)).toEqual({ ...f, statusId: null });
    expect(allFields.find(row => row.id === estimateField.id)).toEqual(estimateField);
    expect(allTickets).toEqual(expect.arrayContaining([est, nonSystem]));
    expect(allStatuses).toEqual(expect.arrayContaining([estimateDecision, otherDecision]));

    const { typeId } = await ensureRFPRequestTicketType(fresh.id);
    expect(await ensureRFPRequestTicketType(fresh.id)).toEqual({ typeId });
    const seeded = await db.select().from(ticketTypeStatuses).where(eq(ticketTypeStatuses.ticketTypeId, typeId))
      .orderBy(ticketTypeStatuses.displayOrder);
    expect(seeded.map(row => [row.statusKey, row.name])).toEqual(expectedLadder);
    const seededFields = await db.select().from(ticketTypeFields).where(eq(ticketTypeFields.ticketTypeId, typeId));
    expect(seeded.map(s => seededFields.filter(f => f.statusId === s.id).length)).toEqual([5, 2, 2, 2, 2, 2, 0, 6, 0, 2]);
    const seededOnboarding = seededFields.filter(f => f.statusId === get(seeded, "onboarding").id).sort((a, b) => a.displayOrder - b.displayOrder);
    expect(seededOnboarding.map(f => [f.fieldKey, f.fieldLabel, f.fieldType, f.isRequired, f.options])).toEqual(checklist);
    const migratedSnapshot = await snapshot();
    await migrateRfpWorkflow();
    expect(await snapshot()).toEqual(migratedSnapshot);
  }, 30_000);
});
