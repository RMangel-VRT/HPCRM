import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { termDocuments } from "@workspace/db";
import { createRenewalFixture } from "./contractRenewalFixture";
import { removeAuditFixture } from "./contractAuditFixture";
import { db, pool } from "../db";
import { ObjectStorageService } from "../objectStorage";

const dir = resolve(import.meta.dirname, "../../../../generated-artifacts/contract-renewal-browser");
try {
  if (process.argv[2] === "cleanup") {
    const f = JSON.parse(await readFile(`${dir}/fixture.json`, "utf8"));
    const docs = await db.select().from(termDocuments).where(eq(termDocuments.companyId, f.companyId));
    const storage = new ObjectStorageService();
    for (const doc of docs) if (doc.storageObjectPath.startsWith(`/objects/contract-renewals/${f.companyId}/`))
      await storage.deletePrivatePath(doc.storageObjectPath.slice("/objects/".length));
    await removeAuditFixture(f.companyId, f.userId);
  } else {
    const f = await createRenewalFixture(); await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/fixture.json`, JSON.stringify({ companyId: f.companyId, userId: f.userId, customerId: f.customerId,
      agreementId: f.agreement.id, sourceId: f.source.id, email: f.email, password: f.password }), { mode: 0o600 });
    await writeFile(`${dir}/renewal.zip`, f.zip);
  }
} finally { await pool.end(); }
