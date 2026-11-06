import type { RequestHandler } from "express";
export const SNOW_COVERAGE_MESSAGE = "Snow coverage comes from the customer's contract.";
/** Provided-field check, including false/null. Never truthiness or parsed defaults. */
export function hasSnowCoverageWrite(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return Object.hasOwn(body, "snowEnabled") || Object.hasOwn(body, "snow_enabled")
    || ("customer" in body && hasSnowCoverageWrite(body.customer));
}
export const rejectLegacySnowCoverageWrite: RequestHandler = (req, res, next) => {
  if (["POST", "PUT", "PATCH"].includes(req.method) && hasSnowCoverageWrite(req.body)) {
    res.status(422).json({ message: SNOW_COVERAGE_MESSAGE }); return;
  }
  next();
};
