// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import "@/i18n";
import { QueueCard } from "./SchedulingCards";
import type { QueueItem } from "@/lib/scheduling";

afterEach(cleanup);

const item: QueueItem = {
  id: "job", title: "Approved estimate work", typeKey: "estimate_request", typeName: "Estimate",
  displayTypeKey: "project", displayTypeName: "Project", priority: "normal",
  scheduleBy: null, serviceType: null, customer: null, followUpDate: null, createdAt: "",
};

describe("whole-card queue dragging protects interactive controls", () => {
  function mount() {
    const schedule = vi.fn();
    const pointer = vi.fn();
    const key = vi.fn();
    const { hook } = memoryLocation({ path: "/dashboard/scheduling" });
    function Harness() {
      const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
      return <Router hook={hook}><DndContext sensors={sensors}>
        <div onPointerDown={pointer} onKeyDown={key}>
          <QueueCard item={item} slipped={false} today="2026-10-27" onSchedule={schedule} />
        </div>
      </DndContext></Router>;
    }
    render(<Harness />);
    return { schedule, pointer, key };
  }

  it("allows Schedule and ticket links without bubbling drag activation", () => {
    const { schedule, pointer, key } = mount();
    const button = screen.getByTestId("button-queue-schedule-job");
    fireEvent.pointerDown(button);
    fireEvent.keyDown(button, { code: "Space", key: " " });
    fireEvent.click(button);
    expect(schedule).toHaveBeenCalledExactlyOnceWith(item);
    const link = screen.getByTestId("link-queue-ticket-job");
    expect(link.getAttribute("draggable")).toBe("false");
    fireEvent.pointerDown(link);
    fireEvent.keyDown(link, { code: "Enter", key: "Enter" });
    expect(pointer).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();
    expect(document.querySelector("a button, button button, a a, button a")).toBeNull();
  });

  it("keeps the card itself focusable and draggable without a separate grip", () => {
    const { pointer } = mount();
    const card = screen.getByTestId("card-queue-job");
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.getAttribute("role")).toBe("group");
    fireEvent.pointerDown(card);
    expect(pointer).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("handle-queue-job")).toBeNull();
    expect(card.style.transform).toBe("");
    expect(screen.getByTestId("rail-queue-job").getAttribute("data-hue")).toBe("var(--tt-project)");
    expect(screen.getByTestId("badge-queue-type-job").innerHTML).toContain("--tt-project");
  });
});
