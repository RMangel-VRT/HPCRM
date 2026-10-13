// @vitest-environment jsdom
import { useState } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePickerField } from "./DatePickerField";
import { Calendar } from "./ui/calendar";

// These browser shims are deliberately scoped to this test file.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const now = new Date(2026, 4, 18, 12, 30);
const december = new Date(2025, 11, 1);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  vi.spyOn(Element.prototype, "hasPointerCapture").mockReturnValue(false);
});

// jsdom doesn't implement these methods; restore their original descriptors.
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
const captureDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "hasPointerCapture");
Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value() {} });
Object.defineProperty(Element.prototype, "hasPointerCapture", { configurable: true, value() { return false; } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

afterAll(() => {
  if (scrollDescriptor) Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  if (captureDescriptor) Object.defineProperty(Element.prototype, "hasPointerCapture", captureDescriptor);
  else Reflect.deleteProperty(Element.prototype, "hasPointerCapture");
});

function selects() {
  const month = screen.getByRole<HTMLSelectElement>("combobox", { name: "Choose the Month" });
  const year = screen.getByRole<HTMLSelectElement>("combobox", { name: "Choose the Year" });
  return { month, year };
}

async function open(value: Date | undefined = december, onChange = vi.fn()) {
  const user = userEvent.setup();
  render(<DatePickerField value={value} onChange={onChange} data-testid="date" />);
  await user.click(screen.getByTestId("date"));
  return { user, onChange };
}

describe("shared date-picker calendar", () => {
  it("opens December 2025 on the selected date and focuses it", async () => {
    await open();
    expect(selects().month.value).toBe("11");
    expect(selects().year.value).toBe("2025");
    const selected = screen.getByRole("button", { name: /Monday, December 1st, 2025/ });
    expect(selected.closest("td")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(selected);
  });

  it("opens the fixed current month when empty", async () => {
    const user = userEvent.setup();
    render(<DatePickerField value={undefined} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Pick a date" }));
    expect(selects().month.value).toBe("4");
    expect(selects().year.value).toBe("2026");
  });

  it("navigates with both dropdowns, retains month on year changes, and keeps arrows working", async () => {
    const { user } = await open();
    expect(Array.from(selects().year.options, option => option.value)).toEqual(
      Array.from({ length: 21 }, (_, i) => String(2016 + i)),
    );
    await user.selectOptions(selects().year, "2027");
    expect(selects().month.value).toBe("11");
    await user.selectOptions(selects().month, "6");
    expect(selects().year.value).toBe("2027");
    await user.click(screen.getByRole("button", { name: "Go to the Next Month" }));
    expect(selects().month.value).toBe("7");
    await user.click(screen.getByRole("button", { name: "Go to the Previous Month" }));
    expect(selects().month.value).toBe("6");
  });

  it("uses seven equal-width weekday and day columns for every week", async () => {
    await open();
    const headers = Array.from(screen.getByRole("grid").querySelectorAll("thead th"));
    expect(headers).toHaveLength(7);
    for (const header of headers) expect(header.className).toContain("w-9");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) {
      const cells = within(row).getAllByRole("gridcell");
      expect(cells).toHaveLength(7);
      expect(row.className).toContain("flex");
      for (const cell of cells) expect(cell.className).toContain("w-9");
    }
  });

  it("emits a local Date and closes after selecting", async () => {
    const { user, onChange } = await open();
    await user.click(screen.getByRole("button", { name: /Friday, December 12th, 2025/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2025, 11, 12));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reopens on the newly selected month rather than its previous value", async () => {
    function ControlledField() {
      const [value, setValue] = useState<Date | undefined>(december);
      return <DatePickerField value={value} onChange={setValue} data-testid="date" />;
    }
    const user = userEvent.setup();
    render(<ControlledField />);
    await user.click(screen.getByTestId("date"));
    await user.selectOptions(selects().year, "2027");
    await user.selectOptions(selects().month, "1");
    await user.click(screen.getByRole("button", { name: /Friday, February 12th, 2027/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByTestId("date"));
    expect(selects().month.value).toBe("1");
    expect(selects().year.value).toBe("2027");
  });

  it("preserves Today and footer Clear callbacks and test IDs", async () => {
    const { user, onChange } = await open();
    await user.click(screen.getByTestId("date-today"));
    expect(onChange).toHaveBeenLastCalledWith(now);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByTestId("date"));
    await user.click(screen.getByTestId("date-clear"));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("preserves compact sizing and inline clearing without opening", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePickerField compact value={december} onChange={onChange} data-testid="date" />);
    expect(screen.getByTestId("date").className).toContain("h-7");
    await user.click(screen.getByTestId("date-inline-clear"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open or clear a disabled field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePickerField disabled value={december} onChange={onChange} data-testid="date" />);
    await user.click(screen.getByTestId("date"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps primary-foreground selection and today's ring without a conflicting text color", async () => {
    await open(now);
    const cell = screen.getByRole("button", { name: /Monday, May 18th, 2026/ }).closest("td");
    expect(cell?.hasAttribute("data-selected")).toBe(true);
    expect(cell?.hasAttribute("data-today")).toBe(true);
    expect(cell?.className).toContain("[&>button]:bg-primary");
    expect(cell?.className).toContain("[&>button]:text-primary-foreground");
    expect(cell?.className).toContain("[&>button]:ring-primary/50");
    expect(cell?.className).toContain("[&:not([data-selected])>button]:text-primary");
    expect(cell?.className.split(" ")).not.toContain("[&>button]:text-primary");
  });

  it("honors caller bounds, class overrides, and label captions", async () => {
    const user = userEvent.setup();
    const view = render(<Calendar mode="single" defaultMonth={new Date(2024, 2, 1)}
      startMonth={new Date(2024, 2, 1)} endMonth={new Date(2028, 8, 1)}
      classNames={{ weekday: "custom-weekday" }} />);
    expect(Array.from(selects().year.options, option => option.value)).toEqual(["2024", "2025", "2026", "2027", "2028"]);
    expect(screen.getByRole("button", { name: "Go to the Previous Month" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("grid").querySelector("thead th")?.className).toBe("custom-weekday");
    await user.selectOptions(selects().year, "2028");
    await user.selectOptions(selects().month, "8");
    expect(screen.getByRole("button", { name: "Go to the Next Month" }).getAttribute("aria-disabled")).toBe("true");
    view.rerender(<Calendar captionLayout="label" />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
