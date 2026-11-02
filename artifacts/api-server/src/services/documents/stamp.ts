import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { documentAsset } from "./assets";

const green = rgb(55 / 255, 68 / 255, 61 / 255), lime = rgb(140 / 255, 198 / 255, 64 / 255), secondary = rgb(79 / 255, 90 / 255, 83 / 255);
const px = (n: number) => n * .75;
export interface StampInput { footerLabel: string; shortHeaderNumber: string; draft?: boolean }
export async function stampDocument(bytes: Buffer, input: StampInput): Promise<Buffer> {
  const pdf = await PDFDocument.load(bytes);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(documentAsset("inter-400.ttf"), { subset: true });
  const bold = await pdf.embedFont(documentAsset("inter-700.ttf"), { subset: true });
  const logo = await pdf.embedPng(documentAsset("hp-logo-white-horizontal.png"));
  const mountains = await pdf.embedPng(documentAsset("mountains.png"));
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const lineY = px(47);
    if (i > 0) {
      page.drawRectangle({ x: 0, y: height - px(78), width, height: px(78), color: green });
      page.drawRectangle({ x: 0, y: height - px(84), width, height: px(6), color: lime });
      page.drawImage(logo, { x: px(64), y: height - px(64), height: px(48), width: px(48) * logo.width / logo.height });
      const text = input.shortHeaderNumber;
      page.drawText(text, { x: width - px(64) - font.widthOfTextAtSize(text, 11), y: height - px(47), size: 11, font, color: rgb(214 / 255, 236 / 255, 184 / 255) });
    }
    if (i === pages.length - 1) {
      const artHeight = width * mountains.height / mountains.width;
      page.pushOperators(pushGraphicsState(), rectangle(0, lineY, width, px(84)), clip(), endPath());
      page.drawImage(mountains, { x: 0, y: lineY + px(84) - artHeight, width, height: artHeight, opacity: .6 });
      page.pushOperators(popGraphicsState());
    }
    page.drawLine({ start: { x: 0, y: lineY }, end: { x: width, y: lineY }, thickness: px(1.5), color: green });
    // Fit long customer/footer notes without overlapping the page count.
    const count = `Page ${i + 1} of ${pages.length}`, label = input.footerLabel.replace(/[\r\n\t]+/g, " ");
    const available = width - px(128) - font.widthOfTextAtSize(count, 9) - 16;
    const size = Math.min(9, available / Math.max(1, font.widthOfTextAtSize(label, 1)));
    page.drawText(label, { x: px(64), y: px(22), size, font, color: secondary });
    page.drawText(count, { x: width - px(64) - font.widthOfTextAtSize(count, 9), y: px(22), size: 9, font, color: secondary });
    if (input.draft) page.drawText("DRAFT", { x: width * .2, y: height * .37, font: bold, size: 100, rotate: degrees(35), color: green, opacity: .06 });
  });
  return Buffer.from(await pdf.save());
}
