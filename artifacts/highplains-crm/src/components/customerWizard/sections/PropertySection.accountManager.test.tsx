// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { PropertySection } from "./PropertySection";
import { buildBody, buildEditPatch, draftFromServer, newWizardDraft, type WizardDraft } from "../wizardModel";
import i18n from "@/i18n";
const fx = vi.hoisted(() => ({ data: { managers: [{ id: "am1", name: "Brady Test" }], assignments: { p1: { id: "am1", name: "Brady Test" } } } as any }));
vi.mock("@/hooks/use-account-managers", () => ({ useAccountManagers: () => ({ data: fx.data, isLoading: false, isError: false }) }));
vi.mock("wouter", () => ({ Link: ({ href, children }: any) => <a href={href}>{children}</a> }));
function Harness({ initial = newWizardDraft(), mode = "create" }: { initial?: WizardDraft; mode?: "create" | "edit" }) {
  const [d, setD] = useState(initial);
  return <><PropertySection d={d} patch={patch => setD(old => ({ ...old, ...patch }))} tw={k => k} mode={mode}
    parentChoices={[{ id: "p1", name: "Parent Test" } as any]} parentsLoading={false} />
    <output data-testid="draft-manager">{d.accountManagerId ?? "none"}</output></>;
}
afterEach(async () => { cleanup(); await i18n.changeLanguage("en"); fx.data = { managers: [{ id: "am1", name: "Brady Test" }], assignments: { p1: { id: "am1", name: "Brady Test" } } }; });
describe("shared account-manager field", () => {
  it("defaults only new standalone to the sole manager and preserves explicit clear across option refreshes", () => {
    const view = render(<Harness />);
    expect(screen.getByTestId("draft-manager").textContent).toBe("am1");
    fireEvent.change(screen.getByTestId("select-account-manager"), { target: { value: "" } });
    fx.data = { ...fx.data, managers: [{ id: "am2", name: "Another Test" }] };
    view.rerender(<Harness />);
    expect(screen.getByTestId("draft-manager").textContent).toBe("none");
  });
  it.each([0, 2])("does not invent a default with %i eligible managers", count => {
    fx.data.managers = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Synthetic ${i}` }));
    render(<Harness />); expect(screen.getByTestId("draft-manager").textContent).toBe("none");
  });
  it("keeps an existing edit assignment and permits an explicit null", () => {
    const initial = { ...newWizardDraft(), accountManagerId: "missing", accountManagerTouched: true };
    render(<Harness initial={initial} mode="edit" />);
    expect(screen.getByTestId("draft-manager").textContent).toBe("missing");
    fireEvent.change(screen.getByTestId("select-account-manager"), { target: { value: "" } });
    expect(screen.getByTestId("draft-manager").textContent).toBe("none");
    expect(buildEditPatch(initial, { ...initial, accountManagerId: null }).customer.accountManagerId).toBeNull();
  });
  it.each(["en", "es"])("shows a parent's live value and link, not a writable branch select in %s", async language => {
    await i18n.changeLanguage(language);
    render(<Harness initial={{ ...newWizardDraft(), parentCustomerId: "p1", accountManagerId: "stale" }} />);
    expect(screen.queryByTestId("select-account-manager")).toBeNull();
    expect(screen.getByText("Brady Test")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Parent Test/ }).getAttribute("href")).toBe("/dashboard/customers/p1");
    const d = { ...newWizardDraft(), parentCustomerId: "p1", accountManagerId: "am1" };
    expect(buildBody(d, { edit: false, master: false }).customer).not.toHaveProperty("accountManagerId");
  });
});
