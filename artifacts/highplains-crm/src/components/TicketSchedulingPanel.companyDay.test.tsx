import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ api: vi.fn(), picker: null as any }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.api, queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useMutation: (options: any) => ({
    isPending: false, mutate: (value: unknown) => options.mutationFn(value),
  }),
}));
vi.mock("@/components/DatePickerField", () => ({
  DatePickerField: (props: any) => { mocks.picker = props; return null; },
}));
import { ScheduleByFact } from "./TicketSchedulingPanel";
beforeEach(() => { vi.clearAllMocks(); mocks.picker = null; });

describe("rendered scheduling selected-date save", () => {
  it.each(["2026-03-08", "2026-11-01", "2028-02-29"])("sends selected calendar date %s, not its Denver projection", date => {
    renderToStaticMarkup(
      <ScheduleByFact ticketId="job" scheduleBy={date} overdueEligible={false} canEdit />,
    );
    expect(mocks.picker.value.getDate()).toBe(Number(date.slice(-2)));
    // Date picker values may be local midnight. Under UTC this instant is
    // yesterday in Colorado, but it still means the explicitly selected date.
    mocks.picker.onChange(new Date(`${date}T00:00:00`));
    expect(mocks.api).toHaveBeenCalledWith("PATCH", "/api/tickets/job", { scheduleBy: date });
  });
});
