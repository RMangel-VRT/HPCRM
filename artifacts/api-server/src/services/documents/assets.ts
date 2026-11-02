import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Source module and bundled dist/index.mjs have different depths. Neither uses cwd.
const candidates = [new URL("../../assets/documents/", import.meta.url), new URL("./assets/documents/", import.meta.url)];
const base = candidates.find(url => existsSync(fileURLToPath(new URL("inter-400.woff2", url))));
const cache = new Map<string, Buffer>();
export function documentAsset(name: string): Buffer {
  if (!base || !/^(inter-(400|500|600|700)\.(woff2|ttf)|hp-logo-(white-horizontal|badge)\.png|mountains\.png)$/.test(name)) throw new Error("DOCUMENT_ASSET_UNAVAILABLE");
  if (!cache.has(name)) cache.set(name, readFileSync(new URL(name, base)));
  return cache.get(name)!;
}
export const assetUri = (name: string) => `data:${name.endsWith(".png") ? "image/png" : "font/woff2"};base64,${documentAsset(name).toString("base64")}`;
