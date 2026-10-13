export type ScopeLine = "landscape" | "irrigation" | "snow";

export interface ScopeService {
  key: string;
  line: ScopeLine;
  label: string;
  /** Section of the Word master this switches on, for the generator (Phase 3). */
  wordModule: string | null;
  unit: string | null;
  defaultQuantity: number | null;
  /** 12 integers, Jan..Dec, or null when timing is set per contract. */
  defaultMonthSpread: number[] | null;
  /** Optional, priced on request; carries a site-specific price instead of a count. */
  optionalPriced?: boolean;
}

export const SCOPE_CATALOG: ScopeService[] = [
  { key: "mowing", line: "landscape", label: "Weekly turf service", wordModule: null, unit: "visits", defaultQuantity: 26, defaultMonthSpread: [0,0,0,2,5,4,4,4,5,2,0,0] },
  { key: "aeration", line: "landscape", label: "Spring core aeration", wordModule: "aeration", unit: "visits", defaultQuantity: 1, defaultMonthSpread: [0,0,0,1,0,0,0,0,0,0,0,0] },
  { key: "fall_aeration", line: "landscape", label: "Fall aeration (on request)", wordModule: "fall_aeration", unit: null, defaultQuantity: null, defaultMonthSpread: null, optionalPriced: true },
  { key: "cleanups", line: "landscape", label: "Spring and fall clean-ups", wordModule: null, unit: "visits", defaultQuantity: 3, defaultMonthSpread: [0,0,0,1,0,0,0,0,0,1,1,0] },
  { key: "shrub_trimming", line: "landscape", label: "Shrub trimming", wordModule: null, unit: "visits", defaultQuantity: 2, defaultMonthSpread: [0,0,0,0,0,0,1,0,0,1,0,0] },
  { key: "ornamental_grass", line: "landscape", label: "Ornamental grass cutback", wordModule: null, unit: "visits", defaultQuantity: 1, defaultMonthSpread: [0,0,0,0,0,0,0,0,0,1,0,0] },
  { key: "tree_pruning", line: "landscape", label: "Light tree pruning", wordModule: null, unit: "visits", defaultQuantity: 1, defaultMonthSpread: [0,0,0,1,0,0,0,0,0,0,0,0] },
  { key: "native_areas", line: "landscape", label: "Native grass areas", wordModule: "native_areas", unit: "visits", defaultQuantity: null, defaultMonthSpread: null },
  { key: "retention_pond", line: "landscape", label: "Detention / retention pond", wordModule: "retention_pond", unit: "visits", defaultQuantity: 1, defaultMonthSpread: null },
  { key: "pool", line: "landscape", label: "Pool on site", wordModule: "pool", unit: null, defaultQuantity: null, defaultMonthSpread: null },
  { key: "chemical", line: "landscape", label: "Fertilization and weed control", wordModule: null, unit: "applications", defaultQuantity: 12, defaultMonthSpread: [0,0,0,3,2,2,2,2,1,0,0,0] },
  { key: "crabgrass", line: "landscape", label: "Crabgrass control (on request)", wordModule: "crabgrass", unit: null, defaultQuantity: null, defaultMonthSpread: null, optionalPriced: true },
  { key: "pet_station", line: "landscape", label: "Pet waste stations", wordModule: "pet_waste", unit: "visits", defaultQuantity: 26, defaultMonthSpread: [0,0,0,2,5,4,4,4,5,2,0,0] },
  { key: "winter_visits", line: "landscape", label: "Winter site visits", wordModule: null, unit: "visits", defaultQuantity: 10, defaultMonthSpread: [2,2,2,0,0,0,0,0,0,0,2,2] },
  { key: "winter_watering", line: "landscape", label: "Winter watering (on request)", wordModule: "winter_watering", unit: null, defaultQuantity: null, defaultMonthSpread: null },
  { key: "irrigation_open", line: "irrigation", label: "Spring activation", wordModule: "irrigation", unit: "visits", defaultQuantity: 1, defaultMonthSpread: null },
  { key: "irrigation_inspection", line: "irrigation", label: "Monthly system inspection", wordModule: "irrigation", unit: "visits", defaultQuantity: null, defaultMonthSpread: null },
  { key: "irrigation_winterization", line: "irrigation", label: "Winterization", wordModule: "irrigation", unit: "visits", defaultQuantity: 1, defaultMonthSpread: null },
  { key: "backflow", line: "irrigation", label: "Backflow testing", wordModule: "irrigation", unit: "devices", defaultQuantity: null, defaultMonthSpread: null },
  { key: "snow_walks", line: "snow", label: "Sidewalks and steps", wordModule: "snow", unit: null, defaultQuantity: null, defaultMonthSpread: null },
  { key: "snow_drives", line: "snow", label: "Streets, drives and lots", wordModule: "snow", unit: null, defaultQuantity: null, defaultMonthSpread: null },
  { key: "snow_alleys", line: "snow", label: "Alleys", wordModule: "snow", unit: null, defaultQuantity: null, defaultMonthSpread: null },
  { key: "ice_melt", line: "snow", label: "Ice melt application", wordModule: "snow", unit: null, defaultQuantity: null, defaultMonthSpread: null },
  { key: "snow_stakes", line: "snow", label: "Snow stakes", wordModule: "snow", unit: null, defaultQuantity: null, defaultMonthSpread: null },
  { key: "other", line: "landscape", label: "Other", wordModule: null, unit: null, defaultQuantity: null, defaultMonthSpread: null },
];

/** Old contracts.service_type → agreement line. */
export const LEGACY_CONTRACT_LINE: Record<string, "landscape" | "snow"> = {
  Maintenance: "landscape", Chemical: "landscape", Irrigation: "landscape", Other: "landscape", Snow: "snow",
};

/** Old contract_services.service_type and customer_service_plans.service_category → scope key.
 *  Entries marked review:true are assumptions the copy tool flags for a person to check. */
export const LEGACY_SERVICE_TO_SCOPE: Record<string, { key: string; review?: boolean }> = {
  mowing: { key: "mowing" }, pet_station: { key: "pet_station" }, chemical: { key: "chemical" },
  shrub_trimming: { key: "shrub_trimming" }, ornamental_grass: { key: "ornamental_grass" },
  aeration: { key: "aeration" }, cleanups: { key: "cleanups" }, tree_pruning: { key: "tree_pruning" },
  irrigation_open: { key: "irrigation_open" },
  irrigation_close: { key: "irrigation_winterization", review: true },
  irrigation_winterization: { key: "irrigation_winterization" },
  snow_removal: { key: "snow_walks", review: true },
  other: { key: "other", review: true },
};

export interface RateCardDefault {
  key: string; line: "landscape" | "irrigation" | "snow" | "general"; category: string; label: string;
  priceCents: number | null; priceText?: string; unit: string; minimum?: string;
}

/** High Plains standard rates. Landscape and irrigation values come from the contracts plugin's
 *  defaults.json; snow values were approved Oct 12, 2026. A null price means "no standard, set per contract". */
export const RATE_CARD_DEFAULTS: RateCardDefault[] = [
  { key: "rate_general_labor", line: "landscape", category: "Labor", label: "General labor", priceCents: null, unit: "per hour" },
  { key: "rate_emergency_general_labor", line: "landscape", category: "Labor", label: "Emergency general labor", priceCents: null, unit: "per hour" },
  { key: "rate_operator_labor", line: "landscape", category: "Labor", label: "Operator labor", priceCents: null, unit: "per hour" },
  { key: "disposal_rate", line: "landscape", category: "Landscape", label: "Disposal", priceCents: 32500, unit: "per 7' x 14' dump trailer load" },
  { key: "native_broadleaf_rate", line: "landscape", category: "Landscape", label: "Native-area broadleaf control", priceCents: 4700, unit: "per gallon applied" },
  { key: "pet_station_rate", line: "landscape", category: "Landscape", label: "Pet waste bags", priceCents: 2500, unit: "per station per week" },
  { key: "winter_water_gallon_rate", line: "landscape", category: "Winter watering", label: "Winter watering, delivered", priceCents: 189, unit: "per gallon applied" },
  { key: "winter_water_hourly_rate", line: "landscape", category: "Winter watering", label: "Winter watering, client water", priceCents: 7500, unit: "per hour" },
  { key: "rate_irrigation_labor", line: "irrigation", category: "Labor", label: "Irrigation labor", priceCents: null, unit: "per hour" },
  { key: "rate_emergency_irrigation_labor", line: "irrigation", category: "Labor", label: "Emergency irrigation labor", priceCents: null, unit: "per hour" },
  { key: "backflow_rate", line: "irrigation", category: "Irrigation", label: "Backflow test, 1-inch device", priceCents: 15500, unit: "per device" },
  { key: "irrigation_auto_limit", line: "irrigation", category: "Irrigation repair limits", label: "Repair without approval, up to", priceCents: 50000, unit: "per repair" },
  { key: "irrigation_notify_cap", line: "irrigation", category: "Irrigation repair limits", label: "Notify the client at", priceCents: 150000, unit: "per billing cycle" },
  { key: "rate_service_truck", line: "snow", category: "Snow equipment & labor", label: "Service truck", priceCents: 12000, unit: "per occurrence" },
  { key: "rate_plow_truck", line: "snow", category: "Snow equipment & labor", label: "Plow truck", priceCents: 14500, unit: "per hour", minimum: "3 hour minimum" },
  { key: "rate_skid_loader", line: "snow", category: "Snow equipment & labor", label: "Skid loader", priceCents: 24500, unit: "per hour", minimum: "3 hour minimum" },
  { key: "rate_atv", line: "snow", category: "Snow equipment & labor", label: "ATV", priceCents: 13500, unit: "per hour", minimum: "3 hour minimum" },
  { key: "rate_snowblower", line: "snow", category: "Snow equipment & labor", label: "Snowblower", priceCents: 13500, unit: "per hour", minimum: "3 hour minimum" },
  { key: "rate_hand_shovel", line: "snow", category: "Snow equipment & labor", label: "Hand shovel", priceCents: 8000, unit: "per hour", minimum: "6 hour minimum" },
  { key: "rate_ice_melt_application", line: "snow", category: "Snow equipment & labor", label: "Ice melt application", priceCents: 7000, unit: "per hour" },
  { key: "rate_holiday", line: "snow", category: "Snow equipment & labor", label: "Holiday rate", priceCents: null, priceText: "1.5x Normal Rates", unit: "Thanksgiving, Christmas Eve and Day, New Year's Eve and Day" },
  { key: "rate_ice_melt", line: "snow", category: "Snow materials", label: "Ice melt", priceCents: 145, unit: "per pound", minimum: "50 lb minimum" },
  { key: "rate_sand_salt", line: "snow", category: "Snow materials", label: "Sand / salt mix", priceCents: 10500, unit: "per ton" },
  { key: "rate_snow_stakes", line: "snow", category: "Snow materials", label: "Snow stakes", priceCents: 500, unit: "per stake installed" },
  { key: "rate_additional_mowing", line: "landscape", category: "Landscape extras", label: "Additional mowing", priceCents: 60000, unit: "per occurrence" },
  { key: "rate_additional_aeration", line: "landscape", category: "Landscape extras", label: "Additional aeration", priceCents: 50000, unit: "per aeration" },
  { key: "rate_extra_weed_spray", line: "landscape", category: "Landscape extras", label: "Additional weed control (spot spraying)", priceCents: 45000, unit: "per application" },
  { key: "rate_native_overseed", line: "landscape", category: "Landscape extras", label: "Native area over-seeding", priceCents: null, unit: "per application" },
  { key: "rate_tree_guard", line: "landscape", category: "Landscape extras", label: "Tree guards", priceCents: null, unit: "per tree" },
  { key: "rate_winter_water_sod", line: "landscape", category: "Winter watering", label: "Winter watering, sod", priceCents: 12500, unit: "per event" },
  { key: "rate_winter_water_trees", line: "landscape", category: "Winter watering", label: "Winter watering, trees and shrubs", priceCents: null, unit: "per event" },
  { key: "rate_freeze_wrap", line: "irrigation", category: "Irrigation", label: "Freeze wrap of exposed lines", priceCents: 12500, unit: "per occurrence" },
  { key: "rate_backflow_2in", line: "irrigation", category: "Irrigation", label: "Backflow test, 2-inch device", priceCents: 17500, unit: "per device" },
  { key: "rate_backflow_3in", line: "irrigation", category: "Irrigation", label: "Backflow test, 3-inch device", priceCents: null, unit: "per device" },
  { key: "rate_backflow_4in", line: "irrigation", category: "Irrigation", label: "Backflow test, 4-inch device", priceCents: null, unit: "per device" },
  { key: "rate_backflow_storage", line: "irrigation", category: "Irrigation", label: "Backflow winter storage and reinstall", priceCents: null, unit: "per device per season" },
  { key: "rate_front_end_loader", line: "snow", category: "Snow equipment & labor", label: "Front end loader", priceCents: null, unit: "per hour" },
  { key: "rate_dump_truck", line: "snow", category: "Snow equipment & labor", label: "Dump truck", priceCents: null, unit: "per hour" },
  { key: "rate_sand_salt_application", line: "snow", category: "Snow equipment & labor", label: "Sand / salt application", priceCents: null, unit: "per hour" },
  { key: "rate_ice_slicer", line: "snow", category: "Snow materials", label: "Ice Slicer", priceCents: 29500, unit: "per ton" },
  { key: "rate_ice_slicer_application", line: "snow", category: "Snow equipment & labor", label: "Ice Slicer application", priceCents: 8000, unit: "per hour" },
  { key: "rate_liquid_mag", line: "snow", category: "Snow materials", label: "Liquid mag chloride", priceCents: null, unit: "per gallon" },
  { key: "rate_liquid_mag_application", line: "snow", category: "Snow equipment & labor", label: "Liquid mag chloride application", priceCents: null, unit: "per hour" },
];

export const scopeServiceByKey = (key: string) => SCOPE_CATALOG.find((s) => s.key === key);
