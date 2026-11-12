import type { TFunction } from "i18next";
import { formatEstimateUnit } from "@shared/estimateSetup";
export { normalizeEstimateUnit } from "@shared/estimateSetup";

export function unitLabel(unit: string, t: TFunction): string {
  return formatEstimateUnit(unit, canonical => t(`estimateBuilder.unit.${canonical}`, { defaultValue: canonical }));
}
