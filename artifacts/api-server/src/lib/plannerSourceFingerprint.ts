import { createHash } from "node:crypto";
import type { PlannerInputs } from "./importPlannerRoutes";

/** Approval v2 binds only the selected source, never live contractual coverage,
 * today's date, generated anchors, labels anonymized by the audit, or inventory
 * belonging to other templates. Keep this shared by audit planning and startup.
 */
export function plannerSourceFingerprint(companyId: string, templateId: string | null, data: PlannerInputs) {
  const template = data.templates.find(t => t.id === templateId && t.companyId === companyId);
  const blocks = data.blocks.filter(b => b.templateId === template?.id).sort((a, b) => a.id.localeCompare(b.id));
  const source = blocks.map(block => {
    const config = data.configs.find(c => c.id === block.visitConfigId);
    const column = data.columns.find(c => c.id === block.crewId);
    const crew = data.crews.find(c => c.id === column?.crewId);
    const property = data.properties.find(p => p.id === config?.customerId);
    return {
      block: { id: block.id, templateId: block.templateId, visitConfigId: block.visitConfigId,
        crewId: block.crewId, dayOfWeek: block.dayOfWeek, sortOrder: block.sortOrder, startTime: block.startTime },
      config: config ? { id: config.id, customerId: config.customerId, isActive: config.isActive,
        minutes: config.estimatedDurationMinutes,
        notesDigest: config.notesDigest ?? createHash("md5").update(config.notes ?? "").digest("hex") } : null,
      // Column activity is deliberately not eligibility: the linked standing crew owns it.
      column: column ? { id: column.id, crewId: column.crewId, name: column.name } : null,
      crew: crew ? { id: crew.id, isActive: crew.isActive, displayOrder: crew.displayOrder, name: crew.name } : null,
      property: property ? { id: property.id, active: property.active, status: property.status } : null,
    };
  });
  return createHash("sha256").update(JSON.stringify({
    semantics: "selected-planner-source-v2", companyId,
    template: template ? { id: template.id, companyId: template.companyId, name: template.name, isActive: template.isActive } : null,
    serviceKey: "mowing", everyWeeks: 1, source,
  })).digest("hex");
}
