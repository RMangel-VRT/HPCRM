// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import "@/i18n";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentEditor } from "./PaymentEditor";
import { ExplicitScheduleEditor } from "./ExplicitScheduleEditor";
import { BillingSummary } from "./ContractWidgets";
import { annualCents, applyPreset, blankLine, feesCents, linesFromBilling, paymentsPayload } from "./paymentDraft";
import type { PaymentLine } from "./paymentDraft";
import { explicitFromBilling, explicitPayload, explicitProblems, explicitTotals, termMonths } from "./explicitSchedule";
import type { ExplicitDraft } from "./explicitSchedule";
import type { DetailTerm } from "./contractTypes";

afterEach(cleanup);
const t = (k: string) => k;
const mk = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;

function Pattern({ init, line, snowPricing }: { init: PaymentLine[]; line?: "snow"; snowPricing?: string }) {
  const [lines, setLines] = useState(init);
  return <><PaymentEditor lines={lines} onChange={setLines} startMonth={1} line={line} snowPricing={snowPricing} />
    <pre data-testid="payload">{JSON.stringify(paymentsPayload(lines))}</pre></>;
}

describe("CC2-18 fee lines", () => {
  it("fee checkbox tags the line and moves it out of the annual price", () => {
    const g = applyPreset(blankLine("Grounds", { total: "22248" }), "equal12", 1);
    const m = applyPreset(blankLine("Mobilization", { total: "479.40" }), "equal12", 1);
    render(<Pattern init={[g, m]} />);
    expect(screen.getByTestId("text-annual-price").textContent).toBe("$22,727.40");
    fireEvent.click(screen.getByTestId("checkbox-line-fee-1"));
    expect(screen.getAllByText("Fee: billed every month, not part of the contract price").length).toBe(2);
    expect(screen.getByTestId("tag-fee-1").textContent).toBe("Fee");
    expect(screen.getByTestId("text-annual-price").textContent).toBe("$22,248.00".replace(".00", ""));
    expect(screen.getByTestId("text-fees-annual").textContent).toContain("$479.40");
    const payload = JSON.parse(screen.getByTestId("payload").textContent!);
    expect(payload[1].fee).toBe(true); expect(payload[0].fee).toBeUndefined();
  });
  it("snow T&M allows fee lines only", () => {
    render(<Pattern init={[]} line="snow" snowPricing="time_and_materials" />);
    expect(screen.getByTestId("text-time-and-materials")).toBeTruthy();
    expect(screen.queryByTestId("button-add-line")).toBeNull();
    fireEvent.click(screen.getByTestId("button-add-fee-line"));
    const box = screen.getByTestId("checkbox-line-fee-0") as HTMLInputElement;
    expect(box.checked).toBe(true); expect(box.disabled).toBe(true);
  });
  it("annual and fee helpers split components; billing rows keep the flag", () => {
    const lines = linesFromBilling([{ component: "Mob", month: "2026-01-01", amountCents: 3995, isFee: true }, { component: "G", month: "2026-01-01", amountCents: 1000 }]);
    expect(annualCents(lines)).toBe(1000); expect(feesCents(lines)).toBe(3995);
  });
});

function Exact({ init }: { init: ExplicitDraft }) {
  const [d, setD] = useState(init);
  return <><ExplicitScheduleEditor draft={d} onChange={setD} startDate="2026-04-01" endDate="2027-09-30" />
    <pre data-testid="payload">{JSON.stringify(explicitPayload(d, "2026-04-01"))}</pre>
    <pre data-testid="problems">{JSON.stringify(explicitProblems(d, "2026-04-01", "2027-09-30", t, m => m))}</pre></>;
}

describe("CC2-18 exact dates", () => {
  const rows = [
    ...termMonths("2026-04-01", "2027-09-30").map(month => ({ component: "Grounds", month, amountCents: 150000 })),
    ...[2026, 2027].flatMap(y => [3, 4, 5, 6, 7, 8, 9].map(m => ({ component: "Chemical", month: mk(y, m), amountCents: 164500 }))),
  ];
  it("covers the full term, keeps exact rows and zeros, and needs consent for pre-start", () => {
    const init = explicitFromBilling([...rows, { component: "Grounds", month: "2027-09-01", amountCents: 0 }].filter((r, i, a) => a.findIndex(x => x.component === r.component && x.month === r.month) === i), "2026-04-01");
    render(<Exact init={init} />);
    expect(screen.getByTestId("row-explicit-2026-03-01")).toBeTruthy();
    expect(screen.getByTestId("tag-prestart-2026-03-01")).toBeTruthy();
    expect(screen.getByTestId("row-explicit-2027-09-01")).toBeTruthy();
    let payload = JSON.parse(screen.getByTestId("payload").textContent!);
    expect(payload.rows.filter((r: { component: string }) => r.component === "Grounds")).toHaveLength(18);
    expect(payload.rows.filter((r: { component: string }) => r.component === "Chemical")).toHaveLength(14);
    expect(payload.allowPreStart).toBeUndefined();
    expect(screen.getByTestId("problems").textContent).toContain("contractFees.pPreStart");
    fireEvent.click(screen.getByTestId("checkbox-allow-prestart"));
    payload = JSON.parse(screen.getByTestId("payload").textContent!);
    expect(payload.allowPreStart).toBe(true);
    expect(screen.getByTestId("problems").textContent).toBe("[]");
    fireEvent.change(screen.getByTestId("input-explicit-1-2027-09-01"), { target: { value: "0" } });
    payload = JSON.parse(screen.getByTestId("payload").textContent!);
    expect(payload.rows.find((r: { component: string; month: string }) => r.component === "Grounds" && r.month === "2027-09-01").amountCents).toBe(0);
  });
  it("year 1 is Apr-Mar, contract total covers all rows", () => {
    const d = explicitFromBilling(rows, "2026-04-01");
    const tot = explicitTotals(d, "2026-04-01");
    expect(tot.contract).toBe(18 * 150000 + 14 * 164500);
    expect(tot.year1).toBe(12 * 150000 + 6 * 164500 + 164500);
  });
  it("pre-start month can be added intentionally", () => {
    render(<Exact init={{ components: [{ id: "c", name: "Chemical", fee: false }], cells: {}, preStart: 0, allowPreStart: false }} />);
    expect(screen.queryByTestId("row-explicit-2026-02-01")).toBeNull();
    fireEvent.click(screen.getByTestId("button-add-prestart"));
    fireEvent.click(screen.getByTestId("button-add-prestart"));
    expect(screen.getByTestId("row-explicit-2026-02-01")).toBeTruthy();
    expect((screen.getByTestId("button-add-prestart") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("CC2-18 contract summary", () => {
  it("shows contract/fee split with names, Fee tags and the contract total label", () => {
    const term = {
      id: "t", seasonLabel: "2026", startDate: "2026-04-01", endDate: "2027-09-30", status: "active", displayStatus: "active",
      annualPriceCents: 2224800, feesAnnualCents: 47940, contractTotalCents: 7103000, durationMonths: 18, paymentSchedule: "explicit",
      snowPricing: null, needsReview: false, scope: [], rates: [], documents: [], history: [],
      billingMonths: [{ component: "Grounds", month: "2026-04-01", amountCents: 185400 }, { component: "Mobilization", month: "2026-04-01", amountCents: 3995, isFee: true }],
    } as unknown as DetailTerm;
    render(<BillingSummary term={term} snow={false} snowLineOnly={false} />);
    expect(screen.getByTestId("text-contract-split").textContent).toBe("Contract price $22,248 \u00b7 Fees $479.40/yr (Mobilization)");
    expect(screen.getByTestId("tag-fee-Mobilization").textContent).toBe("Fee");
    expect(screen.getByTestId("text-billing-contract-total").textContent).toBe("Contract total $71,030 (18 months)");
    expect(screen.getByTestId("table-explicit-schedule")).toBeTruthy();
  });
});
