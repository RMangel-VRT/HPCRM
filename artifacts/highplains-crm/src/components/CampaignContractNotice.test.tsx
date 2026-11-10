// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import CampaignContractNotice from "./CampaignContractNotice";
import type { CampaignContractState } from "../../../../lib/db/src/campaignGenerationContracts";
afterEach(cleanup);
const mount = (value?: CampaignContractState, onSkip?: () => void) => render(
  <Router hook={memoryLocation({ path: "/" }).hook}><CampaignContractNotice value={value} onSkip={onSkip} /></Router>,
);
describe("generated campaign contract exceptions", () => {
  it("does not add warnings to manual or owed items", () => {
    const view = mount(); expect(view.container.textContent).toBe("");
    cleanup(); expect(mount({ state: "owed", agreementId: "a", termId: "t" }).container.textContent).toBe("");
  });
  it("links waiting-on-signature items to their governing contract without a skip action", () => {
    mount({ state: "waiting_on_signature", agreementId: "a", termId: "t" }, vi.fn());
    expect(screen.getByText("Waiting on signature")).toBeTruthy();
    expect(screen.getByText("Open contract").getAttribute("href")).toBe("/dashboard/contracts/a#term-t");
    expect(screen.queryByText("Skip item")).toBeNull();
  });
  it("shows retained history and opens the existing skip action only when allowed", () => {
    const skip = vi.fn();
    mount({ state: "no_longer_in_contract", agreementId: null, termId: null }, skip);
    expect(screen.getByText("No longer in contract")).toBeTruthy();
    expect(screen.getByText("Review contracts").getAttribute("href")).toBe("/dashboard/contracts");
    fireEvent.click(screen.getByText("Skip item")); expect(skip).toHaveBeenCalledTimes(1);
    cleanup();
    mount({ state: "no_longer_in_contract", agreementId: null, termId: null });
    expect(screen.queryByText("Skip item")).toBeNull();
  });
});
