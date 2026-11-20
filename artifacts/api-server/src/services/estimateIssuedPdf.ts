import { ESTIMATE_ISSUED_PDF_PREFIX, ObjectStorageService } from "../objectStorage";

// Only server-generated identities are used here. The authorized estimate
// version stores the reference; there is no generic URL or upload grant.
const path = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid issued estimate object identity");
  return `${ESTIMATE_ISSUED_PDF_PREFIX}${id}.pdf`;
};
export const issuedEstimatePdfs = {
  async save(id: string, bytes: Buffer) {
    await new ObjectStorageService().saveBufferToPrivatePath(path(id), bytes, "application/pdf");
  },
  async read(id: string) {
    const file = await new ObjectStorageService().getObjectEntityFile(`/objects/${path(id)}`, { allowIssuedEstimatePdf: true });
    return (await file.download())[0];
  },
  async remove(id: string) { await new ObjectStorageService().deletePrivatePath(path(id)); },
};
