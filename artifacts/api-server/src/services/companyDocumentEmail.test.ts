import { beforeEach, expect, it, vi } from "vitest";
import { emailCompanyDocuments, previewCompanyDocuments, unambiguousDocumentCustomer, companyDocumentAttachmentName } from "./companyDocumentEmail";
import { PDFDocument } from "pdf-lib";
import { companyDocumentEmailInput } from "../../../../lib/db/src/companyDocumentContracts";
import { CustomerDocumentError } from "./customerDocumentContent";
import { DEFAULT_WORDING } from "./outgoingEmail/wording";
const user = { id: "editor", name: "Office", activeRole: "office" } as any;
const input = { mailboxAccountId: "mail", to: ["to@example.test"], subject: "Documents", note: " Hi <team> ", documentIds: ["doc"] };
const deps = {
  visible: vi.fn(async () => ({ mailboxIds: null as string[] | null, includeNullMailbox: true, scopeLabel: "All" })),
  company: vi.fn(async () => ({ name: "Fixture Company", addressLine: "123 Test St", phone: "", website: "", email: "" })),
  wording: vi.fn(async () => DEFAULT_WORDING.documents),
  mailbox: vi.fn(async () => ({ id: "mail", accountType: "shared", isActive: true, oauthTokenJson: { fixture: true }, displayName: "Office Mailbox", companyId: "co", syncEnabled: true, syncStatus: "connected", emailAddress: "office@example.test" })),
  repo: { get: vi.fn(async (_co: string, id: string) => ({ id, currentFileId: `file-${id}`, name: `COI ${id}` })),
    file: vi.fn(async (_co: string, id: string) => ({ id: `file-${id}`, filePath: `private/${id}`, fileSize: 5, fileType: "pdf", mimeType: "application/pdf" })) },
  objects: { read: vi.fn(async () => Buffer.from("bytes")) },
  matchCustomer: vi.fn(async () => null as string | null),
  record: vi.fn(async (values: any) => ({ ...values, id: "communication" })),
  stamp: vi.fn(async () => {}),
  send: vi.fn(async (_mail: string, _opts: unknown, id: string) => ({ messageId: "<real@mail.gmail.com>", reservedMessageId: id, gmailId: "internal", threadId: "thread" })),
};
beforeEach(() => {
  vi.clearAllMocks();
  deps.visible.mockResolvedValue({ mailboxIds: null, includeNullMailbox: true, scopeLabel: "All" });
  deps.mailbox.mockResolvedValue({ id: "mail", accountType: "shared", isActive: true, oauthTokenJson: { fixture: true }, displayName: "Office Mailbox", companyId: "co", syncEnabled: true, syncStatus: "connected", emailAddress: "office@example.test" });
  deps.objects.read.mockResolvedValue(Buffer.from("bytes"));
  deps.repo.file.mockImplementation(async (_co, id) => ({ id: `file-${id}`, filePath: `private/${id}`, fileSize: 5, fileType: "pdf", mimeType: "application/pdf" }));
  deps.send.mockImplementation(async (_mail, _opts, id) => ({ messageId: "<real@mail.gmail.com>", reservedMessageId: id, gmailId: "internal", threadId: "thread" }));
});
it("records exact current-file snapshots and RFC ID before sending one or several documents", async () => {
  await emailCompanyDocuments("co", user, { ...input, documentIds: ["doc", "doc2"] }, deps as any);
  const row = deps.record.mock.calls[0][0];
  expect(row).toMatchObject({ companyId: "co", customerId: null, direction: "outbound", fromName: "Office Mailbox", sentById: user.id, routingMethod: "company_documents", deliveryStatus: "pending",
    attachmentsJson: [{ kind: "company_document", documentId: "doc", fileId: "file-doc", fileName: "COI doc.pdf", fileSize: 5 },
      { kind: "company_document", documentId: "doc2", fileId: "file-doc2", fileName: "COI doc2.pdf", fileSize: 5 }] });
  expect(row.providerMessageId).toMatch(/^<.*@highplains.crm>$/);
  expect(deps.record.mock.invocationCallOrder[0]).toBeLessThan(deps.send.mock.invocationCallOrder[0]);
  expect(deps.send.mock.calls[0][2]).toBe(row.providerMessageId);
  expect(deps.send.mock.calls[0][1]).toMatchObject({ subject: row.subject, bodyHtml: row.bodyHtml, bodyText: row.bodyText });
  expect(deps.stamp).toHaveBeenCalledWith("co", "communication", expect.objectContaining({ deliveryStatus: "sent", providerThreadId: "thread", providerMessageId: "<real@mail.gmail.com>" }), expect.objectContaining({ reservedMessageId: row.providerMessageId }));
});
it("previews both documents, known page counts and the trimmed note without recording or sending", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage(); pdf.addPage();
  deps.objects.read.mockResolvedValueOnce(Buffer.from(await pdf.save()));
  const preview = await previewCompanyDocuments("co", user, { ...input, documentIds: ["doc", "doc2"] }, deps as any);
  expect(preview.html).toContain("Hi &lt;team&gt;");
  expect(preview.text).toContain("COI doc.pdf · 2 pages");
  expect(preview.text).toContain("COI doc2.pdf");
  expect(deps.record).not.toHaveBeenCalled();
  expect(deps.stamp).not.toHaveBeenCalled();
  expect(deps.send).not.toHaveBeenCalled();
});
it("uses the saved subject with the real attachment count unless the sender overrides it", async () => {
  deps.wording.mockResolvedValue({ ...DEFAULT_WORDING.documents, subject: "{documentCount} documents from {companyName}" });
  try {
    const args = { ...input, subject: undefined, documentIds: ["doc", "doc2"] };
    const preview = await previewCompanyDocuments("co", user, args, deps as any);
    expect(preview.subject).toBe("2 documents from Fixture Company");
    await emailCompanyDocuments("co", user, args, deps as any);
    expect(deps.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subject: preview.subject }), expect.any(String));
    expect((await previewCompanyDocuments("co", user, { ...args, subject: "Custom subject" }, deps as any)).subject).toBe("Custom subject");
  } finally {
    deps.wording.mockResolvedValue(DEFAULT_WORDING.documents);
  }
});
it.each(["foreign", "hidden", "disabled", "disconnected", "personal"])("rejects %s mailbox before reading files or recording", async kind => {
  if (kind === "hidden") deps.visible.mockResolvedValueOnce({ mailboxIds: [], includeNullMailbox: false, scopeLabel: "" });
  else deps.mailbox.mockResolvedValueOnce({ id: "mail", accountType: kind === "personal" ? "personal" : "shared", isActive: true, oauthTokenJson: { fixture: true }, displayName: "Office Mailbox", companyId: kind === "foreign" ? "other" : "co", syncEnabled: kind !== "disabled", syncStatus: kind === "disconnected" ? "error" : "connected", emailAddress: "office@example.test" });
  await expect(emailCompanyDocuments("co", user, input, deps as any)).rejects.toMatchObject({ status: 403 });
  expect(deps.objects.read).not.toHaveBeenCalled(); expect(deps.record).not.toHaveBeenCalled();
});
it("refuses archived/foreign documents and real byte totals over 20 MB before send", async () => {
  deps.repo.get.mockRejectedValueOnce(new CustomerDocumentError(404, "COMPANY_DOCUMENT_NOT_FOUND"));
  await expect(emailCompanyDocuments("co", user, input, deps as any)).rejects.toMatchObject({ status: 404 });
  deps.objects.read.mockResolvedValueOnce(Buffer.alloc(20 * 1024 * 1024 + 1));
  await expect(emailCompanyDocuments("co", user, input, deps as any)).rejects.toMatchObject({ code: "COMPANY_DOCUMENT_EMAIL_TOO_LARGE" });
  expect(deps.record).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
});
it("stamps failures with no automatic retry and retains the pre-saved RFC ID", async () => {
  deps.send.mockRejectedValueOnce(new Error("Reconnect Gmail"));
  await expect(emailCompanyDocuments("co", user, input, deps as any)).rejects.toMatchObject({ status: 502 });
  expect(deps.send).toHaveBeenCalledTimes(1);
  expect(deps.stamp).toHaveBeenCalledWith("co", "communication", { deliveryStatus: "failed", failureReason: "Reconnect Gmail" });
});
it("requires 1–10 recipients/documents, validates addresses and prevents header injection", () => {
  for (const change of [{ to: [] }, { to: ["bad"] }, { to: Array(10).fill("a@example.test"), cc: ["b@example.test"] },
    { documentIds: [] }, { documentIds: ["same", "same"] }, { subject: "Hello\r\nBcc:evil" }, { bodyText: "Legacy" }, { note: "x".repeat(2001) }])
    expect(companyDocumentEmailInput.safeParse({ ...input, ...change }).success).toBe(false);
  expect(companyDocumentEmailInput.safeParse({ ...input, documentIds: Array.from({ length: 10 }, (_, i) => String(i)) }).success).toBe(true);
});
it("matches only when every To points unambiguously to the same customer", () => {
  const candidates = [{ customerId: "a", emails: ["ONE@example.test", "two@example.test"] }];
  expect(unambiguousDocumentCustomer(["one@example.test", "two@example.test"], candidates)).toBe("a");
  expect(unambiguousDocumentCustomer(["unknown@example.test"], candidates)).toBeNull();
  expect(unambiguousDocumentCustomer(["one@example.test"], [...candidates, { customerId: "b", emails: ["one@example.test"] }])).toBeNull();
  expect(unambiguousDocumentCustomer(["one@example.test", "b@example.test"], [...candidates, { customerId: "b", emails: ["b@example.test"] }])).toBeNull();
  expect(companyDocumentAttachmentName('COI\r\n"evil/path', "pdf")).toBe("COI___evil_path.pdf");
});
