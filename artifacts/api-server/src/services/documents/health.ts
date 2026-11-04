import { DocumentRendererUnavailable, resolveChromiumExecutable, type ExecutableSource, type RendererFailure } from "./browser";
import { renderDocumentPdf } from "./render";
import { logger } from "../../lib/logger";

export interface RendererStatus {
  status: "ready" | "unavailable";
  reason: RendererFailure | null;
  executableSource: ExecutableSource | null;
  browserVersion: string | null;
  checkedAt: string;
}
export async function checkDocumentRenderer(signal?: AbortSignal): Promise<RendererStatus> {
  const started = performance.now();
  let executableSource: ExecutableSource | null = null;
  let browserVersion: string | null = null;
  try {
    // Preserve the selected source even for an invalid configured executable.
    executableSource = process.env.PUPPETEER_EXECUTABLE_PATH ? "PUPPETEER_EXECUTABLE_PATH"
      : process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ? "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE" : null;
    executableSource = resolveChromiumExecutable().source;
    await renderDocumentPdf({
      html: "<!doctype html><html><body><p>PDF engine check</p></body></html>",
      footerLabel: "PDF engine check", shortHeaderNumber: "PDF engine check",
    }, { signal, overallTimeoutMs: Math.max(1, 20_000 - (performance.now() - started)), onBrowser: async instance => { browserVersion = await instance.version(); } });
    return { status: "ready", reason: null, executableSource, browserVersion, checkedAt: new Date().toISOString() };
  } catch (error) {
    const reason = error instanceof DocumentRendererUnavailable ? error.reason : "RENDER_FAILED";
    logger.warn({ reason }, "DOCUMENT_RENDERER_UNAVAILABLE");
    return { status: "unavailable", reason, executableSource, browserVersion: null, checkedAt: new Date().toISOString() };
  }
}
