import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createParentFixture } from "./contractParentFixture";
import { removeAuditFixture } from "./contractAuditFixture";
import { renewalZip } from "./contractRenewalFixture";
import { pool } from "../db";

const dir = resolve(import.meta.dirname, "../../../../generated-artifacts/contract-parent-browser");
try {
  if (process.argv[2] === "cleanup") {
    const f = JSON.parse(await readFile(`${dir}/fixture.json`, "utf8"));
    await removeAuditFixture(f.companyId, f.userId);
  } else {
    const f = await createParentFixture();
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/fixture.json`, JSON.stringify({ companyId: f.companyId, userId: f.userId,
      customerId: f.customerId, branch2Id: f.branch2Id, parentId: f.parentId,
      oldIds: f.oldIds, email: f.email, password: f.password }), { mode: 0o600 });
    await writeFile(`${dir}/parent-consolidation.zip`, await renewalZip(f.entries));
  }
} finally { await pool.end(); }
