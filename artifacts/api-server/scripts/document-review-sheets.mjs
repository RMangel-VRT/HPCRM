import sharp from "sharp";
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

// Run after pagination.test.ts. All inputs are fictional renderer fixtures.
const directory = fileURLToPath(new URL("../../../generated-artifacts/ic4-1/", import.meta.url));
const names = ["estimate-12", "estimate-60", "invoice-13-draft", "invoice-13-issued", "estimate-boundary", "invoice-boundary"];
const inventory = [];
for (const name of names) {
  const files = (await readdir(directory)).filter(f => new RegExp(`^${name}-\\d+\\.png$`).test(f)).sort();
  if (!files.length) throw new Error(`Missing evidence for ${name}`);
  const pdf = await PDFDocument.load(await readFile(`${directory}${name}.pdf`));
  if (files.length !== pdf.getPageCount()) throw new Error(`Stale or missing page PNGs for ${name}`);
  const tileWidth = 480, gap = 16, titleHeight = 60, labelHeight = 24;
  const tileHeight = Math.round(1056 / 816 * tileWidth);
  const columns = Math.min(3, files.length), rows = Math.ceil(files.length / columns);
  const width = columns * (tileWidth + gap) + gap;
  const height = titleHeight + rows * (tileHeight + labelHeight + gap);
  const svg = Buffer.from(`<svg width="${width}" height="${titleHeight}" xmlns="http://www.w3.org/2000/svg"><text x="16" y="25" font-size="18" font-family="sans-serif" fill="#37443d">${name}</text><text x="16" y="46" font-size="13" font-family="sans-serif" fill="#37443d">${files.length} page${files.length === 1 ? "" : "s"} · written specification review</text></svg>`);
  const composite = [{ input: svg, left: 0, top: 0 }];
  for (const [i, file] of files.entries()) {
    const left = gap + i % columns * (tileWidth + gap), top = titleHeight + Math.floor(i / columns) * (tileHeight + labelHeight + gap);
    composite.push({ input: await sharp(`${directory}${file}`).resize(tileWidth, tileHeight).png().toBuffer(), left, top });
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="18" font-size="13" font-family="sans-serif" fill="#37443d">Page ${i + 1} of ${files.length}</text></svg>`);
    composite.push({ input: label, left, top: top + tileHeight });
  }
  await sharp({ create: { width, height, channels: 3, background: "#e6e8e4" } }).composite(composite).png().toFile(`${directory}${name}-all-pages.png`);
  inventory.push({ fixture: name, pages: files.length, sheet: `${name}-all-pages.png`, fullPages: files });
}
await writeFile(`${directory}inventory.json`, JSON.stringify(inventory, null, 2));
console.log(JSON.stringify(inventory, null, 2));
