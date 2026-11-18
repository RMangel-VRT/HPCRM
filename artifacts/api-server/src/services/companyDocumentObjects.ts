import { ObjectStorageService } from "../objectStorage";
import { COMPANY_DOCUMENT_MAX_BYTES } from "../../../../lib/db/src/companyDocumentContracts";
import { CustomerDocumentError } from "./customerDocumentContent";

export function companyDocumentRelativePath(path: string, company: string, document: string, privateDir: string) {
  const dir = privateDir.replace(/\/$/, "");
  const relative = path.startsWith("/objects/") ? path.slice(9) : path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : "";
  if (relative.split("/").some(p => !p || p === "." || p === ".." || p.includes("\\")) ||
    !relative.startsWith(`company-documents/${company}/${document}/`))
    throw new CustomerDocumentError(404, "COMPANY_DOCUMENT_NOT_FOUND");
  return relative;
}
export class CompanyDocumentObjects {
  private service = new ObjectStorageService();
  async upload(relative: string) {
    const result = await this.service.getScopedUploadURL(relative);
    return { uploadURL: result.uploadUrl, objectPath: result.storagePath };
  }
  async read(path: string, company: string, document: string) {
    const relative = companyDocumentRelativePath(path, company, document, this.service.getPrivateObjectDir());
    const file = await this.service.getObjectEntityFile(`/objects/${relative}`);
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of file.createReadStream()) {
      size += chunk.length;
      if (size > COMPANY_DOCUMENT_MAX_BYTES) throw new CustomerDocumentError(413, "COMPANY_DOCUMENT_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  async save(relative: string, bytes: Buffer, mime: string) {
    // Deliberately no generic-object ACL: access is exclusively through authorized document routes.
    await this.service.saveBufferToPrivatePath(relative, bytes, mime);
    return `/objects/${relative}`;
  }
  async remove(path: string, company: string, document: string) {
    await this.service.deletePrivatePath(companyDocumentRelativePath(path, company, document, this.service.getPrivateObjectDir()));
  }
}
