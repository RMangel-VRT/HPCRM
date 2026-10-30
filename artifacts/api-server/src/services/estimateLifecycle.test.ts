import { describe, it, expect } from "vitest";
import { ESTIMATE_STATUSES, sendEstimateSchema, acceptEstimateSchema, estimateReasonSchema, emptyEstimateActionSchema } from "@workspace/db/estimate-contracts";
import { assertEstimateTransition, type EstimateAction } from "./estimateLifecycle";

describe("lifecycle state machine", () => {
  const valid: Record<string, string[]> = { send: ["draft"], accept: ["sent"], decline: ["sent"], revise: ["sent", "accepted", "declined"], discard: ["draft"] };
  for (const action of Object.keys(valid) as EstimateAction[]) {
    for (const status of ESTIMATE_STATUSES) {
      it(`${status} / ${action}`, () => {
        if (valid[action].includes(status)) expect(() => assertEstimateTransition(status, action, 2)).not.toThrow();
        else expect(() => assertEstimateTransition(status, action, 2)).toThrow(expect.objectContaining({
          status: 409, error: "INVALID_TRANSITION", extra: { from: status, action },
        }));
      });
    }
  }
  it("v1 cannot be discarded", () => {
    expect(() => assertEstimateTransition("draft", "discard", 1)).toThrow(expect.objectContaining({ error: "INVALID_TRANSITION" }));
  });
});
describe("strict action contracts", () => {
  it("uses only exact enums and strict booleans", () => {
    for (const method of ["email", "hard_copy", "portal", "other"]) expect(sendEstimateSchema.parse({ method }).method).toBe(method);
    for (const body of [{ method: "Email" }, { method: "email", confirmZeroPriced: "true" }, { method: "email", status: "sent" }, {}])
      expect(sendEstimateSchema.safeParse(body).success).toBe(false);
    for (const method of ["email_approval", "signed_pdf", "phone", "portal", "other"]) expect(acceptEstimateSchema.parse({ method }).method).toBe(method);
    expect(acceptEstimateSchema.safeParse({ method: "email" }).success).toBe(false);
  });
  it("validates calendar components independently of timezone and leap boundaries", () => {
    for (const acceptedOn of ["2024-02-29", "2026-10-29", "0001-01-01"]) expect(acceptEstimateSchema.safeParse({ method: "phone", acceptedOn }).success).toBe(true);
    for (const acceptedOn of ["2026-02-29", "2026-04-31", "0000-01-01", "2026-13-01", "2026-1-1", "2026-10-29T00:00:00Z", "", null])
      expect(acceptEstimateSchema.safeParse({ method: "phone", acceptedOn }).success).toBe(false);
  });
  it("requires nonblank reasons and rejects unknown payload fields", () => {
    expect(estimateReasonSchema.parse({ reason: "  Timing  " })).toEqual({ reason: "Timing" });
    for (const body of [{}, { reason: "" }, { reason: " \n " }, { reason: "X", userId: "actor" }])
      expect(estimateReasonSchema.safeParse(body).success).toBe(false);
    expect(emptyEstimateActionSchema.safeParse({ status: "draft" }).success).toBe(false);
    expect(acceptEstimateSchema.safeParse({ method: "phone", acceptedAt: "2026-01-01" }).success).toBe(false);
  });
});
