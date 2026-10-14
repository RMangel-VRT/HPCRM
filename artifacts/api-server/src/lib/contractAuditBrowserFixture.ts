import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { pool } from "../db";

// Run from workspace root via pnpm --filter @workspace/scripts exec tsx
// ../artifacts/api-server/src/lib/contractAuditBrowserFixture.ts [cleanup].
const dir = resolve(import.meta.dirname, "../../../../generated-artifacts/contract-audit-browser");
try {
  if (process.argv[2] === "cleanup") {
    const fixture = JSON.parse(await readFile(`${dir}/fixture.json`, "utf8")) as { companyId: string; userId: string };
    await removeAuditFixture(fixture.companyId, fixture.userId);
  } else {
    const fixture = await createAuditFixture();
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/fixture.json`, JSON.stringify({ companyId: fixture.companyId, userId: fixture.userId,
      customerId: fixture.customerId, legacyIds: fixture.oldIds, email: fixture.email, password: fixture.password }), { mode: 0o600 });
    const output = createWriteStream(`${dir}/college-hills.zip`);
    const archive = archiver("zip");
    const finish = new Promise<void>((done, reject) => { output.once("close", done); output.once("error", reject); archive.once("error", reject); });
    archive.pipe(output);
    fixture.upload.forEach(f => archive.append(f.data, { name: f.name }));
    await archive.finalize(); await finish;
    for (const f of fixture.upload) if (f.name.endsWith(".csv")) await writeFile(`${dir}/${f.name.split("/").pop()}`, f.data);
  }
} finally { await pool.end(); }
