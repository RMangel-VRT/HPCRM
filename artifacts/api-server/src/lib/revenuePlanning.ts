import { GetRevenuePlanParams, SaveRevenuePlanBody, SaveRevenueTargetsBody } from "@workspace/api-zod";
import { REVENUE_STREAMS, type RevenueStream } from "@workspace/db/revenue-streams";
import { z } from "zod";

export function planDefaults(year: number) {
  return {
    year,
    renewalIncreasePct: 3,
    keptPct: 90,
    snowYears: 3,
    irrigationGrowthPct: 0,
    projectsGrowthPct: 0,
    extraGrowthPct: 0,
    goalCents: null,
  };
}

export const planningYear = z.string().length(4).regex(/^[0-9]{4}$/).pipe(GetRevenuePlanParams.shape.year);

// Orval emits .number() even for OpenAPI integers. Require integer cents and
// counts explicitly and don't inject defaults into a provided-field patch.
const twoDecimalPlaces = (value: number) => value === Math.round(value * 100) / 100;
export const revenuePlanPatch = SaveRevenuePlanBody.strict().extend({
  renewalIncreasePct: SaveRevenuePlanBody.shape.renewalIncreasePct.unwrap().refine(twoDecimalPlaces).optional(),
  keptPct: SaveRevenuePlanBody.shape.keptPct.unwrap().int().optional(),
  snowYears: SaveRevenuePlanBody.shape.snowYears.unwrap().int().optional(),
  irrigationGrowthPct: SaveRevenuePlanBody.shape.irrigationGrowthPct.unwrap().refine(twoDecimalPlaces).optional(),
  projectsGrowthPct: SaveRevenuePlanBody.shape.projectsGrowthPct.unwrap().refine(twoDecimalPlaces).optional(),
  extraGrowthPct: SaveRevenuePlanBody.shape.extraGrowthPct.unwrap().refine(twoDecimalPlaces).optional(),
  goalCents: SaveRevenuePlanBody.shape.goalCents.unwrap().unwrap().int().nullable().optional(),
});

const monthlyCents = SaveRevenueTargetsBody.shape.streams.shape.contract.unwrap();
const targetAmounts = z.array(monthlyCents.element.int()).length(12).optional();
export const revenueTargetUpdate = SaveRevenueTargetsBody.strict().extend({
  streams: z.object(Object.fromEntries(REVENUE_STREAMS.map(stream => [stream, targetAmounts])) as
    Record<RevenueStream, typeof targetAmounts>).strict(),
});

export type RevenuePlanPatch = z.infer<typeof revenuePlanPatch>;
export type RevenueTargetStreams = z.infer<typeof revenueTargetUpdate>["streams"];
