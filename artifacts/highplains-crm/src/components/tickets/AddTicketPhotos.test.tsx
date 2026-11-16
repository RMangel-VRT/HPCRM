// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { AddTicketPhotos } from "./AddTicketPhotos";

let qc: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  mocks.api.mockImplementation(async (method: string) => ({
    json: async () => method === "POST" ? { uploadURL: "https://upload.invalid/photo", objectPath: "/objects/uploads/p1", uploadToken: "signed-token" } : {},
  }));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  return render(<QueryClientProvider client={qc}><AddTicketPhotos ticketId="t1" companyId="c1" /></QueryClientProvider>);
}
const choose = (files: File[]) => fireEvent.change(screen.getByTestId("input-ticket-photos"), { target: { files } });
const photo = () => new File(["image"], "site.jpg", { type: "image/jpeg" });

describe("post-creation ticket photos", () => {
  it("uploads and appends using a company-bound grant, then refreshes the ticket", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    mount(); choose([photo(), photo()]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "newTicket.photoAdded" }));
    expect(mocks.api.mock.calls.filter(([method]) => method === "PATCH")).toHaveLength(2);
    expect(mocks.api).toHaveBeenCalledWith("PATCH", "/api/tickets/t1",
      { appendPhotos: [{ path: "/objects/uploads/p1", uploadToken: "signed-token" }] }, { headers: { "X-Company-Id": "c1" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/tickets", "t1"] });
    expect((screen.getByTestId("input-ticket-photos") as HTMLInputElement).value).toBe("");
  });
  it("does not attach when storage upload fails, and allows retry", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    mount(); choose([photo()]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.api.mock.calls.some(([method]) => method === "PATCH")).toBe(false);
    expect((screen.getByTestId("button-add-ticket-photos") as HTMLButtonElement).disabled).toBe(false);
  });
  it("refuses non-images before requesting an upload", async () => {
    mount(); choose([new File(["text"], "note.txt", { type: "text/plain" })]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("reports attachment failure without claiming success", async () => {
    mocks.api.mockImplementation(async (method: string) => {
      if (method === "PATCH") throw new Error("No access");
      return { json: async () => ({ uploadURL: "https://upload.invalid", objectPath: "/objects/uploads/p1", uploadToken: "signed-token" }) };
    });
    mount(); choose([photo()]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mocks.toast).not.toHaveBeenCalledWith({ title: "newTicket.photoAdded" });
  });
});
