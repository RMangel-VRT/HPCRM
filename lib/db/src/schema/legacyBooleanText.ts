import { customType } from "drizzle-orm/pg-core";

/** The deployed campaign flag is text; callers still accept and return booleans. */
export const legacyBooleanText = customType<{ data: boolean; driverData: string }>({
  dataType: () => "text",
  toDriver: value => value ? "true" : "false",
  fromDriver: value => value === "true",
});
