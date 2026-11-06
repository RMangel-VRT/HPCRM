import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCustomerNotePins } from "./customerNotePins";

const pinNote = vi.fn();
let role = "office", company = "company", authenticated = true;
function app() {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated,
      user: { id: "another-editor", activeRole: role, activeCompanyId: company } });
    next();
  });
  registerCustomerNotePins(a, { pinNote });
  return request(a);
}
beforeEach(() => {
  vi.resetAllMocks(); role = "office"; company = "company"; authenticated = true;
  pinNote.mockResolvedValue({ id: "note", authorId: "original-author", body: "Unchanged",
    createdAt: "2026-01-01", pinnedAt: "2026-11-06" });
});
describe("CP4 shared-note pin authorization", () => {
  it.each(["admin", "account_manager", "office", "field_manager", "chemical_manager", "irrigation_manager",
    "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor"])(
    "preserves existing non-field editor access for %s, not author ownership", async r => {
      role = r;
      const res = await app().patch("/api/notes/note/pin").send({ pinned: true }).expect(200);
      expect(pinNote).toHaveBeenCalledExactlyOnceWith("note", "company", true);
      expect(res.body).toMatchObject({ authorId: "original-author", body: "Unchanged", createdAt: "2026-01-01" });
    });
  it("unpinned uses the same scoped writer", async () => {
    await app().patch("/api/notes/note/pin").send({ pinned: false }).expect(200);
    expect(pinNote).toHaveBeenCalledExactlyOnceWith("note", "company", false);
  });
  it("rejects signed-out, field and stale-company writes before storage", async () => {
    authenticated = false;
    await app().patch("/api/notes/note/pin").send({ pinned: true }).expect(401);
    authenticated = true; role = "field";
    await app().patch("/api/notes/note/pin").send({ pinned: true }).expect(403);
    role = "office";
    await app().patch("/api/notes/note/pin").set("X-Company-Id", "previous").send({ pinned: true }).expect(409);
    expect(pinNote).not.toHaveBeenCalled();
  });
  it.each([{}, { pinned: "true" }, { pinned: null }, { pinned: true, pinnedAt: "2000-01-01" },
    { pinned: true, authorId: "attacker" }, { pinned: true, body: "overwrite" }])(
    "rejects malformed data and client-owned pin metadata: %j", async input => {
      await app().patch("/api/notes/note/pin").send(input).expect(400);
      expect(pinNote).not.toHaveBeenCalled();
    });
  it("foreign or nonexistent note cannot be pinned", async () => {
    pinNote.mockResolvedValue(undefined);
    await app().patch("/api/notes/foreign/pin").send({ pinned: true }).expect(404);
    expect(pinNote).toHaveBeenCalledExactlyOnceWith("foreign", "company", true);
  });
});
