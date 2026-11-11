// First run scopeCleanup.test.ts to create the PDFs and per-page PNGs.
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../../../generated-artifacts/eb45/", import.meta.url));
for (const name of ["plants-scope", "services-only", "long-legal"]) {
  const files = (await readdir(dir)).filter(f => new RegExp(`^${name}-\\d+\\.png$`).test(f)).sort();
  if (!files.length) throw new Error(`Missing ${name} render evidence`);
  const width = 612, height = 792, gap = 12;
  const images = await Promise.all(files.map(async (file, i) => ({
    input: await sharp(`${dir}${file}`).resize(width, height).toBuffer(),
    left: (i % 2) * (width + gap), top: Math.floor(i / 2) * (height + gap),
  })));
  await sharp({ create: { width: width * 2 + gap, height: Math.ceil(files.length / 2) * (height + gap) - gap, channels: 3, background: "#cccccc" } })
    .composite(images).png().toFile(`${dir}${name}-review.png`);
}
