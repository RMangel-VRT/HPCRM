import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { hardscapeCatalogItems, estimateQuickItems, estimateServiceCategories, QUICK_ITEM_UNITS,
  type CatalogMatchesQuery, type CatalogMatchDto, type CreateEstimateLineInput } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { EstimateError } from "./estimateErrors";

/** Bounded SQL matching; strpos treats %, _ and backslashes as literal input. */
export async function catalogMatches(companyId: string, query: CatalogMatchesQuery): Promise<CatalogMatchDto[]> {
  const q = query.name;
  if (query.catalog === "hardscape") {
    const t = hardscapeCatalogItems;
    const score = sql<number>`similarity(lower(${t.name}), lower(${q}))`;
    return db.select({ id: t.id, name: t.name, unit: t.unit, priceCents: t.retailPriceCents, categoryName: t.category })
      .from(t).where(and(eq(t.companyId, companyId), eq(t.isActive, true),
        or(sql`${score} >= 0.3`, sql`strpos(lower(${t.name}), lower(${q})) > 0`)))
      .orderBy(desc(score), asc(t.name), asc(t.id)).limit(5);
  }
  const t = estimateQuickItems, c = estimateServiceCategories;
  const score = sql<number>`similarity(lower(${t.label}), lower(${q}))`;
  return db.select({ id: t.id, name: t.label, unit: t.defaultUnit, priceCents: t.defaultRateCents, categoryName: c.name })
    .from(t).leftJoin(c, and(eq(c.id, t.serviceCategoryId), eq(c.companyId, companyId)))
    .where(and(eq(t.companyId, companyId), eq(t.isActive, true), eq(t.kind, query.catalog),
      query.catalog === "service" ? and(eq(c.id, query.serviceCategoryId!), eq(c.isActive, true)) : undefined,
      or(sql`${score} >= 0.3`, sql`strpos(lower(${t.label}), lower(${q})) > 0`)))
    .orderBy(desc(score), asc(t.label), asc(t.id)).limit(5);
}

/** Only called AFTER estimate/version/section authorization, inside its transaction. */
export async function saveCustomCatalogItem(tx: AppTransaction, companyId: string,
  input: Extract<CreateEstimateLineInput, { lineType: "custom" }>): Promise<CreateEstimateLineInput> {
  const target = input.saveToCatalog!;
  let umbrella = target.catalog === "hardscape" ? "landscape_materials"
    : target.catalog === "equipment" ? "landscape_labor" : "fees_surcharges";
  if (target.catalog === "service") {
    // Share lock keeps the validated default/activity stable through snapshot insertion.
    const [category] = await tx.select().from(estimateServiceCategories).where(and(
      eq(estimateServiceCategories.companyId, companyId), eq(estimateServiceCategories.id, target.serviceCategoryId),
      eq(estimateServiceCategories.isActive, true))).for("share");
    if (!category) throw new EstimateError(422, "INVALID_SERVICE_CATEGORY");
    umbrella = category.defaultUmbrellaKey;
  }
  if (input.umbrellaKey !== umbrella) throw new EstimateError(422, "UMBRELLA_MISMATCH");
  const base = { sectionId: input.sectionId, quantity: input.quantity };
  if (target.catalog === "hardscape") {
    const [item] = await tx.insert(hardscapeCatalogItems).values({
      companyId, name: input.name, category: "general", description: input.detail ?? null,
      unit: input.unit, retailPriceCents: input.unitPriceCents, wholesaleCostCents: null,
      umbrellaKey: "landscape_materials", isActive: true,
    }).returning({ id: hardscapeCatalogItems.id });
    return { ...base, lineType: "hardscape", hardscapeCatalogItemId: item.id };
  }
  const unit = QUICK_ITEM_UNITS.find(unit => unit === input.unit);
  if (!unit) throw new EstimateError(422, "INVALID_CATALOG_UNIT");
  if (input.name.length > 200) throw new EstimateError(422, "INVALID_CATALOG_NAME");
  const [item] = await tx.insert(estimateQuickItems).values({
    companyId, kind: target.catalog, label: input.name, defaultUnit: unit,
    defaultRateCents: input.unitPriceCents, umbrellaKey: input.umbrellaKey,
    serviceCategoryId: target.catalog === "service" ? target.serviceCategoryId : null,
    isActive: true, sortOrder: 0,
  }).returning({ id: estimateQuickItems.id });
  return { ...base, lineType: target.catalog, quickItemId: item.id };
}

/** Must run after rollback: never query an aborted transaction or guess the kind. */
export async function conflictingQuickItem(companyId: string, name: string) {
  const t = estimateQuickItems, c = estimateServiceCategories;
  const [existing] = await db.select({
    id: t.id, name: t.label, kind: t.kind, isActive: t.isActive, serviceCategoryIsActive: c.isActive,
  }).from(t).leftJoin(c, and(eq(c.id, t.serviceCategoryId), eq(c.companyId, companyId)))
    .where(and(eq(t.companyId, companyId), sql`lower(${t.label}) = lower(${name})`)).limit(1);
  return existing;
}
