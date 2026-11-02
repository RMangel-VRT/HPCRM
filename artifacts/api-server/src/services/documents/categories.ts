const labels: Record<string, string> = {
  plants: "Plants", landscape_materials: "Landscape materials", landscape_labor: "Landscape labor",
  irrigation_materials: "Irrigation materials", irrigation_labor: "Irrigation labor", fees_surcharges: "Fees",
  grounds_contract: "Grounds maintenance", chemical_contract: "Chemical", snow_contract: "Snow contract", snow_services: "Snow services",
};
export function categoryLabel(key: string): string {
  const label = labels[key];
  if (!label) throw new Error("INVALID_DOCUMENT_CATEGORY");
  return label;
}
