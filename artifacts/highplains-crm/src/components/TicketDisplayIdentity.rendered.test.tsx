import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import TicketCard from "./TicketCard";
import { resolveDisplayTicketType } from "@shared/ticketVisuals";
import { InvoiceParentLine } from "./TicketLinkDisplay";

const approved = ["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"];
const early = ["new", "estimating", "proposal_draft", "proposal_sent", "decision_received", "closed_lost", "custom", null, undefined];

describe("display-only card identity", () => {
  it.each(approved)("renders a matching teal badge and rail at %s without altering the raw type", statusKey => {
    const ticket = {
      id: "estimate", title: "Example work", ticketTypeId: "raw-estimate", currentStatusId: "stage",
      ticketType: { id: "raw-estimate", name: "Renamed Estimate", typeKey: "estimate_request", color: null },
      currentStatus: { id: "stage", name: "Renamed status", statusKey, color: null },
    };
    const html = renderToStaticMarkup(<Router ssrPath="/"><TooltipProvider>
      <TicketCard ticket={ticket} formatDueDate={() => null} />
    </TooltipProvider></Router>);
    expect(html).toContain('background-color:var(--tt-project)');
    expect(html).toContain('background:var(--tt-project)');
    expect(html).toContain(">Project</span>");
    expect(html).not.toContain("--tt-estimate");
    expect(html).toContain("--ts-");
    expect(ticket.ticketType).toMatchObject({ id: "raw-estimate", typeKey: "estimate_request", name: "Renamed Estimate" });
  });
  it.each(early)("keeps estimate identity for absent, unknown, earlier and lost keys (%s)", statusKey => {
    const raw = { name: "Renamed estimate", typeKey: "estimate_request" };
    expect(resolveDisplayTicketType(raw, statusKey)).toBe(raw);
    const html = renderToStaticMarkup(<Router ssrPath="/"><TooltipProvider>
      <TicketCard ticket={{ id: "early", title: "Work",
        ticketType: { ...raw, id: "estimate", color: null },
        currentStatus: { id: "status", name: "Scheduled", statusKey, color: null },
      }} formatDueDate={() => null} />
    </TooltipProvider></Router>);
    expect(html).toContain(">Renamed estimate</span>");
    expect(html).toContain("background-color:var(--tt-estimate)");
    expect(html).not.toContain("--tt-project");
  });
  it.each(["rfp_request", "project", "custom", null, undefined])("does not relabel non-estimates (%s)", typeKey => {
    const raw = { name: "Custom label", typeKey };
    for (const statusKey of approved) expect(resolveDisplayTicketType(raw, statusKey)).toBe(raw);
  });
  it("uses additive lineage display metadata for the parent hue", () => {
    const html = renderToStaticMarkup(<InvoiceParentLine typeKey="invoice" summary={{
      invoices: [], parent: { id: "estimate", title: "Work", typeKey: "estimate_request", typeName: "Renamed estimate",
        displayTypeKey: "project", displayTypeName: "Project" },
    }} />);
    expect(html).toContain("--tt-project");
    expect(html).not.toContain("--tt-estimate");
  });
});
