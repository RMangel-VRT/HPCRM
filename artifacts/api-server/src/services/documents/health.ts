import { DocumentRendererUnavailable, type DiscoveryReport, type RendererFailure } from "./browser";
import { renderDocumentPdf } from "./render";
import { logger } from "../../lib/logger";

export interface RendererStatus extends DiscoveryReport {
  status: "ready" | "unavailable";
  reason: RendererFailure | null;
  browserVersion: string | null;
  checkedAt: string;
}
export async function checkDocumentRenderer(signal?: AbortSignal): Promise<RendererStatus> {
  let discovery: DiscoveryReport = { executableSource: null, attempts: [] };
  let browserVersion: string | null = null;
  try {
    await renderDocumentPdf({
      html: "<!doctype html><html><body><p>PDF engine check</p></body></html>",
      footerLabel: "PDF engine check", shortHeaderNumber: "PDF engine check",
    }, { signal, overallTimeoutMs: 20_000, onDiscovery: report => { discovery = report; },
      onBrowser: async instance => { browserVersion = await instance.version(); } });
    return { status: "ready", reason: null, ...discovery, browserVersion, checkedAt: new Date().toISOString() };
  } catch (error) {
    const reason = error instanceof DocumentRendererUnavailable ? error.reason : "RENDER_FAILED";
    if (error instanceof DocumentRendererUnavailable) discovery = error.discovery;
    logger.warn({ reason }, "DOCUMENT_RENDERER_UNAVAILABLE");
    return { status: "unavailable", reason, ...discovery, browserVersion: null, checkedAt: new Date().toISOString() };
  }
}
