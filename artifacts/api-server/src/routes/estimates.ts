import { Router, type Express, type RequestHandler } from "express";
import { z } from "zod/v4";
import { createEstimateSchema, patchEstimateSchema, createEstimateSectionSchema, patchEstimateSectionSchema,
  createEstimateLineSchema, patchEstimateLineSchema, estimateListQuerySchema, estimateDetailQuerySchema, estimateIdSchema,
  sendEstimateSchema, acceptEstimateSchema, estimateReasonSchema, emptyEstimateActionSchema } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { estimateAccess } from "../lib/estimateAccess";
import { logger } from "../lib/logger";
import { EstimateError, postgresCode } from "../services/estimateErrors";
import { listEstimates, readEstimate } from "../services/estimateReads";
import { createEstimate, retitleEstimate, createSection, patchSection, deleteSection, createLine, patchLine, deleteLine } from "../services/estimates";
import { transitionEstimate } from "../services/estimateLifecycle";
import { readTicketEstimate } from "../services/ticketEstimates";

const handle = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "INVALID_REQUEST" }); return; }
    if (error instanceof EstimateError) { res.status(error.status).json({ error: error.error, ...error.extra }); return; }
    if (error instanceof RangeError) { res.status(422).json({ error: "AMOUNT_OUT_OF_RANGE" }); return; }
    const code = postgresCode(error);
    if (code === "23505") { res.status(409).json({ error: "CONFLICT" }); return; }
    // Never log the error object/message: PG detail can contain commercial/customer data.
    (req.log ?? logger).error({ code: code && /^[0-9A-Z]{5}$/.test(code) ? code : "ESTIMATE_ERROR" }, "Estimate request failed");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
};
const pathSchema = z.object({ id: estimateIdSchema, versionId: estimateIdSchema.optional(), sectionId: estimateIdSchema.optional(), lineId: estimateIdSchema.optional() });
export function registerEstimateRoutes(app: Express) {
  const router = Router();
  router.use(estimateAccess);
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
    res.json(await retitleEstimate((req.user as UserWithContext).activeCompanyId, id, patchEstimateSchema.parse(req.body).title));
  }));
  const versionPath = "/:id/versions/:versionId";
  for (const action of ["send", "accept", "decline", "revise"] as const) {
    router.post(`${versionPath}/${action}`, handle(async (req, res) => {
      const { id, versionId } = pathSchema.parse(req.params);
      const user = req.user as UserWithContext;
      const schema = action === "send" ? sendEstimateSchema : action === "accept" ? acceptEstimateSchema
        : action === "decline" ? estimateReasonSchema : emptyEstimateActionSchema;
      res.json(await transitionEstimate(user.activeCompanyId, user.id, id, versionId!, action, schema.parse(req.body)));
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
