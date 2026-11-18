// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentPreview } from "./DocumentPreview";
import type { CompanyDocumentDto } from "./companyDocumentsApi";
const fx = vi.hoisted(() => ({
  request: vi.fn(), destroy: vi.fn(async () => {}), render: vi.fn(() => ({ cancel: vi.fn(), promise: Promise.resolve() })),
  page: vi.fn(), load: vi.fn(), worker: { workerSrc: "" },
}));
vi.mock("./companyDocumentsApi", () => ({ companyRequest: fx.request, previewable: (type: string) => type === "pdf" ? "pdf" : "image" }));
vi.mock("./bits", () => ({ FileTile: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, args: any) => key.endsWith(".page") ? `${args.page}/${args.total}` : key }) }));
vi.mock("pdfjs-dist", () => ({ getDocument: fx.load, GlobalWorkerOptions: fx.worker }));
const doc = { id: "doc", name: "COI", openUrl: "/api/company-documents/doc/open?companyId=company", currentFile: { uploadedAt: "2026-11-18", fileType: "pdf" } } as CompanyDocumentDto;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("fetches with company binding, renders pixels without an iframe, paginates and destroys private bytes on close", async () => {
  fx.request.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer });
  fx.page.mockResolvedValue({ getViewport: () => ({ width: 600, height: 800 }), render: fx.render });
  fx.load.mockReturnValue({ destroy: fx.destroy, promise: Promise.resolve({ numPages: 2, getPage: fx.page }) });
  const view = render(<DocumentPreview doc={doc} companyId="company" />);
  await waitFor(() => expect(fx.render).toHaveBeenCalledTimes(1));
  expect(fx.request).toHaveBeenCalledWith("company", "GET", doc.openUrl, undefined, expect.any(AbortSignal));
  expect(fx.load).toHaveBeenCalledWith({ data: new Uint8Array([37, 80, 68, 70]), enableXfa: false, useSystemFonts: true });
  expect(view.container.querySelector("iframe")).toBeNull();
  expect(view.container.querySelector("canvas")).not.toBeNull();
  fireEvent.click(screen.getByText("companyDocuments.preview.next"));
  await waitFor(() => expect(fx.page).toHaveBeenCalledWith(2));
  expect(screen.getByText("2/2")).toBeTruthy();
  view.unmount();
  expect(fx.destroy).toHaveBeenCalledTimes(1);
  expect(fx.request.mock.calls[0][4].aborted).toBe(true);
});
it("shows a useful download fallback instead of silently hiding authorization or rendering failures", async () => {
  fx.request.mockRejectedValue(new Error("404"));
  render(<DocumentPreview doc={doc} companyId="other" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("companyDocuments.preview.unavailable"));
});
