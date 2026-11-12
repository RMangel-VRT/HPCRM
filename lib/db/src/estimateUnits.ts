/** Driver-free unit contract. Never import the database barrel from the browser. */
export const ESTIMATE_UNITS = ["SF", "LF", "1,000 SF", "HR", "DAY", "WEEK", "EA", "FLAT", "GAL", "CU. YD", "LB", "BAG", "TON", "IN. DBH"] as const;
export type EstimateUnit = typeof ESTIMATE_UNITS[number];
export const ESTIMATE_UNIT_ALIASES: Readonly<Record<string, EstimateUnit>> = {
  hour: "HR", day: "DAY", week: "WEEK", ea: "EA", each: "EA", flat: "FLAT", visit: "FLAT",
  "sq ft": "SF", sqft: "SF", "1,000 sq ft": "1,000 SF", "lin ft": "LF", lf: "LF",
  "cu yd": "CU. YD", yd3: "CU. YD", ton: "TON", bag: "BAG", gal: "GAL", gallon: "GAL", lb: "LB",
};
export function normalizeEstimateUnit(value: string): EstimateUnit | undefined {
  const key = value.trim().toLowerCase();
  return ESTIMATE_UNITS.find(unit => unit.toLowerCase() === key)
    ?? (Object.hasOwn(ESTIMATE_UNIT_ALIASES, key) ? ESTIMATE_UNIT_ALIASES[key] : undefined);
}
/** Unknowns remain visible, byte-for-byte; never manufacture a commercial unit. */
export function formatEstimateUnit(value: string, label?: (unit: EstimateUnit) => string): string {
  const unit = normalizeEstimateUnit(value);
  return unit ? label?.(unit) ?? unit : value;
}
