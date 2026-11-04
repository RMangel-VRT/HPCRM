// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.request }));
import { PdfPreviewDialog } from "./PdfPreviewDialog";
const props = { open: true, onClose: vi.fn(), companyId: "a", estimateId: "e", versionId: "v", estimateNumber: "EST-2026-0001", versionNumber: 1, draft: false };
beforeEach(async () => {
  vi.resetAllMocks(); await i18n.changeLanguage("en");
  URL.createObjectURL = vi.fn(() => "blob:pdf");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
it.each(["en", "es"])("shows engine guidance and a working Retry for the exact 503 in %s", async language => {
  await i18n.changeLanguage(language);
  mocks.request.mockRejectedValueOnce(new Error('503: {"error":"DOCUMENT_RENDERER_UNAVAILABLE"}'))
    .mockResolvedValue({ blob: async () => new Blob(["pdf"], { type: "application/pdf" }) });
  const view = render(<PdfPreviewDialog {...props} />);
  await screen.findByText(i18n.t("documents.engine.previewUnavailable"));
  fireEvent.click(screen.getByTestId("button-pdf-retry"));
  await screen.findByTestId("frame-pdf");
  expect(mocks.request.mock.calls[1][3].headers).toMatchObject({ "X-Company-Id": "a" });
  const signal = mocks.request.mock.calls[1][3].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
});
it.each(['500: {"error":"INTERNAL_ERROR"}', '503: {"error":"OTHER"}', "network unavailable"])("preserves other preview errors: %s", async error => {
  mocks.request.mockRejectedValue(new Error(error));
  render(<PdfPreviewDialog {...props} />);
  await screen.findByText(i18n.t("estimateBuilder.pdf.error"));
  expect(screen.queryByText(i18n.t("documents.engine.previewUnavailable"))).toBeNull();
});
it("cancels and drops a response after switching company/version without leaking an object URL", async () => {
  let finish!: (response: unknown) => void;
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockRejectedValue(new Error('503: {"error":"DOCUMENT_RENDERER_UNAVAILABLE"}'));
  const view = render(<PdfPreviewDialog {...props} />);
  const oldSignal = mocks.request.mock.calls[0][3].signal;
  view.rerender(<PdfPreviewDialog {...props} companyId="b" versionId="v2" />);
  expect(oldSignal.aborted).toBe(true);
  finish({ blob: async () => new Blob(["old"]) });
  await screen.findByText(i18n.t("documents.engine.previewUnavailable"));
  await waitFor(() => expect(URL.createObjectURL).not.toHaveBeenCalled());
});
