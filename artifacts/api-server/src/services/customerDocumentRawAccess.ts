import { eq } from "drizzle-orm";
import { termDocuments } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";

/** The old generic ACL route cannot bypass an accepted customer-document row,
 * nor Contract Center's privileged boundary when a caller knows an object URL.
 * Customer-file callers use scoped /documents/:id/open, not raw paths.
 */
export async function customerDocumentRawAccess(path: string, user: UserWithContext): Promise<boolean> {
  if (path.startsWith("/objects/map-documents/")) return false;
  const [termFile] = await db.select({ companyId: termDocuments.companyId }).from(termDocuments)
    .where(eq(termDocuments.storageObjectPath, path)).limit(1);
  return !termFile || (termFile.companyId === user.activeCompanyId && ["admin", "office"].includes(user.accessRole));
}
