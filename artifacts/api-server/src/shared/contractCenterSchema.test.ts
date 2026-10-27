import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  agreements, contractMasters, agreementTerms, termScopeLines, rateCardItems, termRates,
  termBillingMonths, termDocuments, termStatusHistory, scopePresets, scopePresetLines, termLegacySources,
  insertAgreementSchema, insertContractMasterSchema, insertAgreementTermSchema, insertTermScopeLineSchema,
  insertRateCardItemSchema, insertTermRateSchema, insertTermBillingMonthSchema, insertTermDocumentSchema,
  insertTermStatusHistorySchema, insertScopePresetSchema, insertScopePresetLineSchema, insertTermLegacySourceSchema,
} from "@workspace/db";

const term = {
  line: "landscape",
  companyId: "company", agreementId: "agreement", seasonLabel: "2026",
  startDate: "2026-01-01", endDate: "2026-12-31", billingType: "equal_monthly",
};
const scope = { companyId: "company", termId: "term", serviceKey: "mowing", line: "landscape" };
const rate = { companyId: "company", rateKey: "labor", line: "general", category: "Labor", label: "Labor", unit: "hour" };
const tables = [
  agreements, contractMasters, agreementTerms, termScopeLines, rateCardItems, termRates,
  termBillingMonths, termDocuments, termStatusHistory, scopePresets, scopePresetLines, termLegacySources,
];
const originalMigration = readFileSync(new URL("../../../../.migration-backup/migrations/0043_contract_center_tables.sql", import.meta.url), "utf8");
const extension = readFileSync(new URL("../../../../.migration-backup/migrations/0046_contract_center_payment_lines.sql", import.meta.url), "utf8");
const auditExtension = readFileSync(new URL("../../../../.migration-backup/migrations/0048_agreement_import_ref.sql", import.meta.url), "utf8");
const bidExtension = readFileSync(new URL("../../../../.migration-backup/migrations/0052_term_bid_ticket.sql", import.meta.url), "utf8");
// Compare the foundation plus the additive extension, never rewrite historical SQL.
const migration = originalMigration
  .replace("  line text NOT NULL,\n  form text NOT NULL DEFAULT 'ours',", "  line text,\n  form text DEFAULT 'ours',")
  .replace("CREATE TABLE IF NOT EXISTS agreement_terms (\n", "CREATE TABLE IF NOT EXISTS agreement_terms (\n  bid_ticket_id varchar REFERENCES tickets(id) ON DELETE SET NULL,\n  line text NOT NULL,\n  form text NOT NULL DEFAULT 'ours',\n")
  .replace("CREATE TABLE IF NOT EXISTS agreements (\n", "CREATE TABLE IF NOT EXISTS agreements (\n  import_ref text,\n")
  .replace("CREATE TABLE IF NOT EXISTS agreements (\n  import_ref text,", "CREATE TABLE IF NOT EXISTS agreements (\n  CONSTRAINT agreements_company_import_ref_unique UNIQUE (company_id, import_ref),\n  import_ref text,")
  .replace("  annual_price_cents integer,", "  annual_price_cents integer,\n  snow_pricing text,\n  snow_flat_price_cents integer,")
  .replace("  month date NOT NULL,", "  component text NOT NULL DEFAULT 'Contract',\n  month date NOT NULL,")
  .replace("term_billing_months_term_month_unique UNIQUE (term_id, month)", "term_billing_months_term_component_month_unique UNIQUE (term_id, component, month)")
  + "\nCREATE INDEX IF NOT EXISTS agreement_terms_bid_ticket_idx ON agreement_terms (bid_ticket_id);";

describe("Contract Center schema", () => {
  it("adds only a nullable nonunique indexed ticket FK with SET NULL", () => {
    expect(bidExtension).toContain("ADD COLUMN IF NOT EXISTS bid_ticket_id varchar");
    expect(bidExtension).toContain("REFERENCES tickets(id) ON DELETE SET NULL");
    expect(bidExtension).toContain("CREATE INDEX IF NOT EXISTS agreement_terms_bid_ticket_idx");
    expect(bidExtension).not.toMatch(/UNIQUE|UPDATE|CREATE TABLE/);
    expect(insertAgreementTermSchema.parse({ ...term, bidTicketId: "rfp" }).bidTicketId).toBe("rfp");
  });
  it("guards the nullable company import reference without changing non-import inserts", () => {
    expect(auditExtension).toContain("ADD COLUMN IF NOT EXISTS import_ref text");
    expect(auditExtension).toContain("conrelid = 'agreements'::regclass");
    expect(auditExtension).toContain("ADD CONSTRAINT agreements_company_import_ref_unique UNIQUE (company_id, import_ref)");
    const base = { companyId: "company", customerId: "customer", line: "both" };
    expect(insertAgreementSchema.parse(base).importRef).toBeUndefined();
    expect(insertAgreementSchema.parse({ ...base, importRef: null }).importRef).toBeNull();
    expect(insertAgreementSchema.parse({ ...base, importRef: "audited" }).importRef).toBe("audited");
  });
  it("extends payment lines and snow pricing with guarded SQL and normalized inserts", () => {
    expect(extension).toContain("ADD COLUMN IF NOT EXISTS component text NOT NULL DEFAULT 'Contract'");
    expect(extension).toContain("DROP CONSTRAINT IF EXISTS term_billing_months_term_month_unique");
    expect(extension).toContain("conrelid = 'term_billing_months'::regclass");
    expect(extension).toContain("UNIQUE (term_id, component, month)");
    for (const snowPricing of ["", null, undefined]) expect(insertAgreementTermSchema.parse({ ...term, snowPricing }).snowPricing).toBeUndefined();
    expect(insertAgreementTermSchema.parse({ ...term, snowPricing: "flat_rate", snowFlatPriceCents: 15000 }).snowPricing).toBe("flat_rate");
    expect(insertAgreementTermSchema.safeParse({ ...term, snowPricing: "invalid" }).success).toBe(false);
    expect(insertAgreementTermSchema.safeParse({ ...term, snowFlatPriceCents: 1.5 }).success).toBe(false);
    expect(insertTermBillingMonthSchema.parse({ companyId: "c", termId: "t", month: "2026-01-01", amountCents: 5 }).component).toBe("Contract");
  });
  it("validates all twelve minimal inserts with the specified defaults", () => {
    expect(insertAgreementSchema.parse({ companyId: "company", customerId: "customer" }).form).toBeUndefined();
    expect(insertAgreementTermSchema.parse(term).form).toBe("ours");
    expect(insertContractMasterSchema.parse({ companyId: "company", version: 1, filename: "master", storageObjectPath: "/master" }).isCurrent).toBe(false);
    expect(insertAgreementTermSchema.parse(term).status).toBe("draft");
    expect(insertTermScopeLineSchema.parse(scope)).toMatchObject({ included: true, details: {}, sortOrder: 0 });
    expect(insertRateCardItemSchema.parse(rate).active).toBe(true);
    expect(insertTermRateSchema.parse({ ...rate, termId: "term" }).sortOrder).toBe(0);
    expect(insertTermBillingMonthSchema.parse({ companyId: "company", termId: "term", month: "2026-01-01", amountCents: 0 }).amountCents).toBe(0);
    expect(insertTermDocumentSchema.parse({ companyId: "company", termId: "term", kind: "signed", filename: "signed", storageObjectPath: "/signed", mimeType: "application/pdf" }).version).toBe(1);
    expect(insertTermStatusHistorySchema.parse({ companyId: "company", termId: "term", newStatus: "signed" }).newStatus).toBe("signed");
    expect(insertScopePresetSchema.parse({ companyId: "company", name: "Standard", line: "both" }).active).toBe(true);
    expect(insertScopePresetLineSchema.parse({ presetId: "preset", serviceKey: "mowing" }).details).toEqual({});
    expect(insertTermLegacySourceSchema.parse({ companyId: "company", termId: "term", legacyContractId: "old" }).legacyContractId).toBe("old");
  });

  it.each(["2026-02-29", "1900-02-29", "2026-04-31", "0000-01-01", "2026-13-01", "2026-1-01", "2026-01-01T00:00:00Z"])("rejects impossible or noncalendar dates: %s", (value) => {
    expect(insertAgreementTermSchema.safeParse({ ...term, startDate: value }).success).toBe(false);
    expect(insertAgreementTermSchema.safeParse({ ...term, endDate: value }).success).toBe(false);
    expect(insertTermBillingMonthSchema.safeParse({ companyId: "company", termId: "term", month: value, amountCents: 0 }).success).toBe(false);
  });

  it("accepts leap dates and equal dates, but rejects reversed date ranges", () => {
    expect(insertAgreementTermSchema.safeParse({ ...term, startDate: "2000-02-29", endDate: "2000-02-29" }).success).toBe(true);
    expect(insertAgreementTermSchema.safeParse({ ...term, startDate: "2026-12-31", endDate: "2026-01-01" }).success).toBe(false);
  });

  it.each([-1, 0.5, "100"])("rejects invalid money values: %s", (value) => {
    expect(insertAgreementTermSchema.safeParse({ ...term, annualPriceCents: value }).success).toBe(false);
    expect(insertTermScopeLineSchema.safeParse({ ...scope, priceCents: value }).success).toBe(false);
    expect(insertRateCardItemSchema.safeParse({ ...rate, priceCents: value }).success).toBe(false);
    for (const field of ["priceCents", "cardPriceCents"]) {
      expect(insertTermRateSchema.safeParse({ ...rate, termId: "term", [field]: value }).success).toBe(false);
    }
    expect(insertTermBillingMonthSchema.safeParse({ companyId: "company", termId: "term", month: "2026-01-01", amountCents: value }).success).toBe(false);
  });

  it("accepts omitted/null optional money, zero cents and only twelve nonnegative integer month entries", () => {
    for (const value of [undefined, null, 0, 100]) {
      expect(insertAgreementTermSchema.safeParse({ ...term, annualPriceCents: value }).success).toBe(true);
      expect(insertTermRateSchema.safeParse({ ...rate, termId: "term", priceCents: value, cardPriceCents: value }).success).toBe(true);
    }
    for (const [monthSpread, valid] of [
      [undefined, true], [null, true], [Array(12).fill(0), true],
      [Array(11).fill(0), false], [Array(13).fill(0), false],
      [Array(12).fill(-1), false], [Array(12).fill(0.5), false],
    ] as const) {
      expect(insertTermScopeLineSchema.safeParse({ ...scope, monthSpread }).success).toBe(valid);
      expect(insertScopePresetLineSchema.safeParse({ presetId: "preset", serviceKey: "mowing", monthSpread }).success).toBe(valid);
    }
  });

  it("normalizes empty optional statuses and rejects invalid enums", () => {
    for (const oldStatus of [undefined, "", null]) {
      expect(insertTermStatusHistorySchema.parse({ companyId: "company", termId: "term", newStatus: "active", oldStatus }).oldStatus).toBeUndefined();
    }
    expect(insertTermStatusHistorySchema.safeParse({ companyId: "company", termId: "term", newStatus: "", oldStatus: "bad" }).success).toBe(false);
    expect(insertAgreementSchema.safeParse({ companyId: "company", customerId: "customer", line: "irrigation" }).success).toBe(false);
    expect(insertAgreementTermSchema.safeParse({ ...term, billingType: "monthly" }).success).toBe(false);
    expect(insertTermScopeLineSchema.safeParse({ ...scope, line: "both" }).success).toBe(false);
    expect(insertRateCardItemSchema.safeParse({ ...rate, line: "both" }).success).toBe(false);
    expect(insertTermDocumentSchema.safeParse({ companyId: "company", termId: "term", kind: "bad", filename: "doc", storageObjectPath: "/doc", mimeType: "text/plain" }).success).toBe(false);
  });

  it("matches SQL columns, nullability, types, named indexes/uniques and foreign-key deletion behavior", () => {
    expect(tables).toHaveLength(12);
    for (const table of tables) {
      const config = getTableConfig(table);
      const body = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${config.name} \\(\\n([\\s\\S]*?)\\n\\);`))?.[1];
      expect(body, config.name).toBeDefined();
      const definitions = body!.split("\n").map((line) => line.trim().replace(/,$/, "")).filter((line) => !line.startsWith("CONSTRAINT"));
      expect(config.columns.map((c) => c.name)).toEqual(definitions.map((d) => d.split(" ")[0]));
      for (const [i, column] of config.columns.entries()) {
        const definition = definitions[i];
        expect(column.notNull, `${config.name}.${column.name}`).toBe(/NOT NULL|PRIMARY KEY/.test(definition));
        expect(column.getSQLType().replace(/\s/g, "")).toBe(definition.split(" ")[1]);
        expect(column.hasDefault).toBe(definition.includes("DEFAULT"));
      }
      for (const idx of config.indexes) {
        const names = idx.config.columns.map((c) => "name" in c ? c.name : undefined);
        expect(migration).toContain(`CREATE INDEX IF NOT EXISTS ${idx.config.name} ON ${config.name} (${names.join(", ")});`);
      }
      for (const constraint of config.uniqueConstraints) {
        expect(body).toContain(`CONSTRAINT ${constraint.name} UNIQUE (${constraint.columns.map((c) => c.name).join(", ")})`);
      }
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const source = ref.columns[0].name;
        const target = `${getTableConfig(ref.foreignTable).name}(${ref.foreignColumns[0].name})`;
        expect(definitions.find((d) => d.startsWith(`${source} `))).toContain(`REFERENCES ${target} ON DELETE ${fk.onDelete!.toUpperCase()}`);
      }
      expect(config.foreignKeys).toHaveLength(definitions.filter((d) => d.includes("REFERENCES")).length);
    }
    expect(getTableConfig(termLegacySources).foreignKeys.some((fk) => fk.reference().columns.some((c) => c.name === "legacy_contract_id"))).toBe(false);
  });

  it("keeps client/server field declarations and validation in sync despite the untyped stub", () => {
    const block = (path: URL) => readFileSync(path, "utf8").split("// Contract Center:")[1].split("// Ticketing System Tables")[0];
    const server = block(new URL("../../../../lib/db/src/schema/schema.ts", import.meta.url));
    const client = block(new URL("../../../highplains-crm/src/shared/schema.ts", import.meta.url))
      .replace(/\n\/\/ Type only this block's enum builders;[\s\S]*?const contractCenterText = .*?;\n/, "")
      .replaceAll("contractCenterText(", "text(")
      .replaceAll("(t: Record<string, any>)", "(t)")
      .replaceAll("(v: { startDate: string; endDate: string })", "(v)");
    expect(client).toBe(server);
  });
});
