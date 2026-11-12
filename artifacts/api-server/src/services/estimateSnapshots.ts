import { and, eq } from "drizzle-orm";
import { plantCatalogItems, hardscapeCatalogItems, irrigationCatalogItems, estimateQuickItems, estimateServiceCategories, type CreateEstimateLineInput, type EstimateLine, type EstimateUmbrella } from "@workspace/db";
import type { AppTransaction } from "../db";
import { loadEstimateRateContext, resolveEstimateRate } from "./estimateRates";
import { PLANT_DEFAULT_PRICE, moneyStringToCents } from "./estimateMath";
import { EstimateError, requireEstimate } from "./estimateErrors";
import { canonicalEstimateUnit } from "./estimateUnit";

type Snapshot = Pick<EstimateLine, "name" | "detail" | "unit" | "unitPriceCents" | "unitCostCents" | "umbrellaKey" | "priceSource"> &
  Partial<Pick<EstimateLine, "plantCatalogItemId" | "hardscapeCatalogItemId" | "irrigationCatalogItemId" | "quickItemId" | "rateKey" | "termId">>;
/** Sources are read ONLY on insertion, through the caller's transaction. */
export async function snapshotEstimateLine(tx: AppTransaction, companyId: string, customerId: string, input: CreateEstimateLineInput): Promise<Snapshot> {
  switch (input.lineType) {
    case "plant": {
      const [row] = await tx.select().from(plantCatalogItems).where(and(eq(plantCatalogItems.companyId, companyId), eq(plantCatalogItems.id, input.plantCatalogItemId), eq(plantCatalogItems.isActive, true)));
      const plant = requireEstimate(row);
      return { plantCatalogItemId: plant.id, name: [plant.commonName, plant.sizeLabel].filter(Boolean).join(" "),
        detail: ["Plant Library", plant.category, plant.sizeLabel].filter(Boolean).join(" · "), unit: "EA",
        unitPriceCents: PLANT_DEFAULT_PRICE(plant.wholesaleCost, plant.salePrice),
        unitCostCents: plant.wholesaleCost === null ? null : moneyStringToCents(plant.wholesaleCost), umbrellaKey: "plants", priceSource: "catalog" };
    }
    case "hardscape": {
      const row = requireEstimate((await tx.select().from(hardscapeCatalogItems).where(and(eq(hardscapeCatalogItems.companyId, companyId), eq(hardscapeCatalogItems.id, input.hardscapeCatalogItemId), eq(hardscapeCatalogItems.isActive, true))))[0]);
      return { hardscapeCatalogItemId: row.id, name: row.name, detail: [row.category, row.sku].filter(Boolean).join(" · "), unit: canonicalEstimateUnit(row.unit),
        unitPriceCents: row.retailPriceCents ?? 0, unitCostCents: row.wholesaleCostCents, umbrellaKey: row.umbrellaKey as EstimateUmbrella, priceSource: "catalog" };
    }
    case "irrigation": {
      const row = requireEstimate((await tx.select().from(irrigationCatalogItems).where(and(eq(irrigationCatalogItems.companyId, companyId), eq(irrigationCatalogItems.id, input.irrigationCatalogItemId), eq(irrigationCatalogItems.isActive, true))))[0]);
      return { irrigationCatalogItemId: row.id, name: row.name, detail: [row.category, row.externalSku].filter(Boolean).join(" · "), unit: canonicalEstimateUnit(row.unit),
        unitPriceCents: row.retailPriceCents ?? 0, unitCostCents: row.wholesaleCostCents, umbrellaKey: row.umbrellaKey as EstimateUmbrella, priceSource: "catalog" };
    }
    case "labor": {
      const context = await loadEstimateRateContext(companyId, customerId, tx);
      const rate = await resolveEstimateRate(companyId, customerId, input.rateKey, context);
      if (rate.source === "unset") throw new EstimateError(422, "RATE_UNSET");
      return { rateKey: input.rateKey, termId: rate.termId ?? null, name: rate.label, detail: rate.priceText, unit: canonicalEstimateUnit(rate.unit ?? "HR"),
        unitPriceCents: rate.rateCents ?? 0, unitCostCents: null, priceSource: rate.source,
        umbrellaKey: context.card.find(c => c.rateKey === input.rateKey)?.line === "irrigation" ? "irrigation_labor" : "landscape_labor" };
    }
    case "service": case "equipment": case "fee": {
      if (input.quickItemId) {
        const row = requireEstimate((await tx.select().from(estimateQuickItems).where(and(eq(estimateQuickItems.companyId, companyId), eq(estimateQuickItems.id, input.quickItemId), eq(estimateQuickItems.isActive, true), eq(estimateQuickItems.kind, input.lineType))))[0]);
        if (input.lineType === "service") {
          requireEstimate((await tx.select().from(estimateServiceCategories).where(and(
            eq(estimateServiceCategories.companyId, companyId), eq(estimateServiceCategories.id, row.serviceCategoryId!),
            eq(estimateServiceCategories.isActive, true),
          )))[0]);
        }
        return { quickItemId: row.id, name: row.label, detail: null, unit: canonicalEstimateUnit(row.defaultUnit), unitPriceCents: row.defaultRateCents ?? 0,
          unitCostCents: null, umbrellaKey: row.umbrellaKey, priceSource: "quick_list" };
      }
      return { name: input.name!, detail: input.detail ?? null, unit: input.unit!, unitPriceCents: input.unitPriceCents!,
        unitCostCents: null, umbrellaKey: input.umbrellaKey!, priceSource: "manual" };
    }
    case "custom": return { name: input.name, detail: input.detail ?? null, unit: input.unit, unitPriceCents: input.unitPriceCents,
      unitCostCents: null, umbrellaKey: input.umbrellaKey, priceSource: "manual" };
  }
}
