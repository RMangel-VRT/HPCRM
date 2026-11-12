import { normalizeEstimateUnit } from "../../../../lib/db/src/estimateUnits";
import { EstimateError } from "./estimateErrors";

/** Reference snapshots cannot perpetuate unmapped catalog/contract units. */
export function canonicalEstimateUnit(value: string) {
  const unit = normalizeEstimateUnit(value);
  if (!unit) throw new EstimateError(422, "INVALID_CATALOG_UNIT", { unit: value });
  return unit;
}
