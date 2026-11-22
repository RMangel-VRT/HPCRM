// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { RequiredSqlObjectsCard } from "./RequiredSqlObjectsCard";

const mocks = vi.hoisted(() => ({ status: vi.fn(), refresh: vi.fn(), clipboard: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  getGetRequiredSqlObjectsQueryKey: () => ["/api/settings/database/sql-objects"],
  useGetRequiredSqlObjects: mocks.status,
}));

const present = {
  id: "function", label: "Retirement function", present: true, kind: "function", sqlFile: "0062.sql",
};
const sql = "BEGIN;\nCOMMIT;\n";
const missing = { ...present, id: "trigger", kind: "trigger", label: "Retirement trigger",
  present: false, remediationSql: sql };

describe("database objects status card", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.clipboard.mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: mocks.clipboard } });
    await i18n.changeLanguage("en");
    mocks.status.mockReturnValue({ data: { objects: [present, missing] }, refetch: mocks.refresh });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows both statuses, copies only the missing object's reviewed SQL and refreshes the correct scope", async () => {
    render(<RequiredSqlObjectsCard companyId="company-a" userId="admin-a" />);
    expect(screen.getByText("Present")).toBeTruthy();
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(screen.getByText("0062.sql")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy SQL" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith(sql));
    await screen.findByText("SQL copied for review.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.status).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ queryKey: ["/api/settings/database/sql-objects", "company-a", "admin-a"] }),
      request: { headers: { "X-Company-Id": "company-a" } },
    }));
  });

  it("distinguishes a catalog query failure from missing objects", () => {
    mocks.status.mockReturnValue({ data: { objects: [missing] }, isError: true, refetch: mocks.refresh });
    render(<RequiredSqlObjectsCard companyId="company-a" userId="admin-a" />);
    expect(screen.getByRole("alert").textContent).toContain("could not be checked");
    expect(screen.queryByText("Missing")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy SQL" })).toBeNull();
  });
});
