export type ServiceType = 
  | "mowing"
  | "pet_station"
  | "chemical"
  | "shrub_trimming"
  | "ornamental_grass"
  | "aeration"
  | "cleanups"
  | "tree_pruning";

export interface ServiceDefinition {
  type: ServiceType;
  name: string;
  description: string;
  defaultAnnualCount: number;
  defaultMonthlyDistribution: number[]; // 12 integers for Jan-Dec
  parameters?: {
    hasOrganic?: boolean;
    hasStationCount?: boolean;
    hasVisitsPerWeek?: boolean;
  };
}

export const SERVICE_CATALOG: Record<ServiceType, ServiceDefinition> = {
  mowing: {
    type: "mowing",
    name: "Full Mowing Service",
    description: "Mowing, trimming, blowing",
    defaultAnnualCount: 26,
    defaultMonthlyDistribution: [0, 0, 0, 2, 5, 4, 4, 4, 5, 2, 0, 0], // April: 2, May: 5, June-Aug: 4, Sep: 5, Oct: 2 = 26
  },
  pet_station: {
    type: "pet_station",
    name: "Pet Station Service",
    description: "Pet waste station maintenance",
    defaultAnnualCount: 26,
    defaultMonthlyDistribution: [0, 0, 0, 2, 5, 4, 4, 4, 5, 2, 0, 0], // Same as mowing season by default = 26
    parameters: {
      hasStationCount: true,
      hasVisitsPerWeek: true,
    },
  },
  chemical: {
    type: "chemical",
    name: "Chemical Service",
    description: "Herbicide, broadleaf control, and fertilizer applications",
    defaultAnnualCount: 12,
    defaultMonthlyDistribution: [0, 0, 0, 3, 2, 2, 2, 2, 1, 0, 0, 0], // Roundup weekly in mowing season + 4 broadleaf + 4 fertilizer
    parameters: {
      hasOrganic: true,
    },
  },
  shrub_trimming: {
    type: "shrub_trimming",
    name: "Shrub Trimming",
    description: "Seasonal shrub maintenance",
    defaultAnnualCount: 2,
    defaultMonthlyDistribution: [0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0], // 1 summer (July), 1 fall (October)
  },
  ornamental_grass: {
    type: "ornamental_grass",
    name: "Ornamental Grass Trimming",
    description: "Annual ornamental grass maintenance",
    defaultAnnualCount: 1,
    defaultMonthlyDistribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], // 1 fall (October)
  },
  aeration: {
    type: "aeration",
    name: "Aeration",
    description: "Core aeration service",
    defaultAnnualCount: 1,
    defaultMonthlyDistribution: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], // 1 spring (April)
  },
  cleanups: {
    type: "cleanups",
    name: "Cleanups",
    description: "Spring and fall property cleanups",
    defaultAnnualCount: 2,
    defaultMonthlyDistribution: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0], // 1 spring (April), 1 fall (October)
  },
  tree_pruning: {
    type: "tree_pruning",
    name: "Tree Pruning",
    description: "Tree pruning service up to 10 feet",
    defaultAnnualCount: 1,
    defaultMonthlyDistribution: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], // 1 service (April)
  },
};

// ─── Annual Rollup Mapping Utilities ───────────────────────────────────────────

/**
 * Extended service type keys that include irrigation categories not in the
 * contract_services table (which tracks mowing/chemical/cleanups etc.).
 * These are used for the annual service rollup view.
 */
export type RollupServiceType = ServiceType | "irrigation_open" | "irrigation_close" | "irrigation_custom" | "general";

/**
 * Human-readable labels for the annual rollup view.
 * Merges contract service names with campaign-derived categories.
 */
export const ROLLUP_SERVICE_LABELS: Record<RollupServiceType, string> = {
  mowing: "Mow/Trim/Blow",
  pet_station: "Pet Station",
  chemical: "Fertilizer",
  shrub_trimming: "Shrub Trimming",
  ornamental_grass: "Ornamental Grass",
  aeration: "Aeration",
  cleanups: "Cleanup",
  tree_pruning: "Tree Pruning",
  irrigation_open: "Irrigation Open",
  irrigation_close: "Irrigation Close",
  irrigation_custom: "Irrigation (Custom)",
  general: "General",
};

/**
 * Infer a contract service type key from a general-category campaign title
 * using keyword matching. Falls back to "general" if no match found.
 */
export function inferServiceTypeFromCampaignTitle(title: string): RollupServiceType {
  const t = title.toLowerCase();
  if (t.includes("cleanup") || t.includes("clean up")) return "cleanups";
  if (t.includes("mow") || t.includes("trim") || t.includes("blow")) return "mowing";
  if (t.includes("shrub") || t.includes("prune shrub")) return "shrub_trimming";
  if (t.includes("ornamental") || t.includes("grass trim")) return "ornamental_grass";
  if (t.includes("aeration") || t.includes("aerati")) return "aeration";
  if (t.includes("tree")) return "tree_pruning";
  if (t.includes("pet station") || t.includes("pet waste")) return "pet_station";
  return "general";
}

/**
 * Map campaign category and subtype to a rollup service type key.
 */
export function campaignToRollupServiceType(
  category: "general" | "chemical" | "irrigation",
  subtype: string | null | undefined,
  title: string
): RollupServiceType {
  if (category === "irrigation") {
    if (subtype === "winterization") return "irrigation_close";
    if (subtype === "spring_turn_on") return "irrigation_open";
    return "irrigation_custom";
  }
  if (category === "chemical") return "chemical";
  // general: infer from title
  return inferServiceTypeFromCampaignTitle(title);
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const MONTH_ABBREV = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
