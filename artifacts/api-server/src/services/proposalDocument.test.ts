import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalWithDetails } from "@workspace/db";
import type { ProposalExhibits } from "../../../../lib/db/src/plantExhibitContracts";
const mocks = vi.hoisted(() => ({ estimate: vi.fn(), download: vi.fn(), visual: vi.fn() }));
vi.mock("./estimatePdf", async original => ({ ...await original<typeof import("./estimatePdf")>(), loadEstimateDocumentModel: mocks.estimate }));
vi.mock("../objectStorage", () => ({ ObjectStorageService: class {
  downloadByPath = mocks.download;
  async getObjectEntityFile(path: string) { return { download: async () => [await mocks.download(path)] }; }
} }));
vi.mock("../visualScopeRenderer", () => ({ renderVisualScope: mocks.visual }));
import { loadProposalDocumentModel } from "./proposalDocument";
import { estimateFixture } from "./documents/fixtures";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=", "base64");
const exhibits: ProposalExhibits = {
  provenance: { estimateId: "e", versionId: "captured", versionNumber: 2, estimateNumber: "EST-42" },
  palette: { introText: "", groups: [{ category: "tree", cards: [{ id: "private-item-id", name: "Pine", typeLabel: "Tree", imagePath: "/bucket/plant" }] }] },
  schedule: [{ quantity: "2.00", name: "Pine", botanicalName: "Pinus", size: "5 gal", imagePath: "/bucket/plant" }],
};
function proposal(overrides: Partial<ProposalWithDetails> = {}) {
  return {
    id: "p", companyId: "c", estimateId: "e", title: "Landscape", proposalNumber: "P-42", proposalDate: "2026-11-03",
    scopeOfWork: "Scope", coverSource: "photo", coverPhotoFileId: "a", photoLayout: "large",
    files: [
      { id: "b", companyId: "c", proposalId: "p", fileType: "image", mimeType: "image/png", displayOrder: 2, caption: "Second", storageObjectPath: "/bucket/b" },
      { id: "a", companyId: "c", proposalId: "p", fileType: "image", mimeType: "image/png", displayOrder: 1, caption: "First", storageObjectPath: "/objects/a" },
      { id: "missing", companyId: "c", proposalId: "p", fileType: "image", mimeType: "image/png", displayOrder: 0, caption: "Missing", storageObjectPath: "/bucket/missing" },
    ], ...overrides,
  } as ProposalWithDetails;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.estimate.mockResolvedValue(estimateFixture(12));
  mocks.download.mockImplementation(async (path: string) => { if (path.includes("missing")) throw new Error("missing"); return png; });
  mocks.visual.mockResolvedValue(png);
});
describe("scoped proposal loader", () => {
  it("uses the exact captured version's authoritative total and selected exhibits, skipping missing images", async () => {
    const model = await loadProposalDocumentModel("c", proposal(), exhibits);
    expect(mocks.estimate).toHaveBeenCalledExactlyOnceWith("c", "e", "captured");
    expect(model.estimate.totalCents).toBe(300000);
    expect(model.photos.map(p => p.caption)).toEqual(["First", "Second"]);
    expect(model.hero?.dataUri).toMatch(/^data:image\/jpeg;base64,/);
    expect(model.palette.introText).toBe("");
    expect(model.schedule[0].name).toBe("Pine");
    expect(JSON.stringify(model)).not.toMatch(/private-item-id|captured|imagePath|provenance/);
  });
  it("honors exhibit switches and deleted photo/detached scope logo-only fallback", async () => {
    const m = await loadProposalDocumentModel("c", proposal({ coverPhotoFileId: "deleted", includePlantPalette: false, includePlantSchedule: false }), exhibits);
    expect(m.hero).toBeNull(); expect(m.palette.groups).toEqual([]); expect(m.schedule).toEqual([]);
    const detached = await loadProposalDocumentModel("c", proposal({ coverSource: "visual_scope", visualScopeSheetId: null, visualScopeSheet: null }), exhibits);
    expect(detached.hero).toBeNull(); expect(detached.visualScope).toEqual([]);
  });
  it("uses attached scoped Visual Scope with include flags, with graceful missing rendering fallback", async () => {
    const p = proposal({ coverSource: "visual_scope", visualScopeSheetId: "vs", vsIncludeBase: true, vsIncludeOverlay: false,
      visualScopeSheet: { id: "vs", companyId: "c", baseImagePath: "/bucket/base" } as ProposalWithDetails["visualScopeSheet"] });
    const m = await loadProposalDocumentModel("c", p, exhibits);
    expect(m.visualScope.map(i => i.caption)).toEqual(["Visual Scope", "Existing conditions"]);
    expect(m.hero?.dataUri).toBe(m.visualScope[0].dataUri);
    mocks.visual.mockRejectedValue(new Error("removed"));
    const missing = await loadProposalDocumentModel("c", p, exhibits);
    expect(missing.hero).toBeNull(); expect(missing.visualScope).toEqual([]);
  });
  it("rejects company/version mismatches and never downloads remote image URLs", async () => {
    await expect(loadProposalDocumentModel("foreign", proposal(), exhibits)).rejects.toThrow("SCOPE_MISMATCH");
    await expect(loadProposalDocumentModel("c", proposal(), { ...exhibits, provenance: { ...exhibits.provenance, estimateId: "wrong" } })).rejects.toThrow("SCOPE_MISMATCH");
    const p = proposal(); p.files[0].storageObjectPath = "https://example.test/private";
    await loadProposalDocumentModel("c", p, exhibits);
    expect(mocks.download).not.toHaveBeenCalledWith("https://example.test/private");
  });
});
