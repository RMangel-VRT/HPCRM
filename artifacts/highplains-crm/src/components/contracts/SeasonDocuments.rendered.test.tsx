// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { SeasonDocuments } from "./SeasonDocuments";
import type { DetailTerm, TermDocument } from "./contractTypes";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mock.request }));
const document: TermDocument = { id: "pdf", kind: "signed", version: 1, filename: "signed.pdf",
  storageObjectPath: "/objects/pdf", mimeType: "application/pdf", fileSize: 10, createdAt: "2026-10-01" };
const term = { id: "source", startDate: "2026-01-01", seasonLabel: "2026", documents: [document] } as DetailTerm;
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("season document viewing and coverage", () => {
  it.each([
    ["application/pdf", "signed.pdf", "iframe"],
    ["image/png", "photo.png", "img"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "contract.docx", null],
  ])("views %s without changing download attributes", async (mimeType, filename, tag) => {
    await i18n.changeLanguage("en");
    render(<SeasonDocuments term={{ ...term, documents: [{ ...document, mimeType, filename }] }} terms={[term]} selectTerm={vi.fn()} refresh={vi.fn()} />);
    expect(screen.getByTestId("link-download-pdf").getAttribute("download")).toBe(filename);
    fireEvent.click(screen.getByTestId("button-view-pdf"));
    const dialog = screen.getByTestId("dialog-document-view");
    if (tag) expect(dialog.querySelector(tag)?.getAttribute("src")).toBe("/objects/pdf");
    else expect(screen.getByTestId("text-document-no-preview").textContent).toContain("No inline preview");
    expect(screen.getByText("Open in new tab").getAttribute("target")).toBe("_blank");
    expect(dialog.querySelector("a[download]")?.getAttribute("download")).toBe(filename);
  });
  it("navigates from covered rows, preserves own-only empty state and avoids a coverage selector on covered documents", () => {
    const navigate = vi.fn();
    render(<SeasonDocuments term={{ ...term, id: "later", documents: [], coveredBy: [{ ...document, fromTermId: "source", fromSeasonLabel: "2026" }] }} terms={[term]} selectTerm={navigate} refresh={vi.fn()} />);
    fireEvent.click(screen.getByTestId("link-source-season-pdf"));
    expect(navigate).toHaveBeenCalledWith("source");
    expect(screen.queryByTestId("select-coverage-pdf")).toBeNull();
    expect(screen.getByTestId("link-download-pdf").getAttribute("download")).toBe("signed.pdf");
    cleanup();
    render(<SeasonDocuments term={{ ...term, documents: [] }} terms={[term]} selectTerm={navigate} refresh={vi.fn()} />);
    expect(screen.getByTestId("empty-documents")).toBeTruthy();
  });
  it("sets/clears coverage, refreshes on success and displays failures", async () => {
    const refresh = vi.fn();
    mock.request.mockResolvedValue({});
    const later = { ...term, id: "later", startDate: "2027-01-01", seasonLabel: "2027" };
    render(<SeasonDocuments term={term} terms={[term, later]} selectTerm={vi.fn()} refresh={refresh} />);
    fireEvent.change(screen.getByTestId("select-coverage-pdf"), { target: { value: "later" } });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(mock.request).toHaveBeenLastCalledWith("PATCH", "/api/contract-center/documents/pdf/coverage", { coversThroughTermId: "later" });
    await waitFor(() => expect((screen.getByTestId("select-coverage-pdf") as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(screen.getByTestId("select-coverage-pdf"), { target: { value: "" } });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(mock.request).toHaveBeenLastCalledWith("PATCH", "/api/contract-center/documents/pdf/coverage", { coversThroughTermId: null });
    await waitFor(() => expect((screen.getByTestId("select-coverage-pdf") as HTMLSelectElement).disabled).toBe(false));
    mock.request.mockRejectedValue(new Error("Coverage could not save"));
    fireEvent.change(screen.getByTestId("select-coverage-pdf"), { target: { value: "later" } });
    await waitFor(() => expect(screen.getByTestId("error-document-coverage").textContent).toContain("Coverage could not save"));
  });
});
