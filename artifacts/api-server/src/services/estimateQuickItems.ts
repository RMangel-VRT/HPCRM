import { and, eq } from "drizzle-orm";
import { estimateQuickItems, type createQuickItemSchema, type patchQuickItemSchema } from "@workspace/db";
import type { z } from "zod/v4";
import { db } from "../db";

export const estimateQuickCatalog = {
  list(companyId: string, kind?: "equipment" | "fee") {
    return db.select().from(estimateQuickItems)
      .where(and(eq(estimateQuickItems.companyId, companyId), kind ? eq(estimateQuickItems.kind, kind) : undefined))
      .orderBy(estimateQuickItems.sortOrder, estimateQuickItems.label);
  },
  async create(companyId: string, body: z.output<typeof createQuickItemSchema>) {
    const [row] = await db.insert(estimateQuickItems).values({ ...body, companyId }).returning();
    return row;
  },
  async update(companyId: string, id: string, body: z.output<typeof patchQuickItemSchema>) {
    const [row] = await db.update(estimateQuickItems).set({ ...body, updatedAt: new Date() })
      .where(and(eq(estimateQuickItems.companyId, companyId), eq(estimateQuickItems.id, id))).returning();
    return row;
  },
};
