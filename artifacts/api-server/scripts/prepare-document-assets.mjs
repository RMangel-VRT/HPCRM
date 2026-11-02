import sharp from "sharp";
import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
const root = new URL("../../../", import.meta.url);
const output = new URL("../src/assets/documents/", import.meta.url);
await mkdir(output, { recursive: true });
for (const [source, target, width] of [
  ["LOGO_-_SPREAD-07_1773353516654.png", "hp-logo-white-horizontal.png", 720],
  ["LOGO_-_SPREAD-06_1773353516653.png", "hp-logo-badge.png", 720],
]) {
  await sharp(new URL(`attached_assets/${source}`, root).pathname, { limitInputPixels: false })
    .trim().resize({ width }).png().toFile(new URL(target, output).pathname);
}
const mountain = await sharp(new URL("attached_assets/Mountains_1773354108536.png", root).pathname, { limitInputPixels: false })
  .trim().resize({ width: 2000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < mountain.data.length; i += 4) {
  mountain.data[i] = 55; mountain.data[i + 1] = 68; mountain.data[i + 2] = 61;
}
await sharp(mountain.data, { raw: mountain.info }).png().toFile(new URL("mountains.png", output).pathname);
const require = createRequire(import.meta.url);
for (const weight of [400, 500, 600, 700]) await copyFile(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff2`), new URL(`inter-${weight}.woff2`, output));
await copyFile(require.resolve("@fontsource/inter/LICENSE"), new URL("Inter-LICENSE.txt", output));
