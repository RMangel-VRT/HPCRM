import { ObjectStorageService } from "../objectStorage";
import { setObjectAclPolicy, ObjectAccessGroupType, ObjectPermission } from "../objectAcl";
import { CUSTOMER_DOCUMENT_MAX_BYTES } from "../../../../lib/db/src/customerDocumentContracts";
import { CustomerDocumentError } from "./customerDocumentContent";

/** Only the existing customer-file namespace is eligible, never terms or KML.
 * Accept legacy full bucket paths and normalized paths without changing stored paths.
 */
export function customerDocumentRelativePath(path: string, companyId: string, customerId: string, privateDir: string) {
  const dir = privateDir.replace(/\/$/, "");
  const relative = path.startsWith("/objects/") ? path.slice("/objects/".length)
    : path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : null;
  if (!relative || relative.split("/").some(p => !p || p === "." || p === "..") ||
    !relative.startsWith(`map-documents/${companyId}/${customerId}/`))
    throw new CustomerDocumentError(404, "DOCUMENT_NOT_FOUND");
  return relative;
}

export class CustomerDocumentObjects {
  private service = new ObjectStorageService();
  private relative(path: string, company: string, customer: string) {
    return customerDocumentRelativePath(path, company, customer, this.service.getPrivateObjectDir());
  }
  async upload(relative: string) {
    const result = await this.service.getScopedUploadURL(relative);
    return { uploadURL: result.uploadUrl, objectPath: result.storagePath };
  }
  async read(path: string, company: string, customer: string) {
    const file = await this.service.getObjectEntityFile(`/objects/${this.relative(path, company, customer)}`);
    // Stream-bounded actual bytes, never trust GCS size or caller metadata.
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of file.createReadStream()) {
      size += chunk.length;
      if (size > CUSTOMER_DOCUMENT_MAX_BYTES) throw new CustomerDocumentError(413, "DOCUMENT_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  async save(relative: string, buffer: Buffer, mime: string, user: string, company: string) {
    await this.service.saveBufferToPrivatePath(relative, buffer, mime);
    const file = await this.service.getObjectEntityFile(`/objects/${relative}`);
    await setObjectAclPolicy(file, { owner: user, visibility: "private", aclRules: [
      { group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: company }, permission: ObjectPermission.READ },
    ] });
    return `/objects/${relative}`;
  }
  async remove(path: string, company: string, customer: string) {
    // ignoreNotFound is idempotent; every other storage error propagates.
    await this.service.deletePrivatePath(this.relative(path, company, customer));
  }
}
