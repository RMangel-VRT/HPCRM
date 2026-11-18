import { describe, expect, it } from "vitest";
import type { ActiveCustomerRow, ActiveCustomersResponse, LineState } from "../../../../../lib/db/src/activeCustomers";
import { projectActiveCustomers } from "../../../../../lib/db/src/activeCustomers";
import { activeCustomersLocale, activeCustomersText, reportDate } from "../../../../../lib/db/src/activeCustomersText";
import { activeCustomersReport } from "./activeCustomers";

export const none: LineState = { state: "none", seasonId: null, agreementId: null, seasonLabel: null, startDate: null, endDate: null, note: null };
export const line = (values: Partial<LineState>): LineState => ({ ...none, seasonLabel: "2026–27", startDate: "2026-01-01", endDate: "2026-12-31", ...values });
export const row = (id: string, values: Partial<ActiveCustomerRow> = {}): ActiveCustomerRow => ({
  customerId: id, customerName: id, customerStatus: "active", managingAgentName: null,
  responsible: true, landscape: line({ state: "in_effect" }), snow: none, flags: [], ...values,
});
export const fixture = (rows: ActiveCustomerRow[] = []): ActiveCustomersResponse => ({
  asOf: "2026-11-13", counts: { responsible: 17, landscape: 13, snow: 9, ending_soon: 99,
    lapsed: 99, should_fall_off: 99, starting_soon: 99, mismatch: 99, noContract: 99 }, rows,
});

describe("Active Customers pure report", () => {
  it("uses projection figures, one row per applicable issue, and ignores starting_soon", () => {
    const report = activeCustomersReport(fixture([
      row("Overlap", { flags: ["ending_soon", "lapsed", "should_fall_off", "mismatch", "starting_soon"], noContract: true }),
      row("Just starting", { flags: ["starting_soon"] }),
    ]), "en");
    expect(report.issues.map(i => i.kind)).toEqual(["ending_soon", "lapsed", "should_fall_off", "mismatch", "noContract"]);
    expect(report.html).toContain("<strong>17</strong>");
    expect(report.html).toContain("<strong>13</strong>");
    expect(report.html).toContain("<strong>9</strong>");
    expect(report.html).toContain("<strong>5</strong>");
    expect(report.html).not.toContain("<strong>99</strong>");
    expect(report.html).not.toContain("Starting soon");
  });
  it("groups inherited branches by stable parent ID even with duplicate parent names", () => {
    const report = activeCustomersReport(fixture([
      row("branch2", { customerName: "A branch", viaParent: true, parentName: "Z parent", parentCustomerId: "p2" }),
      row("p2", { customerName: "Z parent" }), row("middle", { customerName: "M standalone" }),
      row("branch1", { customerName: "B branch", viaParent: true, parentName: "Z parent", parentCustomerId: "p1" }),
      row("p1", { customerName: "Z parent" }),
    ]), "en");
    expect(report.responsible.map(r => r.customerId)).toEqual(["middle", "p1", "branch1", "p2", "branch2"]);
    expect(report.html.match(/class="branch"/g)).toHaveLength(2);
  });
  it("keeps parent identity in the existing projection without changing responsibility", () => {
    const report = projectActiveCustomers({
      customers: [{ id: "p", name: "Parent", status: "active", parentCustomerId: null },
        { id: "b", name: "Branch", status: "active", parentCustomerId: "p" }],
      agreements: [{ id: "a", customerId: "p" }],
      seasons: [{ id: "s", agreementId: "a", seasonLabel: "2026", line: "both", status: "signed",
        startDate: "2026-01-01", endDate: "2026-12-31", renewedFromTermId: null, nonRenewalOn: null }],
      asOf: "2026-11-13",
    });
    expect(report.rows[0]).toMatchObject({ viaParent: true, parentCustomerId: "p", responsible: true });
    expect(report.counts.responsible).toBe(2);
  });
  it.each(["en", "es"] as const)("renders every state, all notes, chips and localized details in %s", lang => {
    const text = activeCustomersText[lang], p = text.pdf;
    const report = activeCustomersReport(fixture([
      ...(["renewed", "renewal_drafted", "renewal_sent", "not_renewing", "lost"] as const).map(note =>
        row(note, { landscape: line({ state: "in_effect", note }) })),
      row("Ended", { landscape: line({ state: "ended" }) }),
      row("Lapsed", { landscape: line({ state: "lapsed", note: "renewal_sent" }), flags: ["lapsed"] }),
      row("Starting", { landscape: line({ state: "starting", startDate: "2027-01-01" }) }),
      row("None", { landscape: none, customerStatus: "prospect" }),
      row("Mismatch", { customerStatus: "inactive", flags: ["mismatch", "ending_soon"],
        landscape: line({ state: "in_effect", endDate: "2026-11-20" }) }),
      row("Off", { responsible: false, flags: ["should_fall_off"] }),
      row("No", { responsible: false, noContract: true }),
    ]), lang);
    for (const note of ["renewed", "renewal_drafted", "renewal_sent", "not_renewing", "lost"] as const)
      expect(report.html).toContain(p[note]);
    expect(report.html).toContain(`chip green">${p.renewed}`);
    expect(report.html).toContain(`chip amber">${p.renewal_sent}`);
    expect(report.html).toContain(`chip red">`);
    expect(report.html).toContain(`class="muted">${text.state.ended.split(" {{")[0]}`);
    expect(report.html).toContain(p.lapsedIssue);
    expect(report.html).toContain(text.status.prospect);
    expect(report.html).toContain("2026–27");
    expect(report.html).toContain(reportDate("2026-01-01", lang));
    expect(report.html).toContain(reportDate("2026-11-20", lang));
    expect(report.html).toContain(p.noContractDetail);
    expect(report.html).toContain(p.mismatchDetail);
    expect(report.html).toContain(p.fallOffDetail);
    expect(report.pageCountTemplate).toBe(p.page);
  });
  it("uses latest ended/lapsed end only, recognizes early stops, and never guesses missing dates", () => {
    const report = activeCustomersReport(fixture([
      row("Early", { responsible: false, customerStatus: "inactive", landscape: line({ state: "ended", endDate: "2027-01-01" }),
        snow: line({ state: "ended", endDate: "2026-01-01" }) }),
      row("Mixed", { responsible: false, customerStatus: "inactive", landscape: line({ state: "ended", endDate: "2026-10-01" }),
        snow: line({ state: "starting", startDate: "2027-01-01", endDate: "2028-12-31" }) }),
      row("Absent", { responsible: false, customerStatus: "inactive", landscape: line({ state: "ended", endDate: null }) }),
      row("Prospect", { responsible: false, customerStatus: "prospect" }),
      row("Working", { customerStatus: "inactive" }),
    ]), "en");
    expect(report.inactive.map(r => r.customerId)).toEqual(["Absent", "Early", "Mixed"]);
    expect(report.html).toContain("Stopped early (term ran to Jan 1, 2027)");
    expect(report.html).toContain("Ended Oct 1, 2026");
    expect(report.html).not.toContain("Ended Dec 31, 2028");
  });
  it("escapes all supplied names, agents and season labels, and produces readable empty sections", () => {
    const html = activeCustomersReport(fixture([row('"><script>', {
      managingAgentName: "<img src=x onerror='x'>", customerName: 'A & B " <script>',
      landscape: line({ state: "in_effect", seasonLabel: "<svg onload=x>" }),
    })]), "es").html;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;img src=x onerror=&#39;x&#39;&gt;");
    expect(html).toContain("A &amp; B &quot; &lt;script&gt;");
    expect(activeCustomersReport(fixture(), "en").html.match(/>None\.<\/td>/g)).toHaveLength(3);
  });
  it("bounds locale, ignores host timezone, and falls back to EN", () => {
    expect(activeCustomersLocale("es-MX")).toBe("es");
    for (const value of [undefined, ["es"], "fr", "<script>", "esperanto"]) {
      expect(activeCustomersLocale(value)).toBe("en");
      expect(activeCustomersReport(fixture(), value).html).toContain("Active Customers");
    }
    expect(reportDate("2026-11-13", "en", true)).toBe("November 13, 2026");
  });
});
