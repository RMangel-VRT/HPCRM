import { expect, it } from "vitest";
import { communications, users } from "@workspace/db";
import { db, inTransaction } from "../db";
import { hasSyncedCommunication, parseGmailMessage } from "./emailSyncService";
import { companyDocumentSends } from "./companyDocumentEmail";
import { companyDocumentRepository } from "./companyDocuments";

it("deduplicates a null-customer sent copy by RFC ID and reads exact JSONB send history in-company", async () => {
  const rollback = new Error("rollback fixture");
  await expect(db.transaction(async tx => {
    for (const table of ["communications", "users", "company_documents"])
      await tx.execute(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
    await inTransaction(tx, async () => {
      await tx.insert(users).values({ id: "u", name: "Office", passwordHash: "not-a-login" });
      const { companyDocuments } = await import("@workspace/db");
      await tx.insert(companyDocuments).values({ id: "doc", companyId: "co", name: "COI", category: "insurance" });
      await tx.insert(communications).values([
        { companyId: "co", type: "email", customerId: null, subject: "COI", body: "Attached", direction: "outbound", status: "sent",
          fromName: "Office", providerMessageId: "<saved@highplains.crm>", routingMethod: "company_documents", deliveryStatus: "sent",
          attachmentsJson: [{ kind: "company_document", documentId: "doc", fileId: "exact-file", fileName: "COI.pdf", fileSize: 123 }] },
        { companyId: "other", type: "email", customerId: null, subject: "Foreign", body: "Secret", direction: "outbound", status: "sent",
          routingMethod: "company_documents", attachmentsJson: [{ kind: "company_document", documentId: "doc" }] },
      ]);
      const parsed = parseGmailMessage({ id: "gmail-internal-not-rfc", threadId: "thread", payload: { headers: [
        { name: "From", value: "office@example.test" }, { name: "Message-ID", value: "<saved@highplains.crm>" },
      ] } })!;
      expect(parsed.providerMessageId).toBe("<saved@highplains.crm>");
      expect(await hasSyncedCommunication("co", parsed.providerMessageId)).toBe(true);
      expect(await hasSyncedCommunication("other", parsed.providerMessageId)).toBe(false);
      expect(await hasSyncedCommunication("co", "gmail-internal-not-rfc")).toBe(false);
      expect(await companyDocumentSends("co", "doc")).toMatchObject([{ subject: "COI", sentByName: "Office" }]);
      await expect(companyDocumentRepository.get("other", "doc")).rejects.toMatchObject({ status: 404 });
      // Inbox predicates cannot match an outbound/null-customer send.
      expect((await tx.execute("SELECT id FROM communications WHERE company_id='co' AND direction='inbound'")).rows).toEqual([]);
    });
    throw rollback;
  })).rejects.toBe(rollback);
});
