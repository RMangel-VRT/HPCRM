import { expect, it } from "vitest";
import { communicationAutomationRules, communicationTemplates } from "@workspace/db";
import { db, inTransaction } from "../db";
import { normalizeStoredCommunicationTemplates } from "./communicationTemplateCleanup";

it("converts known tokens and archives only retired options, without writing again on replay", async () => {
  await db.transaction(async tx => {
    for (const table of ["communication_templates", "communication_automation_rules"]) {
      await tx.execute(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    const seed = { companyId: "fixture-one", name: "Custom email", body: "Custom body", type: "email" as const };
    await tx.insert(communicationTemplates).values([
      { ...seed, id: "known", subject: "{{customer_name}} · {{ property_name }}", body: "{{contact_name}} {{service_date}}\n{{pm_name}}\n{{company_name}}" },
      { ...seed, id: "proposal", body: "Total: {{proposal_total}}" },
      { ...seed, id: "sms1", type: "sms", name: "Snow Event Service Notice" },
      { ...seed, id: "sms2", type: "sms", name: "Service Update — Delay Notice" },
      { ...seed, id: "unrelated", companyId: "fixture-two", body: "Keep {{unrelated}} and existing {companyName}.", type: "sms" },
    ]);
    await tx.insert(communicationAutomationRules).values([
      { companyId: "fixture-one", id: "retired", name: "Proposal Follow-Up", triggerType: "time_after_event", eventKey: "proposal_created", isEnabled: true, autoSend: true },
      { companyId: "fixture-one", id: "other", name: "Custom Rule", triggerType: "time_after_event", eventKey: "proposal_created", isEnabled: false, autoSend: false },
    ]);
    const run = () => inTransaction(tx, normalizeStoredCommunicationTemplates);
    expect(await run()).toEqual({ converted: 4, retiredRules: 1 });
    const rows = () => tx.select().from(communicationTemplates).orderBy(communicationTemplates.id);
    const first = await rows();
    expect(first.find(r => r.id === "known")).toMatchObject({
      subject: "{customerName} · {propertyName}", body: "{contactName} {serviceDate}\n{companyName}", isArchived: false,
    });
    expect(first.filter(r => r.isArchived).map(r => r.id)).toEqual(["proposal", "sms1", "sms2"]);
    expect(first.find(r => r.id === "unrelated")).toMatchObject({ body: "Keep {{unrelated}} and existing {companyName}.", isArchived: false });
    const rules = await tx.select().from(communicationAutomationRules);
    expect(rules.find(r => r.id === "retired")).toMatchObject({ isEnabled: false, autoSend: false });
    expect(rules.find(r => r.id === "other")).toMatchObject({ isEnabled: false, autoSend: false });
    expect(await run()).toEqual({ converted: 0, retiredRules: 0 });
    expect(await rows()).toEqual(first);
  });
});
