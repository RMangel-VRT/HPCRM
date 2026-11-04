import { chromiumPdf, type RenderOptions } from "./browser";
import { stampDocument, type StampInput } from "./stamp";
export { closeDocumentBrowser } from "./browser";
/** HTML is one self-contained flow; decoration runs only after pagination is final. */
export async function renderDocumentPdf(input: StampInput & { html: string }, options?: RenderOptions): Promise<Buffer> {
  return chromiumPdf(input.html, bytes => stampDocument(bytes, input), options);
}
