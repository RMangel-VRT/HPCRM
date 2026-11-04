import { readFileSync } from "node:fs";

// The deployment build captures its own Nix closure, never a development override.
// Explicit runtime overrides retain precedence and are diagnosed by the status check.
if (!process.env.PUPPETEER_EXECUTABLE_PATH && !process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  const { executablePath } = JSON.parse(readFileSync(new URL("../dist/document-runtime.json", import.meta.url), "utf8"));
  process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
}
await import("../dist/index.mjs");
