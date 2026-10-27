import { describe, expect, it } from "vitest";
import {
  STATUS_KEY_BACKFILL, TICKET_TYPE_KEYS, resolveDisplayTypeKey, resolveDisplayTypeName,
} from "./ticketCapabilities";
import {
  resolveDisplayTypeKey as clientKey, resolveDisplayTypeName as clientName,
} from "../../../highplains-crm/src/shared/ticketVisuals";

const approved = new Set(["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"]);
const typeKeys = [...Object.values(TICKET_TYPE_KEYS), "custom", "unknown", "", null, undefined];
const statusKeys = [...new Set(Object.values(STATUS_KEY_BACKFILL).flatMap(Object.values)), "unknown", "", null, undefined];

describe("client/server display identity parity", () => {
  for (const typeKey of typeKeys) {
    it(`preserves raw identity except explicitly approved estimates (${String(typeKey)})`, () => {
      for (const statusKey of statusKeys) {
        const projects = typeKey === "estimate_request" && approved.has(statusKey!);
        const expectedKey = projects ? "project" : typeKey;
        expect(resolveDisplayTypeKey(typeKey, statusKey)).toBe(expectedKey);
        expect(clientKey(typeKey, statusKey)).toBe(expectedKey);
        for (const rawName of ["Renamed custom label", "Project", "Estimate Request", null, undefined]) {
          const expectedName = projects ? "Project" : rawName;
          expect(resolveDisplayTypeName(typeKey, statusKey, rawName)).toBe(expectedName);
          expect(clientName(typeKey, statusKey, rawName)).toBe(expectedName);
        }
      }
    });
  }
});
