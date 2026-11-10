import { describe, expect, it } from "vitest";
import { projectCustomerContractDocuments, loadCustomerContractDocuments } from "./customerContractDocuments";
import { customerContractProjector } from "../lib/customerContractSummary";
import { getTableName } from "drizzle-orm";

const data: any = {
  customers: [{ id: "parent" }, { id: "inherit", parentCustomerId: "parent" }, { id: "own", parentCustomerId: "parent" }],
  agreements: [{ id: "pa", customerId: "parent" }, { id: "snow", customerId: "parent" }, { id: "oa", customerId: "own" }],
  terms: [
    { id: "p-old", agreementId: "pa", status: "renewed", startDate: "2024-01-01", endDate: "2024-12-31", seasonLabel: "2024", line: "landscape" },
    { id: "p", agreementId: "pa", status: "signed", startDate: "2026-01-01", endDate: "2026-12-31", seasonLabel: "2026", line: "landscape" },
    { id: "p-next", agreementId: "pa", status: "signed", startDate: "2027-01-01", endDate: "2027-12-31", seasonLabel: "2027", line: "landscape" },
    { id: "s", agreementId: "snow", status: "signed", startDate: "2026-01-01", endDate: "2026-12-31", seasonLabel: "Snow", line: "snow" },
    { id: "o", agreementId: "oa", status: "signed", startDate: "2026-01-01", endDate: "2026-12-31", seasonLabel: "Own", line: "landscape" },
    { id: "draft", agreementId: "oa", status: "draft", startDate: "2027-01-01", endDate: "2027-12-31", seasonLabel: "Draft", line: "landscape" },
  ],
};
const file = (id: string, termId: string, through: string | null = null) => ({ id, termId, companyId: "co", filename: `${id}.pdf`, kind: "signed",
  createdAt: new Date("2026-01-01"), coversThroughTermId: through, storageObjectPath: "/objects/uploads/private" } as any);
describe("CP5 live contract-file projection", () => {
  it("matches real CP1 own-before-parent separately by period, keeps concurrent agreements, deduplicates", () => {
    const docs = [file("parent", "p"), file("snow", "s"), file("own", "o"), file("draft", "draft"), file("coverage", "p-old", "p-next")];
    const summary = customerContractProjector(data, "2026-06-01")("own")!;
    expect(summary.current.map(t => t.termId)).toEqual(["o"]);
    const own = projectCustomerContractDocuments(data, docs, "own", "2026-06-01");
    // Own current overrides ALL parent current agreements, but parent upcoming/previous
    // still qualify in periods without own terms, exactly like CP1.
    expect(own.map(d => d.id).sort()).toEqual(["coverage", "own"]);
    expect(own.find(d => d.id === "coverage")).toMatchObject({ agreementId: "pa", termId: "p-old" });
    const inherited = projectCustomerContractDocuments(data, docs, "inherit", "2026-06-01");
    expect(inherited.map(d => d.id).sort()).toEqual(["coverage", "parent", "snow"]);
    expect(inherited.filter(d => d.id === "coverage")).toHaveLength(1);
    expect(inherited.find(d => d.id === "coverage")!.seasonLabel).toBe("2026 · 2027 · 2024");
    expect(inherited[0]).not.toHaveProperty("storageObjectPath");
    expect(projectCustomerContractDocuments(data, docs, "missing", "2026-06-01")).toEqual([]);
  });
  it("does not infer coverage, cross agreements, or borrow a foreign parent", () => {
    const custom = { ...data, terms: data.terms.filter((t: any) => t.id !== "p-old") };
    const files = [file("no-coverage", "p-old"), file("wrong-agreement", "p-old", "s")];
    expect(projectCustomerContractDocuments(custom, files, "inherit", "2026-06-01")).toEqual([]);
    expect(projectCustomerContractDocuments(data, [file("own", "o")], "parent", "2026-06-01")).toEqual([]);
  });
  it("bulk loading is four fixed company-filtered queries, independent of term count", async () => {
    const calls: string[] = [];
    const reader: any = { select: () => ({ from: (table: any) => ({ where: async () => {
      const name = getTableName(table); calls.push(name);
      return ({ customers: data.customers, agreements: data.agreements, agreement_terms: data.terms, term_documents: [] } as any)[name];
    } }) }) };
    await loadCustomerContractDocuments(reader, "co", "parent");
    expect(calls).toEqual(["customers", "agreements", "agreement_terms", "term_documents"]);
  });
});
