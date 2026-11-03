import type { ProposalWithDetails } from "@workspace/db";
import type { ProposalExhibits } from "../../../../lib/db/src/plantExhibitContracts";
import { PALETTE_CATEGORY_LABEL_MAP } from "../../../../lib/db/src/plantExhibitContracts";
import { ObjectStorageService } from "../objectStorage";
import { renderVisualScope } from "../visualScopeRenderer";
import { coloradoDate, loadEstimateDocumentModel } from "./estimatePdf";
import { buildProposalDocumentModel, proposalDocumentHtml, type DocumentImage } from "./documents/proposal";
import { chromiumPdf } from "./documents/browser";
import { stampDocument } from "./documents/stamp";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

/** Decode, rotate, bound both dimensions, strip metadata and compress before embedding. */
export async function proposalImageUri(bytes: Buffer): Promise<string> {
  const compressed = await sharp(bytes, { limitInputPixels: 80_000_000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
  return `data:image/jpeg;base64,${compressed.toString("base64")}`;
}
/** Trusted scoped storage paths only. Never fetch a supplied URL, including enrichment URLs. */
export async function loadProposalDocumentModel(companyId: string, p: ProposalWithDetails, exhibits: ProposalExhibits) {
  if (p.companyId !== companyId || !p.estimateId || exhibits.provenance.estimateId !== p.estimateId) throw new Error("PROPOSAL_DOCUMENT_SCOPE_MISMATCH");
  const estimate = await loadEstimateDocumentModel(companyId, p.estimateId, exhibits.provenance.versionId);
  const storage = new ObjectStorageService();
  const cache = new Map<string, Promise<string | null>>();
  const image = (path: string | null): Promise<string | null> => {
    if (!path || !path.startsWith("/") || path.startsWith("//")) return Promise.resolve(null);
    if (!cache.has(path)) cache.set(path, (async () => {
      try {
        const bytes = path.startsWith("/objects/")
          ? (await (await storage.getObjectEntityFile(path)).download())[0] as Buffer
          : await storage.downloadByPath(path);
        return await proposalImageUri(bytes);
      }
      catch { return null; } // A missing/corrupt individual image never invalidates commercial pages.
    })());
    return cache.get(path)!;
  };
  const photos = [];
  for (const file of [...p.files].sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))) {
    if (file.companyId !== companyId || file.proposalId !== p.id || file.fileType !== "image" || !file.mimeType.startsWith("image/")) continue;
    const dataUri = await image(file.storageObjectPath);
    if (dataUri) photos.push({ caption: file.caption ?? "", dataUri, order: file.displayOrder, id: file.id });
  }
  const visualScope: DocumentImage[] = [];
  let visualHero: DocumentImage | null = null;
  const sheet = p.visualScopeSheet;
  if (sheet && sheet.companyId === companyId && sheet.id === p.visualScopeSheetId && sheet.baseImagePath) {
    for (const kind of ["combined", ...(p.vsIncludeBase ? ["base"] : []), ...(p.vsIncludeOverlay ? ["overlay"] : [])] as ("combined" | "base" | "overlay")[]) {
      try {
        const dataUri = await proposalImageUri(await renderVisualScope(sheet, kind, 1600));
        const figure = { caption: kind === "combined" ? "Visual Scope" : kind === "base" ? "Existing conditions" : "Scope overlay", dataUri };
        visualScope.push(figure);
        if (kind === "combined") visualHero = figure;
      } catch { /* Missing individual rendering: skip, including cover fallback. */ }
    }
  }
  const groups = [];
  if (p.includePlantPalette !== false) for (const group of exhibits.palette.groups) {
    const cards = [];
    for (const card of group.cards) cards.push({ name: card.name, typeLabel: card.typeLabel, dataUri: await image(card.imagePath) });
    groups.push({ label: PALETTE_CATEGORY_LABEL_MAP[group.category] ?? group.category, cards });
  }
  return buildProposalDocumentModel({
    title: p.title, number: p.proposalNumber, documentDate: p.proposalDate || coloradoDate(new Date()),
    scopeOfWork: p.scopeOfWork, customerName: estimate.customerName, customerAddress: estimate.customerAddress,
    workLocation: estimate.workLocation, estimate, coverSource: p.coverSource ?? "none",
    hero: p.coverSource === "photo" ? photos.find(f => f.id === p.coverPhotoFileId) ?? null : p.coverSource === "visual_scope" ? visualHero : null,
    visualScope, palette: { introText: exhibits.palette.introText, groups },
    schedule: p.includePlantSchedule !== false ? exhibits.schedule : [], photos, photoLayout: p.photoLayout,
  });
}
/** Render prefix first: its last page is acceptance, independent of attachment count/layout. */
export async function renderProposalDocument(model: ReturnType<typeof buildProposalDocumentModel>): Promise<Buffer> {
  const prefix = await chromiumPdf(proposalDocumentHtml(model, false));
  const endOfDocumentPage = (await PDFDocument.load(prefix)).getPageCount() - 1;
  const bytes = model.photos.length ? await chromiumPdf(proposalDocumentHtml(model)) : prefix;
  const result = await stampDocument(bytes, { footerLabel: `Proposal ${model.number} · ${model.customerName}`,
    shortHeaderNumber: model.number, draft: model.estimate.draft, coverPages: 1, endOfDocumentPage });
  if (result.length > 25 * 1024 * 1024) throw Object.assign(new Error("Generated PDF exceeds the 25 MB limit. Reduce the number or size of photos."), { statusCode: 400 });
  return result;
}
export async function renderLinkedProposal(companyId: string, proposal: ProposalWithDetails, exhibits: ProposalExhibits): Promise<Buffer> {
  return renderProposalDocument(await loadProposalDocumentModel(companyId, proposal, exhibits));
}
