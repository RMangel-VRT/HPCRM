import { describe, expect, it } from "vitest";
import { replayEstimateEdits } from "./estimateRevision";
import type { EstimateDetailDto } from "./estimateBuilder";

const sourceUrl = "/api/estimates/e1/versions/v1";
const draftUrl = "/api/estimates/e1/versions/v2";
const source = { id: "e1", version: { id: "v1" } } as EstimateDetailDto;
const draft = { id: "e1", currentVersionId: "v2", version: {
  id: "v2", status: "draft", createdFromVersionId: "v1",
  sections: [{ id: "new-s1", lines: [{ id: "new-l1" }] }, { id: "new-s2", lines: [] }],
} } as EstimateDetailDto;
const idMap = { sections: { s1: "new-s1", s2: "new-s2" }, lines: { l1: "new-l1" } };

describe("E2 first-edit replay", () => {
  it("maps the complete cross-section order and the in-place line action targets to the new draft", () => {
    const order = { sections: [{ id: "s2", lineIds: ["l1"] }, { id: "s1", lineIds: [] }] };
    const replacement = { lineType: "plant", plantCatalogItemId: "catalog-plant", keepPrice: true };
    expect(replayEstimateEdits(source, sourceUrl, draft, idMap, [
      { method: "PUT", url: `${sourceUrl}/order`, body: order },
      { method: "POST", url: `${sourceUrl}/lines/l1/replace`, body: replacement },
      { method: "POST", url: `${sourceUrl}/lines/l1/duplicate` },
    ])).toEqual([
      { method: "PUT", url: `${draftUrl}/order`, body: { sections: [{ id: "new-s2", lineIds: ["new-l1"] }, { id: "new-s1", lineIds: [] }] } },
      { method: "POST", url: `${draftUrl}/lines/new-l1/replace`, body: replacement },
      { method: "POST", url: `${draftUrl}/lines/new-l1/duplicate` },
    ]);
  });

  it("never replays an action for a line removed from the draft", () => {
    for (const edit of [
      { method: "PUT", url: `${sourceUrl}/order`, body: { sections: [{ id: "s1", lineIds: ["deleted"] }] } },
      { method: "POST", url: `${sourceUrl}/lines/deleted/duplicate` },
      { method: "POST", url: `${sourceUrl}/lines/deleted/replace`, body: { lineType: "plant", plantCatalogItemId: "p" } },
    ]) expect(replayEstimateEdits(source, sourceUrl, draft, idMap, [edit])).toBeNull();
  });
});
