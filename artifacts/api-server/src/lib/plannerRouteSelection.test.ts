import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { planPlannerRoutes, type PlannerInputs } from "./importPlannerRoutes";
import { coverageResolver } from "./contractCoverage";
import type { AgreementTerm, TermScopeLine } from "@workspace/db";
import { planProductionRouteAudit, type ProductionRouteAuditInput } from "./routeProductionAudit";

function inputs(): PlannerInputs {
  return {
    templates: [{ id: "chosen", companyId: "company", name: "Chosen", isActive: true },
      { id: "other", companyId: "company", name: "Legacy", isActive: true }] as PlannerInputs["templates"],
    blocks: [{ id: "b1", templateId: "chosen", visitConfigId: "config", crewId: "column",
      dayOfWeek: "tuesday", sortOrder: 1, startTime: "08:00" },
    { id: "b2", templateId: "other", visitConfigId: "other-config", crewId: "other-column",
      dayOfWeek: "friday", sortOrder: 1, startTime: "10:00" }] as PlannerInputs["blocks"],
    configs: [{ id: "config", customerId: "property", estimatedDurationMinutes: 30, isActive: true, notes: "Snapshot" },
      { id: "other-config", customerId: "other-property", estimatedDurationMinutes: 60, isActive: true, notes: null }] as PlannerInputs["configs"],
    columns: [{ id: "column", crewId: "crew", name: "Column" }, { id: "other-column", crewId: "other-crew", name: "Other" }] as PlannerInputs["columns"],
    crews: [{ id: "crew", name: "Crew", isActive: true, displayOrder: 0 },
      { id: "other-crew", name: "Other", isActive: true, displayOrder: 1 }] as PlannerInputs["crews"],
    properties: [{ id: "property", name: "Property", active: "true", status: "active" },
      { id: "other-property", name: "Other", active: "true", status: "active" }],
    existing: [],
  };
}
const plan = (data = inputs(), resolve = coverageResolver({ customers: [], agreements: [], terms: [], scopes: [] }),
  today = "2026-11-03", selected: string | undefined = "chosen") =>
  planPlannerRoutes("company", data, resolve, today, selected);

describe("selected-source approval semantics", () => {
  it("selects just the named company template among multiple active templates without editing any source", () => {
    const data = inputs(), before = structuredClone(data);
    expect(plan(data)).toMatchObject({ blocked: null, activeTemplates: 2, selectedTemplateId: "chosen", decisions: [], skipped: [] });
    expect(plan(data).proposed.map(s => s.importedFromBlockId)).toEqual(["b1"]);
    expect(data).toEqual(before);
    data.templates[0].isActive = false;
    expect(plan(data).proposed).toHaveLength(1); // explicit selection, not an active-flag mutation
  });
  it.each(["", "missing", "foreign"])("fails closed on explicit ID %j rather than falling back", id => {
    const data = inputs();
    data.templates.push({ ...data.templates[0], id: "foreign", companyId: "another" });
    expect(plan(data, undefined, undefined, id)).toMatchObject({ selectedTemplateId: null, proposed: [], blocked: expect.any(String) });
  });
  it("preserves unnamed exactly-one-active selection and rejects ambiguous IDs", () => {
    const data = inputs();
    const legacy = () => planPlannerRoutes("company", data, () => null, "2026-11-03");
    expect(legacy().blocked).toContain("Exactly one");
    data.templates[1].isActive = false;
    expect(legacy()).toMatchObject({ selectedTemplateId: "chosen", blocked: null });
    data.templates[0].isActive = false;
    expect(legacy().blocked).toContain("Exactly one");
    data.templates.push({ ...data.templates[0] });
    expect(plan(data).blocked).toContain("uniquely");
  });
  it("is stable across source array order, anonymized property labels, note digests, and wall-clock/anchor dates", () => {
    const data = inputs(), original = plan(data);
    data.templates.reverse(); data.blocks.reverse(); data.configs.reverse(); data.columns.reverse(); data.crews.reverse();
    data.properties[0].name = "Anonymized";
    const config = data.configs.find(c => c.id === "config")!;
    config.notesDigest = createHash("md5").update(config.notes!).digest("hex"); config.notes = null;
    const later = plan(data, undefined, "2027-02-02");
    expect(later.proposed[0].anchorDate).not.toBe(original.proposed[0].anchorDate);
    expect(later.fingerprint).toBe(original.fingerprint);
  });
  it("ignores nonselected inventory, blocks, configs, columns, crews and properties", () => {
    const data = inputs(), fingerprint = plan(data).fingerprint;
    data.templates[1].name = "Edited legacy"; data.templates[1].isActive = false;
    data.blocks[1].dayOfWeek = "saturday"; data.configs[1].notes = "Edited";
    data.columns[1].crewId = null; data.crews[1].isActive = false; data.properties[1].active = "false";
    expect(plan(data).fingerprint).toBe(fingerprint);
    data.templates.pop(); data.blocks.pop(); data.configs.pop(); data.columns.pop(); data.crews.pop(); data.properties.pop();
    expect(plan(data).fingerprint).toBe(fingerprint);
  });
  it.each([
    ["block placement", (d: PlannerInputs) => { d.blocks[0].dayOfWeek = "monday"; }],
    ["block ordering", (d: PlannerInputs) => { d.blocks[0].sortOrder = 8; }],
    ["block time tie-break", (d: PlannerInputs) => { d.blocks[0].startTime = "09:00"; }],
    ["duration", (d: PlannerInputs) => { d.configs[0].estimatedDurationMinutes = 45; }],
    ["notes", (d: PlannerInputs) => { d.configs[0].notes = "Edited"; }],
    ["config eligibility", (d: PlannerInputs) => { d.configs[0].isActive = false; }],
    ["property eligibility", (d: PlannerInputs) => { d.properties[0].active = "false"; }],
    ["property status", (d: PlannerInputs) => { d.properties[0].status = "inactive"; }],
    ["crew link", (d: PlannerInputs) => { d.columns[0].crewId = "other-crew"; }],
    ["crew eligibility", (d: PlannerInputs) => { d.crews[0].isActive = false; }],
    ["crew order", (d: PlannerInputs) => { d.crews[0].displayOrder = 9; }],
    ["selected identity", (d: PlannerInputs) => { d.templates[0].name = "Renamed"; }],
    ["missing reference", (d: PlannerInputs) => { d.configs.shift(); }],
  ] as const)("invalidates changed selected %s", (_label, change) => {
    const data = inputs(), before = plan(data).fingerprint;
    change(data);
    expect(plan(data).fingerprint).not.toBe(before);
  });
  it("ignores renewal identity, signature, quantity, window and month-spread while reporting current coverage", () => {
    const data = inputs(), before = plan(data);
    for (const status of ["draft", "signed", "active", "renewed"]) {
      const resolve = coverageResolver({
        customers: [{ id: "property", parentCustomerId: null }],
        agreements: [{ id: "agreement", customerId: "property" }],
        terms: [{ id: `renewal-${status}`, agreementId: "agreement", status, line: "landscape", startDate: "2027-04-15", endDate: "2027-09-30" } as AgreementTerm],
        scopes: [{ termId: `renewal-${status}`, serviceKey: "mowing", included: true, quantity: 31,
          monthSpread: [0,0,0,1,3,4,5,6,7,0,0,0] } as TermScopeLine],
      });
      const current = plan(data, resolve, "2027-05-01");
      expect(current.fingerprint).toBe(before.fingerprint);
      expect(current.covered2027).toBe(status === "draft" ? 0 : 1);
    }
  });
});

describe("read-only production report approval gate", () => {
  function auditInput(): ProductionRouteAuditInput {
    const data = inputs();
    data.templates[0].name = "Randy And Luciano (Copy)";
    for (let i = 1; i < 39; i++) {
      data.properties.push({ ...data.properties[0], id: `p${i}` });
      data.configs.push({ ...data.configs[0], id: `c${i}`, customerId: `p${i}` });
      data.blocks.push({ ...data.blocks[0], id: `b-${i}`, visitConfigId: `c${i}` });
    }
    return { ...data, properties: data.properties.map(p => ({ ...p, parentCustomerId: null })),
      companyId: "company", observedAt: "2026-11-03T16:00:00Z", agreements: [], terms: [], scopes: [] };
  }
  it("uses the shared plan/fingerprint and gates on 39/0, never the informational coverage split", () => {
    const data = auditInput(), before = structuredClone(data);
    const report = planProductionRouteAudit(data, "chosen", "2026-11-03");
    expect(report).toMatchObject({ approvalGatePassed: true, selectedTemplateId: "chosen",
      observedAt: data.observedAt, covered2027: 0, withoutCoverage2027: 39, decisions: [] });
    expect(report.fingerprint).toBe(plan(data).fingerprint);
    expect(data).toEqual(before);
    data.blocks.push({ ...data.blocks[0], id: "extra", sortOrder: 999 });
    expect(planProductionRouteAudit(data, "chosen").approvalGatePassed).toBe(false);
    data.blocks.pop(); data.blocks.pop();
    expect(planProductionRouteAudit(data, "chosen").approvalGatePassed).toBe(false);
  });
  it("refuses a missing, foreign, ambiguous or differently named selection", () => {
    const data = auditInput();
    expect(() => planProductionRouteAudit(data, "missing")).toThrow("uniquely");
    data.templates[0].companyId = "foreign";
    expect(() => planProductionRouteAudit(data, "chosen")).toThrow("uniquely");
    data.templates[0].companyId = "company"; data.templates[0].name = "Another";
    expect(() => planProductionRouteAudit(data, "chosen")).toThrow("uniquely");
    data.templates[0].name = "Randy And Luciano (Copy)";
    data.templates.push({ ...data.templates[0] });
    expect(() => planProductionRouteAudit(data, "chosen")).toThrow("uniquely");
  });
});
