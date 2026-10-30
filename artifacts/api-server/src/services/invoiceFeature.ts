import { eq } from "drizzle-orm";
import { settings } from "@workspace/db";
import { db } from "../db";

/** Absent, malformed, non-boolean or unreadable settings always disable IC1. */
export async function isInvoiceCenterEnabled(companyId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ featureFlags: settings.featureFlags }).from(settings).where(eq(settings.companyId, companyId));
    const flags: unknown = JSON.parse(row?.featureFlags || "{}");
    return typeof flags === "object" && flags !== null && !Array.isArray(flags)
      && (flags as Record<string, unknown>).invoiceCenter === true;
  } catch { return false; }
}
