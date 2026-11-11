// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ScopeEditor, buildScopeRows, scopePayload, splitChemical, type ScopeRow } from "./ScopeEditor";
import type { TermScopeRow } from "./contractTypes";

afterEach(cleanup);
const chem = { serviceKey: "chemical", included: true, quantity: 5, unit: "applications", monthSpread: null, details: {}, priceCents: 1000, notes: null, line: "landscape" } as unknown as TermScopeRow;

function Harness({ server, onChange }: { server: TermScopeRow[]; onChange?: (r: ScopeRow[]) => void }) {
  const [rows, setRows] = useState(() => buildScopeRows(server, "landscape"));
  return <ScopeEditor line="landscape" rows={rows} editing onChange={r => { setRows(r); onChange?.(r); }} snowTriggers={null} onSnowTriggers={() => {}} />;
}

describe("ScopeEditor fert/chem split", () => {
  it("hides legacy chemical for new lines and offers fertilization and broadleaf", () => {
    render(<Harness server={[]} />);
    expect(screen.queryByTestId("scope-row-chemical")).toBeNull();
    expect(screen.getByTestId("scope-row-fertilization")).toBeTruthy();
    expect(screen.getByTestId("scope-row-broadleaf")).toBeTruthy();
  });

  it("shows an existing chemical line with the note and Split", () => {
    render(<Harness server={[chem]} />);
    expect(screen.getByTestId("note-legacy-chemical").textContent).toContain("From before the split: replace with fertilization and broadleaf");
    expect(screen.getByTestId("button-split-chemical")).toBeTruthy();
  });

  it("Split only stages a draft: old count to fertilization, broadleaf blank, chemical off", () => {
    const save = vi.fn();
    const changes: ScopeRow[][] = [];
    render(<Harness server={[chem]} onChange={r => changes.push(r)} />);
    fireEvent.click(screen.getByTestId("button-split-chemical"));
    expect(save).not.toHaveBeenCalled();
    const last = changes.at(-1)!;
    const by = (k: string) => last.find(r => r.serviceKey === k)!;
    expect(by("chemical").included).toBe(false);
    expect(by("fertilization")).toMatchObject({ included: true, quantity: 5 });
    expect(by("broadleaf")).toMatchObject({ included: true, quantity: null });
    expect(screen.getByTestId("note-split-fertilization")).toBeTruthy();
    expect(screen.getByTestId("text-split-staged")).toBeTruthy();
    // On explicit save, the payload records chemical as switched off rather than deleting it.
    expect(scopePayload(last).find(r => r.serviceKey === "chemical")).toMatchObject({ included: false, quantity: 5 });
  });

  it("without Split, the source line carries forward unchanged (renewal semantics)", () => {
    const rows = buildScopeRows([chem], "landscape");
    expect(scopePayload(rows).map(r => r.serviceKey)).toEqual(["chemical"]);
    expect(splitChemical(buildScopeRows([], "landscape"))).toEqual(buildScopeRows([], "landscape"));
  });
});
