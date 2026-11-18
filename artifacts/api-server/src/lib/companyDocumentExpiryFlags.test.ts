import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { companyDocumentExpiryCandidate, companyDocumentExpiryPlan, registerCompanyDocumentReconciliation } from "./companyDocumentExpiryFlags";
import { addCalendarDays } from "./companyDay";
const today = "2026-11-18";
const doc = (days: number | null = 60) => ({ id: "doc", name: "COI", archivedAt: null, expiresOn: days === null ? null : addCalendarDays(today, days) });
it.each([[61, null], [60, "60"], [15, "60"], [14, "14"], [0, "14"], [-1, "expired"]] as const)("selects exactly the stage for %s days", (days, stage) => {
  const candidate = companyDocumentExpiryCandidate(doc(days), today);
  if (!stage) expect(candidate).toBeNull();
  else expect(candidate).toMatchObject({ sourceKey: `company-doc:doc:${doc(days).expiresOn}:${stage}` });
});
it("does not remind for missing expiry or archived documents", () => {
  expect(companyDocumentExpiryCandidate(doc(null), today)).toBeNull();
  expect(companyDocumentExpiryCandidate({ ...doc(), archivedAt: new Date() }, today)).toBeNull();
});
it("hands stages off, suppresses all closed same-key reminders and preserves human active workflow", () => {
  const current = doc(14), desired = companyDocumentExpiryCandidate(current, today)!;
  const earlier = `company-doc:doc:${current.expiresOn}:60`;
  expect(companyDocumentExpiryPlan([current], [{ id: "old", sourceKey: earlier, status: "acknowledged" }], today)).toMatchObject({
    create: [desired], resolve: [{ id: "old", resolution: "Moved to the next reminder" }],
  });
  for (const status of ["dismissed", "resolved", "new", "acknowledged", "in_progress"]) {
    expect(companyDocumentExpiryPlan([current], [{ id: "f", sourceKey: desired.sourceKey, status }], today)).toEqual({ create: [], resolve: [] });
  }
  const suppression = companyDocumentExpiryPlan([current], [{ id: "old", sourceKey: earlier, status: "new" },
    { id: "closed-current", sourceKey: desired.sourceKey, status: "dismissed" }], today);
  expect(suppression).toEqual({ create: [], resolve: [{ id: "old", resolution: "Moved to the next reminder" }] });
});
it("uses precise resolution reasons and never touches unrelated/malformed source keys", () => {
  const prior = doc(30), history = [{ id: "f", sourceKey: companyDocumentExpiryCandidate(prior, today)!.sourceKey, status: "in_progress" },
    { id: "other", sourceKey: "no-term:customer", status: "new" }, { id: "crew", sourceKey: null, status: "new" },
    { id: "unknown", sourceKey: "company-doc:unrecognized", status: "new" }];
  for (const [document, resolution] of [[doc(90), "Renewed copy uploaded"], [doc(10), "Expiration date changed"],
    [doc(null), "Expiration removed"], [{ ...prior, archivedAt: new Date() }, "Document removed"]] as const) {
    expect(companyDocumentExpiryPlan([document], history, today).resolve).toEqual([{ id: "f", resolution }]);
  }
  expect(companyDocumentExpiryPlan([], history, today).resolve).toEqual([{ id: "f", resolution: "Document removed" }]);
});
it("captures company on entry and schedules only successful committed create/replace/patch/archive responses", async () => {
  const app = express(), schedule = vi.fn(async () => {}), user = { activeCompanyId: "initial" };
  app.use((req, _res, next) => { Object.assign(req, { user }); next(); });
  registerCompanyDocumentReconciliation(app, schedule);
  app.all("/{*path}", (_req, res) => { user.activeCompanyId = "switched"; res.status(201).json({}); });
  for (const [method, path, expected] of [["post", "/api/company-documents", true], ["post", "/api/company-documents/doc/files", true],
    ["patch", "/api/company-documents/doc", true], ["delete", "/api/company-documents/doc", true],
    ["post", "/api/company-documents/upload-url", false], ["post", "/api/company-documents/email", false],
    ["put", "/api/company-documents/license-number", false], ["get", "/api/company-documents", false]] as const) {
    user.activeCompanyId = "initial"; schedule.mockClear();
    await request(app)[method](path).expect(201);
    expect(schedule).toHaveBeenCalledTimes(expected ? 1 : 0);
    if (expected) expect(schedule).toHaveBeenCalledWith("initial");
  }
  const failed = express();
  failed.use((req, _res, next) => { Object.assign(req, { user }); next(); });
  registerCompanyDocumentReconciliation(failed, schedule);
  failed.post("/api/company-documents", (_req, res) => { res.sendStatus(422); });
  schedule.mockClear(); await request(failed).post("/api/company-documents").expect(422); expect(schedule).not.toHaveBeenCalled();
});
