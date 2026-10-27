import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
import { rfpSyncTargets } from "./rfpContracts";
const statuses = ["new", "proposal_draft", "proposal_sent", "decision_received", "awarded", "contract_executed", "crm_setup", "closed_won", "closed_lost", "custom_final"]
  .map((statusKey, displayOrder) => ({ id: statusKey, ticketTypeId: "rfp", name: statusKey, statusKey, displayOrder,
    isFinal: (displayOrder >= 7 ? "true" : "false") as "true" | "false", description: null, color: "#6b7280",
    actionType: "needs_action" as const, waitingCategory: null, createdAt: new Date() }));
const status = (key: string) => statuses.find(s => s.statusKey === key)!;
const flow = (key: string) => ({ statuses, current: status(key), draft: status("proposal_draft"), awarded: status("awarded"), executed: status("contract_executed") });
describe("RFP aggregate precedence and forward-only boundaries", () => {
  it.each([
    ["proposal_draft", [], []],
    ["proposal_draft", ["draft", "lost"], []],
    ["proposal_draft", ["cancelled", "cancelled"], []],
    ["proposal_draft", ["lost", "cancelled"], ["closed_lost"]],
    ["proposal_draft", ["sent", "lost"], ["proposal_sent"]],
    ["proposal_draft", ["signed", "sent", "lost"], ["awarded", "contract_executed"]],
    ["proposal_sent", ["sent"], []],
    ["decision_received", ["sent"], []],
    ["decision_received", ["signed", "draft"], ["awarded", "contract_executed"]],
    ["awarded", ["signed"], []],
    ["contract_executed", ["lost"], []],
    ["crm_setup", ["signed"], []],
    ["closed_won", ["sent"], []],
    ["closed_lost", ["signed"], []],
    ["custom_final", ["signed"], []],
  ])("%s with %j produces %j", (current, terms, expected) => {
    expect(rfpSyncTargets(flow(current as string), (terms as string[]).map(status => ({ status })))).toEqual(expected);
  });
});
