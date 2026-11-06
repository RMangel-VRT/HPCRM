/** Browser-safe membership identity and authorization projection. No database imports. */
export const ROLE_VALUES = [
  "admin", "account_manager", "office", "field_manager", "chemical_manager", "field",
  "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor",
] as const;
export type Role = typeof ROLE_VALUES[number];

/** Membership identity must never be rewritten to the projected permission role. */
export function accessRole<T extends string>(role: T): Exclude<T, "account_manager"> | "admin" {
  return (role === "account_manager" ? "admin" : role) as Exclude<T, "account_manager"> | "admin";
}
