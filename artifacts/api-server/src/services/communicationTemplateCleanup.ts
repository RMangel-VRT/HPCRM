import { and, eq, or, sql } from "drizzle-orm";
import { communicationAutomationRules as rules, communicationTemplates as templates } from "@workspace/db";
import { db } from "../db";

const tokens: Readonly<Record<string, string>> = {
  customer_name: "customerName", property_name: "propertyName", contact_name: "contactName",
  service_date: "serviceDate", company_name: "companyName",
};
const retiredSms = ["Snow Event Service Notice", "Service Update — Delay Notice"];
const proposalTokens = /\{\{\s*proposal_(?:name|total)\s*\}\}/u;

export function normalizeTemplateText(text: string) {
  return text.replace(/^[ \t]*(?:(?:best(?: regards)?|thanks|thank you|regards|sincerely),[ \t]*)?\{\{[ \t]*pm_name[ \t]*\}\}[ \t]*(?:\r?\n|$)/gimu, "")
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gu, (match, key: string) =>
      Object.hasOwn(tokens, key) ? `{${tokens[key]}}` : match);
}

export function isRetiredTemplate(row: Pick<typeof templates.$inferSelect, "name" | "type" | "body"> & { subject?: string | null }) {
  return (row.type === "sms" && retiredSms.includes(row.name))
    || (row.type === "email" && row.name === "Proposal Follow-Up — Standard")
    || proposalTokens.test(row.subject ?? "") || proposalTokens.test(row.body);
}

export const RETIRED_AUTOMATION = { name: "Proposal Follow-Up", eventKey: "proposal_created" } as const;
export function isRetiredAutomation(rule: { name?: string; eventKey?: string | null }) {
  return rule.name === RETIRED_AUTOMATION.name && rule.eventKey === RETIRED_AUTOMATION.eventKey;
}

/** Only rewrite recognized tokens and targeted obsolete options; archived rows retain their history. */
export async function normalizeStoredCommunicationTemplates() {
  return db.transaction(async tx => {
    const rows = await tx.select().from(templates).where(or(
      sql`${templates.subject} like '%{{%'`, sql`${templates.body} like '%{{%'`,
      and(eq(templates.isArchived, false), or(
        and(eq(templates.type, "email"), eq(templates.name, "Proposal Follow-Up — Standard")),
        and(eq(templates.type, "sms"), or(...retiredSms.map(name => eq(templates.name, name)))),
      )),
    )).for("update");
    let converted = 0;
    for (const row of rows) {
      const subject = row.subject === null ? null : normalizeTemplateText(row.subject);
      const body = normalizeTemplateText(row.body);
      const isArchived = row.isArchived || isRetiredTemplate(row);
      if (subject === row.subject && body === row.body && isArchived === row.isArchived) continue;
      await tx.update(templates).set({ subject, body, isArchived, updatedAt: new Date() })
        .where(and(eq(templates.id, row.id), eq(templates.companyId, row.companyId)));
      converted++;
    }
    // Rules lack an archive field. Retain the row, turn off delivery, and hide
    // this exact retired identity from management and execution.
    const disabled = await tx.update(rules).set({ isEnabled: false, autoSend: false }).where(and(
      eq(rules.name, RETIRED_AUTOMATION.name), eq(rules.eventKey, RETIRED_AUTOMATION.eventKey),
      or(eq(rules.isEnabled, true), eq(rules.autoSend, true)),
    )).returning({ id: rules.id });
    return { converted, retiredRules: disabled.length };
  });
}
