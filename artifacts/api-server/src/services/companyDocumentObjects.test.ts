import { expect, it } from "vitest";
import { companyDocumentRelativePath } from "./companyDocumentObjects";
it("permits only the exact company/document private namespace, normalized or bucket-qualified", () => {
  expect(companyDocumentRelativePath("/objects/company-documents/co/doc/accepted/a", "co", "doc", "/bucket/.private")).toBe("company-documents/co/doc/accepted/a");
  expect(companyDocumentRelativePath("/bucket/.private/company-documents/co/doc/pending/a", "co", "doc", "/bucket/.private/")).toBe("company-documents/co/doc/pending/a");
  for (const path of ["/objects/company-documents/other/doc/accepted/a", "/objects/company-documents/co/other/accepted/a",
    "/objects/company-documents/co/document/accepted/a", "/objects/company-documents/co/doc/../other",
    "/objects/company-documents/co/doc//a", "/objects/company-documents/co/doc/./a",
    "/objects/map-documents/co/doc/a", "/other-bucket/.private/company-documents/co/doc/a", "/objects/company-documents/co/doc/a\\b"])
    expect(() => companyDocumentRelativePath(path, "co", "doc", "/bucket/.private")).toThrow();
});
