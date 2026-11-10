import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole } from "../../../../lib/db/src/accessRole";
const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: query }) }) }) } }));
import { customerDocumentRawAccess } from "./customerDocumentRawAccess";

beforeEach(() => { query.mockReset(); query.mockResolvedValue([{ companyId: "company" }]); });
describe("CP5 raw-object retrieval cannot bypass document authorization", () => {
  it("denies pending, rejected, accepted and deleted customer paths even with ACL permission", async () => {
    for (const path of ["/objects/map-documents/company/customer/pending/token", "/objects/map-documents/company/customer/accepted"]) {
      expect(await customerDocumentRawAccess(path, { accessRole: "admin", activeCompanyId: "company" } as any)).toBe(false);
    }
    expect(query).not.toHaveBeenCalled();
  });
  it.each(["field", "crew_supervisor", "mapping", "field_manager", "shop_manager", "landscape_supervisor"])("denies %s a known term object path", async role => {
    expect(await customerDocumentRawAccess("/objects/uploads/term", { accessRole: role, activeCompanyId: "company" } as any)).toBe(false);
  });
  it.each(["admin", "office", "account_manager"])("permits same-company privileged %s, never another active company", async role => {
    expect(await customerDocumentRawAccess("/objects/uploads/term", { accessRole: accessRole(role), activeCompanyId: "company" } as any)).toBe(true);
    expect(await customerDocumentRawAccess("/objects/uploads/term", { accessRole: accessRole(role), activeCompanyId: "other" } as any)).toBe(false);
  });
  it("leaves unrelated existing object ACL handling unchanged", async () => {
    query.mockResolvedValue([]);
    expect(await customerDocumentRawAccess("/objects/map-layers/company/customer/layer", { accessRole: "field", activeCompanyId: "company" } as any)).toBe(true);
  });
});
