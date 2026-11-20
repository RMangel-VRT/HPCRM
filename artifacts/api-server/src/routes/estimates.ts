import { Router, type Express, type RequestHandler } from "express";
import { z } from "zod/v4";
import { createEstimateSchema, patchEstimateSchema, patchEstimateVersionSchema, createEstimateSectionSchema, patchEstimateSectionSchema,
  createEstimateLineSchema, patchEstimateLineSchema, estimateListQuerySchema, estimateDetailQuerySchema, estimateIdSchema,
   sendEstimateSchema, acceptEstimateSchema, estimateReasonSchema, emptyEstimateActionSchema, reviseEstimateSchema, catalogMatchesQuerySchema } from "@workspace/db";
import { PutEstimateWorkLocationBody, PutEstimateWorkLocationResponse } from "@workspace/api-zod";
import { estimateOrderSchema, replaceEstimateLineSchema, estimatePhotoUploadSchema, registerEstimatePhotoSchema,
  estimatePhotoCaptionSchema, estimatePhotoOrderSchema } from "@workspace/db/estimate-contracts";
import type { UserWithContext } from "../auth";
import { estimateAccess } from "../lib/estimateAccess";
import { logger } from "../lib/logger";
import { EstimateError, postgresCode } from "../services/estimateErrors";
import { listEstimates, readEstimate } from "../services/estimateReads";
import { createEstimate, retitleEstimate, patchVersion, createSection, patchSection, deleteSection, createLine, patchLine, deleteLine,
  reorderEstimate, duplicateEstimateLine, replaceEstimateLine } from "../services/estimates";
import { transitionEstimate } from "../services/estimateLifecycle";
import { readTicketEstimate } from "../services/ticketEstimates";
import { renderEstimatePdfFile } from "../services/estimatePdf";
import { DocumentRendererUnavailable } from "../services/documents/browser";
import { customerActivation } from "../services/customerActivation";
import { catalogMatches } from "../services/estimateCatalogSaves";
import { rejectDirectEstimateLocationWrite, updateEstimateWorkLocation } from "../services/estimateWorkLocation";
import { readEstimatePhoto, startEstimatePhotoUpload, registerEstimatePhoto, patchEstimatePhoto, removeEstimatePhoto, orderEstimatePhotos } from "../services/estimatePhotos";
import { ObjectNotFoundError, ObjectStorageService } from "../objectStorage";
import { canWriteCrewWorksheets } from "../lib/crewWorksheetAccess";
import { generateEstimateCrewWorksheet } from "../services/estimateCrewWorksheet";

const handle = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "INVALID_REQUEST" }); return; }
    if (error instanceof EstimateError) { res.status(error.status).json({ error: error.error, ...error.extra }); return; }
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "PHOTO_NOT_FOUND" }); return; }
    if (error instanceof RangeError) { res.status(422).json({ error: "AMOUNT_OUT_OF_RANGE" }); return; }
    const code = postgresCode(error);
    if (code === "23505") { res.status(409).json({ error: "CONFLICT" }); return; }
    // Never log the error object/message: PG detail can contain commercial/customer data.
    (req.log ?? logger).error({ code: code && /^[0-9A-Z]{5}$/.test(code) ? code : "ESTIMATE_ERROR" }, "Estimate request failed");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
};
const pathSchema = z.object({ id: estimateIdSchema, versionId: estimateIdSchema.optional(), sectionId: estimateIdSchema.optional(), lineId: estimateIdSchema.optional(), photoId: estimateIdSchema.optional() });
export function registerEstimateRoutes(app: Express) {
  const router = Router();
  router.use(estimateAccess);
  router.get("/catalog-matches", handle(async (req, res) => {
    res.json(await catalogMatches((req.user as UserWithContext).activeCompanyId, catalogMatchesQuerySchema.parse(req.query)));
  }));
  router.get("/", handle(async (req, res) => {
    res.json(await listEstimates((req.user as UserWithContext).activeCompanyId, estimateListQuerySchema.parse(req.query)));
  }));
  router.post("/", handle(async (req, res) => {
    const user = req.user as UserWithContext;
    res.status(201).json(await createEstimate(user.activeCompanyId, user.id, createEstimateSchema.parse(req.body)));
  }));
  router.get("/by-ticket/:ticketId", handle(async (req, res) => {
    const ticketId = estimateIdSchema.parse(req.params.ticketId);
    res.json(await readTicketEstimate((req.user as UserWithContext).activeCompanyId, ticketId));
  }));
  router.get("/:id", handle(async (req, res) => {
    const { id } = pathSchema.parse(req.params);
    res.json(await readEstimate((req.user as UserWithContext).activeCompanyId, id, estimateDetailQuerySchema.parse(req.query).version));
  }));
  router.patch("/:id", handle(async (req, res) => {
    const { id } = pathSchema.parse(req.params);
    const { activeCompanyId } = req.user as UserWithContext;
    if (req.body && ["workLocationLabel", "workLocationDescription", "work_location_label", "work_location_description"]
      .some(key => Object.hasOwn(req.body, key))) await rejectDirectEstimateLocationWrite(activeCompanyId, id);
    res.json(await retitleEstimate(activeCompanyId, id, patchEstimateSchema.parse(req.body).title));
  }));
  router.put("/:id/work-location", handle(async (req, res) => {
    const { id } = pathSchema.parse(req.params);
    const user = req.user as UserWithContext;
    const parsed = PutEstimateWorkLocationBody.strict().safeParse(req.body);
    if (!parsed.success) throw new EstimateError(400, "INVALID_REQUEST");
    const { label, details } = parsed.data;
    const resolved = await updateEstimateWorkLocation(user.activeCompanyId, user.id, id,
      { label: label?.trim() || null, details: details?.trim() || null });
    res.json(PutEstimateWorkLocationResponse.parse(resolved));
  }));
  const versionPath = "/:id/versions/:versionId";
  router.patch(versionPath, handle(async (req, res) => {
    const { id, versionId } = pathSchema.parse(req.params);
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).length === 0)
      throw new EstimateError(400, "EMPTY_PATCH");
    const input = patchEstimateVersionSchema.parse(req.body);
    res.json(await patchVersion((req.user as UserWithContext).activeCompanyId, id, versionId!, input));
  }));
  const photoScope = (req: Parameters<RequestHandler>[0]) => {
    const user = req.user as UserWithContext;
    const { id, versionId } = pathSchema.parse(req.params);
    return { companyId: user.activeCompanyId, userId: user.id, sessionId: req.sessionID, estimateId: id, versionId: versionId! };
  };
  router.post(`${versionPath}/photos/upload-url`, handle(async (req, res) => {
    res.json(await startEstimatePhotoUpload(photoScope(req), estimatePhotoUploadSchema.parse(req.body)));
  }));
  router.post(`${versionPath}/photos`, handle(async (req, res) => {
    res.status(201).json(await registerEstimatePhoto(photoScope(req), registerEstimatePhotoSchema.parse(req.body).uploadToken));
  }));
  router.put(`${versionPath}/photos/order`, handle(async (req, res) => {
    const { companyId, estimateId, versionId } = photoScope(req);
    res.json(await orderEstimatePhotos(companyId, estimateId, versionId, estimatePhotoOrderSchema.parse(req.body).photoIds));
  }));
  router.patch(`${versionPath}/photos/:photoId`, handle(async (req, res) => {
    const { companyId, estimateId, versionId } = photoScope(req);
    res.json(await patchEstimatePhoto(companyId, estimateId, versionId, estimateIdSchema.parse(req.params.photoId),
      estimatePhotoCaptionSchema.parse(req.body).caption));
  }));
  router.delete(`${versionPath}/photos/:photoId`, handle(async (req, res) => {
    const { companyId, estimateId, versionId } = photoScope(req);
    res.json(await removeEstimatePhoto(companyId, estimateId, versionId, estimateIdSchema.parse(req.params.photoId)));
  }));
  router.get(`${versionPath}/photos/:photoId`, handle(async (req, res) => {
    const { companyId, estimateId, versionId } = photoScope(req);
    if (req.query.company !== undefined && req.query.company !== companyId) throw new EstimateError(404, "NOT_FOUND");
    const photo = await readEstimatePhoto(companyId, estimateId, versionId, estimateIdSchema.parse(req.params.photoId));
    const file = await new ObjectStorageService().getObjectEntityFile(photo.storageObjectPath, { allowEstimatePhoto: true });
    const [bytes] = await file.download();
    res.set("X-Content-Type-Options", "nosniff").type(photo.mimeType).send(bytes);
  }));
  router.post(`${versionPath}/crew-worksheet`, handle(async (req, res) => {
    if (!canWriteCrewWorksheets((req.user as UserWithContext).activeRole)) throw new EstimateError(403, "FORBIDDEN");
    const { companyId, userId, estimateId, versionId } = photoScope(req);
    emptyEstimateActionSchema.parse(req.body ?? {});
    res.status(201).json(await generateEstimateCrewWorksheet(companyId, userId, estimateId, versionId));
  }));
  router.get(`${versionPath}/pdf`, async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const { id, versionId } = pathSchema.parse(req.params);
      const companyId = (req.user as UserWithContext).activeCompanyId;
      const { pdf, filename } = await renderEstimatePdfFile(companyId, id, versionId!);
      res.type("application/pdf").setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${filename}"`);
      res.send(pdf);
    } catch (error) {
      if (error instanceof DocumentRendererUnavailable) {
        (req.log ?? logger).warn({ reason: error.reason }, "DOCUMENT_RENDERER_UNAVAILABLE");
        res.status(503).json({ error: "DOCUMENT_RENDERER_UNAVAILABLE" }); return;
      }
      if (error instanceof z.ZodError) { res.status(400).json({ error: "INVALID_REQUEST" }); return; }
      if (error instanceof EstimateError && error.status === 404) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      (req.log ?? logger).error({ code: "ESTIMATE_PDF_ERROR" }, "Estimate PDF failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });
  for (const action of ["send", "accept", "decline", "revise"] as const) {
    router.post(`${versionPath}/${action}`, handle(async (req, res) => {
      const { id, versionId } = pathSchema.parse(req.params);
      const user = req.user as UserWithContext;
      const schema = action === "send" ? sendEstimateSchema : action === "accept" ? acceptEstimateSchema
        : action === "decline" ? estimateReasonSchema : reviseEstimateSchema;
      const result = await transitionEstimate(user.activeCompanyId, user.id, id, versionId!, action, schema.parse(req.body));
      const activation = action === "accept" ? await customerActivation(user.activeCompanyId, async () => result.customerId) : undefined;
      res.json({ ...result, ...(activation ? { customerActivation: activation } : {}) });
    }));
  }
  router.delete(versionPath, handle(async (req, res) => {
    const { id, versionId } = pathSchema.parse(req.params);
    const user = req.user as UserWithContext;
    res.json(await transitionEstimate(user.activeCompanyId, user.id, id, versionId!, "discard", emptyEstimateActionSchema.parse(req.body ?? {})));
  }));
  router.post("/:id/void", handle(async (req, res) => {
    const { id } = pathSchema.parse(req.params);
    const user = req.user as UserWithContext;
    res.json(await transitionEstimate(user.activeCompanyId, user.id, id, undefined, "void", estimateReasonSchema.parse(req.body)));
  }));
  router.post(`${versionPath}/sections`, handle(async (req, res) => {
    const { id, versionId } = pathSchema.parse(req.params);
    res.status(201).json(await createSection((req.user as UserWithContext).activeCompanyId, id, versionId!, createEstimateSectionSchema.parse(req.body).name));
  }));
  router.patch(`${versionPath}/sections/:sectionId`, handle(async (req, res) => {
    const { id, versionId, sectionId } = pathSchema.parse(req.params);
    const input = patchEstimateSectionSchema.parse(req.body);
    if (!Object.values(input).some(v => v !== undefined)) throw new EstimateError(400, "EMPTY_PATCH");
    res.json(await patchSection((req.user as UserWithContext).activeCompanyId, id, versionId!, sectionId!, input));
  }));
  router.delete(`${versionPath}/sections/:sectionId`, handle(async (req, res) => {
    const { id, versionId, sectionId } = pathSchema.parse(req.params);
    res.json(await deleteSection((req.user as UserWithContext).activeCompanyId, id, versionId!, sectionId!));
  }));
  router.post(`${versionPath}/lines`, handle(async (req, res) => {
    const { id, versionId } = pathSchema.parse(req.params);
    res.status(201).json(await createLine((req.user as UserWithContext).activeCompanyId, id, versionId!, createEstimateLineSchema.parse(req.body)));
  }));
  router.put(`${versionPath}/order`, handle(async (req, res) => {
    const { id, versionId } = pathSchema.parse(req.params);
    res.json(await reorderEstimate((req.user as UserWithContext).activeCompanyId, id, versionId!, estimateOrderSchema.parse(req.body)));
  }));
  router.post(`${versionPath}/lines/:lineId/duplicate`, handle(async (req, res) => {
    const { id, versionId, lineId } = pathSchema.parse(req.params);
    emptyEstimateActionSchema.parse(req.body ?? {});
    res.status(201).json(await duplicateEstimateLine((req.user as UserWithContext).activeCompanyId, id, versionId!, lineId!));
  }));
  router.post(`${versionPath}/lines/:lineId/replace`, handle(async (req, res) => {
    const { id, versionId, lineId } = pathSchema.parse(req.params);
    res.json(await replaceEstimateLine((req.user as UserWithContext).activeCompanyId, id, versionId!, lineId!, replaceEstimateLineSchema.parse(req.body)));
  }));
  router.patch(`${versionPath}/lines/:lineId`, handle(async (req, res) => {
    const { id, versionId, lineId } = pathSchema.parse(req.params);
    const input = patchEstimateLineSchema.parse(req.body);
    if (!Object.values(input).some(v => v !== undefined)) throw new EstimateError(400, "EMPTY_PATCH");
    res.json(await patchLine((req.user as UserWithContext).activeCompanyId, id, versionId!, lineId!, input));
  }));
  router.delete(`${versionPath}/lines/:lineId`, handle(async (req, res) => {
    const { id, versionId, lineId } = pathSchema.parse(req.params);
    res.json(await deleteLine((req.user as UserWithContext).activeCompanyId, id, versionId!, lineId!));
  }));
  app.use("/api/estimates", router);
}
