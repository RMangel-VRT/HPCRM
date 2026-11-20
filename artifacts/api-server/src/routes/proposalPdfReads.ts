import type { Express, Response } from "express";
import type { ProposalVersionWithUser, ProposalWithDetails } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { estimateAccess } from "../lib/estimateAccess";

type PdfSources = {
  getProposal(id: string, companyId: string): Promise<ProposalWithDetails | undefined>;
  getVersion(id: string, companyId: string): Promise<ProposalVersionWithUser | undefined>;
  loadStoredPdf(path: string): Promise<Buffer>;
  renderDraft(proposal: ProposalWithDetails, companyId: string): Promise<Buffer>;
};

function sendPdf(res: Response, bytes: Buffer, proposal: ProposalWithDetails, inline: boolean, version?: ProposalVersionWithUser) {
  const safe = (s: string, length: number) => s.replace(/[/\\:*?"<>|]/g, "-").trim().substring(0, length);
  const title = safe(proposal.title || "", 80) || "Proposal";
  const customer = safe(proposal.customerName || "", 60) || "Client";
  const date = (version?.proposalDate || proposal.proposalDate || new Date().toISOString()).slice(0, 10);
  const filename = `${title} - ${customer}${version ? ` - v${version.versionNumber}` : ""} - ${date}.pdf`;
  res.attachment(filename).type("application/pdf");
  if (inline) res.setHeader("Content-Disposition", String(res.getHeader("Content-Disposition")).replace(/^attachment/, "inline"));
  res.end(bytes);
}

export function registerProposalPdfReads(app: Express, sources: PdfSources) {
  async function sendStored(res: Response, proposal: ProposalWithDetails, version: ProposalVersionWithUser, inline: boolean): Promise<void> {
    let bytes: Buffer;
    try {
      bytes = await sources.loadStoredPdf(version.pdfStoragePath);
    } catch (err) {
      res.req.log?.error({ err }, "Could not read stored proposal PDF");
      res.status(500).send("Failed to retrieve the stored proposal PDF.");
      return;
    }
    sendPdf(res, bytes, proposal, inline, version);
  }

  app.get("/api/proposals/:id/pdf", estimateAccess, async (req, res): Promise<void> => {
    const { activeCompanyId } = req.user as UserWithContext;
    const { id } = req.params;
    const proposal = typeof id === "string" ? await sources.getProposal(id, activeCompanyId) : undefined;
    if (!proposal) { res.status(404).send("Proposal not found"); return; }
    const inline = req.query.inline === "1";
    const issued = proposal.status === "finalized" || proposal.status === "published";
    const hasDraftSource = !!proposal.estimateId || proposal.files.some(file => file.fileType === "estimate_pdf");
    if (issued || !hasDraftSource) {
      // The former finalize action created an immutable version without changing
      // the proposal's draft status. Use that copy if no live draft source remains.
      const latest = proposal.versions.filter(v => v.companyId === activeCompanyId)
        .reduce<ProposalVersionWithUser | undefined>((max, v) => !max || v.versionNumber > max.versionNumber ? v : max, undefined);
      if (!latest) { res.status(404).send("No stored proposal PDF is available."); return; }
      return sendStored(res, proposal, latest, inline);
    }

    let bytes: Buffer;
    try {
      bytes = await sources.renderDraft(proposal, activeCompanyId);
    } catch (err) {
      const problem = err as { statusCode?: number; message?: string };
      res.status(problem.statusCode ?? 500).send(problem.message ?? "PDF generation failed");
      return;
    }
    sendPdf(res, bytes, proposal, inline);
  });

  app.get("/api/proposals/:id/versions/:versionId/download", estimateAccess, async (req, res): Promise<void> => {
    const { activeCompanyId } = req.user as UserWithContext;
    const { id, versionId } = req.params;
    const version = typeof versionId === "string" ? await sources.getVersion(versionId, activeCompanyId) : undefined;
    if (typeof id !== "string" || !version || version.proposalId !== id) { res.status(404).send("Version not found"); return; }
    const proposal = await sources.getProposal(id, activeCompanyId);
    if (!proposal) { res.status(404).send("Proposal not found"); return; }
    return sendStored(res, proposal, version, req.query.inline === "1");
  });
}
