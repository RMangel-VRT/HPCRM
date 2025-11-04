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

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const MONTH_ABBREV = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
