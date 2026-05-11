// Mobile v1 Slice 4 — flag tag taxonomy.
//
// Single source of truth for the 8 flag tag values exposed in the mobile
// composer and the admin Flags inbox. Imported by both the API (for Zod
// validation) and the web/mobile UIs (for the chip palette / colors).

export const FLAG_TAGS = [
  { value: "irrigation_issue",     label: "Irrigation issue",     color: "#2563eb" }, // blue
  { value: "property_damage",      label: "Property damage",      color: "#dc2626" }, // red
  { value: "access_problem",       label: "Access problem",       color: "#d97706" }, // amber
  { value: "customer_interaction", label: "Customer interaction", color: "#7c3aed" }, // purple
  { value: "material_needed",      label: "Material needed",      color: "#0d9488" }, // teal
  { value: "safety_concern",       label: "Safety concern",       color: "#b91c1c" }, // red-700
  { value: "question",             label: "Question",             color: "#475569" }, // slate
  { value: "other",                label: "Other",                color: "#6b7280" }, // gray
] as const;

export type FlagTag = (typeof FLAG_TAGS)[number]["value"];
export const FLAG_TAG_VALUES: readonly FlagTag[] = FLAG_TAGS.map((t) => t.value);

export const FLAG_STATUSES = [
  "new",
  "acknowledged",
  "in_progress",
  "resolved",
  "dismissed",
] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

export const FLAG_NOTE_MAX_LENGTH = 280;
