import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { companies, customers, agreements, agreementTerms, termScopeLines, serviceCalendar, campaigns, campaignItems,
  campaignGenerationYears, users, pool as schemaPool } from "@workspace/db";
import { db, pool, inTransaction } from "../db";
import { runCampaignGeneration } from "../lib/campaignReconcile";
import { withCampaignContractStates } from "../lib/campaignContractState";
import { loadServiceFulfillmentInputs } from "../lib/customerServiceFulfillmentLoader";
import { customerServiceFulfillment } from "../lib/customerServiceFulfillment";
import { registerCampaignRoundLists } from "./campaignRoundLists";
import { registerContractCenterRoutes } from "./contractCenter";
import { STARTING_SERVICE_CALENDAR } from "../../../../lib/db/src/serviceCalendarContracts";
import { GenerateContractCampaignsResponse, GetCampaignRoundListsResponse, GetCustomerServicesResponse } from "@workspace/api-zod";
import * as demandModule from "../lib/campaignDemand";

afterAll(async () => { await Promise.all([pool.end(), schemaPool.end()]); });
describe("SC2.2 real server contracts and reconciliation (rollback-only development fixtures)", () => {
  it("projects every round, omissions and Services, preserves campaign items on renewal and round-trips billing", async () => {
    if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") throw new Error("Development only");
    const rollback = {};
    try {
      await db.transaction(async tx => inTransaction(tx, async () => {
        const companyId = randomUUID(), userId = randomUUID();
        await tx.insert(users).values({id: userId, name: "SC2.2 rollback actor", passwordHash: "unused-fixture"});
        await tx.insert(companies).values({id: companyId, slug: companyId, name: "SC2.2 rollback fixture"});
        await tx.insert(serviceCalendar).values(STARTING_SERVICE_CALENDAR.map(e => ({...e, companyId})));
        const properties: Record<string, {id: string; agreementId: string; termId: string}> = {};
        for (const name of ["Silent", "Excluded", "Two cleanups", "Not renewing", "Too old", "Native one", "Chemical only", "Invalid count"]) {
          const id = randomUUID(), agreementId = randomUUID(), termId = randomUUID();
          properties[name] = {id, agreementId, termId};
          await tx.insert(customers).values({id, companyId, name, street: "Test", city: "Test", state: "CO", zip: "00000"});
          await tx.insert(agreements).values({id: agreementId, companyId, customerId: id});
          await tx.insert(agreementTerms).values({id: termId, companyId, agreementId, line: "landscape", form: "ours",
            status: "sent", billingType: "seasonal", seasonLabel: name === "Too old" ? "2025–26" : "2026–27",
            startDate: name === "Too old" ? "2025-10-01" : "2026-10-01", endDate: name === "Too old" ? "2026-09-30" : "2027-09-30",
            nonRenewalOn: name === "Not renewing" ? "2027-08-01" : null});
          const scope = name === "Excluded" ? {serviceKey: "cleanups", included: false, quantity: null} :
            name === "Two cleanups" ? {serviceKey: "cleanups", included: true, quantity: 2} :
            name === "Native one" ? {serviceKey: "native_areas", included: true, quantity: 1} :
            name === "Chemical only" ? {serviceKey: "chemical", included: true, quantity: 3} :
            name === "Invalid count" ? {serviceKey: "cleanups", included: true, quantity: 25} : null;
          if (scope) await tx.insert(termScopeLines).values({...scope, companyId, termId, line: "landscape", monthSpread: Array(12).fill(99)});
        }
        const opts = {dryRun: true, today: "2026-11-12"};
        // Execute the integrated predecessor source against EXACTLY the same
        // transaction-local records. Only a generated evidence module is built;
        // no application files are replaced and both writer previews roll back.
        // One-time pre-merge evidence only: normal regression tests must remain
        // runnable after HEAD changes and in packaged sources without Git.
        let before: Awaited<ReturnType<typeof runCampaignGeneration>> | undefined;
        if (process.env.SC22_CAPTURE_BASELINE === "1") {
          const baselinePath = resolve("../../generated-artifacts/SC2.2-baseline-demand.mjs");
          const predecessor = execFileSync("git", ["show", "HEAD:artifacts/api-server/src/lib/campaignDemand.ts"], {encoding: "utf8"});
          if (createHash("sha256").update(predecessor).digest("hex") !== "fe58e37c590791022743d65a2b35b222fbe1cda31e72b2d823df7f29d4d17777")
            throw new Error("SC2.1 baseline is no longer at HEAD; do not recapture misleading before evidence");
          await build({stdin: {contents: predecessor, resolveDir: resolve("src/lib"), loader: "ts"},
            bundle: true, platform: "node", format: "esm", outfile: baselinePath});
          const baseline = await import(pathToFileURL(baselinePath).href);
          const spy = vi.spyOn(demandModule, "campaignDemand").mockImplementation(baseline.campaignDemand);
          try { before = await runCampaignGeneration(companyId, 2027, opts); } finally { spy.mockRestore(); }
        }
        const preview = await runCampaignGeneration(companyId, 2027, opts);
        const calendar = await tx.select().from(serviceCalendar).where(eq(serviceCalendar.companyId, companyId));
        if (before) {
          const beforeRounds = before.rounds;
          writeFileSync(resolve("../../generated-artifacts/SC2.2-fixture-comparison.json"), JSON.stringify({
          before, after: preview,
          rounds: calendar.filter(e => e.kind !== "recurring").map(e => ({
            name: e.name, serviceKey: e.serviceKey, calendarEntryId: e.id, roundYear: 2027,
            before: beforeRounds.find(r => r.calendarEntryId === e.id)?.members.length ?? 0,
            after: preview.rounds.find(r => r.calendarEntryId === e.id)?.members.length ?? 0,
            nonmembers: preview.rounds.find(r => r.calendarEntryId === e.id)?.nonmembers ?? [],
          })),
        }, null, 2));
        }
        expect(GenerateContractCampaignsResponse.parse(preview)).toEqual(preview);
        const fall = preview.rounds.find(r => r.title === "2027 Fall leaf clean-up 2")!;
        expect(fall.members.find(m => m.propertyName === "Silent")).toMatchObject({count: "standard", renewalPending: true});
        expect(fall.nonmembers).toEqual(expect.arrayContaining([
          expect.objectContaining({propertyName: "Excluded", reason: "excluded_by_contract", seasonLabel: "2026–27"}),
          expect.objectContaining({propertyName: "Two cleanups", reason: "count_covers_fewer"}),
          expect.objectContaining({propertyName: "Not renewing", reason: "not_renewing", nonRenewalOn: "2027-08-01"}),
          expect.objectContaining({propertyName: "Too old", reason: "renewal_beyond_12_months"}),
        ]));
        expect(fall.nonmembers?.some(m => m.propertyName === "Invalid count")).toBe(false);
        expect(preview.gaps).toContainEqual(expect.objectContaining({propertyName: "Invalid count", kind: "invalid_count"}));
        const native = preview.rounds.filter(r => r.serviceKey === "native_areas");
        expect(native.flatMap(r => r.nonmembers ?? [])).toEqual([expect.objectContaining({propertyName: "Native one", reason: "count_covers_fewer"})]);
        expect(preview.rounds.some(r => r.serviceKey === "backflow")).toBe(false);
        expect(await tx.select().from(campaigns).where(eq(campaigns.companyId, companyId))).toEqual([]);
        expect(await tx.select().from(campaignGenerationYears).where(eq(campaignGenerationYears.companyId, companyId))).toEqual([]);

        const data = await loadServiceFulfillmentInputs(tx, companyId);
        const silent = customerServiceFulfillment(data, properties.Silent.id, undefined, "2027-10-01")!;
        expect(GetCustomerServicesResponse.parse(silent)).toEqual(silent);
        expect(silent.rows.find(r => r.serviceKey === "cleanups")?.rounds.some(r => r.renewalPending && r.windowEnd === "2027-12-31")).toBe(true);
        const historical = customerServiceFulfillment(data, properties.Silent.id, properties.Silent.termId, "2027-10-01")!;
        expect(historical.rows.flatMap(r => r.rounds).some(r => r.renewalPending)).toBe(false);

        const generated = await runCampaignGeneration(companyId, 2027, {...opts, dryRun: false});
        // Native fall has only excluded candidates, never an empty presentation campaign.
        expect(generated.created.some(r => r.calendarEntryId === native.find(r => !r.members.length)?.calendarEntryId)).toBe(false);
        const campaign = (await tx.select().from(campaigns).where(and(eq(campaigns.companyId, companyId),
          eq(campaigns.calendarEntryId, fall.calendarEntryId))))[0];
        const [item] = await tx.select().from(campaignItems).where(and(eq(campaignItems.campaignId, campaign.id), eq(campaignItems.customerId, properties.Silent.id)));
        await tx.update(campaignItems).set({notes: "Protected work", targetDate: "2027-11-20"}).where(eq(campaignItems.id, item.id));
        const [protectedItem] = await tx.select().from(campaignItems).where(eq(campaignItems.id, item.id));
        const renewalId = randomUUID();
        await tx.insert(agreementTerms).values({id: renewalId, agreementId: properties.Silent.agreementId, companyId, line: "landscape", form: "ours",
          status: "signed", seasonLabel: "2027–28", startDate: "2027-10-01", endDate: "2028-09-30", billingType: "seasonal"});
        const reconciled = await runCampaignGeneration(companyId, 2027, {...opts, dryRun: false});
        expect(reconciled.removed.some(r => r.itemId === item.id)).toBe(false);
        expect(reconciled.added.some(r => r.propertyId === properties.Silent.id && r.calendarEntryId === fall.calendarEntryId)).toBe(false);
        expect((await tx.select().from(campaignItems).where(eq(campaignItems.id, item.id)))[0]).toEqual(protectedItem);
        expect((await withCampaignContractStates(campaign, [protectedItem]))[0].contractState)
          .toMatchObject({termId: renewalId, renewalPending: false});

        const app = express(); app.use(express.json());
        app.use((req, _res, next) => {Object.assign(req, {isAuthenticated: () => true,
          user: {id: userId, activeCompanyId: companyId, activeRole: "admin", accessRole: "admin", isSuperAdminBool: false}}); next();});
        registerCampaignRoundLists(app); registerContractCenterRoutes(app);
        const actualRound = await request(app).get(`/api/campaigns/${campaign.id}/round-lists`).set("X-Company-Id", companyId);
        expect(actualRound.status).toBe(200);
        const read = GetCampaignRoundListsResponse.parse(actualRound.body);
        expect(read.nonmembers).toEqual(fall.nonmembers);
        expect(read.items.find(i => i.id === item.id)?.contractState).toMatchObject({termId: renewalId, renewalPending: false});
        const priceTerm = properties["Two cleanups"].termId;
        const body = [{serviceKey: "cleanups", included: true, quantity: null, monthSpread: Array(12).fill(99),
          details: {billing: "billed_when_done", billingPrice: "$155.25", preserve: "yes"}, priceCents: 15525, notes: "Contract exception"}];
        const save = await request(app).put(`/api/contract-center/terms/${priceTerm}/scope`).set("X-Company-Id", companyId).send(body);
        expect(save.status).toBe(200);
        let [saved] = await tx.select().from(termScopeLines).where(eq(termScopeLines.termId, priceTerm));
        expect(saved).toMatchObject(body[0]);
        const textBody = [{...body[0], details: {...body[0].details, billingPrice: "Per written quote"}, priceCents: null}];
        expect((await request(app).put(`/api/contract-center/terms/${priceTerm}/scope`).set("X-Company-Id", companyId).send(textBody)).status).toBe(200);
        [saved] = await tx.select().from(termScopeLines).where(eq(termScopeLines.termId, priceTerm));
        expect(saved).toMatchObject(textBody[0]);
        writeFileSync(resolve("../../generated-artifacts/SC2.2-fixture-preview.json"), JSON.stringify(preview, null, 2));
        throw rollback;
      }));
    } catch (err) { if (err !== rollback) throw err; }
  }, 120000);
});
