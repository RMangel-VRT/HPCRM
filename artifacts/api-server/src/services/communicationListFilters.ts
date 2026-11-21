export function communicationListFilter(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value !== "all" ? value : undefined;
}
